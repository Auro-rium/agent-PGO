import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AgentProject, NodePosition } from '../types';
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
  layout?: Record<string, NodePosition>;
  layoutRevision?: number;
  onLayoutChange?: (positions: Record<string, NodePosition>) => void;
}

export const ExecutionGraph: React.FC<ExecutionGraphProps> = ({
  project,
  selectedNodeId,
  onSelectNode,
  isOptimizing,
  onRunOptimization,
  activeTestingNodeId,
  testingStatus,
  layout = {},
  layoutRevision = 0,
  onLayoutChange
}) => {
  const formatCost = (value: number, observed: boolean) => observed && value > 0 ? `$${value.toFixed(3)}` : '—';
  const formatSeconds = (value: number, observed: boolean) => observed && value > 0 ? `${value.toFixed(1)}s` : '—';
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 30, y: 25 });
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const nodePositionsRef = useRef(nodePositions);
  const dragRef = useRef<{
    type: 'pan' | 'node';
    startX: number;
    startY: number;
    startPan?: { x: number; y: number };
    nodeId?: string;
    startNode?: { x: number; y: number };
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const pendingNodeRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;

      if (pendingPanRef.current) {
        const nextPan = pendingPanRef.current;
        pendingPanRef.current = null;
        panRef.current = nextPan;
        setPan(nextPan);
      }

      if (pendingNodeRef.current) {
        const { id, position } = pendingNodeRef.current;
        pendingNodeRef.current = null;
        nodePositionsRef.current = { ...nodePositionsRef.current, [id]: position };
        setNodePositions(nodePositionsRef.current);
      }
    });
  }, []);

  const flushPendingNode = useCallback(() => {
    const pending = pendingNodeRef.current;
    if (!pending) return;
    pendingNodeRef.current = null;
    const nextPositions = { ...nodePositionsRef.current, [pending.id]: pending.position };
    nodePositionsRef.current = nextPositions;
    setNodePositions(nextPositions);
    onLayoutChange?.(nextPositions);
  }, [onLayoutChange]);

  // Initialize node positions from the persisted project layout. Layouts are
  // revisioned server state, so re-read them when a project or layout revision
  // changes but keep drag updates local until the pointer is released.
  useEffect(() => {
    const initialPos: Record<string, { x: number; y: number }> = {};
    project.nodes.forEach((n) => {
      initialPos[n.id] = { x: n.x, y: n.y };
    });
    Object.entries(layout).forEach(([nodeId, rawPosition]) => {
      const position = rawPosition as NodePosition;
      if (initialPos[nodeId] && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        initialPos[nodeId] = { x: position.x, y: position.y };
      }
    });
    nodePositionsRef.current = initialPos;
    setNodePositions(initialPos);
  }, [layout, layoutRevision, project.id, project.nodes]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  // Handle Pan canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.graph-node-card')) return;
    dragRef.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      startPan: panRef.current
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.type === 'pan' && drag.startPan) {
      pendingPanRef.current = {
        x: drag.startPan.x + e.clientX - drag.startX,
        y: drag.startPan.y + e.clientY - drag.startY
      };
    } else if (drag.type === 'node' && drag.nodeId && drag.startNode) {
      pendingNodeRef.current = {
        id: drag.nodeId,
        position: {
          x: Math.max(20, drag.startNode.x + (e.clientX - drag.startX) / zoomRef.current),
          y: Math.max(20, drag.startNode.y + (e.clientY - drag.startY) / zoomRef.current)
        }
      };
    }
    scheduleFrame();
  };

  const handleMouseUp = () => {
    flushPendingNode();
    dragRef.current = null;
  };

  const resetView = () => {
    panRef.current = { x: 30, y: 25 };
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 30, y: 25 });
  };

  return (
    <div 
      className="studio-canvas relative flex-1 h-full bg-[#050505] canvas-grid overflow-hidden select-none flex flex-col"
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
          onClick={() => setZoom((z) => { const next = Math.min(1.6, z + 0.1); zoomRef.current = next; return next; })}
          className="p-1.5 rounded text-[#5C6268] hover:text-[#D7DADD] hover:bg-white/[0.04] transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-[#5C6268] px-1">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => { const next = Math.max(0.6, z - 0.1); zoomRef.current = next; return next; })}
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
                const startNode = nodePositionsRef.current[node.id] || { x: node.x, y: node.y };
                dragRef.current = {
                  type: 'node',
                  startX: e.clientX,
                  startY: e.clientY,
                  nodeId: node.id,
                  startNode
                };
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
                      {formatCost(node.avgCost, node.calls > 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono uppercase text-[#5C6268]">Latency</div>
                    <div className="font-mono text-xs text-[#D7DADD]">
                      {formatSeconds(node.latencySec, node.calls > 0)}
                    </div>
                  </div>
                </div>

                {/* Token Usage & Cost Share Bar */}
                <div className="pt-0.5">
                  <div className="flex items-center justify-between text-[9.5px] font-mono mb-1">
                    <span className="text-[#5C6268]">
                      {node.calls > 0 ? `${(node.inputTokens / 1000).toFixed(1)}k tok` : '—'}
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
                      TESTING {project.evalCasesCount.toLocaleString()} EVALS...
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
      <div className="studio-summary studio-summary-strip mt-auto z-10 bg-[#090A0B]/95 backdrop-blur border-t border-white/[0.06] px-4 py-2 flex flex-wrap items-center justify-between gap-4">
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
            <span className="font-semibold text-[#F2F3F4]">{formatCost(project.baselineCost, project.totalExecutions > 0)}</span>
          </div>
          <div className="w-[1px] h-5 bg-white/[0.06]" />
          <div>
            <span className="text-[9px] text-[#5C6268] block uppercase">Latency P95</span>
            <span className="text-[#D7DADD]">{formatSeconds(project.baselineLatencyP95, project.totalExecutions > 0)}</span>
          </div>
          <div className="w-[1px] h-5 bg-white/[0.06]" />
          <div>
            <span className="text-[9px] text-[#5C6268] block uppercase">Quality</span>
            <span className="text-[#D7DADD]">{project.totalExecutions > 0 && project.baselineQuality > 0 ? `${project.baselineQuality.toFixed(1)}%` : '—'}</span>
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
