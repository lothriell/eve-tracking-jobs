import React, { useEffect, useState } from 'react';
import Login from './pages/Login';
import Main from './pages/Main';
import { checkAuth, getMyFeatures } from './services/api';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [characterName, setCharacterName] = useState(null);
  const [features, setFeatures] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await checkAuth();
      setAuthenticated(response.data.authenticated);
      if (response.data.characterName) setCharacterName(response.data.characterName);
      if (response.data.authenticated) {
        try {
          const featResp = await getMyFeatures();
          setFeatures(featResp.data.features || []);
          setIsAdmin(featResp.data.is_admin || false);
        } catch {
          // Continue without features
        }
      }
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

  return <Main onLogout={() => setAuthenticated(false)} characterName={characterName} features={features} isAdmin={isAdmin} />;
}

export default App;
