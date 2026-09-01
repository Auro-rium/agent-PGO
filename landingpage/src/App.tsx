import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ViewMode, AgentProject, OptimizationCandidate, OptimizerEvent, EvalCase } from './types';
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
import { SettingsView } from './components/SettingsView';
import { DemoSession } from './auth/demoAuth';
import { api, ApiError } from './lib/api';
import { subscribeToOptimization, OptimizerStream } from './lib/sse';

const studioViewFromHash = (): ViewMode => {
  const value = window.location.hash.replace(/^#studio\/?/, '').replace(/\/$/, '');
  if (value === 'frontier' || value === 'diff' || value === 'timeline' || value === 'evals' || value === 'settings') return value;
  return 'graph';
};

interface AppProps { session?: DemoSession; onLogout?: () => void; onOpenProfile?: () => void; }

export default function App({ session, onLogout, onOpenProfile }: AppProps) {
  const activeSession: DemoSession = session || { name: 'TwineRun User', email: '', initials: 'TR', authenticatedAt: '' };
  const [currentView, setCurrentView] = useState<ViewMode>(studioViewFromHash);
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [project, setProject] = useState<AgentProject | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<OptimizationCandidate[]>([]);
  const [evalCases, setEvalCases] = useState<EvalCase[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [optEvents, setOptEvents] = useState<OptimizerEvent[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationStatus, setOptimizationStatus] = useState('');
  const [isOptModalOpen, setIsOptModalOpen] = useState(false);
  const [activeTestingNodeId, setActiveTestingNodeId] = useState<string | null>(null);
  const [testingStatus, setTestingStatus] = useState<{ status: 'TESTING' | 'PASS' | 'REJECT'; nodeName: string; fromModel: string; toModel: string; costChange?: string; qualityChange?: string } | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef<OptimizerStream | null>(null);

  const loadProjects = useCallback(async () => {
    const applyProjects = (list: AgentProject[]) => {
      setProjects(list);
      setProject((current) => current && list.some((item) => item.id === current.id) ? current : list[0] || null);
      setError(list.length ? '' : 'No persisted projects are available for this workspace yet.');
    };
    try {
      applyProjects(await api.projects());
    } catch (cause) {
      // A local demo session can outlive its sessionStorage token (for example
      // after a browser restart). Re-bootstrap the short-lived test token once
      // so the studio does not surface a misleading "missing API key" error.
      if (cause instanceof ApiError && cause.status === 401) {
        try {
          const auth = await api.demoSignIn();
          if (auth.accessToken) {
            window.sessionStorage.setItem('twinerun.access-token', auth.accessToken);
            applyProjects(await api.projects());
            return;
          }
        } catch {
          // Fall through to the stable backend error below.
        }
      }
      setError(cause instanceof ApiError ? cause.message : 'Unable to load projects from the backend.');
    }
  }, []);

  useEffect(() => { void loadProjects(); return () => streamRef.current?.close(); }, [loadProjects]);
  useEffect(() => {
    if (!project) return;
    setSelectedNodeId(null);
    setCandidates([]); setEvalCases([]); setOptEvents([]); setSelectedCandidateId('');
    if (project.runId) { void api.candidates(project.runId).then(setCandidates).catch(() => undefined); void api.evalCases(project.runId).then(setEvalCases).catch(() => undefined); }
  }, [project?.id, project?.runId]);
  useEffect(() => { const handle = () => setCurrentView(studioViewFromHash()); window.addEventListener('hashchange', handle); return () => window.removeEventListener('hashchange', handle); }, []);
  useEffect(() => () => streamRef.current?.close(), []);

  const handleViewChange = (view: ViewMode) => { window.history.pushState({}, '', '#studio/' + view); setCurrentView(view); };
  const handleSelectProject = async (projectId: string) => {
    try { setProject(await api.project(projectId)); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Unable to load that project.'); }
  };
  const handleSelectModelOverride = (nodeId: string, modelName: string) => setProject((prev) => prev ? ({ ...prev, nodes: prev.nodes.map((node) => node.id === nodeId ? { ...node, currentModel: modelName } : node) }) : prev);

  const startOptimization = async () => {
    if (!project || isOptimizing) return;
    setError(''); setIsOptimizing(true); setIsOptModalOpen(true); setOptimizationStatus('QUEUED'); setOptEvents([]);
    try {
      const result = await api.startOptimization(project.id, { projectVersionId: project.version, qualityTolerancePp: project.qualityTolerancePct, confidencePct: project.confidencePct, objective: 'cost_quality', idempotencyKey: crypto.randomUUID() });
      setOptimizationStatus(result.status); streamRef.current?.close();
      streamRef.current = subscribeToOptimization(result.runId, (event) => {
        setOptEvents((previous) => previous.some((item) => item.id === event.id) ? previous : [...previous, event]);
        if (event.nodeId) setActiveTestingNodeId(event.nodeId);
        if (event.type === 'TESTING' || event.type === 'PASS' || event.type === 'REJECT') setTestingStatus({ status: event.type === 'TESTING' ? 'TESTING' : event.type, nodeName: event.nodeName || event.nodeId || 'Node', fromModel: event.fromModel || '', toModel: event.toModel || '', costChange: event.costChangePct === undefined ? undefined : `${event.costChangePct.toFixed(1)}% cost`, qualityChange: event.qualityDeltaPp === undefined ? undefined : `${event.qualityDeltaPp >= 0 ? '+' : ''}${event.qualityDeltaPp.toFixed(1)}pp` });
      }, () => setError('Live optimizer events disconnected; polling will continue.'), (status) => {
        setOptimizationStatus(status); setIsOptimizing(false); setActiveTestingNodeId(null); setTestingStatus(null);
        void api.candidates(result.runId).then(setCandidates).catch(() => undefined); void api.project(project.id).then(setProject).catch(() => undefined);
      });
    } catch (cause) { setIsOptimizing(false); setOptimizationStatus('FAILED'); setError(cause instanceof ApiError ? cause.message : 'Unable to start optimization.'); }
  };

  const selectCandidate = async (candidate: OptimizationCandidate) => {
    setSelectedCandidateId(candidate.id);
    if (!project || !project.runId) return;
    try { const updated = await api.selectCandidate(project.runId, candidate.id); if (updated) setProject(updated); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Candidate selection failed.'); }
  };
  const updateSettings = async (settings: Partial<AgentProject>) => {
    if (!project) return;
    setProject((prev) => prev ? { ...prev, ...settings } : prev);
    try { await api.updateSettings(project.id, settings); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Settings could not be saved.'); }
  };
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId) || null;
  const progress = optimizationStatus === 'QUEUED' ? 8 : optimizationStatus === 'BASELINING' ? 25 : optimizationStatus === 'SEARCHING' ? 58 : optimizationStatus === 'VERIFYING' ? 84 : optimizationStatus === 'COMPLETED' ? 100 : 0;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setIsCommandPaletteOpen((open) => !open); } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); void startOptimization(); } };
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  });

  if (!project) return <div className="studio-shell flex h-screen items-center justify-center bg-[#050505] text-[#D6D9DC] font-mono text-xs"><div className="space-y-3 text-center"><div>{error || 'Loading persisted workspace…'}</div><button className="silver-btn-gradient rounded px-3 py-1 text-[#050505]" onClick={() => void loadProjects()}>Retry</button></div></div>;
  return <div className="studio-shell flex h-screen w-screen bg-[#050505] text-[#D6D9DC] overflow-hidden font-sans select-none relative">
    <NavigationRail session={activeSession} onLogout={onLogout || (() => {})} onOpenProfile={onOpenProfile || (() => {})} currentView={currentView} onViewChange={handleViewChange} onOpenIntegrations={() => setIsIntegrationsModalOpen(true)} onOpenSettings={() => { setIsSettingsModalOpen(false); handleViewChange('settings'); }} onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} isOptimizing={isOptimizing} />
    <div className="flex-1 flex flex-col h-full overflow-hidden"><TopBar project={project} allProjects={projects} onSelectProject={handleSelectProject} currentView={currentView} onViewChange={handleViewChange} onRunOptimization={() => void startOptimization()} isOptimizing={isOptimizing} onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} onOpenExport={() => setIsExportModalOpen(true)} optimizationProgressPct={progress} />
      {error && <div className="px-4 py-1.5 bg-[#241b1b] border-b border-white/[0.08] text-[10px] font-mono" role="alert">{error}</div>}
      <main className="flex-1 flex overflow-hidden relative">
        {currentView === 'graph' && <><ExecutionGraph project={project} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} isOptimizing={isOptimizing} onRunOptimization={() => void startOptimization()} activeTestingNodeId={activeTestingNodeId} testingStatus={testingStatus} /><NodeInspector selectedNode={selectedNode} project={project} onClose={() => setSelectedNodeId(null)} onSelectModelOverride={handleSelectModelOverride} onRunOptimization={() => void startOptimization()} isOptimizing={isOptimizing} /></>}
        {currentView === 'frontier' && <OptimizationFrontier candidates={candidates} selectedCandidateId={selectedCandidateId} onSelectCandidate={(id) => setSelectedCandidateId(id)} onApplyCandidateToGraph={(candidate) => void selectCandidate(candidate)} project={project} />}
        {currentView === 'diff' && <BeforeAfterDiff project={project} onDeployOptimized={() => handleViewChange('frontier')} onOpenExport={() => setIsExportModalOpen(true)} />}
        {currentView === 'timeline' && <OptimizerTrace events={optEvents} project={project} />}
        {currentView === 'evals' && <EvalsView project={project} cases={evalCases} />}
        {currentView === 'settings' && <SettingsView project={project} onUpdateProjectSettings={updateSettings} />}
      </main>
    </div>
    <OptimizationModal isOpen={isOptModalOpen} isOptimizing={isOptimizing} events={optEvents} currentStepIndex={optEvents.length} totalSteps={Math.max(1, optEvents.length)} project={project} onClose={() => setIsOptModalOpen(false)} onApplyAndCompare={() => { setIsOptModalOpen(false); handleViewChange('diff'); }} onOpenFrontier={() => { setIsOptModalOpen(false); handleViewChange('frontier'); }} />
    <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} onViewChange={handleViewChange} onRunOptimization={() => void startOptimization()} onSelectProject={handleSelectProject} onOpenExport={() => setIsExportModalOpen(true)} onOpenIntegrations={() => setIsIntegrationsModalOpen(true)} allProjects={projects} />
    <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} project={project} onExport={() => project.runId ? api.exportRun(project.runId) : Promise.resolve()} />
    <IntegrationsModal isOpen={isIntegrationsModalOpen} onClose={() => setIsIntegrationsModalOpen(false)} />
    <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} project={project} onUpdateProjectSettings={updateSettings} />
  </div>;
}
