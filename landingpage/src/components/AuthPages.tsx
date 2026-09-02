import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Mail, UserRound } from "lucide-react";
import { createDemoSession, DemoSession, nameFromEmail, setDemoSession } from "../auth/demoAuth";
import { api, ApiError, DEMO_AUTH_ENABLED } from "../lib/api";
import { navigate } from "../lib/router";

interface AuthPageProps {
  mode: "signin" | "signup";
  onAuthenticated: (session: DemoSession) => void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onAuthenticated }) => {
  const isSignUp = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const referralCode = (() => {
    const value = new URLSearchParams(window.location.search).get("ref")?.trim() || "";
    return /^[A-Za-z0-9_-]{4,80}$/.test(value) ? value : "";
  })();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, [mode]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (isSignUp && !name.trim()) {
      setError("Enter your name to create a profile.");
      return;
    }
    if (!emailPattern.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    // Yield once for button feedback, then authenticate against the backend.
    transitionTimer.current = window.setTimeout(async () => {
      try {
        const auth = isSignUp ? await api.signUp(name.trim(), cleanEmail, password, referralCode || undefined) : await api.signIn(cleanEmail, password);
        const user = (auth.user && typeof auth.user === "object" ? auth.user : {}) as Record<string, unknown>;
        const authenticatedName = typeof user.name === "string" ? user.name : (isSignUp ? name.trim() : nameFromEmail(cleanEmail));
        const authenticatedEmail = typeof user.email === "string" ? user.email : cleanEmail;
        const session = createDemoSession(authenticatedName, authenticatedEmail);
        setDemoSession(session);
        onAuthenticated(session);
      } catch (cause) {
        // Demo auth is an explicit development fallback only. Production-like
        // auth errors are shown to the user and never silently become a local
        // identity.
        if (DEMO_AUTH_ENABLED && cause instanceof ApiError && [404, 503].includes(cause.status)) {
          try {
            const auth = await api.demoSignIn();
            if (auth.accessToken) {
              const session = createDemoSession(isSignUp ? name : nameFromEmail(cleanEmail), cleanEmail);
              setDemoSession(session);
              onAuthenticated(session);
              transitionTimer.current = null;
              return;
            }
          } catch { /* fall through to the original backend error */ }
        }
        setError(cause instanceof ApiError ? cause.message : "Unable to reach the authentication service.");
        setIsSubmitting(false);
      }
      transitionTimer.current = null;
    }, 80);
  };

  return (
    <div className="vesper-page auth-page">
      <div className="vesper-grain" aria-hidden="true" />
      <div className="vesper-photo" aria-hidden="true" />
      <header className="auth-header">
        <a href="/" className="auth-wordmark" aria-label="TwineRun home">TwineRun<span>.ai</span></a>
        <a href="/" className="auth-back-link"><ArrowLeft size={14} /> Back home</a>
      </header>
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-kicker">TWINERUN · SECURE WORKSPACE</div>
          <h1 id="auth-title">{isSignUp ? "Create your workspace." : "Welcome back."}</h1>
          <p className="auth-intro">
            {isSignUp ? "Start profiling where your agent is spending intelligence." : "Continue optimizing your agent with a measured execution plan."}
          </p>
          <form className="auth-form" onSubmit={submit} noValidate>
            {isSignUp && (
              <label className="auth-field">
                <span>Name</span>
                <span className="auth-input-wrap"><UserRound size={16} aria-hidden="true" /><input ref={firstField} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Ada Lovelace" /></span>
              </label>
            )}
            <label className="auth-field">
              <span>Email</span>
              <span className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><input ref={isSignUp ? undefined : firstField} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@company.com" /></span>
            </label>
            <label className="auth-field">
              <span>Password</span>
              <span className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="••••••••" /></span>
            </label>
            {isSignUp && (
              <label className="auth-field">
                <span>Confirm password</span>
                <span className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" /></span>
              </label>
            )}
            {isSignUp && referralCode && <p className="auth-referral-note">Referral code <strong>{referralCode}</strong> will be attached to your signup.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="vesper-btn vesper-btn--solid auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Opening workspace…" : isSignUp ? "Create workspace" : "Sign in"}
              {!isSubmitting && <ArrowRight size={15} />}
            </button>
          </form>
          <p className="auth-switch">
            {isSignUp ? "Already have a workspace?" : "New to TwineRun?"}{" "}
            <a href={isSignUp ? "/signin" : "/signup"}>{isSignUp ? "Sign in" : "Create an account"}</a>
          </p>
          <p className="auth-trust"><Check size={14} /> Server-authenticated workspace · production agents remain untouched</p>
        </section>
      </main>
    </div>
  );
};

interface ProfilePageProps {
  session: DemoSession;
  onLogout: () => void | Promise<void>;
  onOpenStudio: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ session, onLogout, onOpenStudio }) => {
  const [identity, setIdentity] = useState(session);
  const [entitlements, setEntitlements] = useState<import("../types").EntitlementState | null>(null);
  const [referrals, setReferrals] = useState<import("../types").ReferralSummary | null>(null);
  const [accountError, setAccountError] = useState("");
  const [copyState, setCopyState] = useState("Copy link");
  const [codeBusy, setCodeBusy] = useState(false);
  const pendingCheckout = typeof window !== "undefined" ? window.sessionStorage.getItem("twinerun.checkout.pending") : null;

  useEffect(() => {
    let active = true;
    void api.me().then((payload) => {
      const user = payload.user && typeof payload.user === "object" ? payload.user as Record<string, unknown> : payload;
      if (active && typeof user.name === "string" && typeof user.email === "string") setIdentity(createDemoSession(user.name, user.email));
    }).catch(() => undefined);
    void Promise.allSettled([api.entitlements(), api.referrals()]).then(([entitlementResult, referralResult]) => {
      if (!active) return;
      if (entitlementResult.status === "fulfilled") {
        setEntitlements(entitlementResult.value);
        const confirmedPlan = String(entitlementResult.value.plan || "").toLowerCase();
        if (confirmedPlan === "pro" || confirmedPlan === "team") window.sessionStorage.removeItem("twinerun.checkout.pending");
      }
      if (referralResult.status === "fulfilled") setReferrals(referralResult.value);
      if (entitlementResult.status === "rejected" && referralResult.status === "rejected") setAccountError("Account details are not available yet. Refresh after your workspace is ready.");
    });
    return () => { active = false; };
  }, [session.email, session.name]);

  const referralCode = referrals?.referralCode || entitlements?.referralCode || "";
  const referralLink = referrals?.referralLink || (referralCode ? `${window.location.origin}/signup?ref=${encodeURIComponent(referralCode)}` : "");
  const plan = entitlements?.plan || "unavailable";
  const planStatus = entitlements?.planStatus || "not loaded";
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";

  const generateCode = async () => {
    setCodeBusy(true); setAccountError("");
    try { setReferrals(await api.generateReferralCode()); }
    catch (cause) { setAccountError(cause instanceof ApiError ? cause.message : "Referral code could not be generated."); }
    finally { setCodeBusy(false); }
  };
  const copyReferralLink = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); setCopyState("Copied"); window.setTimeout(() => setCopyState("Copy link"), 1600); }
    catch { setCopyState("Copy failed"); }
  };
  const manageBilling = async () => {
    try { const result = await api.billingPortal(); const url = result.url || result.portalUrl; if (url) window.location.assign(url); }
    catch (cause) { setAccountError(cause instanceof ApiError ? cause.message : "Billing management is not available yet."); }
  };

  return <div className="vesper-page auth-page profile-page">
    <div className="vesper-grain" aria-hidden="true" />
    <div className="vesper-photo" aria-hidden="true" />
    <header className="auth-header">
      <a href="/" className="auth-wordmark" aria-label="TwineRun home">TwineRun<span>.ai</span></a>
      <a href="/studio" className="auth-back-link" onClick={onOpenStudio}><ArrowLeft size={14} /> Back to studio</a>
    </header>
    <main className="auth-main profile-main">
      <section className="auth-card profile-card" aria-labelledby="profile-title">
        <div className="profile-avatar" aria-hidden="true">{identity.initials}</div>
        <div className="auth-card-kicker">YOUR TWINERUN PROFILE</div>
        <h1 id="profile-title">{identity.name}</h1>
        <p className="profile-email">{identity.email}</p>
        <div className="profile-note"><Check size={15} /> Server session active · backend state is authoritative</div>
        {pendingCheckout && <div className="profile-pending" role="status"><span className="profile-status-dot" />Payment processing · waiting for confirmation</div>}
        {accountError && <p className="auth-error" role="alert">{accountError}</p>}
        <div className="account-grid">
          <div className="account-panel"><span className="account-label">PLAN</span><strong>{plan.toUpperCase()}</strong><small>{planStatus}</small><button className="vesper-btn vesper-btn--ghost" onClick={() => void manageBilling()}>Manage billing</button></div>
          <div className="account-panel"><span className="account-label">USAGE</span><strong>{count(entitlements?.usage?.agents)} agents</strong><small>Limits are enforced by the backend</small></div>
        </div>
        <div className="profile-referrals">
          <div className="profile-referrals-head"><div><span className="account-label">REFERRALS</span><h2>Invite builders, earn Pro time.</h2></div><button className="vesper-btn vesper-btn--ghost" onClick={() => void generateCode()} disabled={codeBusy}>{codeBusy ? "Generating…" : referralCode ? "Refresh code" : "Generate code"}</button></div>
          {referralCode ? <><div className="referral-link-row"><code>{referralLink}</code><button className="vesper-btn vesper-btn--ghost" onClick={() => void copyReferralLink()}>{copyState}</button></div><div className="referral-stats"><span>Pending <b>{count(referrals?.pending)}</b></span><span>Qualified <b>{count(referrals?.qualified)}</b></span><span>Rewarded <b>{count(referrals?.rewarded)}</b></span><span>Reversed <b>{count(referrals?.reversed)}</b></span><span>Free Pro months <b>{count(referrals?.freeProMonths)}</b></span></div><p className="referral-explainer">A reward is issued only after the invitee completes their first successful Pro billing period.</p></> : <p className="profile-muted">Generate a referral code to share a tracked signup link.</p>}
        </div>
        <div className="profile-actions">
          <button className="vesper-btn vesper-btn--solid" onClick={onOpenStudio}>Open Studio <ArrowRight size={15} /></button>
          <button className="vesper-btn vesper-btn--ghost" onClick={() => void onLogout()}>Log out</button>
          <button className="vesper-btn vesper-btn--ghost" onClick={() => navigate("/system")}>Backend details</button>
        </div>
        <p className="auth-trust">Your identity is persisted by the backend. Sign out revokes the current session.</p>
      </section>
    </main>
  </div>;
};
