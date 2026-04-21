import React, { useEffect, useState, useCallback, useRef } from 'react';
import { logout, getEveStatus, getWealth } from '../services/api';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';
import IndustryJobs from '../components/IndustryJobs';
import CorporationJobs from '../components/CorporationJobs';
import CorporationIndustryStats from '../components/CorporationIndustryStats';
import CharacterIndustryStats from '../components/CharacterIndustryStats';
import Assets from '../components/Assets';
import Planets from '../components/Planets';
import CharacterPage from '../components/CharacterPage';
import HubComparison from '../components/HubComparison';
import TradeFinder from '../components/TradeFinder';
import BuildVsBuy from '../components/BuildVsBuy';
import ProductionTree from '../components/ProductionTree';
import AdminPanel from '../components/AdminPanel';
import './Main.css';

function ServerStatus() {
  const [status, setStatus] = useState(null);
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await getEveStatus();
      setStatus(resp.data);
    } catch {
      setStatus({ tranquility: { online: false }, esi: { online: false } });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh every 60 seconds
    timerRef.current = setInterval(fetchStatus, 60000);
    return () => clearInterval(timerRef.current);
  }, [fetchStatus]);

  if (!status) return null;

  const tq = status.tranquility;
  const esi = status.esi;

  return (
    <div className="server-status">
      <div className={`status-indicator ${tq.online ? 'online' : 'offline'}`} title={
        tq.online
          ? `Tranquility: ${tq.players?.toLocaleString() || 0} players online`
          : tq.maintenance ? 'Tranquility: Maintenance' : 'Tranquility: Offline'
      }>
        <span className="status-dot" />
        <span className="status-label">TQ</span>
        {tq.online && tq.players > 0 && (
          <span className="status-players">{tq.players.toLocaleString()}</span>
        )}
      </div>
      <div className={`status-indicator ${esi.online ? 'online' : 'offline'}`} title={
        esi.online ? 'ESI API: Online' : 'ESI API: Offline'
      }>
        <span className="status-dot" />
        <span className="status-label">ESI</span>
      </div>
    </div>
  );
}

function formatISKHeader(value) {
  if (!value || value === 0) return '0';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function WealthIndicator() {
  const [wealth, setWealth] = useState(null);
  const timerRef = useRef(null);

  const fetchWealth = useCallback(async () => {
    try {
      const resp = await getWealth();
      setWealth(resp.data);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchWealth();
    timerRef.current = setInterval(fetchWealth, 300000); // Refresh every 5 min
    return () => clearInterval(timerRef.current);
  }, [fetchWealth]);

  if (!wealth) return null;

  return (
    <div className="wealth-header-boxes">
      <div className="wealth-header-box assets" title={`Total asset value: ${wealth.total_value.toLocaleString()} ISK across ${wealth.total_items.toLocaleString()} items`}>
        <span className="wealth-header-label">Assets</span>
        <span className="wealth-header-value">{wealth.total_value > 0 ? formatISKHeader(wealth.total_value) : '—'}</span>
      </div>
      <div className={`wealth-header-box wallet ${wealth.total_wallet_balance > 0 ? '' : 'placeholder-dim'}`} title={wealth.total_wallet_balance > 0 ? `Total wallet: ${wealth.total_wallet_balance.toLocaleString()} ISK` : 'Wallet balance (requires wallet ESI scope)'}>
        <span className="wealth-header-label">Wallet</span>
        <span className="wealth-header-value">{wealth.total_wallet_balance > 0 ? formatISKHeader(wealth.total_wallet_balance) : '—'}</span>
      </div>
    </div>
  );
}

function Main({ onLogout, characterName, features = [], isAdmin = false }) {
  const [error, setError] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    const saved = localStorage.getItem('globalAutoRefresh');
    return saved && saved !== 'null' ? parseInt(saved) : null;
  });
  const [autoRefreshDropdown, setAutoRefreshDropdown] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const autoRefreshTimerRef = useRef(null);
  const nextRefreshRef = useRef(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    // Reset countdown on manual refresh
    if (autoRefreshInterval) {
      nextRefreshRef.current = Date.now() + autoRefreshInterval * 60 * 1000;
    }
  }, [autoRefreshInterval]);

  const handleAutoRefreshChange = (minutes) => {
    setAutoRefreshInterval(minutes);
    if (minutes) {
      localStorage.setItem('globalAutoRefresh', minutes.toString());
      nextRefreshRef.current = Date.now() + minutes * 60 * 1000;
    } else {
      localStorage.removeItem('globalAutoRefresh');
      nextRefreshRef.current = null;
      setCountdown(null);
    }
    setAutoRefreshDropdown(false);
  };

  useEffect(() => {
    if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    if (!autoRefreshInterval) return;
    nextRefreshRef.current = Date.now() + autoRefreshInterval * 60 * 1000;
    autoRefreshTimerRef.current = setInterval(() => {
      setRefreshKey(k => k + 1);
      nextRefreshRef.current = Date.now() + autoRefreshInterval * 60 * 1000;
    }, autoRefreshInterval * 60 * 1000);
    return () => clearInterval(autoRefreshTimerRef.current);
  }, [autoRefreshInterval]);

  // Countdown tick
  useEffect(() => {
    if (!autoRefreshInterval) return;
    const tick = setInterval(() => {
      if (nextRefreshRef.current) {
        const remaining = Math.max(0, nextRefreshRef.current - Date.now());
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        setCountdown(`${m}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [autoRefreshInterval]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlError = urlParams.get('error');
    if (urlError) {
      setError(getErrorMessage(urlError));
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const getErrorMessage = (errorCode) => {
    const errorMessages = {
      not_authenticated: 'You must be logged in to link a character',
      missing_parameters: 'OAuth callback missing required parameters',
      invalid_state: 'Invalid OAuth state - please try again',
      eve_auth_failed: 'EVE authentication failed - please try again'
    };
    return errorMessages[errorCode] || 'An error occurred';
  };

  const handleLogout = async () => {
    try {
      await logout();
      onLogout();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSelectCharacter = (character) => {
    setSelectedCharacter(character);
    setCurrentView('character');
  };

  const handleShowAllCharacters = () => {
    setSelectedCharacter(null);
    if (currentView === 'character') {
      setCurrentView('dashboard');
    }
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const renderContent = () => {
    switch (currentView) {
      case 'character':
        return selectedCharacter ? (
          <CharacterPage characterId={selectedCharacter.character_id} onError={setError} refreshKey={refreshKey} />
        ) : (
          <Dashboard onError={setError} refreshKey={refreshKey} />
        );
      case 'jobs':
        return <IndustryJobs onError={setError} refreshKey={refreshKey} />;
      case 'corp-jobs':
        return <CorporationJobs onError={setError} refreshKey={refreshKey} />;
      case 'corp-industry-stats':
        return <CorporationIndustryStats onError={setError} refreshKey={refreshKey} />;
      case 'character-industry-stats':
        return <CharacterIndustryStats onError={setError} refreshKey={refreshKey} />;
      case 'assets':
        return <Assets onError={setError} refreshKey={refreshKey} />;
      case 'planets':
        return <Planets onError={setError} refreshKey={refreshKey} />;
      case 'hub-compare':
        return <HubComparison onError={setError} refreshKey={refreshKey} />;
      case 'trade-finder':
        return <TradeFinder onError={setError} refreshKey={refreshKey} />;
      case 'build-vs-buy':
        return <BuildVsBuy onError={setError} refreshKey={refreshKey} />;
      case 'production':
        return <ProductionTree onError={setError} refreshKey={refreshKey} />;
      case 'admin':
        return <AdminPanel />;
      case 'dashboard':
      default:
        return <Dashboard onError={setError} refreshKey={refreshKey} />;
    }
  };

  return (
    <div className="main-layout">
      <Sidebar
        selectedCharacter={selectedCharacter}
        onSelectCharacter={handleSelectCharacter}
        onShowAllCharacters={handleShowAllCharacters}
        currentView={currentView}
        onViewChange={handleViewChange}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        characterName={characterName}
        features={features}
      />

      <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="main-header">
          <div className="header-title">
            <h1>EVE Industry Tracker</h1>
            {selectedCharacter && currentView === 'character' && (
              <span className="selected-character">
                {selectedCharacter.name}
              </span>
            )}
          </div>
          <div className="header-right">
            <WealthIndicator />
            <ServerStatus />
            <div className="auto-refresh-container">
              <button
                className={`auto-refresh-btn ${autoRefreshInterval ? 'active' : ''}`}
                onClick={() => setAutoRefreshDropdown(!autoRefreshDropdown)}
              >
                <span className={`refresh-icon ${autoRefreshInterval ? 'spinning' : ''}`}>⟳</span>
                {autoRefreshInterval ? <><span className="auto-refresh-interval">{autoRefreshInterval}m</span><span className="auto-refresh-countdown">{countdown}</span></> : 'Off'}
              </button>
              {autoRefreshDropdown && (
                <div className="auto-refresh-dropdown">
                  <div className={`dropdown-item ${!autoRefreshInterval ? 'active' : ''}`} onClick={() => handleAutoRefreshChange(null)}>Off</div>
                  <div className={`dropdown-item ${autoRefreshInterval === 5 ? 'active' : ''}`} onClick={() => handleAutoRefreshChange(5)}>5 min</div>
                  <div className={`dropdown-item ${autoRefreshInterval === 10 ? 'active' : ''}`} onClick={() => handleAutoRefreshChange(10)}>10 min</div>
                  <div className={`dropdown-item ${autoRefreshInterval === 15 ? 'active' : ''}`} onClick={() => handleAutoRefreshChange(15)}>15 min</div>
                </div>
              )}
            </div>
            <button className="refresh-btn" onClick={handleRefresh}>↻</button>
            {isAdmin && (
              <button
                className={`admin-btn ${currentView === 'admin' ? 'active' : ''}`}
                onClick={() => setCurrentView('admin')}
                title="Admin Console"
              >
                ⚙
              </button>
            )}
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError('')} className="dismiss-btn">×</button>
          </div>
        )}

        <div className="content-area">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default Main;
