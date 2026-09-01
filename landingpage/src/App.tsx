import React, { useState, useEffect } from 'react';
import { 
  ViewMode, 
  AgentProject, 
  AgentNode, 
  OptimizationCandidate, 
  OptimizerEvent 
} from './types';
import { 
  ALL_PROJECTS, 
  CANDIDATE_CONFIGS, 
  OPTIMIZER_STREAM_EVENTS, 
  RESEARCH_PROJECT 
} from './data/mockAgents';
import { NavigationRail } from './components/NavigationRail';
import { TopBar } from './components/TopBar';
import { ExecutionGraph } from './components/ExecutionGraph';
import { NodeInspector } from './components/NodeInspector';
import { OptimizationFrontier } from './components/OptimizationFrontier';
import { BeforeAfterDiff } from './components/BeforeAfterDiff';
import { OptimizerTrace } from './components/OptimizerTrace';
import { EvalsView } from './components/EvalsView';
import { OptimizationModal } from './components/OptimizationModal';
import { CommandPalette } from './components/CommandPalette';
import { ExportModal } from './components/ExportModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('graph');
  const [project, setProject] = useState<AgentProject>(RESEARCH_PROJECT);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Optimization Engine State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptModalOpen, setIsOptModalOpen] = useState(false);
  const [optEvents, setOptEvents] = useState<OptimizerEvent[]>(OPTIMIZER_STREAM_EVENTS);
  const [optStepIndex, setOptStepIndex] = useState(14);
  const [activeTestingNodeId, setActiveTestingNodeId] = useState<string | null>(null);
  const [testingStatus, setTestingStatus] = useState<{
    status: 'TESTING' | 'PASS' | 'REJECT';
    nodeName: string;
    fromModel: string;
    toModel: string;
    costChange?: string;
    qualityChange?: string;
  } | null>(null);

  // Candidates & Selection State
  const [selectedCandidateId, setSelectedCandidateId] = useState<number>(42);
  
  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Selected node object
  const selectedNode = project.nodes.find((n) => n.id === selectedNodeId) || null;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        runOptimizationSimulation();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setCurrentView('graph');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setCurrentView('frontier');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setCurrentView('diff');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '4') {
        e.preventDefault();
        setCurrentView('timeline');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '5') {
        e.preventDefault();
        setCurrentView('evals');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Run the live PGO optimization sequence
  const runOptimizationSimulation = () => {
    if (isOptimizing) return;
    
    // Reset to baseline models before starting simulation
    setProject((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => ({
        ...n,
        currentModel: n.baselineModel,
        avgCost: n.baselineCost,
        latencySec: n.baselineLatencySec
      }))
    }));

    setIsOptimizing(true);
    setIsOptModalOpen(true);
    setOptEvents([OPTIMIZER_STREAM_EVENTS[0]]);
    setOptStepIndex(1);

    const steps = [
      // Step 1: Planner
      {
        nodeId: 'node-planner',
        nodeName: 'Planner',
        from: 'Sol',
        to: 'Luna',
        status: 'TESTING' as const,
        events: [OPTIMIZER_STREAM_EVENTS[1]],
        delay: 800,
        applyModel: false
      },
      {
        nodeId: 'node-planner',
        nodeName: 'Planner',
        from: 'Sol',
        to: 'Luna',
        status: 'PASS' as const,
        costChange: '-71.2% Cost',
        qualityChange: '-0.1pp (Pass)',
        events: [OPTIMIZER_STREAM_EVENTS[2]],
        delay: 1400,
        applyModel: true,
        newModel: 'Luna',
        newCost: 0.019,
        newLatency: 1.2
      },
      // Step 2: Researcher
      {
        nodeId: 'node-researcher',
        nodeName: 'Researcher',
        from: 'Sol',
        to: 'Flash',
        status: 'TESTING' as const,
        events: [OPTIMIZER_STREAM_EVENTS[3]],
        delay: 800,
        applyModel: false
      },
      {
        nodeId: 'node-researcher',
        nodeName: 'Researcher',
        from: 'Sol',
        to: 'Flash',
        status: 'PASS' as const,
        costChange: '-64.4% Cost',
        qualityChange: '+0.2pp (Pass)',
        events: [OPTIMIZER_STREAM_EVENTS[4]],
        delay: 1400,
        applyModel: true,
        newModel: 'Flash',
        newCost: 0.028,
        newLatency: 3.4
      },
      // Step 3: Extractor
      {
        nodeId: 'node-extractor',
        nodeName: 'Extractor',
        from: 'Sol',
        to: 'Luna',
        status: 'TESTING' as const,
        events: [OPTIMIZER_STREAM_EVENTS[5]],
        delay: 800,
        applyModel: false
      },
      {
        nodeId: 'node-extractor',
        nodeName: 'Extractor',
        from: 'Sol',
        to: 'Luna',
        status: 'PASS' as const,
        costChange: '-69.2% Cost',
        qualityChange: '+0.1pp (Pass)',
        events: [OPTIMIZER_STREAM_EVENTS[6]],
        delay: 1400,
        applyModel: true,
        newModel: 'Luna',
        newCost: 0.012,
        newLatency: 1.1
      },
      // Step 4: Reasoner (Luna attempt -> REJECT)
      {
        nodeId: 'node-reasoner',
        nodeName: 'Reasoner',
        from: 'Sol',
        to: 'Luna',
        status: 'TESTING' as const,
        events: [OPTIMIZER_STREAM_EVENTS[7]],
        delay: 900,
        applyModel: false
      },
      {
        nodeId: 'node-reasoner',
        nodeName: 'Reasoner',
        from: 'Sol',
        to: 'Luna',
        status: 'REJECT' as const,
        costChange: '-88.1% Cost',
        qualityChange: '-18.4pp (REJECTED)',
        events: [OPTIMIZER_STREAM_EVENTS[8]],
        delay: 1400,
        applyModel: false
      },
      // Step 4b: Reasoner (Terra attempt -> REJECT, KEEP SOL)
      {
        nodeId: 'node-reasoner',
        nodeName: 'Reasoner',
        from: 'Sol',
        to: 'Terra',
        status: 'TESTING' as const,
        events: [OPTIMIZER_STREAM_EVENTS[9]],
        delay: 800,
        applyModel: false
      },
      {
        nodeId: 'node-reasoner',
        nodeName: 'Reasoner',
        from: 'Sol',
        to: 'Terra',
        status: 'REJECT' as const,
        costChange: 'KEEP SOL',
        qualityChange: '-0.8pp (Borderline)',
        events: [OPTIMIZER_STREAM_EVENTS[10]],
        delay: 1400,
        applyModel: true,
        newModel: 'GPT-5.6 Sol',
        newCost: 0.143,
        newLatency: 8.4
      },
      // Step 5: Formatter
      {
        nodeId: 'node-formatter',
        nodeName: 'Formatter',
        from: 'Sol',
        to: 'Luna',
        status: 'TESTING' as const,
        events: [OPTIMIZER_STREAM_EVENTS[11]],
        delay: 800,
        applyModel: false
      },
      {
        nodeId: 'node-formatter',
        nodeName: 'Formatter',
        from: 'Sol',
        to: 'Luna',
        status: 'PASS' as const,
        costChange: '-65.0% Cost',
        qualityChange: '0.0pp (Pass)',
        events: [OPTIMIZER_STREAM_EVENTS[12]],
        delay: 1400,
        applyModel: true,
        newModel: 'Luna',
        newCost: 0.007,
        newLatency: 0.9
      },
      // Final Frontier compilation
      {
        nodeId: '',
        nodeName: 'Frontier',
        from: '',
        to: '',
        status: 'PASS' as const,
        events: [OPTIMIZER_STREAM_EVENTS[13], OPTIMIZER_STREAM_EVENTS[14]],
        delay: 1000,
        applyModel: false
      }
    ];

    let currentStep = 0;

    const runNextStep = () => {
      if (currentStep >= steps.length) {
        setIsOptimizing(false);
        setActiveTestingNodeId(null);
        setTestingStatus(null);
        setOptStepIndex(14);
        return;
      }

      const step = steps[currentStep];
      setActiveTestingNodeId(step.nodeId || null);
      setTestingStatus({
        status: step.status,
        nodeName: step.nodeName,
        fromModel: step.from,
        toModel: step.to,
        costChange: step.costChange,
        qualityChange: step.qualityChange
      });

      setOptEvents((prev) => [...prev, ...step.events]);
      setOptStepIndex(currentStep + 1);

      if (step.applyModel && step.nodeId && step.newModel) {
        setProject((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === step.nodeId
              ? {
                  ...n,
                  currentModel: step.newModel!,
                  avgCost: step.newCost || n.avgCost,
                  latencySec: step.newLatency || n.latencySec
                }
              : n
          )
        }));
      }

      currentStep++;
      setTimeout(runNextStep, step.delay);
    };

    setTimeout(runNextStep, 500);
  };

  // Switch Active Project
  const handleSelectProject = (projectId: string) => {
    const selected = ALL_PROJECTS.find((p) => p.id === projectId);
    if (selected) {
      setProject(selected);
      setSelectedNodeId(null);
    }
  };

  // Override model on a node manually
  const handleSelectModelOverride = (nodeId: string, modelName: string) => {
    setProject((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, currentModel: modelName } : n
      )
    }));
  };

  // Apply candidate from Pareto Frontier directly
  const handleApplyCandidate = (candidate: OptimizationCandidate) => {
    setProject((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => ({
        ...n,
        currentModel: candidate.nodeModels[n.id] || n.currentModel
      }))
    }));
    setSelectedCandidateId(candidate.id);
  };

  // Render Full Interactive Studio Workspace
  return (
    <div className="flex h-screen w-screen bg-[#050505] text-[#D6D9DC] overflow-hidden font-sans select-none relative">
      {/* 1. Slim Left Navigation Rail */}
      <NavigationRail
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenIntegrations={() => setIsIntegrationsModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isOptimizing={isOptimizing}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar with Project Breadcrumbs, Views, and Metallic OPTIMIZE Button */}
        <TopBar
          project={project}
          allProjects={ALL_PROJECTS}
          onSelectProject={handleSelectProject}
          currentView={currentView}
          onViewChange={setCurrentView}
          onRunOptimization={runOptimizationSimulation}
          isOptimizing={isOptimizing}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenExport={() => setIsExportModalOpen(true)}
          optimizationProgressPct={Math.min(100, Math.round((optStepIndex / 14) * 100))}
        />

        {/* Workspace Body: Dynamic View */}
        <main className="flex-1 flex overflow-hidden relative">
          {currentView === 'graph' && (
            <>
              {/* Primary Execution Graph (Visual Hero) */}
              <ExecutionGraph
                project={project}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                isOptimizing={isOptimizing}
                onRunOptimization={runOptimizationSimulation}
                activeTestingNodeId={activeTestingNodeId}
                testingStatus={testingStatus}
              />

              {/* Contextual Right Inspector */}
              <NodeInspector
                selectedNode={selectedNode}
                project={project}
                onClose={() => setSelectedNodeId(null)}
                onSelectModelOverride={handleSelectModelOverride}
                onRunOptimization={runOptimizationSimulation}
                isOptimizing={isOptimizing}
              />
            </>
          )}

          {currentView === 'frontier' && (
            <OptimizationFrontier
              candidates={CANDIDATE_CONFIGS}
              selectedCandidateId={selectedCandidateId}
              onSelectCandidate={setSelectedCandidateId}
              onApplyCandidateToGraph={handleApplyCandidate}
              project={project}
            />
          )}

          {currentView === 'diff' && (
            <BeforeAfterDiff
              project={project}
              onDeployOptimized={() => {
                // Apply optimized configuration
                setProject((prev) => ({
                  ...prev,
                  nodes: prev.nodes.map((n) => ({
                    ...n,
                    currentModel: n.optimizedModel
                  }))
                }));
                setCurrentView('graph');
              }}
              onOpenExport={() => setIsExportModalOpen(true)}
            />
          )}

          {currentView === 'timeline' && (
            <OptimizerTrace
              events={optEvents}
              project={project}
            />
          )}

          {currentView === 'evals' && (
            <EvalsView
              project={project}
            />
          )}
        </main>
      </div>

      {/* 3. Live Optimization Compilation Modal */}
      <OptimizationModal
        isOpen={isOptModalOpen}
        isOptimizing={isOptimizing}
        events={optEvents}
        currentStepIndex={optStepIndex}
        totalSteps={14}
        project={project}
        onClose={() => setIsOptModalOpen(false)}
        onApplyAndCompare={() => {
          setIsOptModalOpen(false);
          setCurrentView('diff');
        }}
        onOpenFrontier={() => {
          setIsOptModalOpen(false);
          setCurrentView('frontier');
        }}
      />

      {/* 4. Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onViewChange={setCurrentView}
        onRunOptimization={runOptimizationSimulation}
        onSelectProject={handleSelectProject}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenIntegrations={() => setIsIntegrationsModalOpen(true)}
        allProjects={ALL_PROJECTS}
      />

      {/* 5. Export Manifest Dialog */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={project}
      />

      {/* 6. SDK Integrations Dialog */}
      <IntegrationsModal
        isOpen={isIntegrationsModalOpen}
        onClose={() => setIsIntegrationsModalOpen(false)}
      />

      {/* 7. Compiler Settings Dialog */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        project={project}
        onUpdateProjectSettings={(settings) => {
          setProject((prev) => ({ ...prev, ...settings }));
        }}
      />
    </div>
  );
}

