import { AgentProject, EvalCase, OptimizationCandidate, OptimizerEvent, ProjectSetupState } from "../types";
import { adaptEvalCase, adaptProject, adaptCandidate, adaptOptimizerEvent, adaptOnboarding } from "./adapters";

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const defaultApiBase = ["/api", "v1"].join("/");
export const API_BASE_URL = (configuredBase || defaultApiBase).replace(/\/$/, "");
export const DEMO_ACCESS_TOKEN = (import.meta.env.VITE_DEMO_ACCESS_TOKEN as string | undefined)?.trim() || "";
// Explicitly opt-in test-only bootstrap. Real sessions must not silently
// become a demo identity when a browser reloads or opens a new tab.
export const DEMO_AUTH_ENABLED = (import.meta.env.VITE_DEMO_AUTH_ENABLED as string | undefined)?.trim().toLowerCase() === "true";

export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;
  fields: Record<string, string>;

  constructor(status: number, message: string, code = "REQUEST_FAILED", requestId?: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.fields = fields;
  }
}

type RequestOptions = RequestInit & { skipAuth?: boolean };

const unwrap = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "data" in payload) return (payload as { data: T }).data;
  return payload as T;
};

const token = () => typeof window === "undefined" ? "" : window.sessionStorage.getItem("twinerun.access-token") || "";

let demoTokenRequest: Promise<string | null> | null = null;

const storeToken = (accessToken: string) => {
  if (typeof window !== "undefined") window.sessionStorage.setItem("twinerun.access-token", accessToken);
};

const clearRuntimeToken = () => {
  if (typeof window !== "undefined") window.sessionStorage.removeItem("twinerun.access-token");
};

/** Restore a short-lived test token when a localStorage demo session survives
 * a refresh or opens in a new tab. This path is never enabled by default. */
const ensureDemoAccessToken = async (): Promise<string | null> => {
  const existing = token();
  if (existing || !DEMO_AUTH_ENABLED) return existing || null;
  if (!demoTokenRequest) {
    demoTokenRequest = request<{ accessToken?: string }>("/auth/demo", { method: "POST", body: "{}", skipAuth: true })
      .then((auth) => {
        const accessToken = typeof auth.accessToken === "string" ? auth.accessToken.trim() : "";
        if (accessToken) storeToken(accessToken);
        return accessToken || null;
      })
      .catch(() => null)
      .finally(() => { demoTokenRequest = null; });
  }
  return demoTokenRequest;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let accessToken = token();
  const canBootstrap = DEMO_AUTH_ENABLED && !options.skipAuth && !path.startsWith("/auth/");
  if (!accessToken && canBootstrap) accessToken = await ensureDemoAccessToken();
  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (accessToken && !options.skipAuth) headers.set("Authorization", `Bearer ${accessToken}`);
    const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    headers.set("X-Request-ID", requestId);
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    if (response.status !== 401 || !canBootstrap || attempt > 0 || !accessToken || DEMO_ACCESS_TOKEN) break;
    clearRuntimeToken();
    accessToken = await ensureDemoAccessToken();
    if (!accessToken) break;
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? (payload as { error: Record<string, unknown> }).error : payload;
    const details = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
    throw new ApiError(response.status, String(details.message || (typeof payload === "string" ? payload : "Request failed.")), String(details.code || "REQUEST_FAILED"), String(details.requestId || response.headers.get("x-request-id") || ""), (details.fields as Record<string, string>) || {});
  }
  return unwrap<T>(payload);
}

const json = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });

export const api = {
  async demoSignIn(): Promise<{ accessToken: string; tokenType: string; expiresIn: number }> {
    const auth = await request<{ accessToken: string; tokenType: string; expiresIn: number }>("/auth/demo", { ...json({}), skipAuth: true });
    if (auth.accessToken) storeToken(auth.accessToken);
    return auth;
  },
  async me(): Promise<Record<string, unknown>> { return request<Record<string, unknown>>("/me"); },
  async signIn(email: string, password: string): Promise<Record<string, unknown>> { return request("/auth/signin", json({ email, password })); },
  async signUp(name: string, email: string, password: string): Promise<Record<string, unknown>> { return request("/auth/signup", json({ name, email, password })); },
  async logout(): Promise<void> { await request("/auth/logout", { method: "POST" }); },
  async projects(): Promise<AgentProject[]> {
    const payload = await request<unknown>("/projects");
    const list = Array.isArray(payload) ? payload : ((payload as { projects?: unknown[] } | null)?.projects || []);
    return list.map((item) => adaptProject(item));
  },
  async createProject(name: string, slug: string): Promise<AgentProject> { return adaptProject(await request("/projects", json({ name, slug }))); },
  async onboarding(projectId: string): Promise<ProjectSetupState> { return adaptOnboarding(await request(`/projects/${encodeURIComponent(projectId)}/onboarding`)); },
  async createVersion(projectId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> { return request(`/projects/${encodeURIComponent(projectId)}/versions`, json(input)); },
  async createProjectKey(projectId: string, name = "twinerun-local"): Promise<{ secret: string; name: string; id?: string }> { return request(`/projects/${encodeURIComponent(projectId)}/api-keys`, json({ name })); },
  async project(projectId: string): Promise<AgentProject> { return adaptProject(await request(`/projects/${encodeURIComponent(projectId)}`)); },
  async startOptimization(projectId: string, input: Record<string, unknown>): Promise<{ runId: string; status: string }> {
    const payload = await request<Record<string, unknown>>(`/projects/${encodeURIComponent(projectId)}/optimization-runs`, json(input));
    return { runId: String(payload.runId || payload.run_id || payload.id), status: String(payload.status || "QUEUED") };
  },
  async optimizationEvents(runId: string): Promise<OptimizerEvent[]> {
    const payload = await request<unknown>(`/optimization-runs/${encodeURIComponent(runId)}/events`);
    const list = Array.isArray(payload) ? payload : ((payload as { events?: unknown[] } | null)?.events || []);
    return list.map((item) => adaptOptimizerEvent(item));
  },
  async candidates(runId: string): Promise<OptimizationCandidate[]> {
    const payload = await request<unknown>(`/optimization-runs/${encodeURIComponent(runId)}/candidates`);
    const list = Array.isArray(payload) ? payload : ((payload as { candidates?: unknown[] } | null)?.candidates || []);
    return list.map((item) => adaptCandidate(item));
  },
  async selectCandidate(runId: string, candidateId: string): Promise<AgentProject | null> {
    const payload = await request<unknown>(`/optimization-runs/${encodeURIComponent(runId)}/select`, json({ candidateId }));
    return payload ? adaptProject(payload) : null;
  },
  async evalCases(runId: string): Promise<EvalCase[]> {
    const payload = await request<unknown>(`/eval-runs/${encodeURIComponent(runId)}/cases`);
    const list = Array.isArray(payload) ? payload : ((payload as { cases?: unknown[] } | null)?.cases || []);
    return list.map((item) => adaptEvalCase(item));
  },
  async settings(projectId: string): Promise<Record<string, unknown>> { return request(`/projects/${encodeURIComponent(projectId)}/settings`); },
  async updateSettings(projectId: string, settings: Record<string, unknown>): Promise<Record<string, unknown>> { return request(`/projects/${encodeURIComponent(projectId)}/settings`, jsonPath("", settings, "PATCH")); },
  async layout(projectId: string): Promise<Record<string, unknown>> { return request(`/projects/${encodeURIComponent(projectId)}/layout`); },
  async updateLayout(projectId: string, layout: Record<string, unknown>): Promise<Record<string, unknown>> { return request(`/projects/${encodeURIComponent(projectId)}/layout`, json(layout)); },
  async exportRun(runId: string): Promise<Blob> {
    const headers = new Headers({ Accept: "application/yaml, application/json" });
    const accessToken = token();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const response = await fetch(`${API_BASE_URL}/optimization-runs/${encodeURIComponent(runId)}/export`, { headers });
    if (!response.ok) throw new ApiError(response.status, "Export is not available for this run.");
    return response.blob();
  },
};

function jsonPath(path: string, value: unknown, method = "POST"): RequestOptions {
  return { ...json(value), method, ...(path ? {} : {}) };
}
