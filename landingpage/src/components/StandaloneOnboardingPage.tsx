import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, Clipboard, Copy, KeyRound, RefreshCw } from "lucide-react";
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

type StepId = "version" | "traces" | "evals" | "baseline";

export const StandaloneOnboardingPage: React.FC<Props> = ({ projectId, create = false, onOpenStudio }) => {
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [project, setProject] = useState<AgentProject | null>(null);
  const [setup, setSetup] = useState<ProjectSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [version, setVersion] = useState("v1");
  const [environment, setEnvironment] = useState("STAGING");
  const [nodesText, setNodesText] = useState("");
  const [edgesText, setEdgesText] = useState("");
  const [evalName, setEvalName] = useState("agent-evals");
  const [evalText, setEvalText] = useState("");
  const [graderKind, setGraderKind] = useState("exact_match");
  const [graderConfig, setGraderConfig] = useState("{}");
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [baselineStatus, setBaselineStatus] = useState("");
  const [evalDatasetId, setEvalDatasetId] = useState<string | undefined>();

  const slugError = !slug ? "A URL-safe slug is required." : !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? "Use lowercase letters, numbers, and single hyphens." : "";
  const hasVersion = Boolean(setup?.hasVersion);
  const hasTraces = Boolean(setup?.hasTraces);
  const hasEvals = Boolean(setup?.hasEvaluationSuite);
  const effectiveBaseline = baselineStatus || setup?.baselineStatus || "NOT_STARTED";
  const baselineDone = effectiveBaseline === "COMPLETED";

  const refresh = async (id: string) => {
    const [detail, state] = await Promise.all([api.project(id), api.onboarding(id)]);
    setProject(detail); setSetup(state); setBaselineStatus(state.baselineStatus || "");
    if (state.baselineStatus === "COMPLETED") setBaselineRunId("");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void (async () => {
      try {
        const list = await api.projects();
        if (cancelled) return;
        setProjects(list);
        const selected = projectId ? list.find((item) => item.id === projectId) : create ? undefined : list[0];
        if (!selected) {
          setProject(null); setSetup(null); setShowCreate(true); setLoading(false); return;
        }
        await refresh(selected.id);
        if (!cancelled) { setShowCreate(false); setLoading(false); }
      } catch (cause) {
        if (!cancelled) { setError(errorText(cause, "Unable to load your projects.")); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [create, projectId]);

  const selectProject = (id: string) => { navigate(`/onboarding/${encodeURIComponent(id)}`); };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || slugError) return;
    setBusy(true); setError("");
    try {
      const created = await api.createProject(name.trim(), slug);
      navigate(`/onboarding/${encodeURIComponent(created.id)}`);
    } catch (cause) { setError(errorText(cause, "Unable to create the project.")); }
    finally { setBusy(false); }
  };

  const parseVersion = () => {
    const lines = nodesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Add at least one real agent node.");
    const nodes = lines.map((line, index) => {
      const [id, nodeName, role, model] = line.split("|").map((part) => part.trim());
      if (!id || !nodeName || !role || !model || !model.includes("/")) throw new Error(`Node ${index + 1} must be id | name | role | provider/model.`);
      return { id, name: nodeName, role, baselineModel: model, currentModel: model, optimizedModel: model, x: 140 + (index % 3) * 240, y: 120 + Math.floor(index / 3) * 150 };
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
    try { await api.createVersion(project.id, parseVersion()); await refresh(project.id); setActiveStep(null); }
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
      await refresh(project.id); setActiveStep(null);
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

  const snippet = useMemo(() => project ? `curl -X POST "${API_BASE_URL}/traces?project_id=${project.id}" \\\n+  -H "X-AgentPGO-API-Key: <project-key>" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"resourceSpans":[]}'` : "", [project]);

  if (loading) return <div className="onboarding-standalone"><div className="onboarding-loading">Loading workspace state…</div></div>;

  return <div className="onboarding-standalone" data-page="onboarding">
    <header className="onboarding-standalone-header"><a href="/" className="onboarding-wordmark">TwineRun<span>.ai</span></a><div className="onboarding-header-actions"><button type="button" onClick={() => { setError(""); if (project) void refresh(project.id); else window.location.reload(); }}><RefreshCw size={14} /> Refresh</button>{project && <button type="button" onClick={() => onOpenStudio(project.id)}>Open Studio</button>}</div></header>
    <main className="onboarding-standalone-main">
      <div className="onboarding-standalone-intro"><p className="onboarding-kicker">WORKSPACE SETUP</p><h1>{project ? `Set up ${project.name}.` : "Create your first agent project."}</h1><p>{project ? "Follow the evidence path in order. TwineRun will not invent nodes, traces, evaluations, or metrics." : "A short, explicit path from an empty workspace to a measured agent."}</p></div>
      {error && <div className="onboarding-error" role="alert"><CircleAlert size={15} />{error}</div>}
      {!project || showCreate ? <section className="onboarding-create-panel" data-operation="create-project"><div><span className="onboarding-operation">create-project</span><h2>Create a project</h2><p>Give the agent a durable name and URL-safe slug. Nothing else is created until you submit.</p></div><form onSubmit={createProject}><label>Project name<input name="projectName" value={name} onChange={(event) => { setName(event.target.value); if (!slugTouched) setSlug(slugify(event.target.value)); }} placeholder="Research Agent" /></label><label>Slug<input name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} placeholder="research-agent" aria-invalid={Boolean(slugError)} /></label>{slugError && <small>{slugError}</small>}<button type="submit" disabled={busy || !name.trim() || Boolean(slugError)}>{busy ? "Creating…" : "Create project"}<ArrowRight size={15} /></button></form>{projects.length > 0 && <button className="onboarding-secondary-action" type="button" onClick={() => { setShowCreate(false); selectProject(projects[0].id); }}>Back to existing projects</button>}</section> : <>
        {projects.length > 1 && <label className="onboarding-project-picker">Project<select value={project.id} onChange={(event) => selectProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => { setShowCreate(true); setName(""); setSlug(""); }}>New project</button></label>}
        <section className="onboarding-flow" aria-label="Agent setup steps">
          <Step done={true} operation="create-project" title="Project created" detail={`${project.name} · ${project.slug || project.id}`} />
          <Step done={hasVersion} operation="define-version" title="Define the agent version" detail={hasVersion ? "A persisted version is available." : "Describe the real nodes and model assignments your agent uses."} active={!hasVersion && (activeStep === "version" || !activeStep)} onOpen={() => setActiveStep("version")}>
            {!hasVersion && activeStep === "version" && <div className="onboarding-form"><label>Version<input value={version} onChange={(event) => setVersion(event.target.value)} /></label><label>Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option>STAGING</option><option>PROD</option></select></label><label>Nodes<small>One per line: id | name | role | provider/model</small><textarea value={nodesText} onChange={(event) => setNodesText(event.target.value)} placeholder="step_id | Step name | role | provider/model" rows={5} /></label><label>Edges<small>Optional. One per line: from -&gt; to</small><textarea value={edgesText} onChange={(event) => setEdgesText(event.target.value)} placeholder="node_a -> node_b" rows={3} /></label><button type="button" onClick={() => void saveVersion()} disabled={busy}>{busy ? "Saving…" : "Save version"}<ArrowRight size={14} /></button></div>}
          </Step>
          <Step done={hasTraces} operation="connect-traces" title="Connect real traces" detail={hasTraces ? `${setup?.traceCount || "Persisted"} trace evidence observed.` : "Create a project key, send one real OTLP trace, then refresh this page."} active={hasVersion && !hasTraces && activeStep === "traces"} onOpen={() => setActiveStep("traces")}>
            {activeStep === "traces" && <div className="onboarding-form"><button data-operation="create-project-key" type="button" onClick={() => void createKey()} disabled={busy || Boolean(key)}><KeyRound size={14} />{key ? "Key created below" : busy ? "Creating key…" : "Create connector key"}</button>{key && <div className="onboarding-secret"><code>{key}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(key)}><Copy size={14} />Copy</button></div>}<pre>{snippet}</pre><button data-operation="ingest-trace" type="button" className="onboarding-copy-command" onClick={() => { void navigator.clipboard?.writeText(snippet); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}><Clipboard size={14} />{copied ? "Copied" : "Copy setup command"}</button><button type="button" className="onboarding-refresh-action" onClick={() => project && void refresh(project.id)}><RefreshCw size={14} />Refresh trace status</button></div>}
          </Step>
          <Step done={hasEvals} operation="import-evaluations" title="Import evaluations" detail={hasEvals ? `${setup?.evalCaseCount || "Persisted"} evaluation cases available.` : "Import JSONL cases so quality can be measured against the baseline."} active={hasVersion && !hasEvals && activeStep === "evals"} onOpen={() => setActiveStep("evals")}>
            {activeStep === "evals" && <form className="onboarding-form" onSubmit={importEvaluations}><label>Suite name<input value={evalName} onChange={(event) => setEvalName(event.target.value)} /></label><label>JSONL cases<small>One JSON object per line with id, input, and expected.</small><textarea value={evalText} onChange={(event) => setEvalText(event.target.value)} placeholder={'{"id":"case-1","input":{},"expected":{}}'} rows={7} /></label><label>Grader<select value={graderKind} onChange={(event) => setGraderKind(event.target.value)}><option value="exact_match">Exact match</option><option value="contains">Contains</option><option value="json_schema">JSON schema</option></select></label><label>Grader config JSON<input value={graderConfig} onChange={(event) => setGraderConfig(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? "Importing…" : "Import evaluations"}<ArrowRight size={14} /></button></form>}
          </Step>
          <Step done={baselineDone} operation="run-baseline" title="Run the baseline" detail={baselineDone ? "A completed baseline is persisted." : !hasVersion || !hasEvals ? "Locked until a version and evaluation suite exist." : `Current state: ${effectiveBaseline}.`} active={hasVersion && hasEvals && !baselineDone && activeStep === "baseline"} onOpen={() => setActiveStep("baseline")}>
            {activeStep === "baseline" && <div className="onboarding-form"><p className="onboarding-status">{effectiveBaseline}{baselineRunId && ` · ${baselineRunId}`}</p><button type="button" onClick={() => void runBaseline()} disabled={busy || !hasVersion || !hasEvals || effectiveBaseline === "QUEUED" || effectiveBaseline === "RUNNING"}>{busy || effectiveBaseline === "QUEUED" || effectiveBaseline === "RUNNING" ? "Baseline running…" : "Run baseline"}<ArrowRight size={14} /></button></div>}
          </Step>
          <Step done={hasVersion} operation="open-studio" title="Open Studio" detail={hasVersion ? baselineDone ? "Your measured project is ready for Studio." : "Studio is available for profiling; optimization remains gated until baseline completion." : "Locked until a real version is persisted."} active={false} onOpen={() => project && onOpenStudio(project.id)} />
        </section>
      </>}
    </main>
  </div>;
};

interface StepProps { done: boolean; operation: string; title: string; detail: string; active: boolean; onOpen: () => void; children?: React.ReactNode; }
const Step: React.FC<StepProps> = ({ done, operation, title, detail, active, onOpen, children }) => <article className={`onboarding-step-row ${done ? "is-done" : active ? "is-active" : "is-locked"}`} data-operation={operation}><div className="onboarding-step-marker">{done ? <Check size={15} /> : <span />}</div><div className="onboarding-step-copy"><span className="onboarding-operation">{operation}</span><h2>{title}</h2><p>{detail}</p>{!done && !active && operation !== "open-studio" && <button type="button" onClick={onOpen}>Work on this step <ArrowRight size={14} /></button>}{operation === "open-studio" && <button type="button" onClick={onOpen} disabled={!done}>Open Studio <ArrowRight size={14} /></button>}{active && children}</div></article>;
