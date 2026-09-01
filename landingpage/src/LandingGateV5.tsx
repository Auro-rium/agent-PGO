import React, { useEffect, useState } from 'react';
import App from './App';
import { VesperHomeFinal } from './components/VesperHomeFinal';
import { VesperRoute, VesperSectionPage } from './components/VesperSectionPage';
import './vesper.css';
import './vesper-fix.css';
import './vesper-sections.css';
import './vesper-routes.css';

const routeFromHash = (): VesperRoute | 'home' | 'studio' => {
  const value = window.location.hash.replace(/^#/, '').replace(/\/$/, '');
  if (value === 'studio' || value.startsWith('studio/')) return 'studio';
  if (value === 'benefits' || value === 'how-it-works' || value === 'benchmarks' || value === 'faqs' || value === 'pricing') return value;
  return 'home';
};

export default function LandingGateV5() {
  const [route, setRoute] = useState<VesperRoute | 'home' | 'studio'>(routeFromHash);
  useEffect(() => { const onHashChange = () => setRoute(routeFromHash()); window.addEventListener('hashchange', onHashChange); return () => window.removeEventListener('hashchange', onHashChange); }, []);
  const launchStudio = () => { window.history.pushState({}, '', '#studio'); setRoute('studio'); };
  if (route === 'studio') return <App />;
  if (route === 'home') return <VesperHomeFinal onLaunchStudio={launchStudio} />;
  return <VesperSectionPage route={route} onLaunchStudio={launchStudio} />;
}

