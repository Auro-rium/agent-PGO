import React, { FormEvent, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, Clipboard, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { AgentProject, ProjectSetupState } from "../types";
import { API_BASE_URL } from "../lib/api";

interface ProjectOnboardingProps {
  project?: AgentProject | null;
  setup?: ProjectSetupState;
  busy?: boolean;
  error?: string;
  onCreateProject?: (name: string, slug: string) => Promise<void>;
  onRefresh?: () => void;
  onCreateVersion?: (input: Record<string, unknown>) => Promise<void>;
  onImportEvaluations?: (name: string, cases: Record<string, unknown>[], graders: Record<string, unknown>[]) => Promise<void>;
  onRunBaseline?: () => Promise<void>;
  baselineStatus?: string;
  baselineRunId?: string;
  onCreateKey?: () => Promise<{ secret: string; name: string } | null>;
}

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export const ProjectOnboarding: React.FC<ProjectOnboardingProps> = ({
  project,
  setup,
  busy = false,
  error,

  onCreateProject,
  onRefresh,
  onCreateVersion,
  onImportEvaluations,
  onRunBaseline,
  baselineStatus,
  baselineRunId,
  onCreateKey,
}) => {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [key, setKey] = useState<{ secret: string; name: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [activeStep, setActiveStep] = useState<"version" | "traces" | "evals" | "baseline" | null>(null);
  const [version, setVersion] = useState("v1");
  const [environment, setEnvironment] = useState("STAGING");
  const [nodesText, setNodesText] = useState("planner | Planner | planning | openai/gpt-5.6-sol\nresearcher | Researcher | research | openai/gpt-5.6-sol");
  const [edgesText, setEdgesText] = useState("planner -> researcher");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [evalName, setEvalName] = useState("agent-evals");
  const [evalText, setEvalText] = useState("");
  const [graderKind, setGraderKind] = useState("exact_match");
  const [graderConfig, setGraderConfig] = useState("{}");
  const [copied, setCopied] = useState(false);

  const slugError = useMemo(() => {
    if (!slug) return "A URL-safe slug is required.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Use lowercase letters, numbers, and single hyphens.";
    return "";
  }, [slug]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!onCreateProject || !name.trim() || slugError) return;
    await onCreateProject(name.trim(), slug);
  };

  const showSlugError = slugTouched || submitAttempted;

  const parseVersion = () => {
    const lines = nodesText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    if (!lines.length) throw new Error("Add at least one node.");
    const nodes = lines.map((line, index) => {
      const [id, nodeName, role, model] = line.split("|").map((part) => part.trim());
      if (!id || !nodeName || !role || !model || !model.includes("/")) throw new Error(`Node ${index + 1} must be: id | name | role | provider/model`);
      return { id, name: nodeName, role, baselineModel: model, currentModel: model, optimizedModel: model, x: 160 + (index % 3) * 240, y: 140 + Math.floor(index / 3) * 150 };
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = edgesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [connection, label] = line.split("|").map((part) => part.trim());
      const [from, to] = connection.split("->").map((part) => part.trim());
      if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) throw new Error(`Edge ${index + 1} must connect existing nodes as from -> to`);
      return { id: `edge-${index + 1}`, from, to, label: label || undefined };
    });
    return { version: version.trim() || "v1", environment, nodes, edges, metrics: {} };
  };

  const saveVersion = async () => {
    if (!onCreateVersion) return;
    setFormBusy(true); setFormError("");
    try { await onCreateVersion(parseVersion()); setActiveStep(null); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to save this version."); }
    finally { setFormBusy(false); }
  };

  const parseEvaluations = () => {
    const raw = evalText.trim();
    if (!raw) throw new Error("Paste at least one JSONL evaluation case or choose a file.");
    let cases: Record<string, unknown>[];
    if (raw.startsWith("[")) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Evaluation JSON must be an array or JSONL.");
      cases = parsed;
    } else {
      cases = raw.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
        try { return JSON.parse(line) as Record<string, unknown>; }
        catch { throw new Error(`Evaluation line ${index + 1} is not valid JSON.`); }
      });
    }
    if (!cases.length) throw new Error("Add at least one evaluation case.");
    const config = JSON.parse(graderConfig || "{}");
    return { cases, graders: [{ name: `${graderKind}-grader`, kind: graderKind, config }] };
  };

  const importEvaluations = async (event: FormEvent) => {
    event.preventDefault();
    if (!onImportEvaluations) return;
    setFormBusy(true); setFormError("");
    try { const parsed = parseEvaluations(); await onImportEvaluations(evalName.trim() || "agent-evals", parsed.cases, parsed.graders); setActiveStep(null); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to import evaluations."); }
    finally { setFormBusy(false); }
  };

  const loadEvalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFormError("");
    try { setEvalText(await file.text()); }
    catch { setFormError("Unable to read that evaluation file."); }
  };

  const connectorSnippet = `curl -X POST "${API_BASE_URL}/traces?project_id=${project?.id}" \\
  -H "X-AgentPGO-API-Key: <project-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"resourceSpans":[{"scopeSpans":[{"spans":[{"traceId":"0123456789abcdef0123456789abcdef","spanId":"0123456789abcdef","name":"researcher","startTimeUnixNano":"1770000000000000000","endTimeUnixNano":"1770000001000000000","attributes":[]}]}]}]}'`;
  const copySnippet = async () => { await navigator.clipboard?.writeText(connectorSnippet); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };

  if (!project) {
    return (
      <div className="flex min-h-full items-center justify-center overflow-auto bg-[#050505] p-6 text-[#D7DADD]">
        <form onSubmit={submit} className="w-full max-w-xl rounded-xl border border-white/[0.1] bg-[#0A0C0E] p-8 shadow-2xl">
          <div className="mb-8 flex items-start justify-between gap-5">
            <div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#7D858C]">Workspace onboarding</p><h1 className="mt-3 text-2xl font-medium text-[#F2F3F4]">Create your first agent project</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-[#8C949B]">Give your agent a home. TwineRun will keep the project empty until you define a real version, observe traces, and import evaluations.</p></div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3"><Plus className="h-5 w-5 text-[#D7DADD]" /></div>
          </div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#7D858C]">Project name<input value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slugEdited) setSlug(slugify(next)); }} placeholder="Research Agent" className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-3 text-sm text-[#F2F3F4] outline-none focus:border-white/30" /></label>
          <label className="mt-5 block text-[10px] font-mono uppercase tracking-wider text-[#7D858C]">Slug<input value={slug} onChange={(event) => { setSlugEdited(true); setSlugTouched(true); setSlug(slugify(event.target.value)); }} placeholder="research-agent" className={`mt-2 w-full rounded border bg-[#050505] px-3 py-3 font-mono text-sm text-[#F2F3F4] outline-none ${showSlugError && slugError ? "border-[#8A4E4E]" : "border-white/[0.1] focus:border-white/30"}`} /></label>
          {showSlugError && slugError && <p className="mt-2 text-xs text-[#D58C8C]">{slugError}</p>}
          {error && <p className="mt-4 flex items-center gap-2 rounded border border-[#8A4E4E]/50 bg-[#2A1515] px-3 py-2 text-xs text-[#E2A4A4]"><CircleAlert className="h-3.5 w-3.5" />{error}</p>}
          <button disabled={busy || !name.trim() || Boolean(slugError)} className="silver-btn-gradient mt-7 flex h-11 w-full items-center justify-center gap-2 rounded text-sm font-medium text-[#050505] disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Creating project…" : "Create project"}<ArrowRight className="h-4 w-4" /></button>
        </form>
      </div>
    );
  }

  const hasVersion = Boolean(setup?.hasVersion || project.version && project.version !== "latest");
  const hasTraces = Boolean(setup?.hasTraces || setup?.traceCount);
  const hasEvals = Boolean(setup?.hasEvaluationSuite || setup?.evalCaseCount);
  const effectiveBaselineStatus = baselineStatus || setup?.baselineStatus || "NOT_STARTED";
  const baselineDone = effectiveBaselineStatus === "COMPLETED";
  const steps = [
    { title: "Define agent", detail: "Create a version with the nodes and baseline models that your agent actually uses.", done: hasVersion, action: onCreateVersion ? () => setActiveStep("version") : undefined, label: "Define version" },
    { title: "Connect traces", detail: "Observe real executions. Prompts and outputs stay disabled by default.", done: hasTraces, action: () => setActiveStep("traces"), label: "Show connector" },
    { title: "Add evaluations", detail: "Import JSONL or create cases for deterministic quality gates.", done: hasEvals, action: onImportEvaluations ? () => setActiveStep("evals") : onRefresh, label: "Import evaluations" },
    { title: "Run baseline", detail: "Measure the current configuration before optimization is enabled.", done: baselineDone, action: onRunBaseline ? () => setActiveStep("baseline") : onRefresh, label: "Run baseline" },
  ];
  const nextAction = setup?.nextAction || (hasVersion ? "ADD_EVALUATIONS" : "DEFINE_AGENT");

  const revealKey = async () => {
    if (!onCreateKey || keyBusy) return;
    setKeyBusy(true);
    try { setKey(await onCreateKey()); } finally { setKeyBusy(false); }
  };

  return (
    <div className="flex min-h-full flex-1 items-start justify-center overflow-auto bg-[#050505] p-6 text-[#D7DADD]">
      <div className="w-full max-w-4xl py-8">
        <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#7D858C]">Agent setup · {project?.name}</p><h1 className="mt-3 text-3xl font-medium text-[#F2F3F4]">Bring a real agent into focus.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8C949B]">TwineRun will not invent a graph or metrics. Complete the evidence path below, then optimization becomes available.</p></div><button onClick={onRefresh} className="flex items-center gap-2 rounded border border-white/[0.1] px-3 py-2 text-xs text-[#A0A5AA] hover:border-white/25 hover:text-white"><RefreshCw className="h-3.5 w-3.5" />Refresh state</button></div>
        {error && <p className="mt-6 flex items-center gap-2 rounded border border-[#8A4E4E]/50 bg-[#2A1515] px-3 py-2 text-xs text-[#E2A4A4]"><CircleAlert className="h-3.5 w-3.5" />{error}</p>}
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => <article key={step.title} className={`rounded-xl border p-5 ${step.done ? "border-white/[0.16] bg-[#0C1011]" : "border-white/[0.08] bg-[#090B0C]"}`}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs ${step.done ? "border-[#B9C1C6] bg-[#E4E7E9] text-[#050505]" : "border-white/15 text-[#7D858C]"}`}>{step.done ? <Check className="h-4 w-4" /> : `0${index + 1}`}</span><h2 className="text-sm font-medium text-[#F2F3F4]">{step.title}</h2></div>{nextAction === ["DEFINE_VERSION", "CONNECT_AGENT", "IMPORT_EVALS", "RUN_BASELINE"][index] && !step.done && <span className="text-[9px] font-mono uppercase tracking-wider text-[#C7CDD1]">Next</span>}</div><p className="mt-4 text-xs leading-relaxed text-[#8C949B]">{step.detail}</p>{step.action && !step.done && <button onClick={step.action} className="mt-5 flex items-center gap-2 text-xs text-[#D7DADD] hover:text-white">{step.label}<ArrowRight className="h-3.5 w-3.5" /></button>}</article>)}
        </div>
        {activeStep === "version" && <section className="mt-4 rounded-xl border border-white/[0.1] bg-[#090B0C] p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm text-[#F2F3F4]">Define version and graph</h2><p className="mt-1 text-xs text-[#8C949B]">One node per line: <code>id | name | role | provider/model</code>. Edges use <code>from -&gt; to</code>.</p></div><button onClick={() => setActiveStep(null)} className="text-xs text-[#7D858C]">Close</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] uppercase tracking-wider text-[#7D858C]">Version<input value={version} onChange={(event) => setVersion(event.target.value)} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-2 text-xs text-white" /></label><label className="text-[10px] uppercase tracking-wider text-[#7D858C]">Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-2 text-xs text-white"><option>STAGING</option><option>PROD</option></select></label></div><label className="mt-4 block text-[10px] uppercase tracking-wider text-[#7D858C]">Nodes<textarea value={nodesText} onChange={(event) => setNodesText(event.target.value)} rows={5} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] p-3 font-mono text-xs leading-relaxed text-white" /></label><label className="mt-4 block text-[10px] uppercase tracking-wider text-[#7D858C]">Edges<textarea value={edgesText} onChange={(event) => setEdgesText(event.target.value)} rows={3} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] p-3 font-mono text-xs leading-relaxed text-white" /></label>{formError && <p className="mt-3 text-xs text-[#D58C8C]">{formError}</p>}<button onClick={() => void saveVersion()} disabled={formBusy} className="silver-btn-gradient mt-4 rounded px-4 py-2 text-xs font-medium text-[#050505] disabled:opacity-40">{formBusy ? "Saving version…" : "Save version"}</button></section>}
        {activeStep === "traces" && <section className="mt-4 rounded-xl border border-white/[0.1] bg-[#090B0C] p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm text-[#F2F3F4]">Connect your agent traces</h2><p className="mt-1 text-xs text-[#8C949B]">Send standard OTLP/HTTP JSON to the API. Keep the project key server-side and set content capture only when debugging.</p></div><button onClick={() => setActiveStep(null)} className="text-xs text-[#7D858C]">Close</button></div><div className="mt-4 relative"><pre className="overflow-auto rounded border border-white/[0.08] bg-[#050505] p-3 text-[10px] leading-relaxed text-[#C9D0D4]">{connectorSnippet}</pre><button onClick={() => void copySnippet()} className="absolute right-2 top-2 flex items-center gap-1 rounded border border-white/[0.12] bg-[#0D1012] px-2 py-1 text-[10px] text-[#D7DADD]"><Clipboard className="h-3 w-3" />{copied ? "Copied" : "Copy"}</button></div><p className="mt-3 text-[10px] leading-relaxed text-[#7D858C]">After sending a real span, return here and use Refresh state. Trace metadata is persisted; prompt and output bodies remain disabled by default.</p></section>}
        {activeStep === "evals" && <form onSubmit={importEvaluations} className="mt-4 rounded-xl border border-white/[0.1] bg-[#090B0C] p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm text-[#F2F3F4]">Import evaluation suite</h2><p className="mt-1 text-xs text-[#8C949B]">Each JSONL row should include <code>id</code>, <code>input</code>, and <code>expected</code>. Metadata is preserved for reporting.</p></div><button type="button" onClick={() => setActiveStep(null)} className="text-xs text-[#7D858C]">Close</button></div><label className="mt-4 block text-[10px] uppercase tracking-wider text-[#7D858C]">Suite name<input value={evalName} onChange={(event) => setEvalName(event.target.value)} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-2 text-xs text-white" /></label><label className="mt-4 block text-[10px] uppercase tracking-wider text-[#7D858C]">JSONL cases<input type="file" accept=".jsonl,.json,application/json" onChange={(event) => void loadEvalFile(event)} className="mt-2 block w-full text-xs text-[#A0A5AA]" /><textarea value={evalText} onChange={(event) => setEvalText(event.target.value)} placeholder={'{"id":"case-1","input":{"question":"..."},"expected":{"answer":"..."}}'} rows={6} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] p-3 font-mono text-xs text-white" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] uppercase tracking-wider text-[#7D858C]">Grader<select value={graderKind} onChange={(event) => setGraderKind(event.target.value)} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-2 text-xs text-white"><option value="exact_match">Exact match</option><option value="contains">Contains</option><option value="json_schema">JSON schema</option></select></label><label className="text-[10px] uppercase tracking-wider text-[#7D858C]">Grader config JSON<input value={graderConfig} onChange={(event) => setGraderConfig(event.target.value)} className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-2 font-mono text-xs text-white" /></label></div>{formError && <p className="mt-3 text-xs text-[#D58C8C]">{formError}</p>}<button disabled={formBusy} className="silver-btn-gradient mt-4 rounded px-4 py-2 text-xs font-medium text-[#050505] disabled:opacity-40">{formBusy ? "Importing suite…" : "Import evaluations"}</button></form>}
        {activeStep === "baseline" && <section className="mt-4 rounded-xl border border-white/[0.1] bg-[#090B0C] p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm text-[#F2F3F4]">Run baseline</h2><p className="mt-1 text-xs text-[#8C949B]">The worker will measure the current version against the persisted evaluation suite. No production traffic is changed.</p></div><button onClick={() => setActiveStep(null)} className="text-xs text-[#7D858C]">Close</button></div><div className="mt-4 flex flex-wrap items-center gap-4 rounded border border-white/[0.08] bg-[#050505] p-4"><div><div className="text-[9px] uppercase tracking-wider text-[#7D858C]">Status</div><div className="mt-1 font-mono text-sm text-[#F2F3F4]">{effectiveBaselineStatus}</div></div>{baselineRunId && <div><div className="text-[9px] uppercase tracking-wider text-[#7D858C]">Run</div><div className="mt-1 font-mono text-xs text-[#A0A5AA]">{baselineRunId}</div></div>}<button onClick={() => void onRunBaseline?.()} disabled={!onRunBaseline || !hasVersion || !hasEvals || effectiveBaselineStatus === "QUEUED" || effectiveBaselineStatus === "RUNNING"} className="silver-btn-gradient ml-auto rounded px-4 py-2 text-xs font-medium text-[#050505] disabled:cursor-not-allowed disabled:opacity-40">{effectiveBaselineStatus === "QUEUED" || effectiveBaselineStatus === "RUNNING" ? "Baseline running…" : baselineDone ? "Run again" : "Start baseline"}</button></div>{(!hasVersion || !hasEvals) && <p className="mt-3 text-[10px] text-[#D3B98A]">Define a version and import at least one evaluation suite before starting the baseline.</p>}</section>}
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#090B0C] p-5"><div className="flex items-center gap-3"><KeyRound className="h-4 w-4 text-[#BFC7CC]" /><div><h2 className="text-sm text-[#F2F3F4]">Connector access</h2><p className="mt-1 text-xs text-[#8C949B]">Create a project-scoped key to send normalized traces. It is shown once and never retrievable again.</p></div></div>{key ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-[#728A75]/50 bg-[#132017] p-3"><code className="min-w-0 flex-1 break-all text-xs text-[#C9E6CE]">{key.secret}</code><button onClick={() => void navigator.clipboard?.writeText(key.secret)} className="flex items-center gap-1 text-xs text-[#C9E6CE]"><Copy className="h-3.5 w-3.5" />Copy</button></div> : <button onClick={() => void revealKey()} disabled={keyBusy || !onCreateKey} className="mt-4 flex items-center gap-2 rounded border border-white/[0.12] px-3 py-2 text-xs text-[#D7DADD] disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5" />{keyBusy ? "Creating key…" : "Create connector key"}</button>}</div>
        <div className="mt-4 rounded-xl border border-dashed border-white/[0.12] bg-[#080A0B] p-5"><div className="flex items-center gap-3"><UploadCloud className="h-4 w-4 text-[#9EA7AD]" /><div><h2 className="text-sm text-[#F2F3F4]">Evidence boundary</h2><p className="mt-1 text-xs leading-relaxed text-[#8C949B]">Current state: <span className="font-mono text-[#D7DADD]">{setup?.profilingOnly ? "profiling only" : baselineDone ? "ready to optimize" : effectiveBaselineStatus === "FAILED" ? "baseline failed — review the run" : "not measured yet"}</span>. Optimization remains disabled until the API reports a completed baseline.</p></div></div></div>
      </div>
    </div>
  );
};
