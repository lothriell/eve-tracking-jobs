import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/api';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';
import IndustryJobs from '../components/IndustryJobs';
import CorporationJobs from '../components/CorporationJobs';
import Assets from '../components/Assets';
import Planets from '../components/Planets';
import './Main.css';

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
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
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
