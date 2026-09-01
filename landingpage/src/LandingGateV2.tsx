import React, { useEffect, useState } from 'react';
import App from './App';
import { VesperLandingV2 } from './components/VesperLandingV2';
import './vesper.css';
import './vesper-fix.css';
import './vesper-sections.css';

export default function LandingGateV2() {
  const [isLanding, setIsLanding] = useState(() => window.location.hash !== '#studio');

  useEffect(() => {
    const onHashChange = () => setIsLanding(window.location.hash !== '#studio');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const launchStudio = () => {
    window.history.pushState({}, '', '#studio');
    setIsLanding(false);
  };

  return isLanding ? <VesperLandingV2 onLaunchStudio={launchStudio} /> : <App />;
}

