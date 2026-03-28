import React, { useState, useEffect } from 'react';
import { initiateEveAuth } from '../services/api';
import './Login.css';

const FEATURES = [
  { icon: '🏭', title: 'Industry Jobs', desc: 'Track manufacturing, research, and reactions across all characters' },
  { icon: '📦', title: 'Asset Browser', desc: 'Browse assets by system, station, and container with full search' },
  { icon: '🪐', title: 'Planetary Industry', desc: 'Live extractor timers, storage tracking, and colony alerts' },
  { icon: '🏢', title: 'Corporation', desc: 'Corporation jobs and assets with role-based access' },
];

function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check for error in URL params (from callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) {
      setError(err === 'eve_auth_failed' ? 'EVE authentication failed. Please try again.' : err);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Parallax star effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      const stars = document.querySelector('.stars-layer');
      const nebula = document.querySelector('.nebula-layer');
      if (stars && nebula) {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        stars.style.transform = `translate(${x}px, ${y}px)`;
        nebula.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleEveLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await initiateEveAuth();
      window.location.href = response.data.authUrl;
    } catch (err) {
      setError('Failed to start EVE authentication');
      setLoading(false);
    }
  };

  return (
    <div className="landing-page">
      {/* Background layers */}
      <div className="bg-base" />
      <div className="stars-layer" />
      <div className="nebula-layer" />
      <div className="vignette-layer" />

      {/* Content */}
      <div className="landing-content">
        {/* Hero */}
        <header className="landing-hero">
          <div className="hero-logo">
            <div className="logo-diamond" />
            <span className="logo-text">EVE Industry Tracker</span>
          </div>

          <h1 className="hero-title">
            Command Your<br />
            <span className="hero-highlight">Industrial Empire</span>
          </h1>

          <p className="hero-subtitle">
            Track industry jobs, manage assets, and monitor planetary colonies
            across all your characters — in one unified dashboard.
          </p>

          {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          <div className="hero-actions">
            <button className="btn-primary" onClick={handleEveLogin} disabled={loading}>
              {loading ? 'Redirecting...' : 'Login with EVE Online'}
            </button>
            <a className="btn-ghost" href="#features">
              Explore Features
            </a>
          </div>

          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-value">Multi-Character</span>
              <span className="stat-label">Support</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">Real-Time</span>
              <span className="stat-label">Job Tracking</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">95K+</span>
              <span className="stat-label">Cached Items</span>
            </div>
          </div>
        </header>

        {/* Features */}
        <section className="landing-features" id="features">
          {FEATURES.map((f, i) => (
            <div className="feature-card" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <span>Powered by EVE Online ESI</span>
          <span className="footer-dot">&bull;</span>
          <span>Not affiliated with CCP Games</span>
        </footer>
      </div>
    </div>
  );
}

export default Login;
