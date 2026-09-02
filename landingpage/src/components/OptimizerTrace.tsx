import React, { useState } from 'react';
import { OptimizerEvent, AgentProject } from '../types';
import { 
  Terminal, 
  Search
} from 'lucide-react';

interface OptimizerTraceProps {
  events: OptimizerEvent[];
  project: AgentProject;
}

export const OptimizerTrace: React.FC<OptimizerTraceProps> = ({ events, project }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredEvents = events.filter((evt) => {
    const matchesSearch =
      evt.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (evt.nodeName && evt.nodeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      evt.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'ALL' || evt.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="studio-view flex-1 h-full bg-[#050505] p-4 md:p-6 overflow-y-auto select-none flex flex-col space-y-4 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#090A0B] border border-white/[0.06] rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#D7DADD]" />
            <span className="text-sm font-semibold text-[#F2F3F4] tracking-wide uppercase">
              COMPILER LOG & PROFILER TRACE
            </span>
          </div>
          <p className="text-[11px] text-[#5C6268] mt-0.5">
            Server optimizer events{project.runId ? ` · Run ${project.runId}` : ''} · {project.evalCasesCount.toLocaleString()} eval cases
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-2 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6268]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter trace logs..."
              className="pl-8 pr-3 py-1 bg-[#050505] border border-white/[0.06] rounded text-xs text-[#F2F3F4] placeholder-[#5C6268] focus:outline-none focus:border-white/[0.16]"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2.5 py-1 bg-[#050505] border border-white/[0.06] rounded text-xs text-[#A0A5AA] focus:outline-none focus:border-white/[0.16]"
          >
            <option value="ALL">All Events</option>
            <option value="PASS">PASS Only</option>
            <option value="REJECT">REJECT Only</option>
            <option value="TESTING">TESTING Only</option>
            <option value="FRONTIER">FRONTIER Events</option>
          </select>
        </div>
      </div>

      {/* Latency Waterfall / Flamegraph Strip */}
      <div className="bg-[#090A0B] border border-white/[0.06] rounded-lg p-4 space-y-3">
        <div className="text-[10px] font-semibold uppercase text-[#5C6268] tracking-wider flex items-center justify-between">
          <span>Execution Latency Waterfall (Baseline vs Compiled)</span>
          <span className="text-[#A0A5AA]">{project.baselineLatencyP95.toFixed(1)}s → {project.optimizedLatencyP95.toFixed(1)}s P95</span>
        </div>

        <div className="space-y-2 text-xs">
          {project.nodes.map((node) => {
            const baselineWidth = Math.max(8, (node.baselineLatencySec / 10) * 100);
            const optimizedWidth = Math.max(8, (node.optimizedLatencySec / 10) * 100);

            return (
              <div key={node.id} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[#A0A5AA]">
                  <span className="font-medium text-[#F2F3F4]">{node.name}</span>
                  <span>
                    {node.baselineLatencySec.toFixed(1)}s →{' '}
                    <strong className="text-[#D7DADD]">{node.optimizedLatencySec.toFixed(1)}s</strong>
                  </span>
                </div>

                {/* Comparative Double Bar */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="w-full h-1.5 bg-[#14171A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5C6268]"
                      style={{ width: `${baselineWidth}%` }}
                    />
                  </div>
                  <div className="w-full h-1.5 bg-[#14171A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#D7DADD]"
                      style={{ width: `${optimizedWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compiler Log Terminal */}
      <div className="flex-1 bg-[#090A0B] border border-white/[0.06] rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-white/[0.05] bg-[#0F1113] flex items-center justify-between text-[9.5px] text-[#5C6268]">
          <span>RAW OPTIMIZER LOG STREAM</span>
          <span>{filteredEvents.length} entries matched</span>
        </div>

        <div className="flex-1 p-4 overflow-y-auto text-xs space-y-1.5 selection:bg-white/[0.1]">
          {filteredEvents.map((evt) => {
            let badgeStyle = 'text-[#5C6268] bg-[#050505] border-white/[0.04]';
            if (evt.type === 'PASS') {
              badgeStyle = 'text-[#F2F3F4] bg-[#0F1113] border-white/[0.1] font-medium';
            } else if (evt.type === 'REJECT') {
              badgeStyle = 'text-[#5C6268] bg-[#050505] border-white/[0.04] line-through';
            } else if (evt.type === 'SELECTED') {
              badgeStyle = 'text-[#050505] silver-btn-gradient font-bold';
            }

            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 py-1 px-2 rounded hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-[#5C6268] text-[10.5px] shrink-0 w-20">
                  {evt.timestamp}
                </span>

                <span
                  className={`px-1.5 py-0.2 rounded border text-[9px] uppercase shrink-0 ${badgeStyle}`}
                >
                  {evt.type}
                </span>

                <span className="text-[#D7DADD] text-xs flex-1 break-all">
                  {evt.message}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
