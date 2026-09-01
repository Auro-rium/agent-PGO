import { AgentProject, EvalCase, OptimizationCandidate, OptimizerEvent } from "../types";
import { adaptEvalCase, adaptProject, adaptCandidate, adaptOptimizerEvent } from "./adapters";

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
export const API_BASE_URL = (configuredBase || "/api/v1").replace(/\/$/, "");
export const DEMO_ACCESS_TOKEN = (import.meta.env.VITE_DEMO_ACCESS_TOKEN as string | undefined)?.trim() || "";

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

const token = () => {
  if (typeof window === "undefined") return DEMO_ACCESS_TOKEN;
  return window.sessionStorage.getItem("twinerun.access-token") || DEMO_ACCESS_TOKEN;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const accessToken = token();
  if (accessToken && !options.skipAuth) headers.set("Authorization", `Bearer ${accessToken}`);
  const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  headers.set("X-Request-ID", requestId);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
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
    return request("/auth/demo", json({}));
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
