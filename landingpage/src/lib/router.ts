import { useEffect, useState } from "react";
import { ViewMode } from "../types";
import { VesperRoute } from "../components/VesperSectionPage";

export type BrowserRoute =
  | { kind: "home" }
  | { kind: "section"; section: VesperRoute }
  | { kind: "auth"; mode: "signin" | "signup"; returnTo?: string }
  | { kind: "profile" }
  | { kind: "system" }
  | { kind: "studio"; view: ViewMode }
  | { kind: "not-found"; path: string };

const sections = new Set<VesperRoute>(["benefits", "how-it-works", "benchmarks", "faqs", "pricing"]);
const studioViews = new Set<ViewMode>(["graph", "frontier", "timeline", "diff", "evals", "settings"]);

const cleanPath = (pathname: string): string => {
  const value = pathname.replace(/\/index\.html$/, "").replace(/\/+/g, "/");
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
};

export const studioPath = (view: ViewMode = "graph"): string => view === "graph" ? "/studio" : `/studio/${view}`;

export const studioViewFromPath = (pathname: string): ViewMode => {
  const path = cleanPath(pathname);
  if (path === "/studio") return "graph";
  const value = path.slice("/studio/".length) as ViewMode;
  return studioViews.has(value) ? value : "graph";
};

const legacyHashPath = (hash: string): string | null => {
  const value = hash.replace(/^#/, "").replace(/\/$/, "");
  if (!value || value === "top") return "/";
  if (value === "studio") return "/studio";
  if (value.startsWith("studio/")) return `/studio/${value.slice("studio/".length)}`;
  if (sections.has(value as VesperRoute) || value === "signin" || value === "signup" || value === "profile") return `/${value}`;
  return null;
};

export interface ParsedLocation { route: BrowserRoute; legacyPath?: string; }

export const parsePath = (pathname: string, search = ""): BrowserRoute => {
  const path = cleanPath(pathname);
  if (path === "/") return { kind: "home" };
  if (sections.has(path.slice(1) as VesperRoute) && path.split("/").length === 2) return { kind: "section", section: path.slice(1) as VesperRoute };
  if (path === "/signin" || path === "/signup") {
    const params = new URLSearchParams(search);
    const returnTo = params.get("returnTo") || undefined;
    return { kind: "auth", mode: path.slice(1) as "signin" | "signup", returnTo: returnTo?.startsWith("/") ? returnTo : undefined };
  }
  if (path === "/profile") return { kind: "profile" };
  if (path === "/system") return { kind: "system" };
  if (path === "/studio" || path === "/studio/graph") return { kind: "studio", view: "graph" };
  if (path.startsWith("/studio/")) {
    const view = path.slice("/studio/".length) as ViewMode;
    if (studioViews.has(view)) return { kind: "studio", view };
  }
  return { kind: "not-found", path };
};

export const parseBrowserLocation = (location: Pick<Location, "pathname" | "search" | "hash"> = window.location): ParsedLocation => {
  const legacyPath = legacyHashPath(location.hash);
  return legacyPath ? { route: parsePath(legacyPath), legacyPath } : { route: parsePath(location.pathname, location.search) };
};

export const navigate = (path: string, replace = false): void => {
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export const useBrowserRoute = (): BrowserRoute => {
  const [route, setRoute] = useState<BrowserRoute>(() => parseBrowserLocation().route);
  useEffect(() => {
    const sync = () => {
      const parsed = parseBrowserLocation();
      if (parsed.legacyPath) {
        window.history.replaceState({}, "", parsed.legacyPath);
        setRoute(parsePath(parsed.legacyPath));
      } else setRoute(parsed.route);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    sync();
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, []);
  return route;
};

export const routePath = (route: BrowserRoute): string => {
  switch (route.kind) {
    case "home": return "/";
    case "section": return `/${route.section}`;
    case "auth": return `/${route.mode}${route.returnTo ? `?returnTo=${encodeURIComponent(route.returnTo)}` : ""}`;
    case "profile": return "/profile";
    case "system": return "/system";
    case "studio": return studioPath(route.view);
    case "not-found": return route.path;
  }
};

export const safeReturnPath = (value: string | undefined): string => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/studio";
  return value;
};
