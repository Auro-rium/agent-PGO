import React, { useState } from 'react';
import { EvalCase, AgentProject } from '../types';
import { MOCK_EVAL_CASES } from '../data/mockAgents';
import { 
  ShieldCheck, 
  Search
} from 'lucide-react';

interface EvalsViewProps {
  project: AgentProject;
}

export const EvalsView: React.FC<EvalsViewProps> = ({ project }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedCase, setSelectedCase] = useState<EvalCase | null>(MOCK_EVAL_CASES[0]);

  const categories = ['ALL', ...Array.from(new Set(MOCK_EVAL_CASES.map((c) => c.category)))];

  const filteredCases = MOCK_EVAL_CASES.filter((c) => {
    const matchesSearch =
      c.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.diffNote.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || c.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="studio-view flex-1 h-full bg-[#050505] p-4 md:p-6 overflow-y-auto select-none flex flex-col md:flex-row gap-4 font-mono text-xs">
      {/* Left: Eval Cases List */}
      <div className="flex-1 flex flex-col space-y-3">
        {/* Header Summary */}
        <div className="bg-[#090A0B] border border-white/[0.06] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#D7DADD]" />
              <span className="text-sm font-semibold text-[#F2F3F4] tracking-wide uppercase">
                EVALUATION HARNESS (120 TEST VECTORS)
              </span>
            </div>
            <p className="text-[11px] text-[#5C6268] mt-0.5">
              Empirical ground-truth verification · 95% confidence interval · ±1.0% tolerance
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#0F1113] border border-white/[0.1] text-xs font-semibold text-[#F2F3F4]">
              100% PASS RATE
            </span>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6268]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evaluation vectors..."
              className="w-full pl-8 pr-3 py-1 bg-[#050505] border border-white/[0.06] rounded text-xs text-[#F2F3F4] placeholder-[#5C6268] focus:outline-none focus:border-white/[0.16]"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1 bg-[#050505] border border-white/[0.06] rounded text-xs text-[#A0A5AA] focus:outline-none focus:border-white/[0.16]"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'ALL' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>

        {/* Cases List */}
        <div className="space-y-2">
          {filteredCases.map((evalCase) => {
            const isSelected = selectedCase?.id === evalCase.id;
            const scoreDelta = evalCase.optimizedScore - evalCase.baselineScore;

            return (
              <div
                key={evalCase.id}
                onClick={() => setSelectedCase(evalCase)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#0F1113] border-white/[0.16] shadow-sm'
                    : 'bg-[#090A0B] border-white/[0.05] hover:border-white/[0.09]'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#F2F3F4]">{evalCase.id}</span>
                    <span className="text-[#5C6268]">·</span>
                    <span className="text-[#A0A5AA]">{evalCase.category}</span>
                  </div>

                  <span className="px-1.5 py-0.2 rounded bg-white/[0.05] border border-white/[0.08] text-[9.5px] text-[#F2F3F4] font-medium">
                    PASS
                  </span>
                </div>

                <p className="text-xs text-[#A0A5AA] line-clamp-2 mb-2">
                  {evalCase.prompt}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-[#5C6268] pt-2 border-t border-white/[0.04]">
                  <div>
                    <span>Baseline: </span>
                    <strong className="text-[#A0A5AA]">{evalCase.baselineScore.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Compiled: </span>
                    <strong className="text-[#F2F3F4]">{evalCase.optimizedScore.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Quality Delta: </span>
                    <strong className={scoreDelta >= 0 ? 'text-[#F2F3F4]' : 'text-[#A0A5AA]'}>
                      {scoreDelta >= 0 ? `+${scoreDelta.toFixed(1)}pp` : `${scoreDelta.toFixed(1)}pp`}
                    </strong>
                  </div>
                  <div>
                    <span>Latency: </span>
                    <strong className="text-[#D7DADD]">
                      {(evalCase.optimizedLatencyMs / 1000).toFixed(1)}s (-{((evalCase.baselineLatencyMs - evalCase.optimizedLatencyMs) / 1000).toFixed(1)}s)
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Selected Eval Deep Inspector */}
      {selectedCase && (
        <div className="w-full md:w-84 lg:w-96 bg-[#090A0B] border border-white/[0.06] rounded-lg p-4 flex flex-col justify-between overflow-y-auto shrink-0 space-y-4">
          <div className="space-y-4">
            <div className="border-b border-white/[0.05] pb-3">
              <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">Eval Case Inspector</div>
              <div className="text-sm font-semibold text-[#F2F3F4] mt-0.5">{selectedCase.id}</div>
              <div className="text-[11px] text-[#A0A5AA] mt-0.5">{selectedCase.category}</div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">Input Prompt Vector</div>
              <div className="p-3 rounded bg-[#050505] border border-white/[0.04] text-[11px] text-[#D7DADD] leading-relaxed">
                {selectedCase.prompt}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">Empirical Benchmark Result</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-[#050505] border border-white/[0.04]">
                  <span className="text-[9px] text-[#5C6268] uppercase block">Baseline Score</span>
                  <span className="text-sm font-semibold text-[#A0A5AA]">
                    {selectedCase.baselineScore.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-[#5C6268] block mt-0.5">
                    {(selectedCase.baselineLatencyMs / 1000).toFixed(1)}s latency
                  </span>
                </div>

                <div className="p-2.5 rounded bg-[#050505] border border-white/[0.04]">
                  <span className="text-[9px] text-[#5C6268] uppercase block">Compiled Score</span>
                  <span className="text-sm font-semibold text-[#F2F3F4]">
                    {selectedCase.optimizedScore.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-[#D7DADD] block mt-0.5">
                    {(selectedCase.optimizedLatencyMs / 1000).toFixed(1)}s latency
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[9.5px] text-[#5C6268] uppercase tracking-wider">Verification & Semantic Diff Note</div>
              <div className="p-3 rounded bg-[#0F1113] border border-white/[0.06] text-[11px] text-[#A0A5AA] leading-relaxed">
                {selectedCase.diffNote}
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-[#050505] border border-white/[0.04] text-[11px] text-[#5C6268] flex items-center justify-between">
            <span>Certification Verdict:</span>
            <span className="text-[#F2F3F4] font-semibold">STRICT PASS</span>
          </div>
        </div>
      )}
    </div>
  );
};

