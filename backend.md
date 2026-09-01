# TwineRun backend contract

This document is the implementation handoff for the backend that will power the
current TwineRun frontend. It describes what the browser does today, which data
is currently mocked, and the contracts the backend must provide when the demo
state is replaced with persisted product data.

The guiding product model is:

> TwineRun profiles an existing agent, benchmarks cheaper model assignments
> against the same evaluations, and exports the lowest-cost configuration that
> remains inside the quality tolerance.

The frontend is a Vite React single-page application. It is currently deployed
as static files inside an AWS Lambda Function URL package. The Lambda handler
serves `landingpage/dist`, falls back to `index.html` for client-side routes,
and does not currently expose an application API.

## 1. Current frontend architecture

### Delivery and routing

- Source directory: `landingpage/`.
- Build command: `npm run build` (`vite build`).
- Typecheck command: `npm run lint` (`tsc --noEmit`).
- Runtime: browser-rendered React 19 bundle.
- Delivery: AWS Lambda Function URL serving the generated `dist/` files.
- Current deployment region: `us-east-1`.
- Client routing uses URL hashes, not server routes:
  - `#` or empty hash: landing page.
  - `#benefits`, `#how-it-works`, `#benchmarks`, `#faqs`, `#pricing`: public pages.
  - `#signin`, `#signup`, `#profile`: frontend demo auth pages.
  - `#studio` and `#studio/{view}`: protected studio pages.

The fragment is never sent to Lambda. Every hash route therefore receives the
same `index.html`; `LandingGateV5` selects the view in the browser. A future
API must use normal request paths such as `/api/v1/...` and must not depend on
hash fragments.

### Current authentication boundary

Authentication is deliberately frontend-only at present:

- `landingpage/src/auth/demoAuth.ts` stores a demo session in
  `localStorage` under `twinerun.demo.session`.
- Sign-in and sign-up validate the form locally and create a demo session.
- The session contains `name`, `email`, `initials`, and `authenticatedAt`.
- `LandingGateV5` redirects unauthenticated studio/profile access to `#signin`.
- Logout clears local storage and navigates to `#signin`.

This is not an authorization boundary. It must be replaced with server-issued
sessions or short-lived access tokens before real projects, traces, prompts,
evaluation data, or exports are exposed.

### Current data boundary

Studio data is imported from `landingpage/src/data/mockAgents.ts`:

- `RESEARCH_PROJECT` is the active project.
- `ALL_PROJECTS` populates the project selector.
- `CANDIDATE_CONFIGS` supplies Pareto candidates.
- `OPTIMIZER_STREAM_EVENTS` supplies the simulated event stream.

The current optimization button runs a timed browser simulation. It resets
nodes to baseline, tests substitutions in sequence, applies accepted models,
updates the selected candidate, and appends mock trace events. These values are
not measurements and must not be treated as production results.

## 2. Canonical domain model

The backend should preserve the existing TypeScript shapes while adding stable
server identifiers and timestamps where needed. JSON names should remain
camelCase to minimize frontend translation.

### Agent project

```ts
interface AgentProject {
  id: string;
  name: string;
  environment: 'PROD' | 'STAGING' | string;
  version: string;
  runId: string;
  totalExecutions: number;
  baselineCost: number;
  optimizedCost: number;
  savingsPct: number;
  monthlySavingsEstimate: number;
  monthlyRequests: number;
  baselineLatencyP95: number;
  optimizedLatencyP95: number;
  baselineQuality: number;
  optimizedQuality: number;
  evalCasesCount: number;
  qualityTolerancePct: number;
  confidencePct: number;
  nodes: AgentNode[];
  edges: GraphEdge[];
}
```

`baselineCost` and `optimizedCost` are decimal currency amounts per execution.
The backend must calculate these from provider pricing and token usage rather
than trusting browser-supplied values. Latency fields are seconds. Quality and
confidence fields are percentages, not fractions. Monetary values should be
stored as fixed-precision decimal values and serialized with at least three
decimal places where displayed as dollars.

### Agent node and model substitutions

```ts
interface AgentNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  baselineModel: string;
  currentModel: string;
  optimizedModel: string;
  calls: number;
  avgCost: number;
  baselineCost: number;
  optimizedCost: number;
  latencySec: number;
  baselineLatencySec: number;
  optimizedLatencySec: number;
  inputTokens: number;
  outputTokens: number;
  costSharePct: number;
  qualitySensitivity: 'HIGH' | 'MEDIUM' | 'LOW';
  isHotspot: boolean;
  promptTemplate: string;
  candidates: CandidateSubstitution[];
}

interface CandidateSubstitution {
  model: string;
  costDelta: number;
  costDeltaPct: number;
  qualityDelta: number;
  latencyDeltaSec: number;
  status: 'RECOMMENDED' | 'VIABLE' | 'REJECTED' | 'BASELINE';
  reason: string;
}
```

The backend owns model catalog validation, provider pricing, token accounting,
and candidate status. `promptTemplate` should be omitted or redacted unless the
user has explicitly enabled prompt storage. Node layout (`x`, `y`) is initially
browser state; it may be persisted separately as described below.

### Graph edges

```ts
interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  throughputTokensPerSec: number;
  avgLatencyMs: number;
}
```

Edges must reference nodes in the same project version. The API should reject
cycles or dangling references unless the underlying agent framework explicitly
supports them.

### Optimization candidates

```ts
interface OptimizationCandidate {
  id: number;
  name: string;
  costPerReq: number;
  qualityPct: number;
  latencySec: number;
  p95LatencySec: number;
  savingsPct: number;
  nodeModels: Record<string, string>;
  isCheapest?: boolean;
  isBalanced?: boolean;
  isHighestQuality?: boolean;
  isBaseline?: boolean;
  isParetoOptimal: boolean;
  evalPassRate: number;
  evalCount: number;
}
```

Candidate IDs are scoped to an optimization run; do not assume candidate `42`
is globally meaningful. The backend must persist the exact node-to-model map,
evaluation dataset version, model versions, pricing snapshot, and optimizer
parameters used to produce each candidate.

### Events and evaluation cases

```ts
interface OptimizerEvent {
  id: string;
  timestamp: string;
  nodeId?: string;
  nodeName?: string;
  fromModel?: string;
  toModel?: string;
  type: 'BASELINE' | 'TESTING' | 'PASS' | 'REJECT' | 'FRONTIER' | 'SELECTED' | 'INFO';
  costChangePct?: number;
  qualityDeltaPp?: number;
  costPerReq?: number;
  qualityPct?: number;
  message: string;
}

interface EvalCase {
  id: string;
  category: string;
  prompt: string;
  baselineScore: number;
  optimizedScore: number;
  baselineLatencyMs: number;
  optimizedLatencyMs: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  passed: boolean;
  diffNote: string;
}
```

Event timestamps should be server timestamps or run-relative timestamps with a
documented format. Evaluation prompts and outputs are sensitive data; the API
must support metadata-only profiling and configurable redaction.

## 3. Proposed API surface

All new endpoints should be versioned under `/api/v1`, return JSON, and include
an `x-request-id` response header. The browser should send credentials using
same-site secure cookies or an authorization token according to the chosen auth
implementation.

### Authentication and profile

```text
POST /api/v1/auth/signup
POST /api/v1/auth/signin
POST /api/v1/auth/logout
POST /api/v1/auth/refresh                 # only if using refresh tokens
GET  /api/v1/me
PATCH /api/v1/me
```

Example sign-in request:

```json
{
  "email": "builder@example.com",
  "password": "..."
}
```

Successful authentication returns the user profile and establishes a secure
session. Passwords are never returned. Validation errors must identify fields
without revealing whether an email is registered. Logout must revoke the
session server-side.

### Projects and versions

```text
GET  /api/v1/projects
POST /api/v1/projects
GET  /api/v1/projects/{projectId}
PATCH /api/v1/projects/{projectId}
DELETE /api/v1/projects/{projectId}
GET  /api/v1/projects/{projectId}/versions
GET  /api/v1/projects/{projectId}/versions/{versionId}
```

`GET /projects/{projectId}` should return the complete project summary needed by
the graph, inspector, frontier, diff, trace, and eval views. Large traces and
evaluation cases should be loaded through their dedicated endpoints rather than
inflating this response.

### Profiling and traces

```text
POST /api/v1/projects/{projectId}/profiles
GET  /api/v1/projects/{projectId}/profiles/{profileId}
POST /api/v1/projects/{projectId}/traces/ingest
GET  /api/v1/projects/{projectId}/traces
GET  /api/v1/projects/{projectId}/traces/{traceId}
```

The ingestion endpoint should accept normalized OpenTelemetry spans. Minimum
normalized fields:

```json
{
  "traceId": "trace_123",
  "spanId": "span_456",
  "parentSpanId": "span_000",
  "nodeId": "node-researcher",
  "model": "provider/model",
  "provider": "provider",
  "startedAt": "2026-09-01T10:00:00Z",
  "durationMs": 8200,
  "inputTokens": 14500,
  "outputTokens": 2100,
  "status": "ok",
  "cost": 0.119
}
```

Prompt and output bodies must be opt-in. Ingestion must be authenticated,
size-limited, deduplicated by provider event ID or span ID, and processed
asynchronously for large payloads.

### Evaluation suites and runs

```text
GET  /api/v1/projects/{projectId}/eval-suites
POST /api/v1/projects/{projectId}/eval-suites
GET  /api/v1/eval-suites/{suiteId}
POST /api/v1/eval-suites/{suiteId}/runs
GET  /api/v1/eval-runs/{runId}
GET  /api/v1/eval-runs/{runId}/cases
```

An evaluation run must capture the suite version, baseline configuration,
candidate configuration, grader version, sample count, confidence method,
tolerance, and raw aggregate metrics. Cases should be paginated and access
controlled. Do not allow a client to mark an evaluation as passed.

### Optimization jobs

```text
POST /api/v1/projects/{projectId}/optimization-runs
GET  /api/v1/projects/{projectId}/optimization-runs
GET  /api/v1/optimization-runs/{runId}
POST /api/v1/optimization-runs/{runId}/cancel
GET  /api/v1/optimization-runs/{runId}/events
GET  /api/v1/optimization-runs/{runId}/candidates
POST /api/v1/optimization-runs/{runId}/select
```

Start request example:

```json
{
  "projectVersionId": "version_31",
  "evalSuiteId": "eval_120",
  "qualityTolerancePp": 1.0,
  "confidencePct": 95,
  "objective": "cost_quality",
  "allowedModels": ["Sol", "Luna", "Flash", "Terra"],
  "idempotencyKey": "client-generated-uuid"
}
```

The server creates an immutable optimization run and returns `202 Accepted`:

```json
{
  "runId": "opt_1842",
  "status": "QUEUED",
  "createdAt": "2026-09-01T10:00:00Z"
}
```

Recommended run states are `QUEUED`, `PROFILING`, `BASELINING`, `SEARCHING`,
`VERIFYING`, `COMPLETED`, `CANCEL_REQUESTED`, `CANCELLED`, `FAILED`, and
`PARTIAL`. State transitions must be monotonic and stored durably.

For a responsive studio, expose events through Server-Sent Events at
`GET /api/v1/optimization-runs/{runId}/events/stream`. Each event should have
an event ID so the client can reconnect with `Last-Event-ID`. Keep the existing
polling endpoint as a fallback for browsers, proxies, or local development.

### Export and layout persistence

```text
GET  /api/v1/optimization-runs/{runId}/export
POST /api/v1/projects/{projectId}/layout
GET  /api/v1/projects/{projectId}/layout
GET  /api/v1/projects/{projectId}/settings
PATCH /api/v1/projects/{projectId}/settings
```

Export must be generated from a server-verified selected candidate, not from
browser state. Include project version, node IDs, model/provider assignments,
fallback behavior, optimizer run ID, evaluation evidence, and generated-at
timestamp. Return either JSON directly or a short-lived signed download URL.

Layout persistence is optional and should contain only UI state, for example:

```json
{
  "versionId": "version_31",
  "nodes": {
    "node-planner": { "x": 180, "y": 194 }
  },
  "updatedAt": "2026-09-01T10:00:00Z"
}
```

Use revision numbers or `If-Match` to prevent one user overwriting another
user's layout changes.

## 4. API conventions

### Success and error envelopes

Successful collection responses should use:

```json
{
  "data": [],
  "page": { "nextCursor": null }
}
```

Errors should use one stable envelope:

```json
{
  "error": {
    "code": "QUALITY_TOLERANCE_INVALID",
    "message": "Quality tolerance must be between 0 and 100 percentage points.",
    "requestId": "req_123",
    "fields": { "qualityTolerancePp": "out_of_range" }
  }
}
```

Use `400` for malformed input, `401` for missing/expired auth, `403` for
ownership or entitlement failures, `404` for inaccessible resources, `409` for
state conflicts, `422` for semantically invalid data, `429` for rate limits,
and `5xx` only for server/provider failures. Do not return provider secrets or
raw stack traces.

### Pagination, limits, and idempotency

- Use cursor pagination for traces, events, eval cases, and optimization runs.
- Enforce maximum page sizes server-side.
- Require an idempotency key when starting profiles, evaluation runs,
  optimizations, exports, or billing actions.
- Retry only safe, idempotent operations automatically.
- Attach a request ID to every log line and asynchronous job.

### Authorization and tenancy

Every project-scoped request must verify that the authenticated user belongs to
the project or its team. Never authorize based on a project ID supplied by the
browser alone. Apply the same check to downloads, event streams, trace search,
evaluation cases, and exports.

## 5. Frontend behavior the backend must preserve

The studio is intentionally fast and interaction-heavy:

- Graph node dragging is local and coalesced with `requestAnimationFrame`.
- Panning and zooming are local canvas interactions.
- Inspector, frontier, evals, and settings panels have adjustable widths.
- View changes update `#studio/{view}` without a full page reload.
- Selecting a node or candidate must not refetch the entire project.
- Starting optimization disables duplicate starts while a run is active.
- Leaving the studio must cancel browser timers and close event subscriptions.
- The backend should send incremental events instead of repeatedly returning the
  entire project document.

Recommended client cache keys are project/version, optimization run, candidate
list, event cursor, eval suite/run, and layout revision. A stale event stream
must never overwrite a newer terminal run state.

## 6. Security, privacy, and compliance requirements

- Store secrets in AWS Secrets Manager or encrypted Lambda environment
  variables; never in Vite variables, source, HTML, Git history, or CI output.
- Require HTTPS, secure HTTP-only cookies if cookies are used, `SameSite=Lax` or
  stricter where compatible, and CSRF protection for cookie-authenticated writes.
- Hash passwords with a modern adaptive password hash and rate-limit auth.
- Restrict CORS to the deployed TwineRun origin; do not use wildcard origins
  with credentials.
- Validate every JSON body, path parameter, model identifier, token count, and
  uploaded evaluation file.
- Apply payload, trace, evaluation, and export size limits.
- Encrypt persisted traces and evaluation data at rest.
- Make prompt/output retention disabled by default and configurable per project.
- Provide project deletion and retention enforcement that covers raw traces,
  derived metrics, eval cases, event logs, and exports.
- Record an audit event for sign-in, project access, optimization start/cancel,
  candidate selection, export, settings changes, and future billing changes.

## 7. AWS shape and deployment

### Initial compatible shape

The existing Lambda can continue serving the static site while a separate API
Lambda, API Gateway HTTP API, or an application service handles `/api/v1/*`.
Do not make the static file handler perform long-running optimization work.

Recommended split:

```text
Browser
  ├─ GET static shell/assets ──> frontend Lambda Function URL
  └─ /api/v1 requests ────────> API Gateway / backend service
                                      ├─ auth + project API
                                      ├─ database
                                      ├─ queue / worker for optimization
                                      └─ object storage for exports
```

Short profiling requests can use Lambda. Optimization, large trace ingestion,
and evaluation runs should be queued through SQS or an equivalent durable
worker path. Use Step Functions, ECS/Fargate, or a container worker if jobs
exceed Lambda duration, memory, or concurrency limits.

### Environment configuration

Use environment names only as placeholders in repository documentation:

```text
APP_ENV
APP_ORIGIN
API_BASE_URL
DATABASE_URL or DATABASE_SECRET_ARN
SESSION_SECRET or AUTH_SECRET_ARN
TRACE_RETENTION_DAYS
MAX_EVAL_CASES
OPTIMIZATION_QUEUE_URL
EXPORT_BUCKET
```

Provider credentials, webhook secrets, and future Dodo credentials must be
runtime secrets. They must not be prefixed with `VITE_`, because Vite embeds
those values into the browser bundle.

### CI/CD gates

The existing workflow builds and typechecks the frontend, packages the Lambda,
deploys it, and smoke-tests the live title and bundle. Backend CI should add:

1. unit tests for validation, authorization, state transitions, and metric math;
2. contract tests against the generated OpenAPI schema;
3. integration tests for database, queue, worker, and export paths;
4. migration checks and rollback-safe deployment;
5. authenticated smoke tests for `/health`, sign-in, project load, and a small
   optimization run using fixture data;
6. secret scanning and a check that no API key occurs in `dist/` or logs.

Expose separate liveness and readiness endpoints. Readiness must fail when a
required database or queue dependency cannot accept work.

## 8. Payments boundary (deferred)

Payments are intentionally not part of the current frontend implementation.
The pricing page is presentation-only and its buttons currently enter the demo
studio flow.

When payments are added, they belong in the backend:

```text
Browser pricing CTA
  -> authenticated backend checkout endpoint
  -> Dodo test/live Checkout Session API
  -> backend returns checkout_url
  -> browser redirects to hosted Dodo checkout
  -> Dodo webhook reaches backend
  -> backend verifies signature and updates entitlement
```

The Dodo API key, product IDs, webhook secret, subscription status, entitlement
mapping, cancellation, refunds, and customer portal must remain server-side.
The future checkout endpoint should accept a server-recognized plan identifier
such as `pro` or `team`, never an arbitrary price or product ID from the client.
It should return a hosted URL and an internal checkout/session ID. Webhook
processing must be signature-verified and idempotent. No payment secret may be
placed in Vite source, HTML, Lambda static assets, GitHub logs, or browser
requests.

## 9. Migration sequence

### Phase 1: backend foundation

- Introduce `/api/v1` routing, request IDs, validation, error envelopes, health
  checks, and authenticated user identity.
- Replace demo session reads in the frontend with a server session while keeping
  the existing hash routes.

### Phase 2: project and observation data

- Persist projects, versions, nodes, edges, layouts, normalized traces, and
  profiling summaries.
- Replace `mockAgents.ts` project loading with API reads.

### Phase 3: evaluations and optimization

- Persist eval suites and immutable eval runs.
- Move optimization from browser timers to a durable worker.
- Add event streaming, reconnect behavior, cancellation, retries, and terminal
  state reconciliation.

### Phase 4: verified output

- Persist candidates and Pareto frontiers.
- Make candidate selection and export server-verified.
- Add audit logs, quotas, retention controls, and production observability.

### Phase 5: billing

- Add Dodo products and entitlements in the backend only.
- Gate hosted profiling, evaluation size, optimization limits, history, and team
  features using verified subscription state.
- Add webhook-driven subscription lifecycle and customer self-service.

## 10. Acceptance checklist

The backend integration is ready for the current frontend when:

- an authenticated user can load only authorized projects;
- project, graph, node, frontier, diff, trace, eval, and settings views load from
  documented API contracts;
- profiling and optimization runs survive page refreshes and reconnects;
- event IDs prevent duplicate or out-of-order UI updates;
- candidate metrics are calculated from stored evidence;
- exports can be reproduced from a selected immutable run;
- local graph interactions remain responsive while API work is in flight;
- prompt/output storage is opt-in and retention is enforceable;
- CI verifies type safety, API contracts, auth, queue/worker behavior, and secret
  absence from the frontend bundle;
- payment code is absent until the backend billing phase is explicitly started.

