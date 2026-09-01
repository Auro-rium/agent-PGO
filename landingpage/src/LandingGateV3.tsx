import React, { useEffect, useState } from 'react';
import App from './App';
import { VesperLandingV2 } from './components/VesperLandingV2';
import { VesperRoute, VesperSectionPage } from './components/VesperSectionPage';
import './vesper.css';
import './vesper-fix.css';
import './vesper-sections.css';
import './vesper-routes.css';

const routeFromHash = (): VesperRoute | 'home' | 'studio' => {
  const value = window.location.hash.replace(/^#/, '').replace(/\/$/, '');
  if (value === 'studio') return 'studio';
  if (value === 'benefits' || value === 'how-it-works' || value === 'faqs' || value === 'pricing') return value;
  return 'home';
};

export default function LandingGateV3() {
  const [route, setRoute] = useState<VesperRoute | 'home' | 'studio'>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const launchStudio = () => {
    window.history.pushState({}, '', '#studio');
    setRoute('studio');
  };

  if (route === 'studio') return <App />;
  if (route === 'home') return <VesperLandingV2 onLaunchStudio={launchStudio} />;
  return <VesperSectionPage route={route} onLaunchStudio={launchStudio} />;
}

