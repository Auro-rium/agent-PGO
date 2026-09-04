import React, { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';

interface VesperLandingProps {
  onLaunchStudio: () => void;
}

const mark = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <g transform="rotate(-30 12 12)">
      <circle cx="7.3" cy="3.2" r="1.45" />
      <rect x="5.5" y="4.7" width="3.6" height="14.6" rx="1.8" />
      <rect x="14.9" y="4.7" width="3.6" height="14.6" rx="1.8" />
      <circle cx="16.7" cy="20.8" r="1.45" />
    </g>
  </svg>
);

export const VesperLanding: React.FC<VesperLandingProps> = ({ onLaunchStudio }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('vesper-menu-open', menuOpen);
    return () => document.body.classList.remove('vesper-menu-open');
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="vesper-page">
      <div className="vesper-grain" aria-hidden="true" />
      <div className="vesper-photo vesper-photo--static" aria-hidden="true" />

      <div className="vesper-backdrop" aria-hidden="true" onClick={closeMenu} />

      <header className="vesper-header">
        <button className="vesper-logo vesper-reveal vesper-reveal--scale" onClick={closeMenu} aria-label="twinerun home">
          <span className="vesper-logo-mark">{mark}</span>
          Vesper<span className="vesper-logo-suffix">.ai</span>
        </button>

        <nav className="vesper-nav" aria-label="Primary navigation">
          <a href="#benefits" className="vesper-nav-link" onClick={closeMenu}>Benefits</a>
          <a href="#how-it-works" className="vesper-nav-link" onClick={closeMenu}>How It Works</a>
          <a href="#faqs" className="vesper-nav-link" onClick={closeMenu}>FAQs</a>
          <a href="#pricing" className="vesper-nav-link" onClick={closeMenu}>Pricing</a>
        </nav>

        <div className="vesper-header-actions">
          <button className="vesper-btn vesper-btn--solid vesper-header-cta" onClick={onLaunchStudio}>
            Launch studio
          </button>
          <button
            className="vesper-burger"
            onClick={() => setMenuOpen((open) => !open)}
            aria-controls="vesper-mobile-nav"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      <nav id="vesper-mobile-nav" className="vesper-mobile-nav" aria-label="Mobile primary navigation">
        <a href="#benefits" className="vesper-mobile-link" onClick={closeMenu}>Benefits</a>
        <a href="#how-it-works" className="vesper-mobile-link" onClick={closeMenu}>How It Works</a>
        <a href="#faqs" className="vesper-mobile-link" onClick={closeMenu}>FAQs</a>
        <a href="#pricing" className="vesper-mobile-link" onClick={closeMenu}>Pricing</a>
        <button className="vesper-btn vesper-btn--solid vesper-mobile-cta" onClick={() => { closeMenu(); onLaunchStudio(); }}>
          Launch studio <ArrowRight size={15} />
        </button>
      </nav>

      <main className="vesper-hero" id="top">
        <div className="vesper-copy">
          <div className="vesper-badge vesper-reveal vesper-reveal--pop">
            <span className="vesper-star" aria-hidden="true">✦</span>
            Operational AI Infrastructure
          </div>

          <h1>
            <span className="vesper-headline-line vesper-reveal vesper-reveal--mask">Train <em>AI agents</em> on your</span>
            <span className="vesper-headline-line vesper-reveal vesper-reveal--mask">workflows in minutes.</span>
          </h1>

          <p className="vesper-lede vesper-reveal vesper-reveal--soft">
            Deploy adaptive AI agents that learn, execute, and scale operational tasks across your business.
          </p>

          <div className="vesper-actions">
            <button className="vesper-btn vesper-btn--solid vesper-hero-btn vesper-reveal vesper-reveal--btn" onClick={onLaunchStudio}>
              Start for free <ArrowRight size={15} />
            </button>
            <a href="#how-it-works" className="vesper-btn vesper-btn--ghost vesper-hero-btn vesper-reveal vesper-reveal--side">
              See it in action <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </main>

      <footer className="vesper-stats" aria-label="twinerun operating metrics">
        <div className="vesper-stat"><span className="vesper-stat-icon">◈</span><span><strong>4.2M+</strong> workflows automated</span></div>
        <div className="vesper-stat"><span className="vesper-stat-icon vesper-stat-icon--square">↓</span><span><strong>92%</strong> reduction in manual operations</span></div>
        <div className="vesper-stat"><span className="vesper-stat-icon vesper-stat-icon--faces">●◌</span><span><strong>180+</strong> operational teams onboarded</span></div>
      </footer>
    </div>
  );
};

