import { OptimizerEvent } from "../types";
import { API_BASE_URL, DEMO_ACCESS_TOKEN } from "./api";
import { adaptOptimizerEvent } from "./adapters";

export interface OptimizerStream {
  close: () => void;
}

export function subscribeToOptimization(runId: string, onEvent: (event: OptimizerEvent) => void, onError: () => void, onTerminal: (status: string) => void): OptimizerStream {
  const seen = new Set<string>();
  let pollTimer: number | null = null;
  let closed = false;
  let inFlightController: AbortController | null = null;
  let lastEventId = "";
  const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "PARTIAL"]);
  const emit = (raw: unknown, id?: string) => {
    const event = adaptOptimizerEvent(raw);
    const eventId = id || event.id;
    if (seen.has(eventId) || closed) return;
    seen.add(eventId);
    lastEventId = eventId;
    onEvent({ ...event, id: eventId });
  };
  const poll = async () => {
    if (closed) return;
    const controller = new AbortController();
    inFlightController = controller;
    try {
      const headers: HeadersInit = { Accept: "application/json" };
      const token = typeof window !== "undefined" ? window.sessionStorage.getItem("twinerun.access-token") || DEMO_ACCESS_TOKEN : DEMO_ACCESS_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/optimization-runs/${encodeURIComponent(runId)}/events`, { headers, signal: controller.signal });
      if (!response.ok) throw new Error("event polling failed");
      const payload = await response.json() as { events?: unknown[]; status?: string } | unknown[];
      const events = Array.isArray(payload) ? payload : payload.events || [];
      events.forEach((item) => emit(item));
      const status = Array.isArray(payload) ? undefined : payload.status;
      if (!closed && status && terminal.has(status)) { onTerminal(status); return; }
    } catch {
      // Closing a stream aborts its current request. That is an intentional
      // lifecycle event, not a transport error for the consumer to render.
      if (!closed) onError();
    } finally {
      if (inFlightController === controller) inFlightController = null;
    }
    if (!closed) pollTimer = window.setTimeout(poll, 2000);
  };
  // The backend accepts bearer auth. Native EventSource cannot attach an
  // Authorization header, so authenticated polling is the reliable browser
  // transport until cookie-authenticated SSE is enabled.
  void poll();
  return {
    close: () => {
      if (closed) return;
      closed = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
      inFlightController?.abort();
      inFlightController = null;
    },
  };
}
