"""Durable SQS job execution runtime.

The runtime keeps provider work behind an injected callable and persists every
state transition before acknowledging a queue message.  It is therefore safe
to restart a worker after a lease expiry: PostgreSQL claims are serialized
with ``FOR UPDATE SKIP LOCKED`` and candidate rows are unique per job.
"""
from __future__ import annotations

from datetime import timedelta
from enum import Enum
import inspect
import os
from threading import Event
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload, sessionmaker

from apps.api.models import Job, JobCandidateResult, utc_now

from .queue import QueueConsumer, QueueMessage


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    EVALUATING = "evaluating"
    VALIDATING = "validating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_STATES = {JobState.COMPLETED.value, JobState.FAILED.value, JobState.CANCELLED.value}


class SpendLimitExceeded(RuntimeError):
    pass


class JobRepository:
    """Small persistence facade; all mutations commit in short transactions."""

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self.session_factory = session_factory

    def create(self, **kwargs: Any) -> Job:
        with self.session_factory.begin() as session:
            job = Job(**kwargs)
            session.add(job)
            session.flush()
            session.refresh(job)
            return job

    def get(self, job_id: str) -> Job | None:
        with self.session_factory() as session:
            return session.scalar(
                select(Job).options(selectinload(Job.candidate_results)).where(Job.id == job_id)
            )

    def claim_next(self, worker_id: str, *, lease_seconds: int = 60) -> Job | None:
        """Atomically claim one available queued/expired job.

        PostgreSQL uses row locks with ``SKIP LOCKED`` so competing workers do
        not block one another.  SQLite ignores that clause and still provides
        the same transactionally atomic update for local tests.
        """
        lease_seconds = max(1, int(lease_seconds))
        now = utc_now()
        with self.session_factory.begin() as session:
            query = (
                select(Job)
                .options(selectinload(Job.candidate_results))
                .where(
                    Job.status == JobState.QUEUED.value,
                    Job.available_at <= now,
                )
                .order_by(Job.created_at, Job.id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            job = session.scalar(query)
            if job is None:
                # A worker may have died while holding a lease.  Reclaim only
                # running rows whose lease is actually expired.
                query = (
                    select(Job)
                    .options(selectinload(Job.candidate_results))
                    .where(
                        Job.status == JobState.RUNNING.value,
                        Job.claim_expires_at.is_not(None),
                        Job.claim_expires_at < now,
                        Job.available_at <= now,
                    )
                    .order_by(Job.created_at, Job.id)
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                job = session.scalar(query)
            if job is None:
                return None
            self._claim(job, worker_id, now, lease_seconds)
            session.flush()
            return job

    def claim(self, job_id: str, worker_id: str, *, lease_seconds: int = 60) -> Job | None:
        lease_seconds = max(1, int(lease_seconds))
        now = utc_now()
        with self.session_factory.begin() as session:
            job = session.scalar(
                select(Job)
                .options(selectinload(Job.candidate_results))
                .where(Job.id == job_id)
                .with_for_update(skip_locked=True)
            )
            if job is None or job.status in TERMINAL_STATES:
                return job
            if job.status == JobState.RUNNING.value and job.claim_expires_at and job.claim_expires_at > now and job.claimed_by != worker_id:
                return None
            if job.status not in {JobState.QUEUED.value, JobState.RUNNING.value}:
                return None
            self._claim(job, worker_id, now, lease_seconds)
            session.flush()
            return job

    @staticmethod
    def _claim(job: Job, worker_id: str, now: Any, lease_seconds: int) -> None:
        job.status = JobState.RUNNING.value
        job.claimed_by = worker_id
        job.claim_expires_at = now + timedelta(seconds=lease_seconds)
        job.attempt_count = int(job.attempt_count or 0) + 1
        job.started_at = job.started_at or now
        job.error = None

    def transition(self, job_id: str, state: JobState | str, *, worker_id: str | None = None, error: str | None = None) -> Job | None:
        state_value = state.value if isinstance(state, JobState) else str(state)
        allowed = {s.value for s in JobState}
        if state_value not in allowed:
            raise ValueError(f"unsupported job state: {state_value}")
        with self.session_factory.begin() as session:
            job = session.get(Job, job_id, with_for_update=True)
            if job is None:
                return None
            if worker_id and job.claimed_by not in {None, worker_id}:
                return None
            job.status = state_value
            job.error = error
            if state_value in TERMINAL_STATES:
                job.completed_at = utc_now()
                job.claim_expires_at = None
                job.claimed_by = None
            session.flush()
            return job

    def checkpoint(self, job_id: str, checkpoint: dict[str, Any], *, spent_usd: float | None = None) -> Job | None:
        with self.session_factory.begin() as session:
            job = session.get(Job, job_id, with_for_update=True)
            if job is None:
                return None
            job.checkpoint = dict(checkpoint)
            if spent_usd is not None:
                job.spent_usd = float(spent_usd)
            session.flush()
            return job

    def record_candidate(
        self, job_id: str, candidate_id: str, result: dict[str, Any], cost_usd: float, checkpoint: dict[str, Any]
    ) -> tuple[JobCandidateResult, bool]:
        """Insert a candidate once and atomically checkpoint its spend.

        Returns ``(row, inserted)``.  A duplicate candidate is never charged a
        second time, even when a worker receives the same SQS message twice.
        """
        with self.session_factory.begin() as session:
            job = session.get(Job, job_id, with_for_update=True)
            if job is None:
                raise KeyError(job_id)
            existing = session.scalar(
                select(JobCandidateResult).where(
                    JobCandidateResult.job_id == job_id,
                    JobCandidateResult.candidate_id == candidate_id,
                )
            )
            if existing is not None:
                return existing, False
            row = JobCandidateResult(
                job_id=job_id,
                candidate_id=candidate_id,
                status=JobState.COMPLETED.value,
                result=dict(result),
                cost_usd=float(cost_usd),
            )
            session.add(row)
            job.checkpoint = dict(checkpoint)
            job.spent_usd = float(job.spent_usd or 0) + float(cost_usd)
            session.flush()
            return row, True

    def release_for_retry(self, job_id: str, error: str, *, delay_seconds: int = 0) -> None:
        with self.session_factory.begin() as session:
            job = session.get(Job, job_id, with_for_update=True)
            if job is None or job.status in TERMINAL_STATES:
                return
            job.status = JobState.QUEUED.value
            job.available_at = utc_now() + timedelta(seconds=max(0, int(delay_seconds)))
            job.claimed_by = None
            job.claim_expires_at = None
            job.error = error[:4000]
            session.flush()


CandidateExecutor = Callable[..., dict[str, Any] | float | int]


class WorkerRuntime:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        queue: QueueConsumer,
        *,
        worker_id: str | None = None,
        candidate_executor: CandidateExecutor | None = None,
        execute_candidate: CandidateExecutor | None = None,
        lease_seconds: int = 60,
        visibility_timeout: int = 60,
        max_receive_count: int = 3,
        retry_delay_seconds: int = 1,
    ) -> None:
        self.repository = JobRepository(session_factory)
        self.queue = queue
        self.worker_id = worker_id or f"worker-{uuid4()}"
        self.candidate_executor = candidate_executor or execute_candidate or self._default_candidate_executor
        self.lease_seconds = max(1, int(lease_seconds))
        self.visibility_timeout = max(0, min(int(visibility_timeout), 43_200))
        self.max_receive_count = max(1, int(max_receive_count))
        self.retry_delay_seconds = max(0, int(retry_delay_seconds))

    @staticmethod
    def _default_candidate_executor(candidate: dict[str, Any], _job: Job) -> dict[str, Any]:
        return dict(candidate)

    def process_once(self) -> bool:
        messages = self.queue.receive(max_messages=1, visibility_timeout=self.visibility_timeout)
        if not messages:
            return False
        message = messages[0]
        job_id = message.body.get("job_id") if isinstance(message.body, dict) else None
        if not isinstance(job_id, str) or not job_id:
            self.queue.move_to_dlq(message)
            return False
        if message.receive_count > self.max_receive_count:
            self.queue.move_to_dlq(message)
            job = self.repository.get(job_id)
            if job and job.status not in TERMINAL_STATES:
                self.repository.transition(job_id, JobState.FAILED, error="message retry limit exceeded")
            return False
        existing = self.repository.get(job_id)
        if existing is None:
            # A malformed/stale message must not be retried forever.  There is
            # no durable row that could become claimable, so route it directly
            # to the DLQ and acknowledge it at the transport layer.
            self.queue.move_to_dlq(message)
            return False
        if existing.status in TERMINAL_STATES:
            self.queue.acknowledge(message)
            return False
        job = self.repository.claim(job_id, self.worker_id, lease_seconds=self.lease_seconds)
        if job is None:
            self.queue.retry(message, visibility_timeout=self.visibility_timeout)
            return False
        try:
            self._execute(job)
        except SpendLimitExceeded as exc:
            self.repository.transition(job.id, JobState.FAILED, worker_id=self.worker_id, error=str(exc))
        except Exception as exc:
            if message.receive_count >= self.max_receive_count or job.attempt_count >= job.max_attempts:
                self.repository.transition(job.id, JobState.FAILED, worker_id=self.worker_id, error=str(exc))
                self.queue.move_to_dlq(message)
            else:
                self.repository.release_for_retry(job.id, str(exc), delay_seconds=self.retry_delay_seconds)
                self.queue.retry(message, visibility_timeout=self.visibility_timeout)
            return True
        self.queue.acknowledge(message)
        return True

    def _execute(self, claimed: Job) -> None:
        job = self.repository.get(claimed.id)
        if job is None:
            raise KeyError(claimed.id)
        payload = job.payload if isinstance(job.payload, dict) else {}
        raw_candidates = payload.get("candidates", [])
        if not isinstance(raw_candidates, list):
            raise ValueError("job payload candidates must be a list")
        candidates = [item if isinstance(item, dict) else {"id": str(index), "value": item} for index, item in enumerate(raw_candidates)]
        self.repository.transition(job.id, JobState.EVALUATING, worker_id=self.worker_id)
        fresh = self.repository.get(job.id)
        completed_ids = set((fresh.checkpoint if fresh else {}).get("completed_candidate_ids", []))
        spent = float((fresh.spent_usd if fresh else 0.0) or 0.0)
        persisted = {row.candidate_id for row in (fresh.candidate_results if fresh else [])}
        for index, candidate in enumerate(candidates):
            candidate_id = str(candidate.get("id", index))
            if candidate_id in completed_ids or candidate_id in persisted:
                continue
            estimated = float(candidate.get("cost_usd", 0.0) or 0.0)
            if estimated < 0:
                raise ValueError("candidate cost cannot be negative")
            cap = float((fresh.max_experiment_cost_usd if fresh else job.max_experiment_cost_usd) or 0.0)
            if spent + estimated > cap + 1e-12:
                raise SpendLimitExceeded(f"spend cap exceeded: {spent + estimated:.8f} > {cap:.8f}")
            result = self._invoke_executor(candidate, fresh or job)
            if isinstance(result, (int, float)):
                result = {"score": float(result)}
            if not isinstance(result, dict):
                raise TypeError("candidate executor must return a mapping or number")
            cost = float(result.get("cost_usd", estimated) or 0.0)
            if cost < 0 or spent + cost > cap + 1e-12:
                raise SpendLimitExceeded(f"spend cap exceeded: {spent + cost:.8f} > {cap:.8f}")
            spent += cost
            completed_ids.add(candidate_id)
            checkpoint = {"next_candidate_index": index + 1, "completed_candidate_ids": sorted(completed_ids)}
            self.repository.record_candidate(job.id, candidate_id, result, cost, checkpoint)
        self.repository.transition(job.id, JobState.VALIDATING, worker_id=self.worker_id)
        final = self.repository.get(job.id)
        self.repository.checkpoint(job.id, {**(final.checkpoint if final else {}), "next_candidate_index": len(candidates), "completed_candidate_ids": sorted(completed_ids)}, spent_usd=spent)
        self.repository.transition(job.id, JobState.COMPLETED, worker_id=self.worker_id)

    def _invoke_executor(self, candidate: dict[str, Any], job: Job) -> dict[str, Any] | float | int:
        try:
            signature = inspect.signature(self.candidate_executor)
            if len(signature.parameters) == 1:
                return self.candidate_executor(candidate)
        except (TypeError, ValueError):
            pass
        return self.candidate_executor(candidate, job)

    def run_forever(self, *, stop_event: Event | None = None, poll_interval_seconds: float = 1.0, max_iterations: int | None = None) -> None:
        import time
        stop_event = stop_event or Event()
        iterations = 0
        while not stop_event.is_set() and (max_iterations is None or iterations < max_iterations):
            processed = self.process_once()
            iterations += 1
            if not processed and poll_interval_seconds > 0:
                stop_event.wait(poll_interval_seconds)
