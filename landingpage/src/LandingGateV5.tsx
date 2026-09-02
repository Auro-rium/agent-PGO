import React, { useCallback, useEffect, useRef, useState } from 'react';
import App from './App';
import { AuthPage, ProfilePage } from './components/AuthPages';
import { AUTH_SESSION_EVENT, DemoSession, getDemoSession, clearDemoSession } from './auth/demoAuth';
import { VesperHomeFinal } from './components/VesperHomeFinal';
import { VesperSectionPage } from './components/VesperSectionPage';
import { navigate, routePath, safeReturnPath, useBrowserRoute } from './lib/router';
import { SystemOverview } from './components/SystemOverview';
import { api } from './lib/api';
import './vesper.css';
import './vesper-fix.css';
import './vesper-sections.css';
import './vesper-routes.css';

const NotFoundPage: React.FC<{ path: string; onHome: () => void }> = ({ path, onHome }) => (
  <main className="vesper-page flex min-h-screen items-center justify-center bg-[#050505] px-6 text-[#F2F3F4]">
    <section className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#0A0C0E] p-8 text-center font-mono">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#7D858C]">404 · route not found</p>
      <h1 className="mt-4 text-2xl font-medium">This path does not exist.</h1>
      <p className="mt-3 break-all text-xs text-[#8C949B]">{path}</p>
      <button className="silver-btn-gradient mt-7 rounded px-4 py-2 text-xs font-bold text-[#050505]" onClick={onHome}>Return home</button>
    </section>
  </main>
);

export default function LandingGateV5() {
  const route = useBrowserRoute();
  const [session, setSession] = useState<DemoSession | null>(() => getDemoSession());
  const [checkoutState, setCheckoutState] = useState<"idle" | "starting" | "error">("idle");
  const [checkoutError, setCheckoutError] = useState("");
  const checkoutAttempt = useRef("");

  useEffect(() => {
    const onAuthChange = () => setSession(getDemoSession());
    window.addEventListener(AUTH_SESSION_EVENT, onAuthChange);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, onAuthChange);
    };
  }, []);

  useEffect(() => {
    if ((route.kind === 'studio' || route.kind === 'profile' || route.kind === 'system') && !session) {
      navigate(`/signin?returnTo=${encodeURIComponent(routePath(route))}`, true);
    }
  }, [route, session]);

  const startCheckout = useCallback(async (referralCode?: string) => {
    if (!session) {
      const returnTo = `/pricing?checkout=pro${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ""}`;
      navigate(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setCheckoutState("starting"); setCheckoutError("");
    const storageKey = "twinerun.checkout.idempotency";
    const idempotencyKey = window.sessionStorage.getItem(storageKey) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    window.sessionStorage.setItem(storageKey, idempotencyKey);
    try {
      const result = await api.checkout("pro", referralCode, idempotencyKey);
      if (!result.checkoutUrl) throw new Error("Checkout URL was not returned by the billing service.");
      window.sessionStorage.setItem("twinerun.checkout.pending", JSON.stringify({ checkoutSessionId: result.checkoutSessionId, idempotencyKey, startedAt: new Date().toISOString() }));
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setCheckoutState("error");
      setCheckoutError(cause instanceof Error ? cause.message : "Checkout could not be started.");
    }
  }, [session]);
  const launchStudio = () => navigate(session ? '/studio' : '/signin?returnTo=%2Fstudio');
  useEffect(() => {
    if (route.kind !== "section" || route.section !== "pricing" || route.checkout !== "pro" || !session) return;
    const attemptKey = `${session.email}:${routePath(route)}`;
    if (checkoutAttempt.current === attemptKey) return;
    checkoutAttempt.current = attemptKey;
    void startCheckout(route.referralCode);
  }, [route, session, startCheckout]);

  const handleAuthenticated = (nextSession: DemoSession) => {
    setSession(nextSession);
    navigate(route.kind === 'auth' ? safeReturnPath(route.returnTo) : '/studio', true);
  };
  const logout = async () => {
    try { await api.logout(); } catch { /* revocation may already have occurred */ }
    clearDemoSession();
    window.sessionStorage.removeItem('twinerun.access-token');
    setSession(null);
    navigate('/signin', true);
  };

  if (route.kind === 'auth') return <AuthPage mode={route.mode} onAuthenticated={handleAuthenticated} />;
  if (route.kind === 'profile') return session ? <ProfilePage session={session} onLogout={logout} onOpenStudio={() => navigate('/studio')} /> : null;
  if (route.kind === 'system') return session ? <SystemOverview /> : null;
  if (route.kind === 'studio') return session ? <App session={session} onLogout={logout} onOpenProfile={() => navigate('/profile')} /> : null;
  if (route.kind === 'not-found') return <NotFoundPage path={route.path} onHome={() => navigate('/')} />;
  if (route.kind === 'home') return <VesperHomeFinal onLaunchStudio={launchStudio} />;
  return <VesperSectionPage route={route.section} onLaunchStudio={launchStudio} session={session || undefined} onStartCheckout={(referralCode) => void startCheckout(referralCode)} checkoutState={checkoutState} checkoutError={checkoutError} />;
}
