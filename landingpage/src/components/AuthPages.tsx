import React, { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Mail, UserRound } from "lucide-react";
import { createDemoSession, DemoSession, nameFromEmail, setDemoSession } from "../auth/demoAuth";
import { api } from "../lib/api";

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
    // Keep the demo transition immediate while yielding once for button feedback.
    transitionTimer.current = window.setTimeout(async () => {
      // The local identity remains a demo convenience, but the API receives a
      // short-lived server token at runtime. We deliberately do not embed one
      // in the public Vite bundle. If the backend is unavailable, preserve the
      // existing local-only flow for offline design work.
      try {
        const auth = await api.demoSignIn();
        if (auth.accessToken) window.sessionStorage.setItem("twinerun.access-token", auth.accessToken);
      } catch {
        // Keep the frontend demo usable while the API is not running locally.
      }
      const session = createDemoSession(isSignUp ? name : nameFromEmail(cleanEmail), cleanEmail);
      setDemoSession(session);
      onAuthenticated(session);
      transitionTimer.current = null;
    }, 80);
  };

  return (
    <div className="vesper-page auth-page">
      <div className="vesper-grain" aria-hidden="true" />
      <div className="vesper-photo" aria-hidden="true" />
      <header className="auth-header">
        <a href="#top" className="auth-wordmark" aria-label="twinerun home">twinerun<span>.ai</span></a>
        <a href="#top" className="auth-back-link"><ArrowLeft size={14} /> Back home</a>
      </header>
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-kicker">FRONTEND DEMO · NO BACKEND CONNECTED</div>
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
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="vesper-btn vesper-btn--solid auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Opening workspace…" : isSignUp ? "Create workspace" : "Sign in"}
              {!isSubmitting && <ArrowRight size={15} />}
            </button>
          </form>
          <p className="auth-switch">
            {isSignUp ? "Already have a workspace?" : "New to twinerun?"}{" "}
            <a href={isSignUp ? "#signin" : "#signup"}>{isSignUp ? "Sign in" : "Create an account"}</a>
          </p>
          <p className="auth-trust"><Check size={14} /> Local demo session only · no production changes</p>
        </section>
      </main>
    </div>
  );
};

interface ProfilePageProps {
  session: DemoSession;
  onLogout: () => void;
  onOpenStudio: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ session, onLogout, onOpenStudio }) => (
  <div className="vesper-page auth-page profile-page">
    <div className="vesper-grain" aria-hidden="true" />
    <div className="vesper-photo" aria-hidden="true" />
    <header className="auth-header">
      <a href="#top" className="auth-wordmark" aria-label="twinerun home">twinerun<span>.ai</span></a>
      <a href="#studio" className="auth-back-link" onClick={onOpenStudio}><ArrowLeft size={14} /> Back to studio</a>
    </header>
    <main className="auth-main">
      <section className="auth-card profile-card" aria-labelledby="profile-title">
        <div className="profile-avatar" aria-hidden="true">{session.initials}</div>
        <div className="auth-card-kicker">YOUR DEMO PROFILE</div>
        <h1 id="profile-title">{session.name}</h1>
        <p className="profile-email">{session.email}</p>
        <div className="profile-note"><Check size={15} /> Frontend-only session active</div>
        <div className="profile-actions">
          <button className="vesper-btn vesper-btn--solid" onClick={onOpenStudio}>Open Studio <ArrowRight size={15} /></button>
          <button className="vesper-btn vesper-btn--ghost" onClick={onLogout}>Log out</button>
        </div>
        <p className="auth-trust">Your demo identity is stored in this browser only.</p>
      </section>
    </main>
  </div>
);
