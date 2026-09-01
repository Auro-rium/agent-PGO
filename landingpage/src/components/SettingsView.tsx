import React, { useState } from 'react';
import { Check, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { AgentProject } from '../types';

interface SettingsViewProps {
  project: AgentProject;
  onUpdateProjectSettings: (newSettings: Partial<AgentProject>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ project, onUpdateProjectSettings }) => {
  const [tolerance, setTolerance] = useState(project.qualityTolerancePct);
  const [evalCases, setEvalCases] = useState(project.evalCasesCount);
  const [confidence, setConfidence] = useState(project.confidencePct);

  const applySettings = () => onUpdateProjectSettings({ qualityTolerancePct: tolerance, evalCasesCount: evalCases, confidencePct: confidence });

  return (
    <section className="studio-settings studio-view flex-1 h-full overflow-y-auto bg-[#050505] p-6 lg:p-10 font-mono text-xs">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#D7DADD]"><SettingsIcon className="h-4 w-4" /><span className="text-[10px] uppercase tracking-[0.18em] text-[#A0A5AA]">Studio settings</span></div>
            <h1 className="mt-3 font-sans text-2xl font-medium tracking-[-0.03em] text-[#F2F3F4]">Compiler flags & bounds</h1>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-[#6F767D]">Define the safety boundary AgentPGO uses before it recommends a cheaper execution plan for <span className="text-[#D7DADD]">{project.name}</span>.</p>
          </div>
          <div className="rounded border border-white/[0.08] bg-[#0B0D0F] px-3 py-2 text-right"><div className="text-[9px] uppercase tracking-wider text-[#5C6268]">Active workspace</div><div className="mt-1 text-[#F2F3F4]">{project.name}</div><div className="mt-0.5 text-[10px] text-[#6F767D]">{project.environment} · {project.version}</div></div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <SettingCard label="Quality tolerance bound (ε)" value={`±${tolerance.toFixed(1)}%`} description="Maximum allowable quality degradation across your evaluation vectors before a candidate is rejected."><input aria-label="Quality tolerance" type="range" min="0.1" max="5" step="0.1" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} /></SettingCard>
            <SettingCard label="Evaluation test batch size" value={`${evalCases} vectors`} description="Number of gold test vectors evaluated per candidate configuration during search passes."><input aria-label="Evaluation test batch size" type="range" min="20" max="500" step="20" value={evalCases} onChange={(e) => setEvalCases(Number(e.target.value))} /></SettingCard>
            <div className="rounded-lg border border-white/[0.07] bg-[#0A0C0E] p-5"><div className="flex items-center justify-between"><div><div className="text-sm text-[#F2F3F4]">Statistical confidence</div><p className="mt-1 text-[11px] leading-relaxed text-[#6F767D]">Confidence level reported with each quality gate.</p></div><span className="text-sm font-semibold text-[#D7DADD]">{confidence}%</span></div><div className="mt-5 grid grid-cols-3 gap-2">{[90, 95, 99].map((level) => <button key={level} onClick={() => setConfidence(level)} className={`rounded border px-3 py-2 text-[11px] transition-colors ${confidence === level ? 'border-[#D7DADD]/50 bg-[#F2F3F4] text-[#050505]' : 'border-white/[0.08] bg-[#050505] text-[#7B8289] hover:border-white/[0.2] hover:text-[#D7DADD]'}`}>{level}%</button>)}</div></div>
            <button onClick={applySettings} className="silver-btn-gradient inline-flex items-center gap-2 rounded px-4 py-2.5 text-xs font-bold text-[#050505]"><Check className="h-3.5 w-3.5" />Apply compiler flags</button>
          </div>
          <aside className="h-fit rounded-lg border border-white/[0.07] bg-[#0A0C0E] p-5"><div className="flex items-center gap-2 text-[#D7DADD]"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] uppercase tracking-[0.16em]">Current safeguards</span></div><div className="mt-5 space-y-4">{[['Quality gate', `±${project.qualityTolerancePct.toFixed(1)}% max delta`], ['Eval suite', `${project.evalCasesCount} gold vectors`], ['Confidence', `${project.confidencePct}% interval`], ['Deployment', 'Manual approval']].map(([label, value]) => <div key={label} className="border-t border-white/[0.06] pt-3"><div className="text-[9px] uppercase tracking-wider text-[#5C6268]">{label}</div><div className="mt-1 text-xs text-[#D7DADD]">{value}</div></div>)}</div><p className="mt-6 text-[10px] leading-relaxed text-[#5C6268]">Settings apply to the next optimization run. Existing compiled configurations remain unchanged.</p></aside>
        </div>
      </div>
    </section>
  );
};

const SettingCard: React.FC<{ label: string; value: string; description: string; children: React.ReactNode }> = ({ label, value, description, children }) => <div className="rounded-lg border border-white/[0.07] bg-[#0A0C0E] p-5"><div className="flex items-center justify-between gap-4"><div><div className="text-sm text-[#F2F3F4]">{label}</div><p className="mt-1 text-[11px] leading-relaxed text-[#6F767D]">{description}</p></div><span className="shrink-0 rounded border border-white/[0.1] bg-[#050505] px-2.5 py-1 text-[#D7DADD]">{value}</span></div><div className="mt-5">{React.cloneElement(children as React.ReactElement, { className: 'w-full accent-[#D7DADD] cursor-pointer' })}</div></div>;
