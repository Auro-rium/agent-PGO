import React, { useEffect, useState } from 'react';
import App from './App';
import { VesperLanding } from './components/VesperLanding';
import './vesper.css';

export default function LandingGate() {
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

  return isLanding ? <VesperLanding onLaunchStudio={launchStudio} /> : <App />;
}

