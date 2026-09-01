"""FastAPI application, OTLP ingestion, and durable control-plane API."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from statistics import quantiles
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from . import models as api_models
from .auth import Tenant, authenticate
from .db import create_session_factory, session_dependency
from .models import Job, Organization, Project, Trace
from .schemas import IngestionResponse, OTLPExportRequest
from services.worker.queue import SQSQueuePublisher

try:
    from services.contracts import JobPayload
except ImportError:  # pragma: no cover - compatibility with pre-contract installs
    JobPayload = None  # type: ignore[assignment,misc]

MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_EVAL_CASES = 1_000
MAX_EVAL_GRADERS = 64
MAX_CONFIG_CANDIDATES = 256
MAX_CONFIG_BYTES = 256 * 1024
DEFAULT_APP_ORIGIN = "https://2syexxoronpapxxxhzu6grgi4a0limkr.lambda-url.us-east-1.on.aws"
CONTENT_KEY = re.compile(r"(?:^|[._-])(prompt|input|completion|output|content|message|messages|secret|password|authorization|api[-_]?key)(?:$|[._-])", re.I)
REDACTED = "[REDACTED]"


def _request_id(request: Request) -> str:
    """Return a bounded, log-safe request ID, preserving client correlation."""
    supplied = request.headers.get("x-request-id", "").strip()
    if supplied and len(supplied) <= 128 and re.fullmatch(r"[A-Za-z0-9._:-]+", supplied):
        return supplied
    return f"req_{uuid4().hex}"


def _error_code(status_code: int) -> str:
    return {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        415: "UNSUPPORTED_MEDIA_TYPE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_SERVER_ERROR",
        503: "SERVICE_UNAVAILABLE",
    }.get(status_code, "REQUEST_FAILED")


def _error_response(request: Request, status_code: int, message: str, *, fields: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or _request_id(request)
    body = {
        "error": {
            "code": _error_code(status_code),
            "message": message,
            "requestId": request_id,
            "fields": fields or {},
        },
        # Kept as a read-only compatibility field for existing SDK callers.
        # New clients should consume the stable `error` envelope above.
        "detail": message,
    }
    response = JSONResponse(body, status_code=status_code, headers=headers)
    response.headers["x-request-id"] = request_id
    return response


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9][a-z0-9_-]*$")


class ProjectResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    slug: str


class EvalCreate(BaseModel):
    project_id: str | None = Field(default=None, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    cases: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVAL_CASES)
    graders: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVAL_GRADERS)


class RunCreate(BaseModel):
    project_id: str | None = Field(default=None, max_length=255)
    dataset_id: str | None = Field(default=None, max_length=255)
    config: dict[str, Any] = Field(default_factory=dict)
    max_experiment_cost_usd: float = Field(default=25.0, gt=0, le=100000)

    @field_validator("config")
    @classmethod
    def bounded_config(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, default=str)) > MAX_CONFIG_BYTES:
            raise ValueError("config exceeds the maximum size")
        candidates = value.get("candidates", value.get("candidate_configs", []))
        if candidates is not None and (not isinstance(candidates, list) or len(candidates) > MAX_CONFIG_CANDIDATES):
            raise ValueError(f"config supports at most {MAX_CONFIG_CANDIDATES} candidates")
        return value


class RunResponse(BaseModel):
    run_id: str
    status: str


def _nanos_to_datetime(value: int | str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1_000_000_000, tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _redact(value: Any, key: str | None = None) -> Any:
    """Recursively remove customer content and credentials at the API edge."""
    if key and CONTENT_KEY.search(key) and not key.lower().endswith(("tokens", "token_count")):
        return REDACTED
    if isinstance(value, dict):
        return {str(k): _redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _value(value: Any) -> Any:
    data = value.model_dump(by_alias=True, exclude_none=True)
    for key in ("stringValue", "boolValue", "intValue", "doubleValue", "bytesValue", "arrayValue", "kvlistValue"):
        if key in data:
            return _redact(data[key], key)
    return None


def _attributes(items: list[Any]) -> dict[str, Any]:
    return {item.key: _redact(_value(item.value), item.key) for item in items}


def _spans(payload: OTLPExportRequest):
    for resource_spans in payload.resource_spans:
        resource_attributes = _attributes(resource_spans.resource.attributes) if resource_spans.resource else {}
        service_name = resource_attributes.get("service.name")
        for scope_spans in resource_spans.scope_spans:
            scope = _redact(scope_spans.scope.model_dump(by_alias=True, exclude_none=True) if scope_spans.scope else {})
            for span in scope_spans.spans:
                yield span, resource_attributes, service_name, scope


def _project_for_request(*, request: Request, project_id: str | None, tenant: Tenant, session: Session) -> Project:
    header_project = request.headers.get("X-AgentPGO-Project-ID")
    if project_id and header_project and project_id != header_project:
        raise HTTPException(status_code=403, detail="Project is outside API key scope")
    requested = project_id or header_project
    if tenant.project_id and requested and requested != tenant.project_id:
        raise HTTPException(status_code=403, detail="Project is outside API key scope")
    resolved = tenant.project_id or requested
    if not resolved:
        raise HTTPException(status_code=400, detail="project_id is required for organization API keys")
    project = session.scalar(select(Project).where(Project.id == resolved, Project.organization_id == tenant.organization_id))
    if project is None:
        raise HTTPException(status_code=403, detail="Project is outside API key scope")
    return project


def _project_reference(reference: str | None, *, tenant: Tenant, session: Session) -> Project:
    if tenant.project_id and reference and reference not in {tenant.project_id}:
        # A project-scoped key may also address its own project by slug.
        own = session.scalar(select(Project).where(Project.id == tenant.project_id, Project.organization_id == tenant.organization_id))
        if own is None or reference != own.slug:
            raise HTTPException(status_code=403, detail="Project is outside API key scope")
    resolved = tenant.project_id or reference
    if not resolved:
        raise HTTPException(status_code=400, detail="project_id is required for organization API keys")
    project = session.scalar(select(Project).where(Project.organization_id == tenant.organization_id, or_(Project.id == resolved, Project.slug == resolved)))
    if project is None or (tenant.project_id and project.id != tenant.project_id):
        raise HTTPException(status_code=403, detail="Project is outside API key scope")
    return project


def _require_json(request: Request) -> None:
    content_type = request.headers.get("content-type", "application/json").split(";", 1)[0].strip().lower()
    if content_type not in {"application/json", ""}:
        raise HTTPException(status_code=415, detail="OTLP JSON requires application/json content type")


def _tenant_dependency(session_factory: sessionmaker[Session]):
    get_session = session_dependency(session_factory)

    def get_tenant(request: Request, session: Session = Depends(get_session), authorization: str | None = Header(default=None), x_api_key: str | None = Header(default=None)) -> Tenant:
        return authenticate(request, session, authorization, x_api_key)

    return get_tenant, get_session


def _model(name: str) -> Any:
    model = getattr(api_models, name, None)
    if model is None:
        raise HTTPException(status_code=503, detail=f"{name} persistence is unavailable")
    return model


def _record_outbox(session: Session, tenant: Tenant, aggregate_type: str, aggregate_id: str, event_type: str, payload: dict[str, Any]) -> None:
    cls = getattr(api_models, "OutboxEvent", None)
    if cls is not None:
        session.add(cls(organization_id=tenant.organization_id, aggregate_type=aggregate_type, aggregate_id=aggregate_id, event_type=event_type, dedupe_key=f"{aggregate_id}:{event_type}", payload=payload))


def _dataset_for_request(dataset_id: str, *, tenant: Tenant, project: Project, session: Session) -> Any:
    cls = _model("EvalDataset")
    dataset = session.scalar(select(cls).where(cls.id == dataset_id, cls.organization_id == tenant.organization_id, cls.project_id == project.id))
    if dataset is None:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")
    return dataset


def _case_values(case: dict[str, Any], index: int) -> dict[str, Any]:
    return {"case_id": str(case.get("case_id", case.get("id", index))), "input_data": case.get("input_data", case.get("input", case.get("prompt", {}))), "expected": case.get("expected", case.get("output", case.get("answer", {}))), "metadata_json": case.get("metadata_json", case.get("metadata", {})), "ordinal": index}


def _create_dataset(body: EvalCreate, *, tenant: Tenant, project: Project, session: Session) -> dict[str, Any]:
    dataset_cls, case_cls, grader_cls = _model("EvalDataset"), _model("EvalCase"), _model("EvalGrader")
    dataset = dataset_cls(organization_id=tenant.organization_id, project_id=project.id, name=body.name, version=1, metadata_json={})
    session.add(dataset)
    session.flush()
    for index, case in enumerate(body.cases):
        session.add(case_cls(dataset_id=dataset.id, **_case_values(case, index)))
    for index, grader in enumerate(body.graders):
        session.add(grader_cls(dataset_id=dataset.id, name=str(grader.get("name", f"grader-{index}")), kind=str(grader.get("kind", "exact_match")), config=dict(grader.get("config", {})), ordinal=index))
    session.commit()
    session.refresh(dataset)
    return {"id": dataset.id, "project_id": project.id, "organization_id": tenant.organization_id, "name": dataset.name, "cases": body.cases, "graders": body.graders, "version": dataset.version}


def create_app(*, session_factory: sessionmaker[Session] | None = None, database_url: str | None = None, queue_publisher: Any | None = None) -> FastAPI:
    factory = session_factory or create_session_factory(database_url)
    get_tenant, get_session = _tenant_dependency(factory)
    app = FastAPI(title="AgentPGO API", version="1.0.0")
    configured_origin = os.getenv("APP_ORIGIN")
    if not configured_origin and os.getenv("APP_ENV", "development").strip().lower() != "production":
        configured_origin = DEFAULT_APP_ORIGIN
    # Never use a wildcard origin with credentials. An empty production
    # origin intentionally means browser requests are denied until deployment
    # supplies the real HTTPS frontend origin.
    allowed_origins = [configured_origin.rstrip("/")] if configured_origin and configured_origin.strip() else []
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-AgentPGO-API-Key", "X-AgentPGO-Project-ID", "X-Request-ID", "Idempotency-Key"],
        expose_headers=["x-request-id"],
    )
    app.state.session_factory = factory
    app.state.queue_publisher = queue_publisher
    if app.state.queue_publisher is None and os.getenv("SQS_QUEUE_URL"):
        app.state.queue_publisher = SQSQueuePublisher(os.environ["SQS_QUEUE_URL"])

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = _request_id(request)
        # The /api/v1 aliases are registered as real routes below. Keep the
        # original path available for future diagnostics without rewriting the
        # request scope (BaseHTTPMiddleware routes from its original scope).
        if request.method in {"POST", "PUT", "PATCH"}:
            raw_length = request.headers.get("content-length")
            try:
                if raw_length and int(raw_length) > MAX_REQUEST_BYTES:
                    return _error_response(request, 413, "Request body exceeds maximum size.")
            except ValueError:
                return _error_response(request, 400, "Invalid content length.")
        response = await call_next(request)
        response.headers["x-request-id"] = request.state.request_id
        return response

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        detail = exc.detail
        fields: dict[str, Any] = {}
        if isinstance(detail, dict):
            message = str(detail.get("message", "Request failed."))
            if isinstance(detail.get("fields"), dict):
                fields = detail["fields"]
        elif isinstance(detail, list):
            message = "Request validation failed."
            fields = {str(index): str(item) for index, item in enumerate(detail)}
        else:
            message = str(detail) if detail else "Request failed."
        return _error_response(request, exc.status_code, message, fields=fields, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for item in exc.errors():
            location = ".".join(str(part) for part in item.get("loc", ()) if part != "body") or "request"
            fields[location] = str(item.get("type", "invalid"))
        return _error_response(request, 422, "Request validation failed.", fields=fields)

    @app.exception_handler(Exception)
    async def internal_exception_handler(request: Request, exc: Exception):
        # Do not expose provider/database details or stack traces to clients.
        return _error_response(request, 500, "Internal server error.")

    @app.get("/health", tags=["system"])
    @app.get("/v1/health", include_in_schema=False, tags=["system"])
    def health() -> dict[str, str]: return {"status": "ok"}

    @app.get("/ready", tags=["system"])
    @app.get("/v1/ready", include_in_schema=False, tags=["system"])
    def ready() -> dict[str, str]:
        try:
            with factory() as session: session.execute(select(1))
        except Exception as exc: raise HTTPException(status_code=503, detail="database is not ready") from exc
        return {"status": "ready"}

    @app.get("/v1/me", tags=["auth"])
    def current_identity(tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        organization = session.get(Organization, tenant.organization_id)
        if organization is None:
            raise HTTPException(status_code=401, detail="Organization no longer exists")
        project = session.get(Project, tenant.project_id) if tenant.project_id else None
        if tenant.project_id and project is None:
            raise HTTPException(status_code=401, detail="Project no longer exists")
        result: dict[str, Any] = {
            "id": tenant.api_key_id,
            "organizationId": organization.id,
            "organizationName": organization.name,
            "projectId": project.id if project else None,
            "projectName": project.name if project else None,
            "authType": "demo" if tenant.api_key_id.startswith("demo:") else "api_key",
        }
        return result

    @app.get("/v1/organizations/me", tags=["organizations"])
    def current_organization(tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        organization = session.get(Organization, tenant.organization_id)
        if organization is None: raise HTTPException(status_code=401, detail="Organization no longer exists")
        return {"id": organization.id, "name": organization.name}

    @app.get("/v1/projects", response_model=list[ProjectResponse], tags=["projects"])
    def list_projects(tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)):
        query = select(Project).where(Project.organization_id == tenant.organization_id)
        if tenant.project_id: query = query.where(Project.id == tenant.project_id)
        return session.scalars(query.order_by(Project.created_at)).all()

    @app.post("/v1/projects", response_model=ProjectResponse, status_code=201, tags=["projects"])
    def create_project(body: ProjectCreate, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)):
        if tenant.project_id: raise HTTPException(status_code=403, detail="Project-scoped API keys cannot create projects")
        project = Project(organization_id=tenant.organization_id, name=body.name, slug=body.slug)
        session.add(project)
        try: session.commit()
        except Exception:
            session.rollback(); raise HTTPException(status_code=409, detail="Project slug already exists")
        session.refresh(project); return project

    @app.post("/v1/traces", response_model=IngestionResponse, tags=["otlp"], dependencies=[Depends(_require_json)])
    @app.post("/v1/otlp/v1/traces", response_model=IngestionResponse, include_in_schema=False, tags=["otlp"], dependencies=[Depends(_require_json)])
    def ingest_traces(request: Request, payload: OTLPExportRequest, project_id: str | None = Query(default=None), tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> IngestionResponse:
        project = _project_for_request(request=request, project_id=project_id, tenant=tenant, session=session)
        accepted, seen = 0, set()
        for span, resource_attributes, service_name, scope in _spans(payload):
            key = (span.trace_id.lower(), span.span_id.lower())
            if key in seen: continue
            seen.add(key)
            existing = session.scalar(select(Trace.id).where(Trace.project_id == project.id, Trace.trace_id == key[0], Trace.span_id == key[1]))
            if existing is not None: continue
            redacted_span = _redact(span.model_dump(by_alias=True, exclude_none=True))
            raw_span = redacted_span if os.getenv("AGENTPGO_STORE_RAW_SPAN", "").lower() in {"1", "true", "yes"} else {}
            session.add(Trace(organization_id=tenant.organization_id, project_id=project.id, trace_id=key[0], span_id=key[1], parent_span_id=span.parent_span_id.lower() if span.parent_span_id else None, name=span.name, kind=span.kind, start_time=_nanos_to_datetime(span.start_time_unix_nano), end_time=_nanos_to_datetime(span.end_time_unix_nano), status_code=span.status.code if span.status else None, status_message=REDACTED if span.status and span.status.message else None, service_name=service_name if isinstance(service_name, str) else None, resource_attributes=_redact(resource_attributes), attributes=_attributes(span.attributes), events=_redact(span.events), links=_redact(span.links), scope=scope, raw_span=raw_span))
            accepted += 1
        session.commit(); return IngestionResponse(accepted=accepted)

    @app.get("/v1/projects/{project_id}/profile", response_model=dict[str, Any], tags=["profile"])
    def project_profile(project_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        project = _project_reference(project_id, tenant=tenant, session=session)
        rows = list(session.scalars(select(Trace).where(Trace.project_id == project.id)).all())
        latencies = [max(0.0, (r.end_time - r.start_time).total_seconds() * 1000) for r in rows if r.start_time and r.end_time]
        p95 = quantiles(latencies, n=20, method="inclusive")[18] if len(latencies) >= 2 else (latencies[0] if latencies else 0.0)
        p50 = quantiles(latencies, n=2, method="inclusive")[0] if len(latencies) >= 2 else (latencies[0] if latencies else 0.0)
        return {"project_id": project.id, "runs_observed": len({r.trace_id for r in rows}), "model_calls": len(rows), "p50_latency_ms": p50, "p95_latency_ms": p95, "spans": len(rows)}

    @app.post("/v1/profiles", response_model=dict[str, Any], status_code=202, tags=["profile"])
    def queue_profile(payload: dict[str, Any], request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        project = _project_for_request(request=request, project_id=payload.get("project_id"), tenant=tenant, session=session)
        run_id = str(uuid4()); job = Job(id=run_id, organization_id=tenant.organization_id, project_id=project.id, kind="profile", payload={**payload, "project_id": project.id})
        session.add(job); _record_outbox(session, tenant, "profile", run_id, "profile.queued", {"job_id": run_id}); session.commit()
        if app.state.queue_publisher is not None: app.state.queue_publisher.publish(run_id, {"kind": "profile"})
        return {"run_id": run_id, "status": "queued"}

    @app.post("/v1/evals", response_model=dict[str, Any], status_code=201, tags=["evals"])
    def create_eval(body: EvalCreate, request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        project = _project_for_request(request=request, project_id=body.project_id, tenant=tenant, session=session)
        return _create_dataset(body, tenant=tenant, project=project, session=session)

    @app.post("/v1/evals/import", response_model=dict[str, Any], status_code=202, tags=["evals"])
    def import_eval(payload: dict[str, Any], request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        cases = payload.get("cases", [])
        graders = payload.get("graders", [])
        if not isinstance(cases, list) or len(cases) > MAX_EVAL_CASES: raise HTTPException(status_code=422, detail="invalid or oversized evaluation cases")
        if not isinstance(graders, list) or len(graders) > MAX_EVAL_GRADERS: raise HTTPException(status_code=422, detail="invalid or oversized evaluation graders")
        body = EvalCreate(project_id=payload.get("project_id"), name=str(payload.get("name", payload.get("project", "imported"))), cases=cases, graders=graders)
        project = _project_for_request(request=request, project_id=body.project_id, tenant=tenant, session=session)
        result = _create_dataset(body, tenant=tenant, project=project, session=session)
        return {"dataset_id": result["id"], "status": "accepted", "case_count": len(cases)}

    @app.get("/v1/evals/{dataset_id}", response_model=dict[str, Any], tags=["evals"])
    def get_eval(dataset_id: str, request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        cls = _model("EvalDataset"); dataset = session.scalar(select(cls).where(cls.id == dataset_id, cls.organization_id == tenant.organization_id))
        if dataset is None or (tenant.project_id and dataset.project_id != tenant.project_id): raise HTTPException(status_code=404, detail="Evaluation dataset not found")
        return {"id": dataset.id, "project_id": dataset.project_id, "organization_id": dataset.organization_id, "name": dataset.name, "version": dataset.version, "cases": [{"id": c.case_id, "input": c.input_data, "expected": c.expected, "metadata": c.metadata_json} for c in dataset.cases], "graders": [{"name": g.name, "kind": g.kind, "config": g.config} for g in dataset.graders]}

    @app.post("/v1/evals/{dataset_id}/cases", response_model=dict[str, Any], tags=["evals"])
    def add_eval_cases(dataset_id: str, cases: list[dict[str, Any]], request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> dict[str, Any]:
        if len(cases) > MAX_EVAL_CASES: raise HTTPException(status_code=422, detail="too many evaluation cases")
        dataset_cls, case_cls = _model("EvalDataset"), _model("EvalCase")
        dataset = session.scalar(select(dataset_cls).where(dataset_cls.id == dataset_id, dataset_cls.organization_id == tenant.organization_id))
        if dataset is None or (tenant.project_id and dataset.project_id != tenant.project_id): raise HTTPException(status_code=404, detail="Evaluation dataset not found")
        current = len(dataset.cases); [session.add(case_cls(dataset_id=dataset.id, **_case_values(case, current + i))) for i, case in enumerate(cases)]
        dataset.version += 1; session.commit(); return {"id": dataset.id, "case_count": current + len(cases), "version": dataset.version}

    def _queue_run(kind: str, body: RunCreate, request: Request, tenant: Tenant, session: Session) -> RunResponse:
        project = _project_for_request(request=request, project_id=body.project_id, tenant=tenant, session=session)
        if body.dataset_id: _dataset_for_request(body.dataset_id, tenant=tenant, project=project, session=session)
        run_id = str(uuid4()); config = dict(body.config); config["max_experiment_cost_usd"] = body.max_experiment_cost_usd
        payload_data = {"job_id": run_id, "kind": kind, "organization_id": tenant.organization_id, "project_id": project.id, "dataset_id": body.dataset_id, "config": config}
        if JobPayload is not None:
            try: payload = JobPayload.model_validate(payload_data).to_wire()
            except Exception as exc: raise HTTPException(status_code=422, detail=f"invalid run config: {exc}") from exc
        else: payload = {**payload_data, "candidates": config.get("candidates", [])}
        job = Job(id=run_id, organization_id=tenant.organization_id, project_id=project.id, kind=kind, payload=payload, max_experiment_cost_usd=body.max_experiment_cost_usd)
        session.add(job); _record_outbox(session, tenant, kind, run_id, f"{kind}.queued", {"job_id": run_id}); session.commit()
        if app.state.queue_publisher is not None: app.state.queue_publisher.publish(run_id, {"kind": kind})
        return RunResponse(run_id=run_id, status="queued")

    @app.post("/v1/baselines/run", response_model=RunResponse, status_code=202, tags=["baselines"])
    def run_baseline(body: RunCreate, request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> RunResponse: return _queue_run("baseline", body, request, tenant, session)

    @app.post("/v1/optimize", response_model=RunResponse, status_code=202, include_in_schema=False, tags=["optimizations"])
    def cli_optimize(body: RunCreate, request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> RunResponse: return _queue_run("optimization", body, request, tenant, session)

    @app.post("/v1/optimizations", response_model=RunResponse, status_code=202, tags=["optimizations"])
    def create_optimization(body: RunCreate, request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)) -> RunResponse: return _queue_run("optimization", body, request, tenant, session)

    def _run_for_tenant(run_id: str, kind: str, tenant: Tenant, session: Session) -> dict[str, Any]:
        query = select(Job).where(Job.id == run_id, Job.organization_id == tenant.organization_id, Job.kind == kind)
        if tenant.project_id: query = query.where(Job.project_id == tenant.project_id)
        job = session.scalar(query)
        if job is None: raise HTTPException(status_code=404, detail=f"{kind.title()} not found")
        payload = job.payload if isinstance(job.payload, dict) else {}
        return {"run_id": job.id, "organization_id": job.organization_id, "project_id": job.project_id, "kind": job.kind, "status": job.status, "config": payload.get("config", {}), "candidates": payload.get("candidates", []), "max_experiment_cost_usd": job.max_experiment_cost_usd, "result": job.result, "error": job.error}

    @app.get("/v1/baselines/{run_id}", response_model=dict[str, Any], tags=["baselines"])
    def get_baseline(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)): return _run_for_tenant(run_id, "baseline", tenant, session)

    @app.get("/v1/optimizations/{run_id}", response_model=dict[str, Any], tags=["optimizations"])
    def get_optimization(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)): return _run_for_tenant(run_id, "optimization", tenant, session)

    @app.get("/v1/optimizations/{run_id}/candidates", response_model=list[dict[str, Any]], tags=["optimizations"])
    def optimization_candidates(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)):
        run = _run_for_tenant(run_id, "optimization", tenant, session); job = session.get(Job, run_id)
        return [{"id": row.candidate_id, **row.result} for row in (job.candidate_results if job else [])]

    @app.get("/v1/optimizations/{run_id}/recommendation", response_model=dict[str, Any], tags=["optimizations"])
    def optimization_recommendation(run_id: str, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)):
        run = _run_for_tenant(run_id, "optimization", tenant, session); cls = getattr(api_models, "OptimizationResult", None)
        result = session.scalar(select(cls).where(cls.job_id == run_id, cls.organization_id == tenant.organization_id)) if cls is not None else None
        recommendation = getattr(result, "recommendation", None) or (run.get("result") or {}).get("recommendation")
        if recommendation is None: raise HTTPException(status_code=409, detail="Recommendation is not ready")
        return recommendation

    def _persisted_export(reference: str | None, run_id: str | None, tenant: Tenant, session: Session) -> dict[str, Any]:
        project = _project_reference(reference, tenant=tenant, session=session); cls = getattr(api_models, "OptimizationResult", None)
        if cls is None: raise HTTPException(status_code=503, detail="Optimization result persistence is unavailable")
        query = select(cls).where(cls.organization_id == tenant.organization_id, cls.project_id == project.id)
        if run_id: query = query.where(cls.job_id == run_id)
        result = session.scalars(query.order_by(cls.created_at.desc())).first()
        if result is None or getattr(result, "recommendation", None) is None: raise HTTPException(status_code=409, detail="Recommendation is not ready")
        payload = {"project": project.slug, "project_id": project.id, "run_id": result.job_id, "status": result.status, "recommendation": result.recommendation}
        metadata = getattr(result, "metadata_json", None) or getattr(result, "metadata", None)
        if metadata: payload["metadata"] = metadata
        return payload

    @app.get("/v1/policy/export", response_model=dict[str, Any], include_in_schema=False, tags=["optimizations"])
    def policy_export(project: str | None = None, project_id: str | None = None, run_id: str | None = None, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)): return _persisted_export(project_id or project, run_id, tenant, session)

    @app.post("/v1/config/export", response_model=dict[str, Any], tags=["optimizations"])
    def export_config(payload: dict[str, Any], request: Request, tenant: Tenant = Depends(get_tenant), session: Session = Depends(get_session)):
        project = _project_reference(payload.get("project_id", payload.get("project")), tenant=tenant, session=session)
        result = {"organization_id": tenant.organization_id, "project_id": project.id, "format": "yaml", "config": payload.get("config", payload)}
        if payload.get("run_id"):
            result.update(_persisted_export(project.id, payload["run_id"], tenant, session))
        return result

    # Register browser-facing aliases after the canonical /v1 routes have been
    # declared. Cloning APIRoute metadata preserves response models,
    # dependencies (including JSON/content validation), and auth behavior.
    from fastapi.routing import APIRoute

    for route in list(app.routes):
        if not isinstance(route, APIRoute) or not route.path.startswith("/v1"):
            continue
        alias = "/api" + route.path
        app.add_api_route(
            alias,
            route.endpoint,
            methods=sorted(route.methods or set()),
            response_model=route.response_model,
            status_code=route.status_code,
            response_class=route.response_class,
            response_model_include=route.response_model_include,
            response_model_exclude=route.response_model_exclude,
            response_model_by_alias=route.response_model_by_alias,
            response_model_exclude_unset=route.response_model_exclude_unset,
            response_model_exclude_defaults=route.response_model_exclude_defaults,
            response_model_exclude_none=route.response_model_exclude_none,
            tags=route.tags,
            dependencies=route.dependencies,
            include_in_schema=False,
            name=f"{route.name}_api_v1",
        )

    return app


# Starlette imports this name at middleware execution time; keeping it local
# avoids exposing a second HTTP framework dependency in the module API.
from starlette.responses import JSONResponse
app = create_app()
