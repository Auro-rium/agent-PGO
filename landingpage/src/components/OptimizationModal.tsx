import React, { useEffect, useRef } from 'react';
import { OptimizerEvent, AgentProject } from '../types';
import { 
  Sparkles, 
  RotateCw, 
  XCircle, 
  Terminal, 
  GitCompare,
  Activity,
  Check
} from 'lucide-react';

interface OptimizationModalProps {
  isOpen: boolean;
  isOptimizing: boolean;
  events: OptimizerEvent[];
  currentStepIndex: number;
  totalSteps: number;
  project: AgentProject;
  onClose: () => void;
  onApplyAndCompare: () => void;
  onOpenFrontier: () => void;
}

export const OptimizationModal: React.FC<OptimizationModalProps> = ({
  isOpen,
  isOptimizing,
  events,
  currentStepIndex,
  totalSteps,
  project,
  onClose,
  onApplyAndCompare,
  onOpenFrontier
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const latencyDeltaSec = project.baselineLatencyP95 - project.optimizedLatencyP95;
  const qualityDeltaPp = project.optimizedQuality - project.baselineQuality;

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  if (!isOpen) return null;

  const isComplete = !isOptimizing && currentStepIndex >= totalSteps;
  const progressPct = Math.min(100, Math.round((currentStepIndex / Math.max(1, totalSteps)) * 100));

  return (
    <div className="fixed inset-0 z-50 bg-[#050505]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#090A0B] border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-mono text-xs">
        {/* Header */}
        <div className="p-3.5 border-b border-white/[0.05] flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-[#050505] border border-white/[0.08] flex items-center justify-center">
              {isOptimizing ? (
                <RotateCw className="w-3.5 h-3.5 text-[#D7DADD] animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#F2F3F4]" />
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-[#F2F3F4] flex items-center gap-2">
                <span>twinerun COMPILER ENGINE</span>
                <span className="px-1.5 py-0.5 rounded bg-[#050505] border border-white/[0.08] text-[10px] text-[#A0A5AA]">
                  {project.name}
                </span>
              </div>
              <div className="text-[10px] text-[#5C6268]">
                {isOptimizing
                  ? `Compiling DAG node configurations · Step ${currentStepIndex} of ${totalSteps}`
                  : 'Optimization run complete'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs hidden sm:block">
              <span className="text-[#5C6268] text-[10px] uppercase block">Progress</span>
              <span className="text-[#D7DADD] font-bold">{progressPct}%</span>
            </div>
            {!isOptimizing && (
              <button
                onClick={onClose}
                className="px-2.5 py-1 rounded bg-[#050505] border border-white/[0.08] hover:border-white/[0.16] text-xs text-[#A0A5AA] transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-0.5 bg-[#050505] overflow-hidden">
          <div
            className="h-full bg-[#D7DADD] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Modal Main Content: Split Terminal + Live Candidate Delta */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.05] overflow-hidden">
          {/* Left 2 Cols: Real-time Optimizer Event Stream */}
          <div className="md:col-span-2 flex flex-col h-80 md:h-96 bg-[#050505]">
            <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between text-[10px] text-[#5C6268] bg-[#090A0B]">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-[#A0A5AA]" />
                <span className="uppercase tracking-wider">Optimizer Event Stream</span>
              </div>
              <span>{project.evalCasesCount.toLocaleString()} eval vectors / test batch</span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto text-xs space-y-1.5 selection:bg-white/[0.1]">
              {events.map((evt) => {
                let badgeStyle = 'text-[#5C6268] bg-[#090A0B] border-white/[0.05]';
                let icon = null;

                if (evt.type === 'PASS') {
                  badgeStyle = 'text-[#F2F3F4] bg-[#0F1113] border-white/[0.16] font-semibold';
                  icon = <Check className="w-3 h-3 text-[#D7DADD] shrink-0" />;
                } else if (evt.type === 'REJECT') {
                  badgeStyle = 'text-[#5C6268] bg-[#050505] border-white/[0.05] line-through';
                  icon = <XCircle className="w-3 h-3 text-[#5C6268] shrink-0" />;
                } else if (evt.type === 'SELECTED') {
                  badgeStyle = 'text-[#050505] silver-btn-gradient font-bold';
                }

                return (
                  <div
                    key={evt.id}
                    className="flex items-start gap-2.5 py-0.5 leading-relaxed hover:bg-white/[0.02] rounded px-1.5 transition-colors"
                  >
                    <span className="text-[#5C6268] text-[11px] shrink-0 w-16">
                      {evt.timestamp}
                    </span>

                    <span
                      className={`px-1.5 py-0.2 rounded border text-[10px] uppercase shrink-0 flex items-center gap-1 ${badgeStyle}`}
                    >
                      {icon}
                      <span>{evt.type}</span>
                    </span>

                    <span className="text-[#D7DADD] text-xs flex-1 break-all">
                      {evt.message}
                    </span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Right Col: Before vs After Compilation Summary */}
          <div className="p-4 flex flex-col justify-between bg-[#090A0B]">
            <div className="space-y-3.5">
              <div className="text-[10px] uppercase text-[#5C6268] tracking-wider">
                COMPILATION TARGETS
              </div>

              {/* Before vs After Table */}
              <div className="space-y-2">
                <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                  <div className="text-[10px] text-[#5C6268] uppercase">Cost per Execution</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xs text-[#5C6268] line-through">${project.baselineCost.toFixed(3)}</span>
                    <span className="text-sm font-bold text-[#F2F3F4]">${project.optimizedCost.toFixed(3)}</span>
                  </div>
                  <div className="text-[10px] text-[#D7DADD] font-medium mt-1">
                    {project.savingsPct.toFixed(1)}% Lower Execution Cost
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                  <div className="text-[10px] text-[#5C6268] uppercase">P95 Latency</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xs text-[#5C6268] line-through">{project.baselineLatencyP95.toFixed(1)}s</span>
                    <span className="text-sm font-bold text-[#D7DADD]">{project.optimizedLatencyP95.toFixed(1)}s</span>
                  </div>
                  <div className="text-[10px] text-[#A0A5AA] mt-1">
                    {latencyDeltaSec >= 0 ? '-' : '+'}{Math.abs(latencyDeltaSec).toFixed(1)}s Latency Delta
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
                  <div className="text-[10px] text-[#5C6268] uppercase">Eval Quality Score</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xs text-[#5C6268]">{project.baselineQuality.toFixed(1)}%</span>
                    <span className="text-sm font-bold text-[#F2F3F4]">{project.optimizedQuality.toFixed(1)}%</span>
                  </div>
                  <div className="text-[10px] text-[#D7DADD] mt-1">
                    {qualityDeltaPp >= 0 ? '+' : ''}{qualityDeltaPp.toFixed(1)}pp Measured Quality Delta
                  </div>
                </div>
              </div>

              {/* Monthly Estimated Impact */}
              <div className="p-3 rounded bg-[#0F1113] border border-white/[0.08] space-y-1">
                <span className="text-[10px] text-[#5C6268] uppercase block">Monthly Financial Delta</span>
                <span className="text-sm font-bold text-[#F2F3F4] block">
                  +${project.monthlySavingsEstimate.toLocaleString()} / mo
                </span>
                <span className="text-[10px] text-[#A0A5AA]">
                  at {project.monthlyRequests.toLocaleString()} monthly executions
                </span>
              </div>
            </div>

            {/* Bottom Actions */}
            {isComplete && (
              <div className="space-y-2 pt-3 border-t border-white/[0.05]">
                <button
                  onClick={onApplyAndCompare}
                  className="w-full py-2 rounded text-xs font-bold silver-btn-gradient text-[#050505] flex items-center justify-center gap-1.5 shadow-sm transition-all"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Inspect Before / After Diff</span>
                </button>

                <button
                  onClick={onOpenFrontier}
                  className="w-full py-1.5 rounded text-xs text-[#D7DADD] bg-[#050505] border border-white/[0.08] hover:border-white/[0.16] flex items-center justify-center gap-1.5 transition-all"
                >
                  <Activity className="w-3.5 h-3.5 text-[#A0A5AA]" />
                  <span>View Pareto Frontier</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
