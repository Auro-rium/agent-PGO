import { api } from "./api";
import {
  AgentProject, ApiCollection, BaselineRun, EvalRun, EvalRunCase, EvalSuite, JsonObject, OptimizationCandidate, OptimizationRecommendation, OptimizationRun, OptimizerEvent, ProfileRun, ProjectLayout, ProjectSettings, TraceDetail, TraceSpan,
} from "../types";

export interface CacheOptions {
  /** Reuse a successful value for this long. Zero means cache until invalidated. */
  ttlMs?: number;
  force?: boolean;
}

interface CacheEntry<T> {
  value?: T;
  promise?: Promise<T>;
  storedAt: number;
}

/** Small, dependency-free cache for browser data needed by the studio.
 * It deduplicates concurrent requests and never caches rejected promises. */
export class DataCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  peek<T>(key: string): T | undefined { return this.entries.get(key)?.value as T | undefined; }

  async load<T>(key: string, loader: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    const ttlMs = options.ttlMs ?? 0;
    const fresh = entry && entry.value !== undefined && (ttlMs === 0 || Date.now() - entry.storedAt < ttlMs);
    if (!options.force && fresh) return entry.value as T;
    if (!options.force && entry?.promise) return entry.promise;

    const promise = loader().then((value) => {
      this.entries.set(key, { value, storedAt: Date.now() });
      return value;
    }).catch((error) => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, { promise, storedAt: entry?.storedAt || 0 });
    return promise;
  }

  invalidate(key: string): void { this.entries.delete(key); }
  invalidatePrefix(prefix: string): void { for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key); }
  clear(): void { this.entries.clear(); }
}

export const dataCache = new DataCache();

const cached = <T>(key: string, loader: () => Promise<T>, options?: CacheOptions) => dataCache.load(key, loader, options);
const projectKey = (projectId: string) => encodeURIComponent(projectId);
const runKey = (runId: string) => encodeURIComponent(runId);

/** Typed read-through API used by studio views. Mutations invalidate only the
 * affected resources, so switching projects does not refetch unrelated data. */
export const cachedApi = {
  projects: (options?: CacheOptions): Promise<AgentProject[]> => cached("projects", api.projects, options),
  project: (projectId: string, options?: CacheOptions): Promise<AgentProject> => cached(`project:${projectKey(projectId)}`, () => api.project(projectId), options),
  onboarding: (projectId: string, options?: CacheOptions) => cached(`onboarding:${projectKey(projectId)}`, () => api.onboarding(projectId), options),
  profile: (profileId: string, options?: CacheOptions): Promise<ProfileRun> => cached(`profile:${runKey(profileId)}`, () => api.profile(profileId), options),
  traces: (projectId: string, params: { cursor?: string; limit?: number } = {}, options?: CacheOptions): Promise<ApiCollection<TraceSpan>> => cached(`traces:${projectKey(projectId)}:${params.cursor || ""}:${params.limit || ""}`, () => api.traces(projectId, params), options),
  trace: (projectId: string, traceId: string, options?: CacheOptions): Promise<TraceDetail> => cached(`trace:${projectKey(projectId)}:${runKey(traceId)}`, () => api.trace(projectId, traceId), options),
  evalSuites: (projectId: string, options?: CacheOptions): Promise<ApiCollection<EvalSuite>> => cached(`eval-suites:${projectKey(projectId)}`, () => api.evalSuites(projectId), options),
  evalSuite: (suiteId: string, options?: CacheOptions): Promise<EvalSuite> => cached(`eval-suite:${runKey(suiteId)}`, () => api.evalSuite(suiteId), options),
  evalRuns: (projectId: string, options?: CacheOptions): Promise<ApiCollection<EvalRun>> => cached(`eval-runs:${projectKey(projectId)}`, () => api.evalRuns(projectId), options),
  evalRun: (runId: string, options?: CacheOptions): Promise<EvalRun> => cached(`eval-run:${runKey(runId)}`, () => api.evalRun(runId), options),
  evalRunCases: (runId: string, limit = 100, options?: CacheOptions): Promise<ApiCollection<EvalRunCase>> => cached(`eval-run-cases:${runKey(runId)}:${limit}`, () => api.evalRunCases(runId, limit), options),
  baseline: (runId: string, options?: CacheOptions): Promise<BaselineRun> => cached(`baseline:${runKey(runId)}`, () => api.baseline(runId), options),
  optimizationRuns: (projectId: string, options?: CacheOptions): Promise<ApiCollection<OptimizationRun>> => cached(`optimization-runs:${projectKey(projectId)}`, () => api.optimizationRuns(projectId), options),
  optimizationRun: (runId: string, options?: CacheOptions): Promise<OptimizationRun> => cached(`optimization-run:${runKey(runId)}`, () => api.optimizationRun(runId), options),
  events: (runId: string, options?: CacheOptions): Promise<OptimizerEvent[]> => cached(`optimization-events:${runKey(runId)}`, () => api.optimizationEvents(runId), options),
  candidates: (runId: string, options?: CacheOptions): Promise<OptimizationCandidate[]> => cached(`optimization-candidates:${runKey(runId)}`, () => api.candidates(runId), options),
  recommendation: (runId: string, options?: CacheOptions): Promise<OptimizationRecommendation> => cached(`recommendation:${runKey(runId)}`, () => api.recommendation(runId), options),
  settings: (projectId: string, options?: CacheOptions): Promise<ProjectSettings> => cached(`settings:${projectKey(projectId)}`, () => api.settings(projectId), options),
  layout: (projectId: string, options?: CacheOptions): Promise<ProjectLayout> => cached(`layout:${projectKey(projectId)}`, () => api.layout(projectId), options),
  createProject: async (name: string, slug: string): Promise<AgentProject> => { const project = await api.createProject(name, slug); dataCache.invalidate("projects"); return project; },
  createEvalSuite: async (projectId: string, input: Parameters<typeof api.createEvalSuite>[1]): Promise<EvalSuite> => { const suite = await api.createEvalSuite(projectId, input); dataCache.invalidatePrefix(`eval-suites:${projectKey(projectId)}`); dataCache.invalidatePrefix(`onboarding:${projectKey(projectId)}`); return suite; },
  startProfile: async (projectId: string, input?: JsonObject): Promise<ProfileRun> => { const profile = await api.startProfile(projectId, input); dataCache.invalidatePrefix(`onboarding:${projectKey(projectId)}`); return profile; },
  startEvalRun: async (suiteId: string, input?: Parameters<typeof api.startEvalRun>[1]): Promise<EvalRun> => { const run = await api.startEvalRun(suiteId, input); dataCache.invalidatePrefix(`eval-runs:${projectKey(run.projectId)}`); return run; },
  runBaseline: async (projectId: string, datasetId?: string): Promise<BaselineRun> => { const run = await api.runBaseline(projectId, datasetId); dataCache.invalidatePrefix(`baseline:${runKey(run.runId)}`); dataCache.invalidatePrefix(`onboarding:${projectKey(projectId)}`); return run; },
  startOptimization: async (projectId: string, input: Record<string, unknown>): Promise<{ runId: string; status: string }> => { const run = await api.startOptimization(projectId, input); dataCache.invalidatePrefix(`optimization-runs:${projectKey(projectId)}`); return run; },
  updateSettings: async (projectId: string, input: Partial<ProjectSettings> | JsonObject): Promise<ProjectSettings> => { const settings = await api.updateSettings(projectId, input); dataCache.invalidate(`settings:${projectKey(projectId)}`); dataCache.invalidate(`project:${projectKey(projectId)}`); return settings; },
  updateLayout: async (projectId: string, input: Parameters<typeof api.updateLayout>[1]): Promise<ProjectLayout> => { const layout = await api.updateLayout(projectId, input); dataCache.invalidate(`layout:${projectKey(projectId)}`); return layout; },
  exportRun: (runId: string): Promise<Blob> => api.exportRun(runId),
};
