import { useEffect, useState } from "react";
import { ViewMode } from "../types";
import { VesperRoute } from "../components/VesperSectionPage";

export type BrowserRoute =
  | { kind: "home" }
  | { kind: "section"; section: VesperRoute; checkout?: string; referralCode?: string }
  | { kind: "auth"; mode: "signin" | "signup"; returnTo?: string; referralCode?: string }
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
  // Older builds used hash links (for example #pricing?checkout=pro). Keep
  // their query string intact while normalizing the path to the current
  // history-based router. Hash values may include an optional leading slash.
  const raw = hash.replace(/^#/, "");
  if (!raw || raw === "top" || raw === "/top") return "/";
  const queryStart = raw.indexOf("?");
  const rawPath = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const rawSearch = queryStart === -1 ? "" : raw.slice(queryStart + 1);
  const value = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!value) return "/";
  let normalized: string;
  if (value === "studio") normalized = "/studio";
  else if (value.startsWith("studio/")) normalized = `/studio/${value.slice("studio/".length)}`;
  else if (sections.has(value as VesperRoute) || value === "signin" || value === "signup" || value === "profile") normalized = `/${value}`;
  else return null;
  return rawSearch ? `${normalized}?${rawSearch}` : normalized;
};

export interface ParsedLocation { route: BrowserRoute; legacyPath?: string; }

const isSafeInternalPath = (value: string | undefined): value is string => {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, "https://twinerun.invalid");
    return parsed.origin === "https://twinerun.invalid";
  } catch {
    return false;
  }
};

export const parsePath = (pathname: string, search = ""): BrowserRoute => {
  const path = cleanPath(pathname);
  if (path === "/") return { kind: "home" };
  if (sections.has(path.slice(1) as VesperRoute) && path.split("/").length === 2) {
    const params = new URLSearchParams(search);
    return { kind: "section", section: path.slice(1) as VesperRoute, checkout: params.get("checkout") || undefined, referralCode: params.get("ref") || undefined };
  }
  if (path === "/signin" || path === "/signup") {
    const params = new URLSearchParams(search);
    const candidateReturnTo = params.get("returnTo") || undefined;
    const returnTo = isSafeInternalPath(candidateReturnTo) ? candidateReturnTo : undefined;
    const referralCode = params.get("ref") || undefined;
    return { kind: "auth", mode: path.slice(1) as "signin" | "signup", returnTo, referralCode };
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
  // An empty hash is the normal state for real browser paths. Only interpret
  // an explicitly supplied legacy hash; otherwise `/signin`, `/studio`, and
  // section URLs were incorrectly reset to `/` on every page load.
  const legacyEntry = cleanPath(location.pathname) === "/";
  const legacyPath = legacyEntry && location.hash ? legacyHashPath(location.hash) : null;
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
    case "section": {
      const params = new URLSearchParams();
      if (route.checkout) params.set("checkout", route.checkout);
      if (route.referralCode) params.set("ref", route.referralCode);
      const query = params.toString();
      return `/${route.section}${query ? `?${query}` : ""}`;
    }
    case "auth": {
      const params = new URLSearchParams();
      if (route.returnTo) params.set("returnTo", route.returnTo);
      if (route.referralCode) params.set("ref", route.referralCode);
      const query = params.toString();
      return `/${route.mode}${query ? `?${query}` : ""}`;
    }
    case "profile": return "/profile";
    case "system": return "/system";
    case "studio": return studioPath(route.view);
    case "not-found": return route.path;
  }
};

export const safeReturnPath = (value: string | undefined): string => {
  return isSafeInternalPath(value) ? value : "/studio";
};
