import React from 'react';
import { ViewMode } from '../types';
import { 
  Network, 
  Activity, 
  GitCompare, 
  CheckCircle2, 
  Settings, 
  Terminal, 
  Share2, 
  Cpu
} from 'lucide-react';

interface NavigationRailProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onOpenIntegrations: () => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  isOptimizing: boolean;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  currentView,
  onViewChange,
  onOpenIntegrations,
  onOpenSettings,
  onOpenCommandPalette,
  isOptimizing
}) => {
  const navItems = [
    {
      id: 'graph' as ViewMode,
      label: 'Agent Graph',
      shortLabel: 'Graph',
      icon: Network,
      shortcut: '1'
    },
    {
      id: 'frontier' as ViewMode,
      label: 'Pareto Frontier',
      shortLabel: 'Frontier',
      icon: Activity,
      shortcut: '2'
    },
    {
      id: 'diff' as ViewMode,
      label: 'Before / After Diff',
      shortLabel: 'Diff',
      icon: GitCompare,
      shortcut: '3'
    },
    {
      id: 'timeline' as ViewMode,
      label: 'Optimizer Trace',
      shortLabel: 'Trace',
      icon: Terminal,
      shortcut: '4'
    },
    {
      id: 'evals' as ViewMode,
      label: 'Eval Suite (120)',
      shortLabel: 'Evals',
      icon: CheckCircle2,
      shortcut: '5'
    }
  ];

  return (
    <aside className="w-13 shrink-0 bg-[#090A0B] border-r border-white/[0.06] flex flex-col items-center justify-between py-3 z-30 select-none">
      {/* Top Logo */}
      <div className="flex flex-col items-center gap-3">
        <button
          id="nav-logo-btn"
          onClick={() => onViewChange('graph')}
          className="relative group p-1.5 rounded hover:bg-white/[0.04] transition-colors focus:outline-none"
          title="twinerun — Profile-Guided Optimizer"
        >
          <div className="w-8 h-8 rounded bg-[#0F1113] border border-white/[0.08] flex items-center justify-center text-[#F2F3F4] group-hover:border-white/[0.2] transition-all">
            <span className="font-mono font-bold text-sm text-[#F2F3F4]">◈</span>
          </div>
          {isOptimizing && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#F2F3F4] animate-ping" />
          )}
        </button>

        <div className="w-5 h-[1px] bg-white/[0.06]" />

        {/* Primary View Navigation */}
        <nav className="flex flex-col items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}-btn`}
                onClick={() => onViewChange(item.id)}
                className={`relative group w-10 py-2 rounded transition-all flex flex-col items-center justify-center focus:outline-none ${
                  isActive
                    ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.1]'
                    : 'text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.03]'
                }`}
                title={`${item.label} (⌘${item.shortcut})`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#F2F3F4]' : 'text-current'}`} />
                <span className="text-[8.5px] font-mono tracking-tight mt-1 opacity-90">
                  {item.shortLabel}
                </span>

                {/* Active Indicator pip */}
                {isActive && (
                  <span className="absolute -left-[1px] top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#F2F3F4] rounded-r" />
                )}

                {/* Tooltip on hover */}
                <div className="absolute left-14 px-2 py-1 bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] text-xs font-mono rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                  <span className="ml-2 text-[#5C6268]">⌘{item.shortcut}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Utility Navigation */}
      <div className="flex flex-col items-center gap-1.5">
        <button
          id="nav-cmd-btn"
          onClick={onOpenCommandPalette}
          className="group relative p-2 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.03] transition-colors focus:outline-none"
          title="Command Palette (⌘K)"
        >
          <Cpu className="w-4 h-4" />
          <div className="absolute left-14 px-2 py-1 bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] text-xs font-mono rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            Command Palette <span className="text-[#5C6268]">⌘K</span>
          </div>
        </button>

        <button
          id="nav-integrations-btn"
          onClick={onOpenIntegrations}
          className="group relative p-2 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.03] transition-colors focus:outline-none"
          title="SDK Integrations & Telemetry"
        >
          <Share2 className="w-4 h-4" />
          <div className="absolute left-14 px-2 py-1 bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] text-xs font-mono rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            SDK & Telemetry
          </div>
        </button>

        <button
          id="nav-settings-btn"
          onClick={onOpenSettings}
          className="group relative p-2 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.03] transition-colors focus:outline-none"
          title="PGO Compiler Settings"
        >
          <Settings className="w-4 h-4" />
          <div className="absolute left-14 px-2 py-1 bg-[#0F1113] border border-white/[0.1] text-[#D7DADD] text-xs font-mono rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            Compiler Flags & Bounds
          </div>
        </button>
      </div>
    </aside>
  );
};

