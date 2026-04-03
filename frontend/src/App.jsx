import React, { useEffect, useState } from 'react';
import Login from './pages/Login';
import Main from './pages/Main';
import { checkAuth } from './services/api';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [characterName, setCharacterName] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await checkAuth();
      setAuthenticated(response.data.authenticated);
      if (response.data.characterName) setCharacterName(response.data.characterName);
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Login />;
  }

  return <Main onLogout={() => setAuthenticated(false)} characterName={characterName} />;
}

export default App;
