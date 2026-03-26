import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, getEveStatus, getWealth } from '../services/api';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';
import IndustryJobs from '../components/IndustryJobs';
import CorporationJobs from '../components/CorporationJobs';
import Assets from '../components/Assets';
import Planets from '../components/Planets';
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

  if (!wealth || wealth.total_value === 0) return null;

  return (
    <div className="wealth-indicator" title={`Total asset value: ${wealth.total_value.toLocaleString()} ISK across ${wealth.total_items.toLocaleString()} items`}>
      <span className="wealth-icon">💰</span>
      <span className="wealth-value">{formatISKHeader(wealth.total_value)}</span>
      <span className="wealth-label">ISK</span>
    </div>
  );
}

function Main({ onLogout }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSelectCharacter = (character) => {
    setSelectedCharacter(character);
  };

  const handleShowAllCharacters = () => {
    setSelectedCharacter(null);
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const renderContent = () => {
    switch (currentView) {
      case 'jobs':
        return <IndustryJobs selectedCharacter={selectedCharacter} onError={setError} />;
      case 'corp-jobs':
        return <CorporationJobs selectedCharacter={selectedCharacter} onError={setError} />;
      case 'assets':
        return <Assets selectedCharacter={selectedCharacter} onError={setError} />;
      case 'planets':
        return <Planets selectedCharacter={selectedCharacter} onError={setError} />;
      case 'dashboard':
      default:
        return <Dashboard onError={setError} />;
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
      />

      <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="main-header">
          <div className="header-title">
            <h1>EVE Industry Tracker</h1>
            {selectedCharacter && (
              <span className="selected-character">
                Viewing: {selectedCharacter.name}
              </span>
            )}
          </div>
          <div className="header-right">
            <WealthIndicator />
            <ServerStatus />
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
