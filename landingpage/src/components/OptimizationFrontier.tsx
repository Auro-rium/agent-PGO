import React, { useState } from 'react';
import { useResizableWidth } from '../hooks/useResizableWidth';
import { PanelResizeHandle } from './PanelResizeHandle';
import { OptimizationCandidate, AgentProject } from '../types';
import { 
  Check
} from 'lucide-react';

interface OptimizationFrontierProps {
  candidates: OptimizationCandidate[];
  selectedCandidateId: string;
  onSelectCandidate: (candidateId: string) => void;
  onApplyCandidateToGraph: (candidate: OptimizationCandidate) => void;
  project: AgentProject;
}

export const OptimizationFrontier: React.FC<OptimizationFrontierProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onApplyCandidateToGraph,
  project
}) => {
  const { width, startResize } = useResizableWidth(352, 280, 520, true);
  const [hoveredCandidate, setHoveredCandidate] = useState<OptimizationCandidate | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'pareto'>('pareto');

  const selectedCandidate =
    candidates.find((c) => c.id === selectedCandidateId) || candidates[0];
  const activeInspection = hoveredCandidate || selectedCandidate;

  // Chart dimensions & scaling
  const minCost = 0.05;
  const maxCost = 0.42;
  const minQuality = 70;
  const maxQuality = 96;

  const svgWidth = 720;
  const svgHeight = 400;
  const padding = { top: 40, right: 40, bottom: 50, left: 60 };

  const innerWidth = svgWidth - padding.left - padding.right;
  const innerHeight = svgHeight - padding.top - padding.bottom;

  const scaleX = (cost: number) => {
    return padding.left + ((cost - minCost) / (maxCost - minCost)) * innerWidth;
  };

  const scaleY = (quality: number) => {
    return padding.top + innerHeight - ((quality - minQuality) / (maxQuality - minQuality)) * innerHeight;
  };

  // Extract Pareto-optimal points sorted by cost to draw the frontier curve
  const paretoPoints = candidates
    .filter((c) => c.isParetoOptimal)
    .sort((a, b) => a.costPerReq - b.costPerReq);

  // Generate SVG path for the Pareto frontier curve
  const paretoPathD = paretoPoints.reduce((acc, pt, idx) => {
    const x = scaleX(pt.costPerReq);
    const y = scaleY(pt.qualityPct);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  return (
    <div className="studio-view studio-frontier flex-1 h-full bg-[#050505] flex flex-col md:flex-row overflow-hidden select-none font-mono text-xs">
      {/* Left Canvas: Pareto Scatter Plot */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
        {/* Header HUD */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#F2F3F4] tracking-wide uppercase">
                OPTIMIZATION FRONTIER
              </span>
              <span className="px-2 py-0.5 rounded bg-[#090A0B] border border-white/[0.06] text-[10px] text-[#A0A5AA]">
                {candidates.length} Configurations Profiled
              </span>
            </div>
            <p className="text-[11px] text-[#5C6268] mt-0.5">
              Empirical Quality vs. Execution Cost trade-off boundary
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center bg-[#090A0B] p-0.5 rounded border border-white/[0.06] text-xs">
            <button
              onClick={() => setFilterMode('pareto')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === 'pareto'
                  ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08]'
                  : 'text-[#5C6268] hover:text-[#D7DADD]'
              }`}
            >
              Pareto Frontier
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === 'all'
                  ? 'bg-[#0F1113] text-[#F2F3F4] border border-white/[0.08]'
                  : 'text-[#5C6268] hover:text-[#D7DADD]'
              }`}
            >
              All Vectors ({candidates.length})
            </button>
          </div>
        </div>

        {/* The Scatter Plot Container */}
        <div className="relative flex-1 min-h-[380px] bg-[#090A0B] border border-white/[0.06] rounded-lg p-3 flex items-center justify-center overflow-hidden">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-full max-h-[500px]"
          >
            <defs>
              {/* Silver Gradient for Pareto Line */}
              <linearGradient id="frontier-silver-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#5C6268" />
                <stop offset="50%" stopColor="#D7DADD" />
                <stop offset="100%" stopColor="#F2F3F4" />
              </linearGradient>

              {/* Shaded Area below frontier */}
              <linearGradient id="frontier-area-fill" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(215, 218, 221, 0.05)" />
                <stop offset="100%" stopColor="rgba(215, 218, 221, 0)" />
              </linearGradient>
            </defs>

            {/* Grid Lines: Horizontal Quality */}
            {[75, 80, 85, 90, 95].map((q) => {
              const y = scaleY(q);
              return (
                <g key={`q-${q}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={svgWidth - padding.right}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.04)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    fill="#5C6268"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {q}%
                  </text>
                </g>
              );
            })}

            {/* Grid Lines: Vertical Cost */}
            {[0.1, 0.2, 0.3, 0.4].map((c) => {
              const x = scaleX(c);
              return (
                <g key={`c-${c}`}>
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={svgHeight - padding.bottom}
                    stroke="rgba(255, 255, 255, 0.04)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={x}
                    y={svgHeight - padding.bottom + 18}
                    fill="#5C6268"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    ${c.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={padding.left}
              y={padding.top - 15}
              fill="#A0A5AA"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              QUALITY METRIC (%) →
            </text>
            <text
              x={svgWidth - padding.right}
              y={svgHeight - padding.bottom + 35}
              fill="#A0A5AA"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="end"
            >
              COST / EXECUTION →
            </text>

            {/* Baseline Quality Tolerance Band */}
            <rect
              x={padding.left}
              y={scaleY(93.4)}
              width={innerWidth}
              height={scaleY(91.4) - scaleY(93.4)}
              fill="rgba(255, 255, 255, 0.02)"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeDasharray="2 2"
            />
            <text
              x={svgWidth - padding.right - 10}
              y={scaleY(93.4) + 12}
              fill="#5C6268"
              fontSize="9"
              fontFamily="monospace"
              textAnchor="end"
            >
              ±1.0% Quality Tolerance Envelope
            </text>

            {/* Pareto Frontier Curve Line */}
            <path
              d={paretoPathD}
              fill="none"
              stroke="url(#frontier-silver-gradient)"
              strokeWidth="2"
            />

            {/* Shaded convex hull under pareto curve */}
            {paretoPoints.length > 0 && (
              <path
                d={`${paretoPathD} L ${scaleX(paretoPoints[paretoPoints.length - 1].costPerReq)} ${
                  svgHeight - padding.bottom
                } L ${scaleX(paretoPoints[0].costPerReq)} ${svgHeight - padding.bottom} Z`}
                fill="url(#frontier-area-fill)"
              />
            )}

            {/* Scatter Dots */}
            {candidates
              .filter((c) => (filterMode === 'pareto' ? c.isParetoOptimal : true))
              .map((c) => {
                const cx = scaleX(c.costPerReq);
                const cy = scaleY(c.qualityPct);
                const isSelected = selectedCandidateId === c.id;
                const isHovered = hoveredCandidate?.id === c.id;

                let r = 4;
                let stroke = 'rgba(255, 255, 255, 0.1)';
                let fill = '#14171A';

                if (c.isBalanced) {
                  r = 6.5;
                  fill = '#F2F3F4';
                  stroke = '#D7DADD';
                } else if (c.isCheapest) {
                  r = 5.5;
                  fill = '#A0A5AA';
                  stroke = '#D7DADD';
                } else if (c.isHighestQuality) {
                  r = 5.5;
                  fill = '#D7DADD';
                  stroke = '#F2F3F4';
                } else if (c.isBaseline) {
                  r = 5.5;
                  fill = '#24282C';
                  stroke = '#5C6268';
                } else if (c.isParetoOptimal) {
                  r = 4.5;
                  fill = '#D7DADD';
                  stroke = 'rgba(255, 255, 255, 0.12)';
                }

                if (isSelected || isHovered) {
                  r += 3;
                }

                return (
                  <g
                    key={c.id}
                    className="cursor-pointer transition-all"
                    onClick={() => onSelectCandidate(c.id)}
                    onMouseEnter={() => setHoveredCandidate(c)}
                    onMouseLeave={() => setHoveredCandidate(null)}
                  >
                    {/* Active Halo ring */}
                    {(isSelected || isHovered) && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 4}
                        fill="none"
                        stroke="#D7DADD"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Candidate Node Circle */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isSelected || isHovered ? '2' : '1'}
                    />

                    {/* Named Labels for Signature Anchor Candidates */}
                    {c.isBalanced && (
                      <g>
                        <rect
                          x={cx - 52}
                          y={cy - 24}
                          width="104"
                          height="17"
                          rx="3"
                          fill="#0F1113"
                          stroke="#D7DADD"
                          strokeWidth="1"
                        />
                        <text
                          x={cx}
                          y={cy - 12}
                          fill="#F2F3F4"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          ★ OPTIMAL (#42)
                        </text>
                      </g>
                    )}

                    {c.isCheapest && (
                      <g>
                        <rect
                          x={cx - 36}
                          y={cy + 11}
                          width="72"
                          height="15"
                          rx="2"
                          fill="#0F1113"
                          stroke="rgba(255, 255, 255, 0.1)"
                          strokeWidth="1"
                        />
                        <text
                          x={cx}
                          y={cy + 22}
                          fill="#A0A5AA"
                          fontSize="8"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          ❖ CHEAPEST
                        </text>
                      </g>
                    )}

                    {c.isHighestQuality && (
                      <g>
                        <rect
                          x={cx - 48}
                          y={cy - 22}
                          width="96"
                          height="15"
                          rx="2"
                          fill="#0F1113"
                          stroke="rgba(255, 255, 255, 0.1)"
                          strokeWidth="1"
                        />
                        <text
                          x={cx}
                          y={cy - 11}
                          fill="#D7DADD"
                          fontSize="8"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          ◈ MAX QUALITY
                        </text>
                      </g>
                    )}

                    {c.isBaseline && (
                      <g>
                        <rect
                          x={cx - 38}
                          y={cy + 11}
                          width="76"
                          height="15"
                          rx="2"
                          fill="#0F1113"
                          stroke="rgba(255, 255, 255, 0.08)"
                          strokeWidth="1"
                        />
                        <text
                          x={cx}
                          y={cy + 22}
                          fill="#5C6268"
                          fontSize="8"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          ✖ BASELINE
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-3 text-xs text-[#5C6268] bg-[#090A0B] p-2.5 rounded border border-white/[0.06]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F2F3F4] border border-[#D7DADD]" />
              <span className="text-[#D7DADD]">Optimal Recommendation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#A0A5AA]" />
              <span>Pareto Frontier</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#24282C]" />
              <span>Dominated</span>
            </div>
          </div>

          <div className="text-[10.5px] text-[#A0A5AA]">
            Select any point to inspect candidate model allocations
          </div>
        </div>
      </div>

      {/* Right Column: Candidate Detailed Inspector */}
      <div className="studio-inspector w-full md:w-80 lg:w-96 bg-[#090A0B] border-t md:border-t-0 md:border-l border-white/[0.06] p-4 flex flex-col justify-between overflow-y-auto shrink-0" style={{ width, flex: "0 0 auto" }}>
        <div className="space-y-4">
          {/* Header */}
          <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between">
            <div>
              <div className="text-[9.5px] uppercase text-[#5C6268] tracking-wider">
                Candidate Profile
              </div>
              <div className="text-sm font-semibold text-[#F2F3F4]">
                {activeInspection.name}
              </div>
            </div>

            {activeInspection.isBalanced && (
              <span className="px-2 py-0.5 rounded bg-[#0F1113] border border-white/[0.1] text-[#F2F3F4] text-[9.5px] font-bold">
                RECOMMENDED
              </span>
            )}
          </div>

          {/* Metric Quad */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
              <span className="text-[9px] text-[#5C6268] uppercase block">Execution Cost</span>
              <span className="text-sm font-bold text-[#F2F3F4]">
                ${activeInspection.costPerReq.toFixed(3)}
              </span>
              <span className="text-[9.5px] text-[#D7DADD] block mt-0.5">
                {activeInspection.savingsPct > 0 ? `-${activeInspection.savingsPct}% savings` : 'Baseline'}
              </span>
            </div>

            <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
              <span className="text-[9px] text-[#5C6268] uppercase block">Quality Score</span>
              <span className="text-sm font-bold text-[#F2F3F4]">
                {activeInspection.qualityPct.toFixed(1)}%
              </span>
              <span className="text-[9.5px] text-[#A0A5AA] block mt-0.5">
                {activeInspection.evalPassRate}% eval pass
              </span>
            </div>

            <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
              <span className="text-[9px] text-[#5C6268] uppercase block">Latency P95</span>
              <span className="text-sm font-semibold text-[#D7DADD]">
                {activeInspection.latencySec.toFixed(1)}s
              </span>
              <span className="text-[9.5px] text-[#5C6268] block mt-0.5">
                P95: {activeInspection.p95LatencySec.toFixed(1)}s
              </span>
            </div>

            <div className="p-2.5 rounded bg-[#050505] border border-white/[0.05]">
              <span className="text-[9px] text-[#5C6268] uppercase block">Pareto Efficiency</span>
              <span className="text-xs font-semibold text-[#F2F3F4]">
                {activeInspection.isParetoOptimal ? 'NON-DOMINATED' : 'DOMINATED'}
              </span>
              <span className="text-[9.5px] text-[#5C6268] block mt-0.5">
                {activeInspection.evalCount} test vectors
              </span>
            </div>
          </div>

          {/* Node Model Allocations */}
          <div className="space-y-2 pt-2 border-t border-white/[0.05]">
            <div className="text-[9.5px] uppercase text-[#5C6268] tracking-wider flex items-center justify-between">
              <span>Node Model Assignments</span>
              <span>Compiled Model</span>
            </div>

            <div className="space-y-1.5 text-xs">
              {project.nodes.map((node) => {
                const assignedModel =
                  activeInspection.nodeModels[node.id] || node.currentModel;
                const isChanged = assignedModel !== node.baselineModel;

                return (
                  <div
                    key={node.id}
                    className="p-2 rounded bg-[#050505] border border-white/[0.05] flex items-center justify-between"
                  >
                    <span className="text-[#A0A5AA]">{node.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold border ${
                        isChanged
                          ? 'bg-[#0F1113] border-white/[0.12] text-[#F2F3F4]'
                          : 'bg-[#050505] border-white/[0.04] text-[#5C6268]'
                      }`}
                    >
                      {assignedModel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Apply Action CTA */}
        <div className="pt-4 border-t border-white/[0.06] space-y-2">
          <button
            onClick={() => onApplyCandidateToGraph(activeInspection)}
            className="w-full py-2 rounded text-xs font-bold silver-btn-gradient text-[#050505] flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply {activeInspection.name}</span>
          </button>
        </div>
        <PanelResizeHandle side="left" onPointerDown={startResize} label="Resize frontier inspector" />
      </div>
    </div>
  );
};
