# AgentPGO

Profile-guided optimization for AI agents.

## Backend V1

This worktree contains the backend-first B2B V1. The unrelated `landingpage/` is preserved unchanged.

- FastAPI API and OTLP ingestion: `apps/api/`
- TypeScript SDK and Vercel AI SDK adapter: `packages/`
- Profiling, evaluation, optimization, statistical gates, and provider seams: `services/`
- CLI: `cli/`
- Alembic schema: `migrations/`

## Local verification

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest -q
node --experimental-strip-types --test packages/*/tests/*.test.ts
```

## Run API

```bash
uvicorn apps.api.main:app --reload
```

The API accepts OTLP JSON at `/v1/traces` and `/v1/otlp/v1/traces`. All protected endpoints require a tenant-scoped API key.

## Scope boundaries

V1 produces recommendations and YAML exports only. It does not change production routing, collect prompt/output content by default, implement a frontend, or integrate payments.
