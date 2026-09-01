import React, { FormEvent, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { AgentProject, ProjectSetupState } from "../types";

interface ProjectOnboardingProps {
  project?: AgentProject | null;
  setup?: ProjectSetupState;
  busy?: boolean;
  error?: string;
  onCreateProject?: (name: string, slug: string) => Promise<void>;
  onRefresh?: () => void;
  onCreateVersion?: () => void;
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
  onCreateKey,
}) => {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [key, setKey] = useState<{ secret: string; name: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  const slugError = useMemo(() => {
    if (!slug) return "A URL-safe slug is required.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Use lowercase letters, numbers, and single hyphens.";
    return "";
  }, [slug]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!onCreateProject || !name.trim() || slugError) return;
    await onCreateProject(name.trim(), slug);
  };

  if (!project) {
    return (
      <div className="flex min-h-full items-center justify-center overflow-auto bg-[#050505] p-6 text-[#D7DADD]">
        <form onSubmit={submit} className="w-full max-w-xl rounded-xl border border-white/[0.1] bg-[#0A0C0E] p-8 shadow-2xl">
          <div className="mb-8 flex items-start justify-between gap-5">
            <div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#7D858C]">Workspace onboarding</p><h1 className="mt-3 text-2xl font-medium text-[#F2F3F4]">Create your first agent project</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-[#8C949B]">Give your agent a home. TwineRun will keep the project empty until you define a real version, observe traces, and import evaluations.</p></div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3"><Plus className="h-5 w-5 text-[#D7DADD]" /></div>
          </div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#7D858C]">Project name<input value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slugEdited) setSlug(slugify(next)); }} placeholder="Research Agent" className="mt-2 w-full rounded border border-white/[0.1] bg-[#050505] px-3 py-3 text-sm text-[#F2F3F4] outline-none focus:border-white/30" /></label>
          <label className="mt-5 block text-[10px] font-mono uppercase tracking-wider text-[#7D858C]">Slug<input value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="research-agent" className={`mt-2 w-full rounded border bg-[#050505] px-3 py-3 font-mono text-sm text-[#F2F3F4] outline-none ${slugError ? "border-[#8A4E4E]" : "border-white/[0.1] focus:border-white/30"}`} /></label>
          {(slugError) && <p className="mt-2 text-xs text-[#D58C8C]">{slugError}</p>}
          {error && <p className="mt-4 flex items-center gap-2 rounded border border-[#8A4E4E]/50 bg-[#2A1515] px-3 py-2 text-xs text-[#E2A4A4]"><CircleAlert className="h-3.5 w-3.5" />{error}</p>}
          <button disabled={busy || !name.trim() || Boolean(slugError)} className="silver-btn-gradient mt-7 flex h-11 w-full items-center justify-center gap-2 rounded text-sm font-medium text-[#050505] disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Creating project…" : "Create project"}<ArrowRight className="h-4 w-4" /></button>
        </form>
      </div>
    );
  }

  const hasVersion = Boolean(setup?.hasVersion || project.version && project.version !== "latest");
  const hasTraces = Boolean(setup?.hasTraces || setup?.traceCount);
  const hasEvals = Boolean(setup?.hasEvaluationSuite || setup?.evalCaseCount);
  const baselineDone = setup?.baselineStatus === "COMPLETED";
  const steps = [
    { title: "Define agent", detail: "Connect OTLP/SDK traces or define nodes and model assignments.", done: hasVersion, action: onCreateVersion, label: "Define version" },
    { title: "Connect traces", detail: "Observe real executions. Prompts and outputs stay disabled by default.", done: hasTraces, action: onRefresh, label: "Refresh traces" },
    { title: "Add evaluations", detail: "Import JSONL or create cases for deterministic quality gates.", done: hasEvals, action: onRefresh, label: "Refresh evaluations" },
    { title: "Run baseline", detail: "Measure the current configuration before optimization is enabled.", done: baselineDone, action: onRefresh, label: "Refresh baseline" },
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
          {steps.map((step, index) => <article key={step.title} className={`rounded-xl border p-5 ${step.done ? "border-white/[0.16] bg-[#0C1011]" : "border-white/[0.08] bg-[#090B0C]"}`}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs ${step.done ? "border-[#B9C1C6] bg-[#E4E7E9] text-[#050505]" : "border-white/15 text-[#7D858C]"}`}>{step.done ? <Check className="h-4 w-4" /> : `0${index + 1}`}</span><h2 className="text-sm font-medium text-[#F2F3F4]">{step.title}</h2></div>{nextAction === ["DEFINE_AGENT", "ADD_TRACES", "ADD_EVALUATIONS", "RUN_BASELINE"][index] && !step.done && <span className="text-[9px] font-mono uppercase tracking-wider text-[#C7CDD1]">Next</span>}</div><p className="mt-4 text-xs leading-relaxed text-[#8C949B]">{step.detail}</p>{step.action && !step.done && <button onClick={step.action} className="mt-5 flex items-center gap-2 text-xs text-[#D7DADD] hover:text-white">{step.label}<ArrowRight className="h-3.5 w-3.5" /></button>}</article>)}
        </div>
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#090B0C] p-5"><div className="flex items-center gap-3"><KeyRound className="h-4 w-4 text-[#BFC7CC]" /><div><h2 className="text-sm text-[#F2F3F4]">Connector access</h2><p className="mt-1 text-xs text-[#8C949B]">Create a project-scoped key to send normalized traces. It is shown once and never retrievable again.</p></div></div>{key ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-[#728A75]/50 bg-[#132017] p-3"><code className="min-w-0 flex-1 break-all text-xs text-[#C9E6CE]">{key.secret}</code><button onClick={() => void navigator.clipboard?.writeText(key.secret)} className="flex items-center gap-1 text-xs text-[#C9E6CE]"><Copy className="h-3.5 w-3.5" />Copy</button></div> : <button onClick={() => void revealKey()} disabled={keyBusy || !onCreateKey} className="mt-4 flex items-center gap-2 rounded border border-white/[0.12] px-3 py-2 text-xs text-[#D7DADD] disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5" />{keyBusy ? "Creating key…" : "Create connector key"}</button>}</div>
        <div className="mt-4 rounded-xl border border-dashed border-white/[0.12] bg-[#080A0B] p-5"><div className="flex items-center gap-3"><UploadCloud className="h-4 w-4 text-[#9EA7AD]" /><div><h2 className="text-sm text-[#F2F3F4]">Evidence boundary</h2><p className="mt-1 text-xs leading-relaxed text-[#8C949B]">Current state: <span className="font-mono text-[#D7DADD]">{setup?.profilingOnly ? "profiling only" : baselineDone ? "ready to optimize" : "not measured yet"}</span>. Optimization remains disabled until the API reports a completed baseline.</p></div></div></div>
      </div>
    </div>
  );
};
