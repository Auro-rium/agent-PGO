import React, { useEffect, useState } from 'react';
import App from './App';
import { AuthPage, ProfilePage } from './components/AuthPages';
import { AUTH_SESSION_EVENT, DemoSession, getDemoSession, clearDemoSession } from './auth/demoAuth';
import { VesperHomeFinal } from './components/VesperHomeFinal';
import { VesperRoute, VesperSectionPage } from './components/VesperSectionPage';
import './vesper.css';
import './vesper-fix.css';
import './vesper-sections.css';
import './vesper-routes.css';

const routeFromHash = (): VesperRoute | 'home' | 'studio' | 'signin' | 'signup' | 'profile' => {
  const value = window.location.hash.replace(/^#/, '').replace(/\/$/, '');
  if (value === 'studio' || value.startsWith('studio/')) return 'studio';
  if (value === 'benefits' || value === 'how-it-works' || value === 'benchmarks' || value === 'faqs' || value === 'pricing') return value;
  if (value === 'signin' || value === 'signup' || value === 'profile') return value;
  return 'home';
};

export default function LandingGateV5() {
  const [route, setRoute] = useState<VesperRoute | 'home' | 'studio' | 'signin' | 'signup' | 'profile'>(routeFromHash);
  const [session, setSession] = useState<DemoSession | null>(() => getDemoSession());

  const navigate = (hash: string, replace = false) => {
    const nextHash = `#${hash}`;
    if (replace) window.history.replaceState({}, '', nextHash);
    else window.history.pushState({}, '', nextHash);
    setRoute(routeFromHash());
  };

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    const onAuthChange = () => setSession(getDemoSession());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(AUTH_SESSION_EVENT, onAuthChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(AUTH_SESSION_EVENT, onAuthChange);
    };
  }, []);

  useEffect(() => {
    if ((route === 'studio' || route === 'profile') && !session) navigate('signin', true);
  }, [route, session]);

  const launchStudio = () => navigate(session ? 'studio' : 'signin');
  const handleAuthenticated = (nextSession: DemoSession) => {
    setSession(nextSession);
    navigate('studio');
  };
  const logout = () => {
    clearDemoSession();
    setSession(null);
    navigate('signin', true);
  };

  if (route === 'signin' || route === 'signup') return <AuthPage mode={route} onAuthenticated={handleAuthenticated} />;
  if (route === 'profile') return session ? <ProfilePage session={session} onLogout={logout} onOpenStudio={() => navigate('studio')} /> : <AuthPage mode="signin" onAuthenticated={handleAuthenticated} />;
  if (route === 'studio') return session ? <App session={session} onLogout={logout} onOpenProfile={() => navigate('profile')} /> : <AuthPage mode="signin" onAuthenticated={handleAuthenticated} />;
  if (route === 'home') return <VesperHomeFinal onLaunchStudio={launchStudio} />;
  return <VesperSectionPage route={route} onLaunchStudio={launchStudio} />;
}

