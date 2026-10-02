import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, Clipboard, Copy, KeyRound, RefreshCw, Terminal, X } from "lucide-react";
import { api, API_BASE_URL, ApiError } from "../lib/api";
import { navigate } from "../lib/router";
import { AgentProject, ProjectSetupState } from "../types";

interface Props {
  projectId?: string;
  create?: boolean;
  onOpenStudio: (projectId: string) => void;
}

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
const errorText = (cause: unknown, fallback: string) => cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : fallback;
const operationId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

type ManualStep = "version" | "traces" | "evals" | "baseline";
type SessionStatus = "AWAITING_HARNESS" | "CONNECTED" | "PROPOSAL_READY" | "APPROVED" | "APPLIED" | "EXPIRED" | "REVOKED" | string;
type JsonRecord = Record<string, unknown>;
type SetupSession = JsonRecord & { id: string; status: SessionStatus; proposal: JsonRecord | null; connectionId: string; expiresAt?: string };

// The page never fabricates a session; every state below comes from the
// project-scoped API methods.
const harnessApi = api;

const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const firstString = (value: JsonRecord, keys: string[]) => keys.map((key) => value[key]).find((item): item is string => typeof item === "string" && item.trim().length > 0) || "";
const unwrapSession = (value: unknown): SetupSession => {
  const root = record(value);
  const source = record(root.data || root.session || root.result || root);
  const proposalValue = source.proposal || source.detectedSetup || source.detected_setup || source.setup;
  return {
    ...source,
    id: firstString(source, ["sessionId", "session_id", "id"]),
    connectionId: firstString(source, ["connectionId", "connection_id", "publicConnectionId", "public_connection_id", "connectId"]),
    status: firstString(source, ["status", "state"]).toUpperCase() || "AWAITING_HARNESS",
    proposal: Object.keys(record(proposalValue)).length ? record(proposalValue) : null,
    expiresAt: firstString(source, ["expiresAt", "expires_at"]) || undefined,
  };
};
const sessionProposal = (session: SetupSession | null) => session?.proposal && Object.keys(session.proposal).length ? session.proposal : null;
const jsonPreview = (value: unknown) => JSON.stringify(value, null, 2);
const sessionStorageKey = (projectId: string) => `twinerun.onboarding-session.${projectId}`;
const applyOperationStorageKey = (projectId: string, sessionId: string) => `twinerun.onboarding-apply.${projectId}.${sessionId}`;

export const StandaloneOnboardingPage: React.FC<Props> = ({ projectId, create = false, onOpenStudio }) => {
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [project, setProject] = useState<AgentProject | null>(null);
  const [setup, setSetup] = useState<ProjectSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [session, setSession] = useState<SetupSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualStep, setManualStep] = useState<ManualStep | null>(null);
  const [sessionOperationId] = useState(operationId);
  const [applyOperationId, setApplyOperationId] = useState<string | null>(null);

  // Manual fallback state. It calls the same real endpoints and never
  // creates browser-side graph, metric, trace, or evaluation records.
  const [version, setVersion] = useState("v1");
  const [environment, setEnvironment] = useState("STAGING");
  const [nodesText, setNodesText] = useState("");
  const [edgesText, setEdgesText] = useState("");
  const [evalName, setEvalName] = useState("agent-evals");
  const [evalText, setEvalText] = useState("");
  const [graderKind, setGraderKind] = useState("exact_match");
  const [graderConfig, setGraderConfig] = useState("{}");
  const [key, setKey] = useState<string | null>(null);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [baselineStatus, setBaselineStatus] = useState("");
  const [evalDatasetId, setEvalDatasetId] = useState<string | undefined>();

  const slugError = !slug ? "A URL-safe slug is required." : !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? "Use lowercase letters, numbers, and single hyphens." : "";
  const hasVersion = Boolean(setup?.hasVersion);
  const hasTraces = Boolean(setup?.hasTraces);
  const hasEvals = Boolean(setup?.hasEvaluationSuite);
  const effectiveBaseline = baselineStatus || setup?.baselineStatus || "NOT_STARTED";
  const baselineDone = effectiveBaseline === "COMPLETED";
  const proposal = sessionProposal(session);

  const refresh = useCallback(async (id: string) => {
    const [detail, state] = await Promise.all([api.project(id), api.onboarding(id)]);
    setProject(detail); setSetup(state); setBaselineStatus(state.baselineStatus || "");
    if (state.baselineStatus === "COMPLETED") setBaselineRunId("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setSession(null);
    void (async () => {
      try {
        const list = await api.projects();
        if (cancelled) return;
        setProjects(list);
        const selected = projectId ? list.find((item) => item.id === projectId) : create ? undefined : list[0];
        if (!selected) { setProject(null); setSetup(null); setShowCreate(true); setLoading(false); return; }
        await refresh(selected.id);
        if (!cancelled) { setShowCreate(false); setLoading(false); }
      } catch (cause) {
        if (!cancelled) { setError(errorText(cause, "Unable to load your projects.")); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [create, projectId, refresh]);

  useEffect(() => {
    if (!project || typeof window === "undefined") return;
    const savedSessionId = window.sessionStorage.getItem(sessionStorageKey(project.id));
    if (!savedSessionId) return;
    setSessionLoading(true);
    void harnessApi.onboardingSession(project.id, savedSessionId)
      .then((value) => setSession(unwrapSession(value)))
      .catch((cause) => {
        if (cause instanceof ApiError && [403, 404].includes(cause.status)) window.sessionStorage.removeItem(sessionStorageKey(project.id));
      })
      .finally(() => setSessionLoading(false));
  }, [project?.id]);

  const selectProject = (id: string) => navigate(`/onboarding/${encodeURIComponent(id)}`);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || slugError) return;
    setBusy(true); setError("");
    try { const created = await api.createProject(name.trim(), slug); navigate(`/onboarding/${encodeURIComponent(created.id)}`); }
    catch (cause) { setError(errorText(cause, "Unable to create the project.")); }
    finally { setBusy(false); }
  };

  const refreshSession = useCallback(async () => {
    if (!project || !session?.id) return;
    setSessionLoading(true);
    try { setSession(unwrapSession(await harnessApi.onboardingSession(project.id, session.id))); }
    catch (cause) { setError(errorText(cause, "Unable to read the connection session.")); }
    finally { setSessionLoading(false); }
  }, [project, session?.id]);

  useEffect(() => {
    if (!project || !session?.id || ["APPLIED", "EXPIRED", "REVOKED"].includes(session.status)) return;
    const timer = window.setInterval(() => { void refreshSession(); }, 2500);
    return () => window.clearInterval(timer);
  }, [project, session?.id, session?.status, refreshSession]);

  const createSession = async () => {
    if (!project) return;
    setSessionLoading(true); setError("");
    setApplyOperationId(null);
    try {
      const created = unwrapSession(await harnessApi.createOnboardingSession(project.id, {
        source: "browser-onboarding",
        harness: { kind: "coding-agent", capabilities: ["repository-discovery", "proposal", "apply"] },
        idempotencyKey: sessionOperationId,
      }));
      setSession(created);
      if (created.id && typeof window !== "undefined") window.sessionStorage.setItem(sessionStorageKey(project.id), created.id);
    }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 404 ? "Agent connection is not available in this environment yet." : errorText(cause, "The harness connection could not be created.")); }
    finally { setSessionLoading(false); }
  };

  const approveSession = async () => {
    if (!project || !session?.id || !proposal) return;
    setSessionLoading(true); setError("");
    try {
      setSession(unwrapSession(await harnessApi.approveOnboardingSession(project.id, session.id, {
        proposalId: firstString(proposal, ["proposalId", "id"]),
        revision: typeof session.revision === "number" ? session.revision : typeof proposal.revision === "number" ? proposal.revision : undefined,
      })));
    }
    catch (cause) { setError(errorText(cause, "The detected setup could not be approved.")); }
    finally { setSessionLoading(false); }
  };

  const applySession = async () => {
    if (!project || !session?.id || !proposal) return;
    setSessionLoading(true); setError("");
    try {
      const savedOperationId = typeof window !== "undefined" ? window.sessionStorage.getItem(applyOperationStorageKey(project.id, session.id)) : null;
      const stableOperationId = applyOperationId || savedOperationId || operationId();
      if (!applyOperationId) setApplyOperationId(stableOperationId);
      if (typeof window !== "undefined") window.sessionStorage.setItem(applyOperationStorageKey(project.id, session.id), stableOperationId);
      const applyPayload = record(proposal.payload);
      setSession(unwrapSession(await harnessApi.applyOnboardingSession(project.id, session.id, Object.keys(applyPayload).length ? applyPayload : proposal, stableOperationId)));
      await refresh(project.id);
    }
    catch (cause) { setError(errorText(cause, "The approved setup could not be applied.")); }
    finally { setSessionLoading(false); }
  };

  const revokeSession = async () => {
    if (!project || !session?.id) return;
    setSessionLoading(true); setError("");
    try {
      setSession(unwrapSession(await harnessApi.revokeOnboardingSession(project.id, session.id)));
      setApplyOperationId(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(sessionStorageKey(project.id));
        window.sessionStorage.removeItem(applyOperationStorageKey(project.id, session.id));
      }
    }
    catch (cause) { setError(errorText(cause, "The connection session could not be revoked.")); }
    finally { setSessionLoading(false); }
  };

  const connectionInstructions = useMemo(() => session?.connectionId ? `twinerun setup --connect ${session.connectionId}` : "", [session?.connectionId]);
  const copyInstructions = async () => {
    if (!connectionInstructions) return;
    await navigator.clipboard?.writeText(`Connect this repository to TwineRun and inspect the real agent setup.\n\n${connectionInstructions}\n\nReport the detected entrypoint, nodes, model assignments, traces, and evaluation source. Do not invent missing values. Ask before uploading data or running external side effects. Return a proposal and wait for browser approval before applying it.`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  };

  const parseVersion = () => {
    const lines = nodesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Add at least one real agent node.");
    const nodes = lines.map((line, index) => {
      const [id, nodeName, role, model] = line.split("|").map((part) => part.trim());
      if (!id || !nodeName || !role || !model || !model.includes("/")) throw new Error(`Node ${index + 1} must be id | name | role | provider/model.`);
      return { id, name: nodeName, role, baselineModel: model, currentModel: model, optimizedModel: model };
    });
    const ids = new Set(nodes.map((node) => node.id));
    const edges = edgesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [connection, label] = line.split("|").map((part) => part.trim());
      const [from, to] = connection.split("->").map((part) => part.trim());
      if (!from || !to || !ids.has(from) || !ids.has(to)) throw new Error(`Edge ${index + 1} must connect existing nodes as from -> to.`);
      return { id: `edge-${index + 1}`, from, to, label: label || undefined };
    });
    return { version: version.trim() || "v1", environment, nodes, edges, metrics: {} };
  };

  const saveVersion = async () => {
    if (!project) return;
    setBusy(true); setError("");
    try { await api.createVersion(project.id, parseVersion()); await refresh(project.id); setManualStep(null); }
    catch (cause) { setError(errorText(cause, "The backend rejected this version.")); }
    finally { setBusy(false); }
  };

  const createKey = async () => {
    if (!project || key) return;
    setBusy(true); setError("");
    try { const result = await api.createProjectKey(project.id, "twinerun-local"); setKey(result.secret); }
    catch (cause) { setError(errorText(cause, "Connector key could not be created.")); }
    finally { setBusy(false); }
  };

  const importEvaluations = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setBusy(true); setError("");
    try {
      const raw = evalText.trim();
      if (!raw) throw new Error("Paste at least one JSONL evaluation case.");
      const cases = raw.startsWith("[") ? JSON.parse(raw) : raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      if (!Array.isArray(cases) || !cases.length) throw new Error("Add at least one evaluation case.");
      const result = await api.importEval(project.id, evalName.trim() || "agent-evals", cases, [{ name: `${graderKind}-grader`, kind: graderKind, config: JSON.parse(graderConfig || "{}") }]);
      const datasetId = String(result.dataset_id || result.datasetId || "");
      if (datasetId) setEvalDatasetId(datasetId);
      await refresh(project.id); setManualStep(null);
    } catch (cause) { setError(errorText(cause, "The evaluation suite could not be imported.")); }
    finally { setBusy(false); }
  };

  const runBaseline = async () => {
    if (!project || !hasVersion || !hasEvals || effectiveBaseline === "QUEUED" || effectiveBaseline === "RUNNING") return;
    setBusy(true); setError("");
    try {
      const run = await api.runBaseline(project.id, evalDatasetId);
      setBaselineRunId(run.runId); setBaselineStatus(run.status || "QUEUED");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 500 : 2000));
        const status = await api.baseline(run.runId);
        const next = String(status.status || "RUNNING").toUpperCase();
        setBaselineStatus(next);
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(next)) { await refresh(project.id); break; }
      }
    } catch (cause) { setError(errorText(cause, "The baseline could not be started.")); }
    finally { setBusy(false); }
  };

  const snippet = useMemo(() => project ? [
    `export TWINERUN_TRACE_ENDPOINT="${API_BASE_URL}/projects/${project.id}/traces/ingest"`,
    'export TWINERUN_PROJECT_KEY="<project-key>"',
    '# Configure your agent SDK to export OTLP spans to $TWINERUN_TRACE_ENDPOINT,',
    '# then run the real agent entrypoint once. Do not send an empty payload.',
  ].join("\n") : "", [project]);

  if (loading) return <div className="onboarding-standalone"><div className="onboarding-loading">Loading workspace state…</div></div>;

  return <div className="onboarding-standalone" data-page="onboarding">
    <header className="onboarding-standalone-header"><a href="/" className="onboarding-wordmark">TwineRun<span>.ai</span></a><div className="onboarding-header-actions"><button type="button" onClick={() => { setError(""); if (project) { void refresh(project.id); if (session?.id) void refreshSession(); } else window.location.reload(); }}><RefreshCw size={14} /> Refresh</button>{project && <button type="button" onClick={() => onOpenStudio(project.id)}>Open Studio</button>}</div></header>
    <main className="onboarding-standalone-main">
      <div className="onboarding-standalone-intro"><p className="onboarding-kicker">WORKSPACE SETUP</p><h1>{project ? "Connect your agent. TwineRun handles the rest." : "Create your first agent project."}</h1><p>{project ? "Point your coding harness at this workspace. It inspects the repository, proposes the real setup, and waits for your approval before applying anything." : "Create a project, then let your coding harness discover the real agent setup."}</p></div>
      {error && <div className="onboarding-error" role="alert"><CircleAlert size={15} />{error}</div>}
      {!project || showCreate ? <section className="onboarding-create-panel" data-operation="create-project"><div><span className="onboarding-operation">create-project</span><h2>Create a project</h2><p>Give the agent a durable name and URL-safe slug. Nothing else is created until you submit.</p></div><form onSubmit={createProject}><label>Project name<input name="projectName" value={name} onChange={(event) => { setName(event.target.value); if (!slugTouched) setSlug(slugify(event.target.value)); }} placeholder="Research Agent" /></label><label>Slug<input name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} placeholder="research-agent" aria-invalid={Boolean(slugError)} /></label>{slugError && <small>{slugError}</small>}<button type="submit" disabled={busy || !name.trim() || Boolean(slugError)}>{busy ? "Creating…" : "Create project"}<ArrowRight size={15} /></button></form>{projects.length > 0 && <button className="onboarding-secondary-action" type="button" onClick={() => { setShowCreate(false); selectProject(projects[0].id); }}>Back to existing projects</button>}</section> : <>
        {projects.length > 1 && <label className="onboarding-project-picker">Project<select value={project.id} onChange={(event) => selectProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => { setShowCreate(true); setName(""); setSlug(""); setSlugTouched(false); }}>New project</button></label>}
        <section className="onboarding-harness" aria-label="Harness setup">
          <div className="harness-phase"><span className="harness-phase-number">01</span><div><span className="onboarding-operation">connect-agent</span><h2>Connect your coding agent</h2><p>Use Codex, Claude Code, pi, or any terminal harness. TwineRun receives a short-lived connection and waits for the harness to inspect the repository.</p></div></div>
          <div className="harness-action-panel" data-operation="connect-agent">
            {!session && <><div className="harness-awaiting"><Terminal size={17} /><span>No harness connection yet.</span></div><button type="button" className="onboarding-primary-action" onClick={() => void createSession()} disabled={sessionLoading}>{sessionLoading ? "Creating connection…" : "Generate connection"}<ArrowRight size={15} /></button><p className="harness-note">The connection expires automatically. No repository data is accepted until your harness sends it.</p></>}
            {session && <><div className="session-status-row"><span className={`session-status session-${session.status.toLowerCase()}`}>{session.status.replaceAll("_", " ")}</span>{session.expiresAt && <span>Expires {session.expiresAt}</span>}</div>{session.connectionId ? <><p className="harness-note">Run this from the repository you want to profile. It requires the TwineRun CLI or a harness adapter; the browser never runs it for you.</p><pre className="harness-command">{connectionInstructions}</pre><div className="harness-actions"><button type="button" className="onboarding-primary-action" onClick={() => void copyInstructions()}><Clipboard size={14} />{copied ? "Copied" : "Copy harness instructions"}</button><button type="button" className="onboarding-secondary-button" onClick={() => void revokeSession()} disabled={sessionLoading}><X size={14} />Revoke</button></div></> : <div className="harness-awaiting"><RefreshCw size={15} className={sessionLoading ? "onboarding-spin" : ""} /><span>Waiting for the server to issue a connection ID…</span></div>}</>}
          </div>
          <div className={`harness-phase ${!session || !proposal ? "is-locked" : ""}`}><span className="harness-phase-number">02</span><div><span className="onboarding-operation">review-setup</span><h2>Review detected setup</h2><p>{proposal ? "These values came from your harness. Review them before TwineRun applies anything." : "Your harness will return the repository entrypoint, real graph, model assignments, and evaluation source here."}</p></div></div>
          <div className={`harness-review-panel ${proposal ? "has-proposal" : "is-locked"}`} data-operation="review-setup">{proposal ? <><div className="proposal-heading"><span>Harness proposal</span><span className="proposal-source">Server returned</span></div><pre className="proposal-json">{jsonPreview(proposal)}</pre><div className="harness-actions">{session?.status !== "APPROVED" && session?.status !== "APPLIED" && <button type="button" className="onboarding-primary-action" onClick={() => void approveSession()} disabled={sessionLoading}>Approve detected setup<Check size={15} /></button>}{session?.status === "APPROVED" && <button type="button" className="onboarding-primary-action" onClick={() => void applySession()} disabled={sessionLoading}>{sessionLoading ? "Applying…" : "Apply setup"}<ArrowRight size={15} /></button>}<button type="button" className="onboarding-secondary-button" onClick={() => void revokeSession()} disabled={sessionLoading}>Reject and revoke</button></div></> : <div className="harness-awaiting"><RefreshCw size={15} className={sessionLoading ? "onboarding-spin" : ""} /><span>Awaiting a detected setup from the harness.</span></div>}</div>
          <div className="harness-phase"><span className="harness-phase-number">03</span><div><span className="onboarding-operation">run-and-verify</span><h2>Run and verify</h2><p>Evidence is read from the backend after setup is applied. Nothing is marked complete from browser state alone.</p></div></div>
          <EvidenceTimeline setup={setup} baselineStatus={effectiveBaseline} baselineDone={baselineDone} onOpenStudio={() => onOpenStudio(project.id)} />
        </section>
        <section className="manual-fallback" data-operation="manual-fallback"><button type="button" className="manual-fallback-toggle" onClick={() => setShowManual((value) => !value)}>{showManual ? "Hide manual setup" : "Use config manually"}<ArrowRight size={14} className={showManual ? "manual-arrow-open" : ""} /></button><p>For environments that cannot run a harness. This path still requires real values and server evidence.</p>{showManual && <ManualSetup project={project} setup={setup} hasVersion={hasVersion} hasEvals={hasEvals} hasTraces={hasTraces} baselineDone={baselineDone} baselineStatus={effectiveBaseline} manualStep={manualStep} setManualStep={setManualStep} busy={busy} version={version} setVersion={setVersion} environment={environment} setEnvironment={setEnvironment} nodesText={nodesText} setNodesText={setNodesText} edgesText={edgesText} setEdgesText={setEdgesText} saveVersion={() => void saveVersion()} createKey={() => void createKey()} keySecret={key} snippet={snippet} evalName={evalName} setEvalName={setEvalName} evalText={evalText} setEvalText={setEvalText} graderKind={graderKind} setGraderKind={setGraderKind} graderConfig={graderConfig} setGraderConfig={setGraderConfig} importEvaluations={importEvaluations} runBaseline={() => void runBaseline()} baselineRunId={baselineRunId} onRefresh={() => project && void refresh(project.id)} onOpenStudio={() => onOpenStudio(project.id)} />}</section>
      </>}
    </main>
  </div>;
};

const EvidenceTimeline: React.FC<{ setup: ProjectSetupState | null; baselineStatus: string; baselineDone: boolean; onOpenStudio: () => void }> = ({ setup, baselineStatus, baselineDone, onOpenStudio }) => {
  const evidence = [{ label: "Project", done: true, detail: "Persisted project identity" }, { label: "Agent version", done: Boolean(setup?.hasVersion), detail: setup?.hasVersion ? "Persisted version detected" : "Awaiting a persisted version" }, { label: "Traces", done: Boolean(setup?.hasTraces), detail: setup?.hasTraces ? `${setup.traceCount ?? "Persisted"} trace evidence observed` : "Awaiting real trace evidence" }, { label: "Evaluations", done: Boolean(setup?.hasEvaluationSuite), detail: setup?.hasEvaluationSuite ? `${setup.evalCaseCount ?? "Persisted"} evaluation cases available` : "Awaiting an evaluation suite" }, { label: "Baseline", done: baselineDone, detail: baselineDone ? "Completed baseline persisted" : `Server state: ${baselineStatus}` }];
  return <div className="evidence-timeline" data-operation="run-and-verify">{evidence.map((item) => <div className={`evidence-row ${item.done ? "is-done" : ""}`} key={item.label}><span className="evidence-marker">{item.done ? <Check size={13} /> : <span />}</span><div><strong>{item.label}</strong><span>{item.detail}</span></div></div>)}<button type="button" className="onboarding-primary-action evidence-studio-button" onClick={onOpenStudio} disabled={!setup?.hasVersion}><span>Open Studio</span><ArrowRight size={15} /></button>{!setup?.hasVersion && <p className="harness-note">Studio unlocks after a real agent version is persisted.</p>}</div>;
};

interface ManualProps {
  project: AgentProject; setup: ProjectSetupState | null; hasVersion: boolean; hasEvals: boolean; hasTraces: boolean; baselineDone: boolean; baselineStatus: string; manualStep: ManualStep | null; setManualStep: (step: ManualStep | null) => void; busy: boolean; version: string; setVersion: (value: string) => void; environment: string; setEnvironment: (value: string) => void; nodesText: string; setNodesText: (value: string) => void; edgesText: string; setEdgesText: (value: string) => void; saveVersion: () => void; createKey: () => void; keySecret: string | null; snippet: string; evalName: string; setEvalName: (value: string) => void; evalText: string; setEvalText: (value: string) => void; graderKind: string; setGraderKind: (value: string) => void; graderConfig: string; setGraderConfig: (value: string) => void; importEvaluations: (event: FormEvent) => void; runBaseline: () => void; baselineRunId: string; onRefresh: () => void; onOpenStudio: () => void;
}

const ManualSetup: React.FC<ManualProps> = (props) => <div className="manual-setup"><ManualRow title="Define version" done={props.hasVersion} active={props.manualStep === "version"} onOpen={() => props.setManualStep(props.manualStep === "version" ? null : "version")}><div className="onboarding-form"><label>Version<input value={props.version} onChange={(event) => props.setVersion(event.target.value)} /></label><label>Environment<select value={props.environment} onChange={(event) => props.setEnvironment(event.target.value)}><option>STAGING</option><option>PROD</option></select></label><label>Nodes<small>One real node per line: id | name | role | provider/model</small><textarea value={props.nodesText} onChange={(event) => props.setNodesText(event.target.value)} placeholder="step_id | Step name | role | provider/model" rows={5} /></label><label>Edges<small>Optional. One per line: from -&gt; to</small><textarea value={props.edgesText} onChange={(event) => props.setEdgesText(event.target.value)} placeholder="node_a -> node_b" rows={3} /></label><button type="button" onClick={props.saveVersion} disabled={props.busy}>{props.busy ? "Saving…" : "Save version"}<ArrowRight size={14} /></button></div></ManualRow><ManualRow title="Connect traces" done={props.hasTraces} active={props.manualStep === "traces"} onOpen={() => props.setManualStep(props.manualStep === "traces" ? null : "traces")}><div className="onboarding-form"><button data-operation="create-project-key" type="button" onClick={props.createKey} disabled={props.busy || Boolean(props.keySecret)}><KeyRound size={14} />{props.keySecret ? "Key created below" : "Create connector key"}</button>{props.keySecret && <div className="onboarding-secret"><code>{props.keySecret}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(props.keySecret || "")}><Copy size={14} />Copy</button></div>}<pre>{props.snippet}</pre><button data-operation="ingest-trace" type="button" className="onboarding-copy-command" onClick={() => void navigator.clipboard?.writeText(props.snippet)}><Clipboard size={14} />Copy trace request</button><button type="button" className="onboarding-refresh-action" onClick={props.onRefresh}><RefreshCw size={14} />Refresh trace status</button></div></ManualRow><ManualRow title="Import evaluations" done={props.hasEvals} active={props.manualStep === "evals"} onOpen={() => props.setManualStep(props.manualStep === "evals" ? null : "evals")}><form className="onboarding-form" onSubmit={props.importEvaluations}><label>Suite name<input value={props.evalName} onChange={(event) => props.setEvalName(event.target.value)} /></label><label>JSONL cases<small>One JSON object per line.</small><textarea value={props.evalText} onChange={(event) => props.setEvalText(event.target.value)} placeholder={'{"id":"case-1","input":{},"expected":{}}'} rows={7} /></label><label>Grader<select value={props.graderKind} onChange={(event) => props.setGraderKind(event.target.value)}><option value="exact_match">Exact match</option><option value="contains">Contains</option><option value="json_schema">JSON schema</option></select></label><label>Grader config JSON<input value={props.graderConfig} onChange={(event) => props.setGraderConfig(event.target.value)} /></label><button type="submit" disabled={props.busy}>{props.busy ? "Importing…" : "Import evaluations"}<ArrowRight size={14} /></button></form></ManualRow><ManualRow title="Run baseline" done={props.baselineDone} active={props.manualStep === "baseline"} onOpen={() => props.setManualStep(props.manualStep === "baseline" ? null : "baseline")}><div className="onboarding-form"><p className="onboarding-status">{props.baselineStatus}{props.baselineRunId && ` · ${props.baselineRunId}`}</p><button type="button" onClick={props.runBaseline} disabled={props.busy || !props.hasVersion || !props.hasEvals || ["QUEUED", "RUNNING"].includes(props.baselineStatus)}>{props.busy ? "Baseline running…" : "Run baseline"}<ArrowRight size={14} /></button></div></ManualRow><div className="manual-open-studio"><button type="button" onClick={props.onOpenStudio} disabled={!props.hasVersion}>Open Studio<ArrowRight size={14} /></button></div></div>;

const ManualRow: React.FC<{ title: string; done: boolean; active: boolean; onOpen: () => void; children: React.ReactNode }> = ({ title, done, active, onOpen, children }) => <article className={`manual-row ${done ? "is-done" : active ? "is-active" : ""}`}><div className="manual-row-header"><span className="evidence-marker">{done ? <Check size={13} /> : <span />}</span><div><strong>{title}</strong><span>{done ? "Persisted" : "Not measured yet"}</span></div><button type="button" onClick={onOpen}>{active ? "Close" : done ? "Review" : "Open"}</button></div>{active && children}</article>;
