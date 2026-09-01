import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import LandingGateV5 from './LandingGateV5';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><LandingGateV5 /></StrictMode>);

