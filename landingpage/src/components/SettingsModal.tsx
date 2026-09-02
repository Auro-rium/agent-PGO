import React, { useEffect, useState } from 'react';
import { AgentProject } from '../types';
import { 
  X, 
  Settings, 
  Check
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: AgentProject;
  onUpdateProjectSettings: (newSettings: Partial<AgentProject>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProjectSettings
}) => {
  const [tolerance, setTolerance] = useState(project.qualityTolerancePct);
  const [evalCases, setEvalCases] = useState(project.evalCasesCount);
  const [confidence, setConfidence] = useState(project.confidencePct);

  useEffect(() => {
    setTolerance(project.qualityTolerancePct);
    setEvalCases(project.evalCasesCount);
    setConfidence(project.confidencePct);
  }, [project.id, project.qualityTolerancePct, project.evalCasesCount, project.confidencePct]);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateProjectSettings({
      qualityTolerancePct: tolerance,
      evalCasesCount: evalCases,
      confidencePct: confidence
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="w-full max-w-lg bg-[#090A0B] border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden z-10 font-mono text-xs flex flex-col">
        <div className="p-3.5 border-b border-white/[0.05] flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#D7DADD]" />
            <span className="font-semibold text-xs text-[#F2F3F4] tracking-wide uppercase">
              COMPILER FLAGS & OPTIMIZATION BOUNDS
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#5C6268] hover:text-[#D7DADD] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 bg-[#090A0B]">
          {/* Quality Tolerance Slider */}
          <div className="p-3.5 rounded bg-[#050505] border border-white/[0.05] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#F2F3F4] font-medium">
                Quality Tolerance Bound (ε)
              </span>
              <span className="px-2 py-0.5 rounded bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] font-semibold">
                ±{tolerance.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={tolerance}
              onChange={(e) => setTolerance(parseFloat(e.target.value))}
              className="w-full accent-[#D7DADD] bg-[#14171A] h-1 rounded cursor-pointer"
            />
            <p className="text-[10px] text-[#5C6268] leading-relaxed">
              Maximum allowable quality degradation across gold evaluation vectors before a candidate substitution is REJECTED.
            </p>
          </div>

          {/* Eval Vector Dataset Size */}
          <div className="p-3.5 rounded bg-[#050505] border border-white/[0.05] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#F2F3F4] font-medium">
                Evaluation Test Batch Size
              </span>
              <span className="px-2 py-0.5 rounded bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] font-semibold">
                {evalCases} Vectors
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="500"
              step="20"
              value={evalCases}
              onChange={(e) => setEvalCases(parseInt(e.target.value))}
              className="w-full accent-[#D7DADD] bg-[#14171A] h-1 rounded cursor-pointer"
            />
            <p className="text-[10px] text-[#5C6268] leading-relaxed">
              Number of multi-turn gold test vectors evaluated per candidate DAG configuration during search passes.
            </p>
          </div>

          {/* Statistical Confidence */}
          <div className="p-3.5 rounded bg-[#050505] border border-white/[0.05] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#F2F3F4] font-medium">
                Statistical Confidence Interval
              </span>
              <span className="px-2 py-0.5 rounded bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] font-semibold">
                {confidence}%
              </span>
            </div>
            <div className="flex gap-2">
              {[90, 95, 99].map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(c)}
                  className={`flex-1 py-1 rounded border text-xs transition-colors ${
                    confidence === c
                      ? 'bg-[#0F1113] border-white/[0.16] text-[#F2F3F4] font-medium'
                      : 'bg-[#050505] border-white/[0.05] text-[#5C6268]'
                  }`}
                >
                  {c}% Confidence
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-white/[0.05] bg-[#050505] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[#A0A5AA] hover:text-[#F2F3F4] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3.5 py-1.5 rounded silver-btn-gradient text-[#050505] font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Compiler Flags</span>
          </button>
        </div>
      </div>
    </div>
  );
};
