import React, { useState, useEffect } from 'react';
import { ViewMode, AgentProject } from '../types';
import { 
  Search, 
  Play, 
  Activity, 
  GitCompare, 
  Terminal, 
  CheckCircle2, 
  Download, 
  Layers, 
  Share2
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onViewChange: (view: ViewMode) => void;
  onRunOptimization: () => void;
  onSelectProject: (id: string) => void;
  onOpenExport: () => void;
  onOpenIntegrations: () => void;
  allProjects: AgentProject[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onViewChange,
  onRunOptimization,
  onSelectProject,
  onOpenExport,
  onOpenIntegrations,
  allProjects
}) => {
  const [query, setQuery] = useState('');

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'opt',
      title: 'Run Profile-Guided Optimizer (Full Compilation Suite)',
      category: 'Compiler',
      icon: Play,
      shortcut: '⌘R',
      run: () => {
        onRunOptimization();
        onClose();
      }
    },
    {
      id: 'view-graph',
      title: 'Switch to Execution Graph Canvas',
      category: 'Views',
      icon: Layers,
      shortcut: '⌘1',
      run: () => {
        onViewChange('graph');
        onClose();
      }
    },
    {
      id: 'view-frontier',
      title: 'Switch to Pareto Optimization Frontier',
      category: 'Views',
      icon: Activity,
      shortcut: '⌘2',
      run: () => {
        onViewChange('frontier');
        onClose();
      }
    },
    {
      id: 'view-diff',
      title: 'Switch to Model Diff Inspector',
      category: 'Views',
      icon: GitCompare,
      shortcut: '⌘3',
      run: () => {
        onViewChange('diff');
        onClose();
      }
    },
    {
      id: 'view-trace',
      title: 'Switch to Optimizer Trace & Telemetry',
      category: 'Views',
      icon: Terminal,
      shortcut: '⌘4',
      run: () => {
        onViewChange('timeline');
        onClose();
      }
    },
    {
      id: 'view-evals',
      title: 'Inspect 120-Case Evaluation Suite',
      category: 'Views',
      icon: CheckCircle2,
      shortcut: '⌘5',
      run: () => {
        onViewChange('evals');
        onClose();
      }
    },
    {
      id: 'export',
      title: 'Export Compiled twinerun Spec (JSON / YAML / Python)',
      category: 'Artifacts',
      icon: Download,
      shortcut: '⌘E',
      run: () => {
        onOpenExport();
        onClose();
      }
    },
    {
      id: 'integrations',
      title: 'SDK & Telemetry Setup (LangGraph, CrewAI, AutoGen)',
      category: 'System',
      icon: Share2,
      shortcut: '⌘I',
      run: () => {
        onOpenIntegrations();
        onClose();
      }
    }
  ];

  // Also include agent workspace switches
  allProjects.forEach((p) => {
    actions.push({
      id: `proj-${p.id}`,
      title: `Switch Workspace: ${p.name} (${p.version} · ${p.nodes.length} nodes)`,
      category: 'Workspaces',
      icon: Layers,
      shortcut: '',
      run: () => {
        onSelectProject(p.id);
        onClose();
      }
    });
  });

  const filteredActions = actions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#050505]/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4 font-mono">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="w-full max-w-xl bg-[#090A0B] border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden z-10 flex flex-col">
        {/* Search Input */}
        <div className="p-3 border-b border-white/[0.05] flex items-center gap-3 bg-[#0F1113]">
          <Search className="w-4 h-4 text-[#5C6268]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search workspace..."
            className="w-full bg-transparent text-xs text-[#F2F3F4] placeholder-[#5C6268] focus:outline-none"
          />
          <span className="text-[9px] text-[#5C6268] bg-[#050505] px-1.5 py-0.5 rounded border border-white/[0.06]">
            ESC
          </span>
        </div>

        {/* Command list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filteredActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.run}
                className="w-full p-2 rounded text-left flex items-center justify-between text-xs hover:bg-white/[0.04] group transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-3.5 h-3.5 text-[#5C6268] group-hover:text-[#D7DADD]" />
                  <div>
                    <div className="text-[#D7DADD] group-hover:text-[#F2F3F4] font-medium text-xs">
                      {action.title}
                    </div>
                    <div className="text-[9.5px] text-[#5C6268]">
                      {action.category}
                    </div>
                  </div>
                </div>

                {action.shortcut && (
                  <span className="text-[9.5px] text-[#5C6268] group-hover:text-[#A0A5AA] bg-[#050505] px-1.5 py-0.5 rounded border border-white/[0.05]">
                    {action.shortcut}
                  </span>
                )}
              </button>
            );
          })}
          {filteredActions.length === 0 && (
            <div className="p-6 text-center text-xs text-[#5C6268]">
              No commands found matching "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-white/[0.05] bg-[#050505] flex items-center justify-between text-[9.5px] text-[#5C6268] px-3">
          <span>twinerun Command Dispatch</span>
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
        </div>
      </div>
    </div>
  );
};

