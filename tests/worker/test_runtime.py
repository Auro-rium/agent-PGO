from __future__ import annotations

import json

import pytest

from apps.api.db import create_session_factory, create_tables
from apps.api.models import Job, Organization
from services.worker.queue import InMemoryQueue, SQSQueueConsumer, SQSQueuePublisher
from services.worker.runtime import JobRepository, WorkerRuntime


def test_sqs_publisher_and_consumer_use_json_message_contract() -> None:
    calls: list[dict] = []

    class Client:
        def send_message(self, **kwargs):
            calls.append(kwargs)
            return {"MessageId": "m-1"}

        def receive_message(self, **kwargs):
            return {"Messages": []}

    publisher = SQSQueuePublisher("https://sqs.example/jobs", client=Client())
    assert publisher.publish("job-1", {"kind": "optimization"}) == "m-1"
    assert calls[0]["QueueUrl"].endswith("/jobs")
    assert json.loads(calls[0]["MessageBody"]) == {"job_id": "job-1", "kind": "optimization"}


def test_repository_claim_is_atomic_and_only_queued_jobs_are_claimable(tmp_path) -> None:
    factory = create_session_factory(f"sqlite:///{tmp_path / 'jobs.db'}")
    create_tables(factory)
    with factory.begin() as session:
        organization = Organization(name="Acme")
        session.add(organization)
        session.flush()
        job = Job(organization_id=organization.id, kind="optimization", payload={})
        session.add(job)
        session.flush()
        job_id = job.id

    repository = JobRepository(factory)
    claimed = repository.claim_next("worker-a", lease_seconds=30)
    assert claimed is not None and claimed.id == job_id
    assert claimed.status == "running"
    assert repository.claim_next("worker-b", lease_seconds=30) is None


def test_worker_checkpoints_candidates_and_is_idempotent(tmp_path) -> None:
    factory = create_session_factory(f"sqlite:///{tmp_path / 'jobs.db'}")
    create_tables(factory)
    with factory.begin() as session:
        organization = Organization(name="Acme")
        session.add(organization)
        session.flush()
        job = Job(
            organization_id=organization.id,
            kind="optimization",
            payload={"candidates": [{"id": "c-1", "cost_usd": 0.25}, {"id": "c-2", "cost_usd": 0.25}]},
            max_experiment_cost_usd=1,
        )
        session.add(job)
        session.flush()
        job_id = job.id

    queue = InMemoryQueue()
    queue.publish(job_id, {})
    runtime = WorkerRuntime(factory, queue, worker_id="worker-a")
    assert runtime.process_once() is True
    assert runtime.process_once() is False
    with factory() as session:
        row = session.get(Job, job_id)
        assert row is not None
        assert row.status == "completed"
        assert row.checkpoint["completed_candidate_ids"] == ["c-1", "c-2"]
        assert len(row.candidate_results) == 2


def test_worker_moves_poison_message_to_dlq_after_bounded_receives(tmp_path) -> None:
    factory = create_session_factory(f"sqlite:///{tmp_path / 'jobs.db'}")
    create_tables(factory)
    queue = InMemoryQueue()
    queue.publish("missing-job", {})
    runtime = WorkerRuntime(factory, queue, worker_id="worker-a", max_receive_count=1)
    assert runtime.process_once() is False
    assert len(queue.dead_letters) == 1


def test_worker_stops_before_exceeding_spend_cap(tmp_path) -> None:
    factory = create_session_factory(f"sqlite:///{tmp_path / 'jobs.db'}")
    create_tables(factory)
    with factory.begin() as session:
        organization = Organization(name="Acme")
        session.add(organization)
        session.flush()
        job = Job(
            organization_id=organization.id,
            kind="optimization",
            payload={"candidates": [{"id": "too-expensive", "cost_usd": 1.01}]},
            max_experiment_cost_usd=1,
        )
        session.add(job)
        session.flush()
        job_id = job.id
    queue = InMemoryQueue()
    queue.publish(job_id, {})
    runtime = WorkerRuntime(factory, queue, worker_id="worker-a")
    assert runtime.process_once() is True
    with factory() as session:
        assert session.get(Job, job_id).status == "failed"
