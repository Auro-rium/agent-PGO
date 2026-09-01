import React, { useState, useRef, useEffect } from 'react';
import { AgentProject } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Zap, 
  Flame, 
  Sparkles
} from 'lucide-react';

interface ExecutionGraphProps {
  project: AgentProject;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  isOptimizing: boolean;
  onRunOptimization: () => void;
  activeTestingNodeId?: string | null;
  testingStatus?: {
    status: 'TESTING' | 'PASS' | 'REJECT';
    nodeName: string;
    fromModel: string;
    toModel: string;
    costChange?: string;
    qualityChange?: string;
  } | null;
}

export const ExecutionGraph: React.FC<ExecutionGraphProps> = ({
  project,
  selectedNodeId,
  onSelectNode,
  isOptimizing,
  onRunOptimization,
  activeTestingNodeId,
  testingStatus
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 30, y: 25 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Initialize node positions from project
  useEffect(() => {
    const initialPos: Record<string, { x: number; y: number }> = {};
    project.nodes.forEach((n) => {
      initialPos[n.id] = { x: n.x, y: n.y };
    });
    setNodePositions(initialPos);
  }, [project]);

  // Handle Pan canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.graph-node-card')) return;
    setIsPanning(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else if (draggedNode) {
      setNodePositions((prev) => ({
        ...prev,
        [draggedNode]: {
          x: Math.max(20, (e.clientX - pan.x) / zoom - 110),
          y: Math.max(20, (e.clientY - pan.y) / zoom - 60)
        }
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 30, y: 25 });
  };

  return (
    <div 
      className="relative flex-1 h-full bg-[#050505] canvas-grid overflow-hidden select-none flex flex-col"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Left Canvas HUD: Compiler Target Badge */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        <div className="px-2.5 py-1 rounded bg-[#090A0B]/90 backdrop-blur border border-white/[0.06] flex items-center gap-2 text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D7DADD]" />
          <span className="text-[#5C6268]">TARGET:</span>
          <span className="text-[#F2F3F4] font-medium">{project.name}</span>
          <span className="text-[#5C6268]">·</span>
          <span className="text-[#A0A5AA]">{project.nodes.length} Nodes</span>
        </div>

        {isOptimizing && (
          <div className="px-2.5 py-1 rounded bg-[#0F1113] border border-[#D7DADD]/60 flex items-center gap-1.5 text-xs font-mono text-[#F2F3F4] animate-pulse shadow-[0_0_15px_rgba(215,218,221,0.1)]">
            <Sparkles className="w-3 h-3 text-[#D7DADD]" />
            <span>PGO COMPILER RUNNING</span>
          </div>
        )}
      </div>

      {/* Top Right Zoom Controls */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-0.5 bg-[#090A0B]/90 backdrop-blur border border-white/[0.06] p-0.5 rounded">
        <button
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
          className="p-1.5 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.04] transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-[#5C6268] px-1">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
          className="p-1.5 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.04] transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="w-[1px] h-3.5 bg-white/[0.06] mx-0.5" />
        <button
          onClick={resetView}
          className="p-1.5 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.04] transition-colors"
          title="Reset View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* SVG Canvas for Dynamic Direct Wires */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <defs>
          {/* Fixed-pixel userSpaceOnUse markers: immune to stroke-width distortion or stretching */}
          <marker
            id="silver-arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 1 2 L 7.5 5 L 1 8 Z" fill="#5C6268" />
          </marker>
          <marker
            id="active-silver-arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="9"
            markerHeight="9"
            orient="auto"
          >
            <path d="M 1 2 L 7.5 5 L 1 8 Z" fill="#F2F3F4" />
          </marker>
        </defs>

        {project.edges.map((edge) => {
          const fromNode = project.nodes.find((n) => n.id === edge.from);
          const toNode = project.nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const fromPos = nodePositions[fromNode.id] || { x: fromNode.x, y: fromNode.y };
          const toPos = nodePositions[toNode.id] || { x: toNode.x, y: toNode.y };

          // Anchors: from right center of source card (225px wide) to left center of target card
          const startX = fromPos.x + 225;
          const startY = fromPos.y + 65;
          const endX = toPos.x;
          const endY = toPos.y + 65;

          const dx = endX - startX;
          const dy = endY - startY;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          let pathD = '';
          if (dx >= 30) {
            // Forward flow: smoothly clamp curvature between 35px and 120px so wide stretching stays sleek
            const curvature = Math.min(Math.max(absDx * 0.4, 35), 120);
            pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
          } else if (dx >= 0) {
            // Short forward / stacked
            const curvature = Math.min(Math.max(absDy * 0.3, 30), 70);
            pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
          } else {
            // Reverse flow: smooth loop-around without intersecting card bounds
            const offset = Math.min(Math.max(absDy * 0.35 + 30, 45), 85);
            pathD = `M ${startX} ${startY} C ${startX + offset} ${startY}, ${startX + offset} ${startY + (dy >= 0 ? 40 : -40)}, ${startX + dx / 2} ${startY + dy / 2} S ${endX - offset} ${endY}, ${endX} ${endY}`;
          }

          const isWireActive =
            fromNode.id === selectedNodeId || toNode.id === selectedNodeId;

          return (
            <g key={edge.id} className="transition-all">
              {/* Background shadow wire */}
              <path
                d={pathD}
                fill="none"
                stroke="#050505"
                strokeWidth="4"
              />
              {/* Main wire */}
              <path
                d={pathD}
                fill="none"
                stroke={isWireActive ? '#D7DADD' : '#2A2E32'}
                strokeWidth={isWireActive ? '1.75' : '1.25'}
                markerEnd={isWireActive ? 'url(#active-silver-arrow)' : 'url(#silver-arrow)'}
                strokeDasharray={isOptimizing ? '4 4' : undefined}
              />
              {/* Animated token packet pulses */}
              <circle r={isWireActive ? '2.5' : '1.75'} fill="#F2F3F4">
                <animateMotion
                  path={pathD}
                  dur={isOptimizing ? '1.2s' : '2.8s'}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Nodes Layer */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {project.nodes.map((node) => {
          const pos = nodePositions[node.id] || { x: node.x, y: node.y };
          const isSelected = selectedNodeId === node.id;
          const isTesting = activeTestingNodeId === node.id;
          const isChanged = node.currentModel !== node.baselineModel;

          return (
            <div
              key={node.id}
              id={`graph-node-${node.id}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggedNode(node.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(isSelected ? null : node.id);
              }}
              className={`graph-node-card absolute pointer-events-auto w-[225px] rounded-lg transition-all duration-150 cursor-pointer select-none border ${
                isSelected
                  ? 'bg-[#0F1113] border-[#D7DADD] shadow-[0_0_24px_rgba(215,218,221,0.12)]'
                  : isTesting
                  ? 'bg-[#0F1113] border-white shadow-[0_0_25px_rgba(255,255,255,0.2)]'
                  : node.isHotspot
                  ? 'bg-[#090A0B] border-white/[0.12] hover:border-white/[0.22]'
                  : 'bg-[#090A0B] border-white/[0.06] hover:border-white/[0.14]'
              }`}
            >
              {/* Hardware Port Anchors */}
              <div 
                className="absolute -left-1.5 top-[65px] -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#050505] border border-white/[0.15] flex items-center justify-center pointer-events-none"
                title="Input Port"
              >
                <div className="w-1 h-1 rounded-full bg-[#5C6268]" />
              </div>
              <div 
                className="absolute -right-1.5 top-[65px] -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#050505] border border-white/[0.15] flex items-center justify-center pointer-events-none"
                title="Output Port"
              >
                <div className="w-1 h-1 rounded-full bg-[#5C6268]" />
              </div>

              {/* Header: Node Name & Sensitivity Tag */}
              <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-1.5">
                  {node.isHotspot && (
                    <span 
                      className="w-1.5 h-1.5 rounded-full bg-[#D7DADD]" 
                      title="Hotspot: High Cost Share" 
                    />
                  )}
                  <span className="font-mono font-semibold text-xs text-[#F2F3F4] tracking-wide uppercase">
                    {node.name}
                  </span>
                </div>

                {node.qualitySensitivity === 'HIGH' && (
                  <span className="px-1 py-0.2 rounded bg-white/[0.04] border border-white/[0.08] text-[8.5px] font-mono tracking-tight text-[#D7DADD]">
                    SENSITIVE
                  </span>
                )}
              </div>

              {/* Node Body: Model & Instrumentation */}
              <div className="p-3 space-y-2.5">
                {/* Active Model Tag */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase text-[#5C6268]">Model</span>
                  <span
                    className={`font-mono text-[11px] font-medium px-1.5 py-0.5 rounded border ${
                      isChanged
                        ? 'bg-[#0F1113] border-[#D7DADD] text-[#F2F3F4]'
                        : 'bg-[#050505] border-white/[0.06] text-[#A0A5AA]'
                    }`}
                  >
                    {node.currentModel}
                  </span>
                </div>

                {/* Metrics Matrix: Cost / Latency */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.04]">
                  <div>
                    <div className="text-[9px] font-mono uppercase text-[#5C6268]">Cost/Run</div>
                    <div className="font-mono text-xs font-semibold text-[#F2F3F4]">
                      ${node.avgCost.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono uppercase text-[#5C6268]">Latency</div>
                    <div className="font-mono text-xs text-[#D7DADD]">
                      {node.latencySec.toFixed(1)}s
                    </div>
                  </div>
                </div>

                {/* Token Usage & Cost Share Bar */}
                <div className="pt-0.5">
                  <div className="flex items-center justify-between text-[9.5px] font-mono mb-1">
                    <span className="text-[#5C6268]">
                      {(node.inputTokens / 1000).toFixed(1)}k tok
                    </span>
                    <span className="text-[#D7DADD]">
                      {node.costSharePct.toFixed(1)}% cost
                    </span>
                  </div>
                  <div className="w-full h-1 bg-[#14171A] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        node.isHotspot ? 'bg-[#D7DADD]' : 'bg-[#5C6268]'
                      }`}
                      style={{ width: `${node.costSharePct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Live Testing Overlay when Optimizer visits this node */}
              {isTesting && testingStatus && (
                <div className="absolute inset-0 rounded-lg bg-[#090A0B]/95 backdrop-blur border-2 border-[#F2F3F4] p-3 flex flex-col justify-between z-20 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono uppercase text-[#5C6268]">
                      Profiling Sub-Agent
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#F2F3F4] animate-ping" />
                  </div>

                  <div className="text-center my-1">
                    <div className="text-[11px] font-mono text-[#A0A5AA]">
                      {testingStatus.fromModel} → <strong className="text-[#F2F3F4]">{testingStatus.toModel}</strong>
                    </div>
                    <div className="text-[9.5px] font-mono text-[#5C6268] mt-0.5 animate-pulse">
                      TESTING 120 EVALS...
                    </div>
                  </div>

                  {testingStatus.costChange && (
                    <div className="flex items-center justify-between text-[9.5px] font-mono pt-1 border-t border-white/[0.06]">
                      <span className="text-[#D7DADD] font-bold">{testingStatus.costChange}</span>
                      <span className="text-[#A0A5AA]">{testingStatus.qualityChange}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Hotspots & Profiler Summary Strip (Bloomberg Terminal style) */}
      <div className="mt-auto z-10 bg-[#090A0B]/95 backdrop-blur border-t border-white/[0.06] px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        {/* Hotspots Breakdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#5C6268] shrink-0">
            <Flame className="w-3.5 h-3.5 text-[#D7DADD]" />
            <span className="uppercase text-[9.5px] tracking-wider text-[#A0A5AA]">HOTSPOTS</span>
          </div>

          <div className="flex items-center gap-2">
            {project.nodes
              .filter((n) => n.costSharePct > 15)
              .map((n) => (
                <button
                  key={n.id}
                  onClick={() => onSelectNode(n.id)}
                  className={`flex items-center gap-2 px-2 py-0.5 rounded border text-xs font-mono transition-colors ${
                    selectedNodeId === n.id
                      ? 'bg-[#0F1113] border-[#D7DADD] text-[#F2F3F4]'
                      : 'bg-[#050505] border-white/[0.06] text-[#A0A5AA] hover:border-white/[0.14]'
                  }`}
                >
                  <span>{n.name}</span>
                  <span className="font-semibold text-[#D7DADD]">{n.costSharePct.toFixed(0)}%</span>
                  <div className="w-8 h-1 bg-[#14171A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#D7DADD]"
                      style={{ width: `${n.costSharePct}%` }}
                    />
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Aggregate Metrics Profile */}
        <div className="flex items-center gap-5 font-mono text-xs">
          <div>
            <span className="text-[9px] text-[#5C6268] block uppercase">Cost / Req</span>
            <span className="font-semibold text-[#F2F3F4]">${project.baselineCost.toFixed(3)}</span>
          </div>
          <div className="w-[1px] h-5 bg-white/[0.06]" />
          <div>
            <span className="text-[9px] text-[#5C6268] block uppercase">Latency P95</span>
            <span className="text-[#D7DADD]">{project.baselineLatencyP95.toFixed(1)}s</span>
          </div>
          <div className="w-[1px] h-5 bg-white/[0.06]" />
          <div>
            <span className="text-[9px] text-[#5C6268] block uppercase">Quality</span>
            <span className="text-[#D7DADD]">{project.baselineQuality.toFixed(1)}%</span>
          </div>
          <div className="w-[1px] h-5 bg-white/[0.06]" />
          <div>
            <button
              onClick={onRunOptimization}
              disabled={isOptimizing}
              className="px-2.5 py-1 rounded bg-[#0F1113] border border-white/[0.08] hover:border-[#D7DADD] text-xs font-mono text-[#F2F3F4] flex items-center gap-1.5 transition-all"
            >
              <Zap className="w-3 h-3 text-[#D7DADD]" />
              <span>Optimize</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

