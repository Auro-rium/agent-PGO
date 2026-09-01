export interface DemoSession {
  name: string;
  email: string;
  initials: string;
  authenticatedAt: string;
}

export const DEMO_SESSION_KEY = "twinerun.demo.session";
export const AUTH_SESSION_EVENT = "twinerun:auth-change";

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const readStoredSession = (): DemoSession | null => {
  try {
    const value = window.localStorage.getItem(DEMO_SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<DemoSession>;
    if (typeof session.name !== "string" || typeof session.email !== "string") return null;
    return {
      name: session.name,
      email: session.email,
      initials: typeof session.initials === "string" && session.initials ? session.initials : initialsFor(session.name),
      authenticatedAt: typeof session.authenticatedAt === "string" ? session.authenticatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const getDemoSession = (): DemoSession | null => {
  if (typeof window === "undefined") return null;
  return readStoredSession();
};

export const createDemoSession = (name: string, email: string): DemoSession => ({
  name: name.trim(),
  email: email.trim().toLowerCase(),
  initials: initialsFor(name),
  authenticatedAt: new Date().toISOString(),
});

export const setDemoSession = (session: DemoSession) => {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: session }));
};

export const clearDemoSession = () => {
  window.localStorage.removeItem(DEMO_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: null }));
};

export const nameFromEmail = (email: string) => {
  const localPart = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!localPart) return "TwineRun User";
  return localPart.replace(/\b\w/g, (letter) => letter.toUpperCase());
};
