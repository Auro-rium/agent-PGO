# Harness-first onboarding

TwineRun onboarding is designed for Codex, Claude Code, pi, and other
repository-aware harnesses. The browser creates a short-lived project-scoped
connection; the harness discovers the real agent locally, returns a proposal,
and waits for browser approval before applying it.

## Harness handoff

The onboarding page generates a command like:

```sh
twinerun setup --connect <PUBLIC_CONNECTION_ID>
```

The connection ID is not a credential. It expires and is approved only for the
selected project. The harness must inspect the repository and report the real
entrypoint, graph, model assignments, and evaluation source. It must not invent
nodes, traces, evaluation cases, metrics, or successful runs.

The command requires the TwineRun CLI or a compatible harness adapter. The
browser does not execute repository commands and does not claim a connection is
active until the server reports it.

## Repository config

After review, the harness may write a non-secret `twinerun.json`:

```json
{
  "$schema": "https://twinerun.com/schemas/project.v1.json",
  "schemaVersion": 1,
  "projectId": "project_123",
  "execution": {
    "cwd": ".",
    "argv": ["python", "-m", "your_real_agent"],
    "adapter": "process"
  },
  "graph": { "source": "instrumentation" },
  "evaluation": {
    "source": "file",
    "path": "evals/baseline.jsonl"
  }
}
```

The entrypoint and evaluation path above are examples of shape only. They must
come from repository discovery or explicit user confirmation.

## Browser approval and apply

The frontend uses project-scoped session operations:

- `POST /projects/{projectId}/onboarding/sessions`
- `GET /projects/{projectId}/onboarding/sessions/{sessionId}`
- `POST /projects/{projectId}/onboarding/sessions/{sessionId}/approve`
- `POST /projects/{projectId}/onboarding/sessions/{sessionId}/revoke`
- `POST /projects/{projectId}/onboarding/sessions/{sessionId}/apply`

Apply requests include the reviewed proposal and a stable `operationId` so a
retry cannot create duplicate versions, evaluation suites, or baseline jobs.
The browser treats `/projects/{projectId}/onboarding` as authoritative after
every mutation.

Never put project secrets, bearer tokens, or API keys in `twinerun.json`, shell
history, URLs, logs, Git, localStorage, or the built frontend bundle.

## Evidence gates

The setup page shows only persisted evidence:

1. project exists;
2. agent version exists;
3. traces are observed;
4. evaluations are persisted;
5. baseline is completed;
6. Studio is opened.

Missing evidence is displayed as awaiting or not detected. Studio and
optimization remain locked until the backend reports the required state.
