import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/api';
import CharacterInfo from '../components/CharacterInfo';
import IndustryJobs from '../components/IndustryJobs';
import './Main.css';

function Main({ onLogout }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  // Handle errors from child components
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlError = urlParams.get('error');
    if (urlError) {
      setError(getErrorMessage(urlError));
      // Clear error from URL
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

  return (
    <div className="main-container">
      <div className="container">
        <div className="header">
          <h1>EVE ESI Dashboard</h1>
          <button onClick={handleLogout} className="button button-secondary">
            Logout
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <CharacterInfo onError={setError} />
        <IndustryJobs onError={setError} />
      </div>
    </div>
  );
}

export default Main;
