import React, { useState } from 'react';
import { AgentProject, ViewMode } from '../types';
import { 
  Play, 
  ChevronDown, 
  Command, 
  RotateCw, 
  Check,
  Download
} from 'lucide-react';

interface TopBarProps {
  project: AgentProject;
  allProjects: AgentProject[];
  onSelectProject: (projectId: string) => void;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onRunOptimization: () => void;
  isOptimizing: boolean;
  onOpenCommandPalette: () => void;
  onOpenExport: () => void;
  optimizationProgressPct: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  allProjects,
  onSelectProject,
  currentView,
  onViewChange,
  onRunOptimization,
  isOptimizing,
  onOpenCommandPalette,
  onOpenExport,
  optimizationProgressPct
}) => {
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);

  return (
    <header className="studio-topbar h-11 bg-[#090A0B] border-b border-white/[0.06] px-4 flex items-center justify-between select-none z-20 shrink-0">
      {/* Left: Project selector & Context */}
      <div className="flex items-center gap-3">
        {/* Agent Switcher Dropdown */}
        <div className="relative">
          <button
            id="topbar-project-dropdown-btn"
            onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#0F1113] border border-white/[0.06] hover:border-white/[0.14] text-xs text-[#F2F3F4] font-mono transition-colors"
          >
            <span className="text-[#5C6268]">twinerun /</span>
            <span className="font-semibold text-[#F2F3F4]">
              {project.name}
            </span>
            <ChevronDown className="w-3 h-3 text-[#5C6268]" />
          </button>

          {isAgentMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsAgentMenuOpen(false)} 
              />
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#0F1113] border border-white/[0.1] rounded shadow-2xl py-1 z-50">
                <div className="px-3 py-1.5 text-[9px] font-mono uppercase text-[#5C6268] tracking-widest border-b border-white/[0.06]">
                  Target Agent Workspaces
                </div>
                {allProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setIsAgentMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs font-mono transition-colors hover:bg-white/[0.04] ${
                      p.id === project.id ? 'text-[#F2F3F4] bg-white/[0.03]' : 'text-[#A0A5AA]'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-[#F2F3F4]">{p.name}</div>
                      <div className="text-[10px] text-[#5C6268]">
                        {p.nodes.length} nodes · ${p.baselineCost.toFixed(3)}/req · {p.version}
                      </div>
                    </div>
                    {p.id === project.id && <Check className="w-3.5 h-3.5 text-[#D7DADD]" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Environment & Version metadata */}
        <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] text-[#5C6268]">
          <span className="px-1.5 py-0.5 rounded bg-[#0F1113] border border-white/[0.04] text-[#A0A5AA]">
            {project.environment}
          </span>
          <span>/</span>
          <span className="text-[#A0A5AA]">{project.version}</span>
          <span>/</span>
          <span className="text-[#5C6268]">{project.runId}</span>
        </div>
      </div>

      {/* Center: View Switcher */}
      <div className="studio-view-tabs hidden md:flex items-center bg-[#050505] p-0.5 rounded border border-white/[0.06]">
        <button
          id="viewtab-graph"
          onClick={() => onViewChange('graph')}
          className={`px-3 py-1 text-xs font-mono rounded transition-all ${
            currentView === 'graph'
              ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08] shadow-sm'
              : 'text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          Execution Graph
        </button>
        <button
          id="viewtab-frontier"
          onClick={() => onViewChange('frontier')}
          className={`px-3 py-1 text-xs font-mono rounded transition-all flex items-center gap-1.5 ${
            currentView === 'frontier'
              ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08] shadow-sm'
              : 'text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          <span>Pareto Frontier</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#A0A5AA]" />
        </button>
        <button
          id="viewtab-diff"
          onClick={() => onViewChange('diff')}
          className={`px-3 py-1 text-xs font-mono rounded transition-all flex items-center gap-1.5 ${
            currentView === 'diff'
              ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08] shadow-sm'
              : 'text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          <span>Before / After</span>
          <span className="text-[10px] text-[#A0A5AA] font-bold">-{project.savingsPct}%</span>
        </button>
        <button
          id="viewtab-timeline"
          onClick={() => onViewChange('timeline')}
          className={`px-3 py-1 text-xs font-mono rounded transition-all ${
            currentView === 'timeline'
              ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08] shadow-sm'
              : 'text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          Optimizer Trace
        </button>
        <button
          id="viewtab-evals"
          onClick={() => onViewChange('evals')}
          className={`px-3 py-1 text-xs font-mono rounded transition-all ${
            currentView === 'evals'
              ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08] shadow-sm'
              : 'text-[#5C6268] hover:text-[#D7DADD]'
          }`}
        >
          Evals ({project.evalCasesCount})
        </button>
      </div>

      {/* Right: Command palette & Metallic OPTIMIZE Action */}
      <div className="flex items-center gap-2">
        {/* Command Palette Button */}
        <button
          id="topbar-cmd-btn"
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-[#0F1113] border border-white/[0.06] hover:border-white/[0.12] text-[#5C6268] hover:text-[#D7DADD] text-xs font-mono transition-colors"
          title="Command Palette"
        >
          <Command className="w-3 h-3" />
          <span>⌘K</span>
        </button>

        {/* Export Spec CTA */}
        <button
          id="topbar-export-btn"
          onClick={onOpenExport}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0F1113] border border-white/[0.06] hover:border-white/[0.12] text-[#A0A5AA] hover:text-[#F2F3F4] text-xs font-mono transition-colors"
        >
          <Download className="w-3 h-3 text-[#5C6268]" />
          <span>Export Spec</span>
        </button>

        {/* Signature Metallic Silver OPTIMIZE Button */}
        <button
          id="topbar-optimize-btn"
          onClick={onRunOptimization}
          disabled={isOptimizing}
          className={`relative overflow-hidden px-3.5 py-1 rounded text-xs font-mono font-bold tracking-wider transition-all flex items-center gap-1.5 select-none active:scale-[0.98] ${
            isOptimizing
              ? 'bg-[#0F1113] text-[#A0A5AA] border border-white/[0.12] cursor-wait'
              : 'silver-btn-gradient border border-white/20 hover:brightness-105'
          }`}
        >
          {isOptimizing ? (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin text-[#D7DADD]" />
              <span>COMPILING ({optimizationProgressPct}%)</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current text-[#050505]" />
              <span className="text-[#050505]">OPTIMIZE</span>
            </>
          )}

          {/* Linear Progress Bar overlay while optimizing */}
          {isOptimizing && (
            <div 
              className="absolute bottom-0 left-0 h-[2px] bg-[#F2F3F4] transition-all duration-300"
              style={{ width: `${optimizationProgressPct}%` }}
            />
          )}
        </button>
      </div>
    </header>
  );
};

