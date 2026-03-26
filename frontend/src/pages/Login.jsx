import React, { useState, useEffect } from 'react';
import { login } from '../services/api';
import './Login.css';

const FEATURES = [
  { icon: '🏭', title: 'Industry Jobs', desc: 'Track manufacturing, research, and reactions across all characters' },
  { icon: '📦', title: 'Asset Browser', desc: 'Browse assets by system, station, and container with full search' },
  { icon: '🪐', title: 'Planetary Industry', desc: 'Live extractor timers, storage tracking, and colony alerts' },
  { icon: '🏢', title: 'Corporation', desc: 'Corporation jobs and assets with role-based access' },
];

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      onLogin();
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
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

          <div className="hero-actions">
            <button className="btn-primary" onClick={() => setShowLogin(true)}>
              Access Dashboard
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
          <span className="footer-dot">&bull;</span>
          <span className="footer-credit">Background: "Carina Nebula Jets" — NASA, ESA, CSA, and STScI, J. DePasquale (STScI)</span>
        </footer>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div className="login-overlay" onClick={() => setShowLogin(false)}>
          <div className="login-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLogin(false)}>×</button>

            <div className="login-header">
              <div className="login-logo-small">
                <div className="logo-diamond small" />
              </div>
              <h2>Welcome Back</h2>
              <p>Sign in to your Industry Tracker</p>
            </div>

            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  disabled={loading}
                />
              </div>

              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
