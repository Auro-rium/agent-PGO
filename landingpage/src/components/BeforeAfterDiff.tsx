import React, { useState } from 'react';
import { AgentProject } from '../types';
import { 
  ArrowRight, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck,
  Download
} from 'lucide-react';

interface BeforeAfterDiffProps {
  project: AgentProject;
  onDeployOptimized: () => void;
  onOpenExport: () => void;
}

export const BeforeAfterDiff: React.FC<BeforeAfterDiffProps> = ({
  project,
  onDeployOptimized,
  onOpenExport
}) => {
  return (
    <div className="flex-1 h-full bg-[#050505] p-4 md:p-6 overflow-y-auto select-none flex flex-col space-y-4 font-mono text-xs">
      {/* Top Banner: Core Before / After Comparison */}
      <div className="bg-[#090A0B] border border-white/[0.06] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.05] pb-4">
          <div>
            <div className="text-[9.5px] uppercase text-[#5C6268] tracking-wider">
              PGO Compilation Audit
            </div>
            <div className="text-sm font-semibold text-[#F2F3F4] flex items-center gap-2 mt-0.5">
              <span>{project.name}</span>
              <span className="text-[#5C6268]">·</span>
              <span className="text-[#A0A5AA]">Baseline vs. Compiled Output</span>
            </div>
          </div>

          {/* Primary Result Headline */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[9.5px] text-[#5C6268] uppercase block">Measured Reduction</span>
              <span className="text-base font-bold text-[#F2F3F4] tracking-tight">
                -63.1% LOWER COST
              </span>
            </div>
            <div className="px-3 py-1.5 rounded silver-btn-gradient text-[#050505] text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>~${project.monthlySavingsEstimate.toLocaleString()}/mo</span>
            </div>
          </div>
        </div>

        {/* The 3 Core Metric Comparisons (Before vs After) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1. Cost per Execution */}
          <div className="p-3.5 rounded-lg bg-[#050505] border border-white/[0.05] space-y-2.5">
            <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">
              Avg Cost / Execution
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[9px] text-[#5C6268] uppercase block">Baseline</span>
                <span className="text-xs text-[#5C6268] line-through font-semibold">
                  ${project.baselineCost.toFixed(3)}
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#5C6268] shrink-0" />
              <div className="text-right">
                <span className="text-[9px] text-[#D7DADD] uppercase block">Compiled</span>
                <span className="text-lg text-[#F2F3F4] font-bold">
                  ${project.optimizedCost.toFixed(3)}
                </span>
              </div>
            </div>
            <div className="w-full h-1 bg-[#14171A] rounded-full overflow-hidden">
              <div className="h-full bg-[#D7DADD] w-[36.9%]" />
            </div>
          </div>

          {/* 2. Latency P95 */}
          <div className="p-3.5 rounded-lg bg-[#050505] border border-white/[0.05] space-y-2.5">
            <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">
              P95 Pipeline Latency
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[9px] text-[#5C6268] uppercase block">Baseline</span>
                <span className="text-xs text-[#5C6268] line-through font-semibold">
                  {project.baselineLatencyP95.toFixed(1)}s
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#5C6268] shrink-0" />
              <div className="text-right">
                <span className="text-[9px] text-[#D7DADD] uppercase block">Compiled</span>
                <span className="text-lg text-[#D7DADD] font-bold">
                  {project.optimizedLatencyP95.toFixed(1)}s
                </span>
              </div>
            </div>
            <div className="text-[10.5px] text-[#A0A5AA] flex justify-between">
              <span>34.4% Latency Reduction</span>
              <span className="text-[#5C6268]">-8.3s faster</span>
            </div>
          </div>

          {/* 3. Measured Quality Score */}
          <div className="p-3.5 rounded-lg bg-[#050505] border border-white/[0.05] space-y-2.5">
            <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">
              Empirical Quality Score
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[9px] text-[#5C6268] uppercase block">Baseline</span>
                <span className="text-xs text-[#A0A5AA] font-semibold">
                  {project.baselineQuality.toFixed(1)}%
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#5C6268] shrink-0" />
              <div className="text-right">
                <span className="text-[9px] text-[#D7DADD] uppercase block">Compiled</span>
                <span className="text-lg text-[#F2F3F4] font-bold">
                  {project.optimizedQuality.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="text-[10.5px] text-[#D7DADD] flex justify-between">
              <span>+0.3pp Quality Lift</span>
              <span className="text-[#5C6268]">0.0% regression</span>
            </div>
          </div>
        </div>
      </div>

      {/* Node Transitions Matrix */}
      <div className="bg-[#090A0B] border border-white/[0.06] rounded-lg p-5 space-y-3.5">
        <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
          <div>
            <div className="text-[9.5px] uppercase text-[#5C6268] tracking-wider">
              Node Model Transitions
            </div>
            <div className="text-sm font-semibold text-[#F2F3F4]">
              Compiled Model Substitution Matrix
            </div>
          </div>
          <span className="text-xs text-[#5C6268]">
            4 Changed · 1 Preserved
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {project.nodes.map((node) => {
            const isChanged = node.optimizedModel !== node.baselineModel;

            return (
              <div
                key={node.id}
                className={`p-3 rounded border transition-all ${
                  isChanged
                    ? 'bg-[#0F1113] border-white/[0.08]'
                    : 'bg-[#050505] border-white/[0.04] opacity-75'
                }`}
              >
                {/* Node Title & Change Status */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs uppercase text-[#F2F3F4]">
                    {node.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[8.5px] uppercase font-semibold ${
                      isChanged
                        ? 'bg-white/[0.06] border border-white/[0.1] text-[#F2F3F4]'
                        : 'bg-white/[0.02] border border-white/[0.04] text-[#5C6268]'
                    }`}
                  >
                    {isChanged ? 'Changed' : 'Preserved (Sol)'}
                  </span>
                </div>

                {/* Transition Arrow */}
                <div className="flex items-center justify-between p-2 rounded bg-[#050505] border border-white/[0.04] my-2 text-xs">
                  <span className="text-[#5C6268] line-through">
                    {node.baselineModel}
                  </span>
                  <ArrowRight className="w-3 h-3 text-[#A0A5AA] shrink-0" />
                  <span
                    className={`font-semibold ${
                      isChanged ? 'text-[#F2F3F4]' : 'text-[#A0A5AA]'
                    }`}
                  >
                    {node.optimizedModel}
                  </span>
                </div>

                {/* Delta Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-[#A0A5AA] pt-1">
                  <div>
                    <span className="text-[#5C6268] block text-[9px]">Node Cost</span>
                    <span className="text-[#D7DADD] font-medium">
                      ${node.baselineCost.toFixed(3)} → ${node.optimizedCost.toFixed(3)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#5C6268] block text-[9px]">Sensitivity</span>
                    <span className="text-[#D7DADD]">{node.qualitySensitivity}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Verification Certification Matrix */}
      <div className="bg-[#090A0B] border border-white/[0.06] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#D7DADD]" />
            <span className="text-xs font-semibold uppercase text-[#F2F3F4]">
              Verification & Certification Status
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#0F1113] border border-white/[0.1] text-xs text-[#F2F3F4] font-semibold">
            CERTIFIED PASS
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs pt-1">
          <div className="p-2 rounded bg-[#050505] border border-white/[0.04]">
            <span className="text-[9px] text-[#5C6268] uppercase block">Eval Cases</span>
            <span className="font-semibold text-[#F2F3F4]">120 Gold Cases</span>
          </div>
          <div className="p-2 rounded bg-[#050505] border border-white/[0.04]">
            <span className="text-[9px] text-[#5C6268] uppercase block">Baseline Score</span>
            <span className="font-semibold text-[#A0A5AA]">92.4%</span>
          </div>
          <div className="p-2 rounded bg-[#050505] border border-white/[0.04]">
            <span className="text-[9px] text-[#5C6268] uppercase block">Compiled Score</span>
            <span className="font-semibold text-[#F2F3F4]">92.7%</span>
          </div>
          <div className="p-2 rounded bg-[#050505] border border-white/[0.04]">
            <span className="text-[9px] text-[#5C6268] uppercase block">Tolerance Bound</span>
            <span className="font-semibold text-[#D7DADD]">±1.0% Max Delta</span>
          </div>
          <div className="p-2 rounded bg-[#050505] border border-white/[0.04]">
            <span className="text-[9px] text-[#5C6268] uppercase block">Confidence</span>
            <span className="font-semibold text-[#D7DADD]">95% (p &lt; 0.01)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/[0.05]">
          <p className="text-xs text-[#5C6268]">
            Artifact verified against multi-hop regression test vectors. Ready for runtime deployment.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenExport}
              className="px-3 py-1.5 rounded bg-[#0F1113] border border-white/[0.08] hover:border-white/[0.14] text-xs text-[#D7DADD] flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Manifest</span>
            </button>

            <button
              onClick={onDeployOptimized}
              className="px-3.5 py-1.5 rounded silver-btn-gradient text-[#050505] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Deploy to Production</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

