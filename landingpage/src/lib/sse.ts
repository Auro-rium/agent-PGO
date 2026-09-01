import { OptimizerEvent } from "../types";
import { API_BASE_URL, DEMO_ACCESS_TOKEN } from "./api";
import { adaptOptimizerEvent } from "./adapters";

export interface OptimizerStream {
  close: () => void;
}

export function subscribeToOptimization(runId: string, onEvent: (event: OptimizerEvent) => void, onError: () => void, onTerminal: (status: string) => void): OptimizerStream {
  const seen = new Set<string>();
  let source: EventSource | null = null;
  let pollTimer: number | null = null;
  let closed = false;
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
    try {
      const headers: HeadersInit = { Accept: "application/json" };
      const token = typeof window !== "undefined" ? window.sessionStorage.getItem("twinerun.access-token") || DEMO_ACCESS_TOKEN : DEMO_ACCESS_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/optimization-runs/${encodeURIComponent(runId)}/events`, { headers });
      if (!response.ok) throw new Error("event polling failed");
      const payload = await response.json() as { events?: unknown[]; status?: string } | unknown[];
      const events = Array.isArray(payload) ? payload : payload.events || [];
      events.forEach((item) => emit(item));
      const status = Array.isArray(payload) ? undefined : payload.status;
      if (status && terminal.has(status)) { onTerminal(status); return; }
    } catch { onError(); }
    if (!closed) pollTimer = window.setTimeout(poll, 2000);
  };
  if (typeof EventSource !== "undefined" && !DEMO_ACCESS_TOKEN) {
    source = new EventSource(`${API_BASE_URL}/optimization-runs/${encodeURIComponent(runId)}/events/stream`, { withCredentials: true });
    source.onmessage = (message) => { try { emit(JSON.parse(message.data), message.lastEventId); } catch { onError(); } };
    source.onerror = () => { source?.close(); source = null; onError(); void poll(); };
  } else {
    void poll();
  }
  return { close: () => { closed = true; source?.close(); if (pollTimer !== null) window.clearTimeout(pollTimer); } };
}
