"""FastAPI application and canonical OTLP/HTTP ingestion route."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
from statistics import quantiles

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .auth import Tenant, authenticate
from .db import create_session_factory, session_dependency
from .models import Job, Organization, Project, Trace
from .schemas import IngestionResponse, OTLPExportRequest, ResourceSpans, Span
from services.worker.queue import SQSQueuePublisher


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9][a-z0-9_-]*$")


class ProjectResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    slug: str


class EvalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    cases: list[dict[str, Any]] = Field(default_factory=list)


class RunCreate(BaseModel):
    project_id: str | None = None
    dataset_id: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    max_experiment_cost_usd: float = Field(default=25.0, gt=0, le=100000)


class RunResponse(BaseModel):
    run_id: str
    status: str


def _nanos_to_datetime(value: int | str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1_000_000_000, tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        # OTLP identifiers are validated strictly, but timestamps can be
        # omitted or outside datetime's range.  Keep ingestion available and
        # preserve the original value in raw_span in that case.
        return None


def _value(value: AnyValueLike) -> Any:
    data = value.model_dump(by_alias=True, exclude_none=True)
    for key in ("stringValue", "boolValue", "intValue", "doubleValue", "bytesValue", "arrayValue", "kvlistValue"):
        if key in data:
            return data[key]
    return None


class AnyValueLike:
    def model_dump(self, **kwargs: Any) -> dict[str, Any]:  # pragma: no cover - protocol typing only
        raise NotImplementedError


def _attributes(items: list[AnyValueLike]) -> dict[str, Any]:
    return {item.key: _value(item.value) for item in items}


def _spans(payload: OTLPExportRequest):
    for resource_spans in payload.resource_spans:
        resource_attributes = _attributes(resource_spans.resource.attributes) if resource_spans.resource else {}
        service_name = resource_attributes.get("service.name")
        for scope_spans in resource_spans.scope_spans:
            scope = scope_spans.scope.model_dump(by_alias=True, exclude_none=True) if scope_spans.scope else {}
            for span in scope_spans.spans:
                yield resource_spans, scope_spans, span, resource_attributes, service_name, scope


def _project_for_request(
    *, request: Request, project_id: str | None, tenant: Tenant, session: Session
) -> Project:
    requested = project_id or request.headers.get("X-AgentPGO-Project-ID")
    if tenant.project_id and requested and requested != tenant.project_id:
        raise HTTPException(status_code=403, detail="Project is outside API key scope")
    resolved = tenant.project_id or requested
    if not resolved:
        raise HTTPException(status_code=400, detail="project_id is required for organization API keys")
    project = session.scalar(
        select(Project).where(Project.id == resolved, Project.organization_id == tenant.organization_id)
    )
    if project is None:
        raise HTTPException(status_code=403, detail="Project is outside API key scope")
    return project


def _require_json(request: Request) -> None:
    content_type = request.headers.get("content-type", "application/json").split(";", 1)[0].strip().lower()
    if content_type not in {"application/json", ""}:
        raise HTTPException(status_code=415, detail="OTLP JSON requires application/json content type")


def _tenant_dependency(session_factory: sessionmaker[Session]):
    get_session = session_dependency(session_factory)

    def get_tenant(
        request: Request,
        session: Session = Depends(get_session),
        authorization: str | None = Header(default=None),
        x_api_key: str | None = Header(default=None),
    ) -> Tenant:
        return authenticate(request, session, authorization, x_api_key)

    return get_tenant, get_session


def create_app(
    *, session_factory: sessionmaker[Session] | None = None, database_url: str | None = None, queue_publisher: Any | None = None
) -> FastAPI:
    factory = session_factory or create_session_factory(database_url)
    get_tenant, get_session = _tenant_dependency(factory)
    app = FastAPI(title="AgentPGO API", version="1.0.0")
    app.state.session_factory = factory
    app.state.datasets = {}
    app.state.runs = {}
    app.state.queue_publisher = queue_publisher
    if app.state.queue_publisher is None and os.getenv("SQS_QUEUE_URL"):
        app.state.queue_publisher = SQSQueuePublisher(os.environ["SQS_QUEUE_URL"])

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready", tags=["system"])
    def ready() -> dict[str, str]:
        """Readiness checks the configured database, not merely process liveness."""
        try:
            with factory() as session:
                session.execute(select(1))
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database is not ready") from exc
        return {"status": "ready"}

    @app.get("/v1/organizations/me", tags=["organizations"])
    def current_organization(
        tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)
    ) -> dict[str, Any]:
        organization = session.get(Organization, tenant.organization_id)
        if organization is None:
            raise HTTPException(status_code=401, detail="Organization no longer exists")
        return {"id": organization.id, "name": organization.name}

    @app.get("/v1/projects", response_model=list[ProjectResponse], tags=["projects"])
    def list_projects(tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)):
        return session.scalars(
            select(Project).where(Project.organization_id == tenant.organization_id).order_by(Project.created_at)
        ).all()

    @app.post("/v1/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED, tags=["projects"])
    def create_project(
        body: ProjectCreate, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)
    ):
        project = Project(organization_id=tenant.organization_id, name=body.name, slug=body.slug)
        session.add(project)
        try:
            session.commit()
        except Exception:
            session.rollback()
            raise HTTPException(status_code=409, detail="Project slug already exists")
        session.refresh(project)
        return project

    @app.post("/v1/traces", response_model=IngestionResponse, tags=["otlp"], dependencies=[Depends(_require_json)])
    @app.post("/v1/otlp/v1/traces", response_model=IngestionResponse, include_in_schema=False, tags=["otlp"], dependencies=[Depends(_require_json)])
    def ingest_traces(
        request: Request,
        payload: OTLPExportRequest,
        project_id: str | None = Query(default=None),
        tenant: Tenant = Depends(get_tenant),
        session: Session = Depends(get_session),
    ) -> IngestionResponse:
        project = _project_for_request(request=request, project_id=project_id, tenant=tenant, session=session)
        accepted = 0
        for _resource_spans, _scope_spans, span, resource_attributes, service_name, scope in _spans(payload):
            existing = session.scalar(
                select(Trace.id).where(
                    Trace.project_id == project.id,
                    Trace.trace_id == span.trace_id.lower(),
                    Trace.span_id == span.span_id.lower(),
                )
            )
            if existing is not None:
                continue
            row = Trace(
                organization_id=tenant.organization_id,
                project_id=project.id,
                trace_id=span.trace_id.lower(),
                span_id=span.span_id.lower(),
                parent_span_id=span.parent_span_id.lower() if span.parent_span_id else None,
                name=span.name,
                kind=span.kind,
                start_time=_nanos_to_datetime(span.start_time_unix_nano),
                end_time=_nanos_to_datetime(span.end_time_unix_nano),
                status_code=span.status.code if span.status else None,
                status_message=span.status.message if span.status else None,
                service_name=service_name if isinstance(service_name, str) else None,
                resource_attributes=resource_attributes,
                attributes=_attributes(span.attributes),
                events=span.events,
                links=span.links,
                scope=scope,
                raw_span=span.model_dump(by_alias=True, exclude_none=True),
            )
            session.add(row)
            accepted += 1
        session.commit()
        return IngestionResponse(accepted=accepted)

    @app.get("/v1/projects/{project_id}/profile", response_model=dict[str, Any], tags=["profile"])
    def project_profile(project_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        project = session.scalar(select(Project).where(Project.id == project_id, Project.organization_id == tenant.organization_id))
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        rows = list(session.scalars(select(Trace).where(Trace.project_id == project_id)).all())
        latencies = [max(0.0, (r.end_time - r.start_time).total_seconds() * 1000) for r in rows if r.start_time and r.end_time]
        p95 = quantiles(latencies, n=20, method="inclusive")[18] if len(latencies) >= 2 else (latencies[0] if latencies else 0.0)
        calls = len(rows)
        return {"project_id": project_id, "runs_observed": len({r.trace_id for r in rows}), "model_calls": calls, "p50_latency_ms": (quantiles(latencies, n=2, method="inclusive")[0] if len(latencies) >= 2 else (latencies[0] if latencies else 0.0)), "p95_latency_ms": p95, "spans": calls}

    @app.post("/v1/profiles", response_model=dict[str, Any], status_code=status.HTTP_202_ACCEPTED, tags=["profile"])
    def queue_profile(payload: dict[str, Any], tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        run_id = str(uuid4())
        job = Job(id=run_id, organization_id=tenant.organization_id, kind="profile", payload=payload)
        session.add(job)
        session.commit()
        app.state.runs[run_id] = {"run_id": run_id, "organization_id": tenant.organization_id, "kind": "profile", "status": "queued", "payload": payload}
        if app.state.queue_publisher is not None:
            app.state.queue_publisher.publish(run_id, {"kind": "profile"})
        return {"run_id": run_id, "status": "queued"}

    @app.post("/v1/evals", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED, tags=["evals"])
    def create_eval(body: EvalCreate, tenant: Tenant = Depends(get_tenant)) -> dict[str, Any]:
        dataset_id = str(uuid4())
        app.state.datasets[dataset_id] = {"id": dataset_id, "organization_id": tenant.organization_id, "name": body.name, "cases": body.cases, "version": 1}
        return app.state.datasets[dataset_id]

    @app.post("/v1/evals/import", response_model=dict[str, Any], status_code=status.HTTP_202_ACCEPTED, tags=["evals"])
    def import_eval(payload: dict[str, Any], tenant: Tenant = Depends(get_tenant)) -> dict[str, Any]:
        dataset_id = str(uuid4())
        cases = payload.get("cases", [])
        app.state.datasets[dataset_id] = {"id": dataset_id, "organization_id": tenant.organization_id, "name": payload.get("project", "imported"), "cases": cases, "version": 1}
        return {"dataset_id": dataset_id, "status": "accepted", "case_count": len(cases)}

    @app.post("/v1/evals/{dataset_id}/cases", response_model=dict[str, Any], tags=["evals"])
    def add_eval_cases(dataset_id: str, cases: list[dict[str, Any]], tenant: Tenant = Depends(get_tenant)) -> dict[str, Any]:
        dataset = app.state.datasets.get(dataset_id)
        if not dataset or dataset["organization_id"] != tenant.organization_id:
            raise HTTPException(status_code=404, detail="Evaluation dataset not found")
        dataset["cases"].extend(cases)
        dataset["version"] += 1
        return {"id": dataset_id, "case_count": len(dataset["cases"]), "version": dataset["version"]}

    def _queue_run(kind: str, body: RunCreate, tenant: Tenant, session: Session) -> RunResponse:
        run_id = str(uuid4())
        payload = {"config": body.config, "dataset_id": body.dataset_id, "project_id": body.project_id}
        if body.project_id:
            project = session.scalar(select(Project).where(Project.id == body.project_id, Project.organization_id == tenant.organization_id))
            if project is None:
                raise HTTPException(status_code=403, detail="Project is outside API key scope")
        job = Job(
            id=run_id,
            organization_id=tenant.organization_id,
            project_id=body.project_id,
            kind=kind,
            payload=payload,
            max_experiment_cost_usd=body.max_experiment_cost_usd,
        )
        session.add(job)
        session.commit()
        app.state.runs[run_id] = {"run_id": run_id, "organization_id": tenant.organization_id, "kind": kind, "status": "queued", "config": body.config, "max_experiment_cost_usd": body.max_experiment_cost_usd}
        if app.state.queue_publisher is not None:
            app.state.queue_publisher.publish(run_id, {"kind": kind})
        return RunResponse(run_id=run_id, status="queued")

    @app.post("/v1/baselines/run", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED, tags=["baselines"])
    def run_baseline(body: RunCreate, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> RunResponse:
        return _queue_run("baseline", body, tenant, session)

    def _run_for_tenant(run_id: str, kind: str, tenant: Tenant, session: Session) -> dict[str, Any]:
        # The database is authoritative after a worker has changed the state;
        # the in-memory map remains a compatibility fallback for old callers.
        job = session.scalar(select(Job).where(Job.id == run_id, Job.organization_id == tenant.organization_id, Job.kind == kind))
        if job is not None:
            return {
                "run_id": job.id,
                "organization_id": job.organization_id,
                "kind": job.kind,
                "status": job.status,
                "config": (job.payload or {}).get("config", {}),
                "max_experiment_cost_usd": job.max_experiment_cost_usd,
                "result": job.result,
                "error": job.error,
            }
        run = app.state.runs.get(run_id)
        if run is not None:
            if run["organization_id"] != tenant.organization_id or run["kind"] != kind:
                raise HTTPException(status_code=404, detail=f"{kind.title()} not found")
            return run
        raise HTTPException(status_code=404, detail=f"{kind.title()} not found")

    @app.get("/v1/baselines/{run_id}", response_model=dict[str, Any], tags=["baselines"])
    def get_baseline(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        return _run_for_tenant(run_id, "baseline", tenant, session)

    @app.post("/v1/optimize", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED, include_in_schema=False, tags=["optimizations"])
    def cli_optimize(body: RunCreate, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> RunResponse:
        return _queue_run("optimization", body, tenant, session)

    @app.post("/v1/optimizations", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED, tags=["optimizations"])
    def create_optimization(body: RunCreate, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> RunResponse:
        return _queue_run("optimization", body, tenant, session)

    @app.get("/v1/optimizations/{run_id}", response_model=dict[str, Any], tags=["optimizations"])
    def get_optimization(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        return _run_for_tenant(run_id, "optimization", tenant, session)

    @app.get("/v1/optimizations/{run_id}/candidates", response_model=list[dict[str, Any]], tags=["optimizations"])
    def optimization_candidates(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> list[dict[str, Any]]:
        run = _run_for_tenant(run_id, "optimization", tenant, session)
        if run.get("candidates") is not None:
            return list(run.get("candidates", []))
        rows = session.scalars(select(Job).where(Job.id == run_id)).first()
        return [{"id": row.candidate_id, **row.result} for row in rows.candidate_results] if rows else []

    @app.get("/v1/optimizations/{run_id}/recommendation", response_model=dict[str, Any], tags=["optimizations"])
    def optimization_recommendation(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        run = _run_for_tenant(run_id, "optimization", tenant, session)
        recommendation = run.get("recommendation") or (run.get("result") or {}).get("recommendation")
        if recommendation is None:
            raise HTTPException(status_code=409, detail="Recommendation is not ready")
        return recommendation

    @app.get("/v1/policy/export", response_model=dict[str, Any], include_in_schema=False, tags=["optimizations"])
    def policy_export(project: str | None = None, tenant: Tenant = Depends(get_tenant)) -> dict[str, Any]:
        return {"project": project or "agent", "status": "queued", "organization_id": tenant.organization_id}

    @app.post("/v1/config/export", response_model=dict[str, Any], tags=["optimizations"])
    def export_config(payload: dict[str, Any], tenant: Tenant = Depends(get_tenant)) -> dict[str, Any]:
        return {"organization_id": tenant.organization_id, "format": "yaml", "config": payload.get("config", payload)}

    return app


app = create_app()
