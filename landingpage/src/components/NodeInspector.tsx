import React, { useState } from 'react';
import { AgentNode, AgentProject } from '../types';
import { 
  X, 
  Sparkles,
  Flame
} from 'lucide-react';

interface NodeInspectorProps {
  selectedNode: AgentNode | null;
  project: AgentProject;
  onClose: () => void;
  onSelectModelOverride: (nodeId: string, modelName: string) => void;
  onRunOptimization: () => void;
  isOptimizing: boolean;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  project,
  onClose,
  onSelectModelOverride,
  onRunOptimization,
  isOptimizing
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'prompt'>('profile');

  // If no node is selected, show the Agent Global Profiler
  if (!selectedNode) {
    return (
      <aside className="studio-inspector w-80 lg:w-96 bg-[#090A0B] border-l border-white/[0.06] flex flex-col h-full overflow-y-auto select-none shrink-0 z-20 font-mono text-xs">
        {/* Header */}
        <div className="p-3.5 border-b border-white/[0.06] flex items-center justify-between bg-[#0F1113]">
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-[#5C6268]">
              Agent Profiler
            </div>
            <div className="text-sm font-semibold text-[#F2F3F4]">
              {project.name}
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#050505] border border-white/[0.06] text-[10px] text-[#A0A5AA]">
            {project.environment}
          </span>
        </div>

        {/* Global Summary Content */}
        <div className="p-4 space-y-4">
          {/* Key Metric Card */}
          <div className="p-3.5 rounded-lg bg-[#0F1113] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#5C6268] uppercase">Compiler Optimization Scope</span>
              <span className="px-2 py-0.5 rounded bg-[#050505] border border-white/[0.1] text-xs font-bold text-[#F2F3F4]">
                -{project.savingsPct}% Cost
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.05]">
              <div>
                <span className="text-[9.5px] text-[#5C6268] uppercase block">Baseline Cost</span>
                <span className="text-sm font-semibold text-[#A0A5AA]">${project.baselineCost.toFixed(3)}</span>
                <span className="text-[9px] text-[#5C6268] block">/ execution</span>
              </div>
              <div>
                <span className="text-[9.5px] text-[#5C6268] uppercase block">Compiled Cost</span>
                <span className="text-sm font-bold text-[#F2F3F4]">${project.optimizedCost.toFixed(3)}</span>
                <span className="text-[9px] text-[#5C6268] block">/ execution</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-xs">
              <span className="text-[#5C6268]">Monthly Run Rate Delta:</span>
              <span className="text-[#F2F3F4] font-bold">~${project.monthlySavingsEstimate.toLocaleString()}/mo</span>
            </div>
          </div>

          {/* Execution Hotspots Summary */}
          <div className="space-y-2">
            <div className="text-[9.5px] uppercase tracking-wider text-[#5C6268] flex items-center justify-between">
              <span>Sub-Agent Cost Share</span>
              <span>Share</span>
            </div>

            <div className="space-y-1.5">
              {project.nodes.map((node) => (
                <div
                  key={node.id}
                  className="p-2.5 rounded bg-[#050505] border border-white/[0.05] hover:border-white/[0.14] transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {node.isHotspot && <Flame className="w-3 h-3 text-[#D7DADD]" />}
                      <span className="font-medium text-[#F2F3F4]">{node.name}</span>
                    </div>
                    <span className="text-[#D7DADD] font-semibold">{node.costSharePct.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#5C6268] mt-1">
                    <span>{node.currentModel}</span>
                    <span>${node.avgCost.toFixed(3)} / run</span>
                  </div>
                  <div className="w-full h-1 bg-[#14171A] rounded-full overflow-hidden mt-1.5">
                    <div
                      className={`h-full ${node.isHotspot ? 'bg-[#D7DADD]' : 'bg-[#5C6268]'}`}
                      style={{ width: `${node.costSharePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Verification Specs */}
          <div className="p-3 rounded bg-[#050505] border border-white/[0.05] space-y-1.5 text-xs">
            <div className="text-[9.5px] text-[#5C6268] uppercase">Verification Test Suite</div>
            <div className="flex items-center justify-between text-[#A0A5AA]">
              <span>Gold Eval Vectors:</span>
              <span className="text-[#F2F3F4] font-medium">{project.evalCasesCount} cases</span>
            </div>
            <div className="flex items-center justify-between text-[#A0A5AA]">
              <span>Quality Tolerance:</span>
              <span className="text-[#D7DADD]">±{project.qualityTolerancePct.toFixed(1)}% max delta</span>
            </div>
            <div className="flex items-center justify-between text-[#A0A5AA]">
              <span>Confidence Interval:</span>
              <span className="text-[#D7DADD]">{project.confidencePct}% (p &lt; 0.01)</span>
            </div>
          </div>

          {/* Full Optimize CTA */}
          <button
            onClick={onRunOptimization}
            disabled={isOptimizing}
            className="w-full py-2 rounded text-xs font-bold silver-btn-gradient text-[#050505] flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#050505]" />
            <span>RUN PGO COMPILATION</span>
          </button>
        </div>
      </aside>
    );
  }

  // A specific node is selected: render deep node inspector
  return (
    <aside className="studio-inspector w-80 lg:w-96 bg-[#090A0B] border-l border-white/[0.06] flex flex-col h-full overflow-y-auto select-none shrink-0 z-20 font-mono text-xs animate-in slide-in-from-right duration-150">
      {/* Header */}
      <div className="p-3.5 border-b border-white/[0.06] flex items-center justify-between bg-[#0F1113]">
        <div className="flex items-center gap-2">
          {selectedNode.isHotspot && <Flame className="w-4 h-4 text-[#D7DADD]" />}
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-[#5C6268]">
              Node Inspector
            </div>
            <div className="text-sm font-semibold text-[#F2F3F4] uppercase tracking-wide">
              {selectedNode.name}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.04] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Node Role & Tabs */}
      <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.05]">
        <p className="text-[10.5px] text-[#A0A5AA] leading-relaxed line-clamp-2">
          {selectedNode.role}
        </p>
      </div>

      {/* Inspector Tabs */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#050505] px-2 text-xs">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3 py-1.5 border-b-2 transition-colors ${
            activeTab === 'profile'
              ? 'border-[#D7DADD] text-[#F2F3F4]'
              : 'border-transparent text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          Profiling
        </button>
        <button
          onClick={() => setActiveTab('prompt')}
          className={`px-3 py-1.5 border-b-2 transition-colors ${
            activeTab === 'prompt'
              ? 'border-[#D7DADD] text-[#F2F3F4]'
              : 'border-transparent text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          Prompt & IO
        </button>
      </div>

      {/* Profiling Body */}
      {activeTab === 'profile' && (
        <div className="p-4 space-y-4">
          {/* Main Instrumentation Metrics */}
          <div className="space-y-2">
            <div className="text-[9.5px] uppercase text-[#5C6268] tracking-wider">
              Node Execution Metrics
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                <div className="text-[9.5px] text-[#5C6268] uppercase">Active Model</div>
                <div className="text-xs font-semibold text-[#F2F3F4] mt-0.5">
                  {selectedNode.currentModel}
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                <div className="text-[9.5px] text-[#5C6268] uppercase">Total Calls</div>
                <div className="text-xs font-semibold text-[#D7DADD] mt-0.5">
                  {selectedNode.calls.toLocaleString()}
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                <div className="text-[9.5px] text-[#5C6268] uppercase">Cost Share</div>
                <div className="text-xs font-semibold text-[#F2F3F4] mt-0.5">
                  {selectedNode.costSharePct.toFixed(1)}%
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                <div className="text-[9.5px] text-[#5C6268] uppercase">Avg Latency</div>
                <div className="text-xs font-semibold text-[#D7DADD] mt-0.5">
                  {selectedNode.latencySec.toFixed(1)}s P95
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                <div className="text-[9.5px] text-[#5C6268] uppercase">Input Tokens</div>
                <div className="text-xs text-[#A0A5AA] mt-0.5">
                  {(selectedNode.inputTokens / 1000).toFixed(1)}k avg
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                <div className="text-[9.5px] text-[#5C6268] uppercase">Output Tokens</div>
                <div className="text-xs text-[#A0A5AA] mt-0.5">
                  {(selectedNode.outputTokens / 1000).toFixed(1)}k avg
                </div>
              </div>
            </div>

            {/* Quality Sensitivity Badge */}
            <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05] flex items-center justify-between text-xs">
              <span className="text-[#5C6268] uppercase text-[9.5px]">Quality Sensitivity</span>
              <span
                className={`font-semibold px-2 py-0.5 rounded border ${
                  selectedNode.qualitySensitivity === 'HIGH'
                    ? 'bg-[#0F1113] text-[#F2F3F4] border-white/[0.12]'
                    : 'bg-[#050505] text-[#A0A5AA] border-white/[0.06]'
                }`}
              >
                {selectedNode.qualitySensitivity}
              </span>
            </div>
          </div>

          {/* Candidate Substitutions Table */}
          <div className="space-y-2 pt-2 border-t border-white/[0.05]">
            <div className="flex items-center justify-between">
              <div className="text-[9.5px] uppercase text-[#5C6268] tracking-wider">
                Candidate Substitutions
              </div>
              <span className="text-[9.5px] text-[#5C6268]">
                {selectedNode.candidates.length} evaluated
              </span>
            </div>

            <div className="space-y-2">
              {selectedNode.candidates.map((cand) => {
                const isCurrent = selectedNode.currentModel === cand.model;
                return (
                  <div
                    key={cand.model}
                    className={`p-3 rounded border transition-all ${
                      isCurrent
                        ? 'bg-[#0F1113] border-[#D7DADD] shadow-[0_0_12px_rgba(215,218,221,0.08)]'
                        : 'bg-[#050505] border-white/[0.05] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-[#F2F3F4]">{cand.model}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-semibold ${
                          cand.status === 'RECOMMENDED'
                            ? 'bg-white/[0.06] text-[#F2F3F4] border border-white/[0.1]'
                            : cand.status === 'REJECTED'
                            ? 'bg-white/[0.02] text-[#5C6268] border border-white/[0.04] line-through'
                            : 'bg-white/[0.03] text-[#A0A5AA]'
                        }`}
                      >
                        {cand.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10.5px] text-[#A0A5AA] my-2">
                      <div>
                        <span className="text-[#5C6268] text-[9px] block">Cost Delta</span>
                        <span className="text-[#D7DADD] font-medium">
                          {cand.costDelta === 0 ? '$0.00 (base)' : `-$${Math.abs(cand.costDelta).toFixed(3)}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C6268] text-[9px] block">Quality Delta</span>
                        <span
                          className={
                            cand.qualityDelta < -2
                              ? 'text-[#5C6268] line-through font-medium'
                              : cand.qualityDelta >= 0
                              ? 'text-[#F2F3F4] font-bold'
                              : 'text-[#A0A5AA]'
                          }
                        >
                          {cand.qualityDelta >= 0 ? `+${cand.qualityDelta}pp` : `${cand.qualityDelta}pp`}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-[#5C6268] leading-relaxed mb-2">
                      {cand.reason}
                    </p>

                    <button
                      onClick={() => onSelectModelOverride(selectedNode.id, cand.model)}
                      disabled={isCurrent}
                      className={`w-full py-1 rounded text-[10px] transition-colors ${
                        isCurrent
                          ? 'bg-white/[0.04] text-[#5C6268] cursor-default'
                          : 'bg-[#0F1113] text-[#D7DADD] hover:text-[#F2F3F4] border border-white/[0.08]'
                      }`}
                    >
                      {isCurrent ? 'Active Model' : `Select ${cand.model}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendation Box */}
          <div className="p-3 rounded bg-[#0F1113] border border-white/[0.06] space-y-1">
            <div className="text-[9px] uppercase text-[#5C6268]">Optimizer Recommendation</div>
            <div className="text-xs font-semibold text-[#F2F3F4]">
              {selectedNode.qualitySensitivity === 'HIGH' ? 'KEEP SOL (FRONTIER REASONING)' : `SUBSTITUTE WITH ${selectedNode.optimizedModel.toUpperCase()}`}
            </div>
            <div className="text-[10.5px] text-[#A0A5AA] leading-relaxed">
              {selectedNode.qualitySensitivity === 'HIGH'
                ? 'High reasoning sensitivity node. Downscaling model produces severe logical regressions in 120-case eval harness.'
                : `Validated across 120 gold cases with zero semantic regression and ${Math.abs(
                    selectedNode.candidates[0]?.costDeltaPct || 65
                  )}% lower execution cost.`}
            </div>
          </div>
        </div>
      )}

      {/* Prompt & IO Tab */}
      {activeTab === 'prompt' && (
        <div className="p-4 space-y-4 text-xs">
          <div className="space-y-1.5">
            <div className="text-[9.5px] text-[#5C6268] uppercase">Node Prompt Template</div>
            <div className="p-3 rounded bg-[#050505] border border-white/[0.05] text-[10.5px] text-[#D7DADD] leading-relaxed whitespace-pre-wrap">
              {selectedNode.promptTemplate}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.05]">
            <div className="text-[9.5px] text-[#5C6268] uppercase">Token Ingestion Distribution</div>
            <div className="space-y-1 text-[10.5px] text-[#A0A5AA]">
              <div className="flex justify-between">
                <span>System instructions:</span>
                <span className="text-[#D7DADD]">420 tok</span>
              </div>
              <div className="flex justify-between">
                <span>Dynamic context / DAG inputs:</span>
                <span className="text-[#D7DADD]">{selectedNode.inputTokens - 420} tok</span>
              </div>
              <div className="flex justify-between">
                <span>Generation budget:</span>
                <span className="text-[#D7DADD]">{selectedNode.outputTokens} tok</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

