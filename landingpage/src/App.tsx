import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ViewMode, AgentProject, OptimizationCandidate, OptimizerEvent, EvalCase, NodePosition, ProjectLayout } from './types';
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
import { api, ApiError, DEMO_AUTH_ENABLED } from './lib/api';
import { subscribeToOptimization, OptimizerStream } from './lib/sse';
import { ProjectOnboarding } from './components/ProjectOnboarding';
import { navigate, studioPath, studioViewFromPath } from './lib/router';

const ACTIVE_PROJECT_STORAGE_KEY = 'twinerun.active-project';
const activeRunStorageKey = (projectId: string) => `twinerun.active-run:${projectId}`;

const numberSetting = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const layoutFromApi = (value: unknown, projectId: string): ProjectLayout => {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawNodes = payload.nodes && typeof payload.nodes === 'object' ? payload.nodes as Record<string, unknown> : {};
  const nodes: Record<string, NodePosition> = {};
  Object.entries(rawNodes).forEach(([nodeId, rawPosition]) => {
    if (!rawPosition || typeof rawPosition !== 'object') return;
    const position = rawPosition as Record<string, unknown>;
    const x = Number(position.x);
    const y = Number(position.y);
    if (Number.isFinite(x) && Number.isFinite(y)) nodes[nodeId] = { x, y };
  });
  return {
    projectId,
    versionId: typeof payload.versionId === 'string' ? payload.versionId : null,
    revision: Math.max(0, Math.floor(numberSetting(payload.revision, 0))),
    nodes,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
  };
};

interface AppProps { session?: DemoSession; onLogout?: () => void; onOpenProfile?: () => void; }

export default function App({ session, onLogout, onOpenProfile }: AppProps) {
  const activeSession: DemoSession = session || { name: 'TwineRun User', email: '', initials: 'TR', authenticatedAt: '' };
  const [currentView, setCurrentView] = useState<ViewMode>(() => studioViewFromPath(window.location.pathname));
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [project, setProject] = useState<AgentProject | null>(null);
  const [activeRunId, setActiveRunId] = useState('');
  const [layout, setLayout] = useState<ProjectLayout>({ revision: 0, nodes: {} });
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
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [onboarding, setOnboarding] = useState<import('./types').ProjectSetupState | undefined>();
  const [creatingProject, setCreatingProject] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [baselineStatus, setBaselineStatus] = useState<string | undefined>();
  const [baselineRunId, setBaselineRunId] = useState<string | undefined>();
  const [evalDatasetId, setEvalDatasetId] = useState<string | undefined>();
  const streamRef = useRef<OptimizerStream | null>(null);
  const layoutRef = useRef(layout);
  const layoutTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    const applyProjects = async (list: AgentProject[]) => {
      // The collection endpoint intentionally returns lightweight summaries.
      // Hydrate the selected project before rendering Studio so graph nodes and
      // version state are available to the access/readiness gates.
      const preferredId = typeof window === 'undefined' ? '' : window.sessionStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || '';
      const first = list.find((item) => item.id === preferredId) || list[0];
      const detail = first ? await api.project(first.id).catch(() => first) : null;
      setProjects(list);
      setProject((current) => {
        if (current && list.some((item) => item.id === current.id)) {
          return current.id === detail?.id ? detail : current;
        }
        return detail;
      });
      const persistedRunId = detail && typeof window !== 'undefined' ? window.sessionStorage.getItem(activeRunStorageKey(detail.id)) || '' : '';
      setActiveRunId(persistedRunId || detail?.runId || '');
      setProjectsLoaded(true);
      setError('');
    };
    try {
      await applyProjects(await api.projects());
    } catch (cause) {
      // A local demo session can outlive its sessionStorage token (for example
      // after a browser restart). Re-bootstrap the short-lived test token once
      // so the studio does not surface a misleading "missing API key" error.
      if (DEMO_AUTH_ENABLED && cause instanceof ApiError && cause.status === 401) {
        try {
          const auth = await api.demoSignIn();
          if (auth.accessToken) {
            window.sessionStorage.setItem('twinerun.access-token', auth.accessToken);
            await applyProjects(await api.projects());
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
    let cancelled = false;
    const emptyLayout: ProjectLayout = { projectId: project.id, revision: 0, nodes: {} };
    layoutRef.current = emptyLayout;
    setLayout(emptyLayout);
    if (layoutTimerRef.current !== null) {
      window.clearTimeout(layoutTimerRef.current);
      layoutTimerRef.current = null;
    }
    void api.settings(project.id).then((rawSettings) => {
      if (cancelled) return;
      setProject((current) => current && current.id === project.id ? {
        ...current,
        qualityTolerancePct: numberSetting(rawSettings.qualityTolerancePct ?? rawSettings.qualityTolerancePp, current.qualityTolerancePct),
        confidencePct: numberSetting(rawSettings.confidencePct, current.confidencePct),
      } : current);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof ApiError ? cause.message : 'Unable to load project settings.');
    });
    void api.layout(project.id).then((rawLayout) => {
      if (cancelled) return;
      const loaded = layoutFromApi(rawLayout, project.id);
      layoutRef.current = loaded;
      setLayout(loaded);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof ApiError ? cause.message : 'Unable to load project layout.');
    });
    return () => {
      cancelled = true;
      if (layoutTimerRef.current !== null) {
        window.clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = null;
      }
    };
  }, [project?.id]);
  useEffect(() => {
    if (!project) return;
    const runId = activeRunId || project.runId;
    void api.onboarding(project.id).then(setOnboarding).catch(() => setOnboarding(project.setup));
    setSelectedNodeId(null);
    setCandidates([]); setEvalCases([]); setOptEvents([]); setSelectedCandidateId('');
    if (runId) {
      void api.candidates(runId).then(setCandidates).catch(() => undefined);
      void api.evalCases(runId).then(setEvalCases).catch(() => undefined);
    }
  }, [activeRunId, project?.id, project?.runId]);
  useEffect(() => { const handle = () => setCurrentView(studioViewFromPath(window.location.pathname)); window.addEventListener('popstate', handle); window.addEventListener('hashchange', handle); return () => { window.removeEventListener('popstate', handle); window.removeEventListener('hashchange', handle); }; }, []);
  useEffect(() => () => streamRef.current?.close(), []);

  const handleViewChange = (view: ViewMode) => { navigate(studioPath(view)); setCurrentView(view); };
  const handleSelectProject = async (projectId: string) => {
    try {
      const next = await api.project(projectId);
      window.sessionStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
      setProject(next);
      setActiveRunId(window.sessionStorage.getItem(activeRunStorageKey(next.id)) || next.runId || '');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Unable to load that project.'); }
  };
  const createProject = async (name: string, slug: string) => {
    setCreatingProject(true); setError('');
    try {
      const created = await api.createProject(name, slug);
      const next = await api.project(created.id).catch(() => created);
      setProjects((current) => [...current.filter((item) => item.id !== next.id), next]);
      setProject(next);
      window.sessionStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, next.id);
      window.sessionStorage.removeItem(activeRunStorageKey(next.id));
      setActiveRunId(next.runId || '');
      setShowCreateProject(false);
      setOnboarding(await api.onboarding(next.id).catch(() => next.setup));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create project.');
      throw cause;
    } finally { setCreatingProject(false); }
  };
  const createProjectKey = async () => project ? api.createProjectKey(project.id, 'twinerun-local') : null;
  const refreshOnboarding = async (projectId: string) => {
    const [detail, setup] = await Promise.all([api.project(projectId), api.onboarding(projectId)]);
    setProject(detail); setOnboarding(setup); setBaselineStatus(setup.baselineStatus);
    return setup;
  };
  const createVersion = async (input: Record<string, unknown>) => {
    if (!project) return;
    setError('');
    try { await api.createVersion(project.id, input); await refreshOnboarding(project.id); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Unable to save the agent version.'); throw cause; }
  };
  const importEvaluations = async (name: string, cases: Record<string, unknown>[], graders: Record<string, unknown>[]) => {
    if (!project) return;
    setError('');
    try {
      const result = await api.importEval(project.id, name, cases, graders);
      const datasetId = String(result.dataset_id || result.datasetId || '');
      if (datasetId) setEvalDatasetId(datasetId);
      await refreshOnboarding(project.id);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Unable to import evaluations.'); throw cause; }
  };
  const runBaseline = async () => {
    if (!project || baselineStatus === 'QUEUED' || baselineStatus === 'RUNNING') return;
    setError('');
    try {
      const result = await api.runBaseline(project.id, evalDatasetId);
      setBaselineRunId(result.runId); setBaselineStatus(result.status || 'QUEUED');
      setOnboarding((current) => current ? { ...current, baselineStatus: result.status || 'QUEUED', baselineRunId: result.runId, nextAction: 'RUN_BASELINE' } : current);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const statusPayload = await api.baseline(result.runId);
        const status = String(statusPayload.status || 'RUNNING').toUpperCase();
        setBaselineStatus(status);
        if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
          await refreshOnboarding(project.id); break;
        }
      }
    } catch (cause) { setBaselineStatus('FAILED'); setError(cause instanceof ApiError ? cause.message : 'Unable to start the baseline.'); }
  };
  const handleSelectModelOverride = (nodeId: string, modelName: string) => setProject((prev) => prev ? ({ ...prev, nodes: prev.nodes.map((node) => node.id === nodeId ? { ...node, currentModel: modelName } : node) }) : prev);

  const persistLayout = useCallback((positions: Record<string, NodePosition>) => {
    if (!project) return;
    const projectId = project.id;
    const nextLayout: ProjectLayout = { ...layoutRef.current, projectId, nodes: positions };
    layoutRef.current = nextLayout;
    if (layoutTimerRef.current !== null) window.clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = window.setTimeout(() => {
      layoutTimerRef.current = null;
      const snapshot = layoutRef.current;
      void api.updateLayout(projectId, { revision: snapshot.revision, nodes: snapshot.nodes }).then((rawLayout) => {
        const persisted = layoutFromApi(rawLayout, projectId);
        const current = layoutRef.current;
        const next = current === snapshot ? persisted : { ...persisted, nodes: current.nodes };
        layoutRef.current = next;
        setLayout(next);
      }).catch(async (cause) => {
        if (!(cause instanceof ApiError) || cause.status !== 409) {
          setError(cause instanceof ApiError ? cause.message : 'Graph layout could not be saved.');
          return;
        }
        try {
          const latest = layoutFromApi(await api.layout(projectId), projectId);
          layoutRef.current = latest;
          setLayout(latest);
          setError('Graph layout changed in another session; the latest saved layout was restored.');
        } catch {
          setError('Graph layout changed in another session and could not be refreshed.');
        }
      });
    }, 250);
  }, [project]);

  const startOptimization = async () => {
    if (!project || isOptimizing || !onboarding?.hasVersion || onboarding.baselineStatus !== 'COMPLETED') return;
    setError(''); setIsOptimizing(true); setIsOptModalOpen(true); setOptimizationStatus('QUEUED'); setOptEvents([]);
    try {
      const result = await api.startOptimization(project.id, { projectVersionId: project.version, qualityTolerancePp: project.qualityTolerancePct, confidencePct: project.confidencePct, objective: 'cost_quality', idempotencyKey: crypto.randomUUID() });
      window.sessionStorage.setItem(activeRunStorageKey(project.id), result.runId);
      setActiveRunId(result.runId);
      setOptimizationStatus(result.status); streamRef.current?.close();
      streamRef.current = subscribeToOptimization(result.runId, (event) => {
        setOptEvents((previous) => previous.some((item) => item.id === event.id) ? previous : [...previous, event]);
        if (event.nodeId) setActiveTestingNodeId(event.nodeId);
        if (event.type === 'TESTING' || event.type === 'PASS' || event.type === 'REJECT') setTestingStatus({ status: event.type === 'TESTING' ? 'TESTING' : event.type, nodeName: event.nodeName || event.nodeId || 'Node', fromModel: event.fromModel || '', toModel: event.toModel || '', costChange: event.costChangePct === undefined ? undefined : `${event.costChangePct.toFixed(1)}% cost`, qualityChange: event.qualityDeltaPp === undefined ? undefined : `${event.qualityDeltaPp >= 0 ? '+' : ''}${event.qualityDeltaPp.toFixed(1)}pp` });
      }, () => setError('Live optimizer events disconnected; polling will continue.'), (status) => {
        setOptimizationStatus(status); setIsOptimizing(false); setActiveTestingNodeId(null); setTestingStatus(null);
        void api.candidates(result.runId).then(setCandidates).catch(() => undefined); void api.project(project.id).then((updated) => { setProject(updated); setActiveRunId(result.runId); }).catch(() => undefined);
      });
    } catch (cause) {
      setIsOptimizing(false); setOptimizationStatus('FAILED');
      if (cause instanceof ApiError && cause.code === 'ENTITLEMENT_LIMIT_REACHED') setError('This workspace reached its plan limit. Upgrade your plan to continue optimizing.');
      else setError(cause instanceof ApiError ? cause.message : 'Unable to start optimization.');
    }
  };

  const selectCandidate = async (candidate: OptimizationCandidate) => {
    setSelectedCandidateId(candidate.id);
    if (!project || !activeRunId) return;
    try { const updated = await api.selectCandidate(activeRunId, candidate.id); if (updated) setProject(updated); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Candidate selection failed.'); }
  };
  const updateSettings = async (settings: Partial<AgentProject>) => {
    if (!project) return;
    setProject((prev) => prev ? { ...prev, ...settings } : prev);
    try {
      const persisted = await api.updateSettings(project.id, {
        qualityTolerancePct: settings.qualityTolerancePct,
        confidencePct: settings.confidencePct,
      });
      setProject((current) => current && current.id === project.id ? {
        ...current,
        qualityTolerancePct: numberSetting(persisted.qualityTolerancePct ?? persisted.qualityTolerancePp, current.qualityTolerancePct),
        confidencePct: numberSetting(persisted.confidencePct, current.confidencePct),
      } : current);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Settings could not be saved.'); }
  };
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId) || null;
  const progress = optimizationStatus === 'QUEUED' ? 8 : optimizationStatus === 'BASELINING' ? 25 : optimizationStatus === 'SEARCHING' ? 58 : optimizationStatus === 'VERIFYING' ? 84 : optimizationStatus === 'COMPLETED' ? 100 : 0;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setIsCommandPaletteOpen((open) => !open); } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); void startOptimization(); } };
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  });

  if (!project) {
    if (projectsLoaded) return <div className="studio-shell flex h-screen w-screen bg-[#050505] text-[#D6D9DC] overflow-hidden font-sans"><ProjectOnboarding busy={creatingProject} error={error} onCreateProject={createProject} onRefresh={() => void loadProjects()} /></div>;
    return <div className="studio-shell flex h-screen items-center justify-center bg-[#050505] text-[#D6D9DC] font-mono text-xs"><div className="space-y-3 text-center"><div>{error || "Loading persisted workspace…"}</div><button className="silver-btn-gradient rounded px-3 py-1 text-[#050505]" onClick={() => void loadProjects()}>Retry</button></div></div>;
  }
  if (showCreateProject) return <div className="studio-shell flex h-screen w-screen bg-[#050505] text-[#D6D9DC] overflow-hidden font-sans"><ProjectOnboarding busy={creatingProject} error={error} onCreateProject={createProject} onRefresh={() => { setShowCreateProject(false); void loadProjects(); }} /></div>;
  // A persisted graph is enough to enter the Studio. The baseline/evaluation
  // gate controls optimization, not access to graph and profiling views.
  // This also avoids a first-render onboarding flash while setup is loading.
  const hasStudioGraph = project.nodes.length > 0 && Boolean(project.version || onboarding?.hasVersion);
  const projectReady = Boolean(onboarding?.hasVersion && onboarding?.baselineStatus === "COMPLETED");
  if (!hasStudioGraph) return <div className="studio-shell flex h-screen w-screen bg-[#050505] text-[#D6D9DC] overflow-hidden font-sans"><ProjectOnboarding project={project} setup={onboarding || project.setup} error={error} onRefresh={() => { void loadProjects(); void api.onboarding(project.id).then(setOnboarding).catch(() => undefined); }} onCreateKey={createProjectKey} onCreateVersion={createVersion} onImportEvaluations={importEvaluations} onRunBaseline={runBaseline} baselineStatus={baselineStatus} baselineRunId={baselineRunId} /></div>;
  return <div className="studio-shell flex h-screen w-screen bg-[#050505] text-[#D6D9DC] overflow-hidden font-sans select-none relative">
    <NavigationRail session={activeSession} onLogout={onLogout || (() => {})} onOpenProfile={onOpenProfile || (() => {})} currentView={currentView} onViewChange={handleViewChange} onOpenIntegrations={() => setIsIntegrationsModalOpen(true)} onOpenSettings={() => { setIsSettingsModalOpen(false); handleViewChange('settings'); }} onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} isOptimizing={isOptimizing} />
    <div className="flex-1 flex flex-col h-full overflow-hidden"><TopBar project={project} allProjects={projects} onSelectProject={handleSelectProject} onCreateProject={() => setShowCreateProject(true)} currentView={currentView} onViewChange={handleViewChange} onRunOptimization={() => void startOptimization()} isOptimizing={isOptimizing} onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} onOpenExport={() => setIsExportModalOpen(true)} optimizationProgressPct={progress} canOptimize={projectReady} />
      {error && <div className="px-4 py-1.5 bg-[#241b1b] border-b border-white/[0.08] text-[10px] font-mono" role="alert">{error}</div>}
      <main className="flex-1 flex overflow-hidden relative">
        {currentView === 'graph' && <><ExecutionGraph project={project} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} isOptimizing={isOptimizing} onRunOptimization={() => void startOptimization()} activeTestingNodeId={activeTestingNodeId} testingStatus={testingStatus} layout={layout.nodes} layoutRevision={layout.revision} onLayoutChange={persistLayout} /><NodeInspector selectedNode={selectedNode} project={project} onClose={() => setSelectedNodeId(null)} onSelectModelOverride={handleSelectModelOverride} onRunOptimization={() => void startOptimization()} isOptimizing={isOptimizing} /></>}
        {currentView === 'frontier' && <OptimizationFrontier candidates={candidates} selectedCandidateId={selectedCandidateId} onSelectCandidate={(id) => setSelectedCandidateId(id)} onApplyCandidateToGraph={(candidate) => void selectCandidate(candidate)} project={project} />}
        {currentView === 'diff' && <BeforeAfterDiff project={project} onDeployOptimized={() => handleViewChange('frontier')} onOpenExport={() => setIsExportModalOpen(true)} />}
        {currentView === 'timeline' && <OptimizerTrace events={optEvents} project={project} />}
        {currentView === 'evals' && <EvalsView project={project} cases={evalCases} />}
        {currentView === 'settings' && <SettingsView project={project} onUpdateProjectSettings={updateSettings} />}
      </main>
    </div>
    <OptimizationModal isOpen={isOptModalOpen} isOptimizing={isOptimizing} events={optEvents} currentStepIndex={optEvents.length} totalSteps={Math.max(1, optEvents.length)} project={project} onClose={() => setIsOptModalOpen(false)} onApplyAndCompare={() => { setIsOptModalOpen(false); handleViewChange('diff'); }} onOpenFrontier={() => { setIsOptModalOpen(false); handleViewChange('frontier'); }} />
    <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} onViewChange={handleViewChange} onRunOptimization={() => void startOptimization()} onSelectProject={handleSelectProject} onCreateProject={() => setShowCreateProject(true)} onOpenExport={() => setIsExportModalOpen(true)} onOpenIntegrations={() => setIsIntegrationsModalOpen(true)} allProjects={projects} />
    <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} project={project} onExport={() => activeRunId ? api.exportRun(activeRunId) : Promise.resolve()} />
    <IntegrationsModal isOpen={isIntegrationsModalOpen} onClose={() => setIsIntegrationsModalOpen(false)} />
    <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} project={project} onUpdateProjectSettings={updateSettings} />
  </div>;
}
