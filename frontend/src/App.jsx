import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Main from './pages/Main';
import { checkAuth } from './services/api';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await checkAuth();
      setAuthenticated(response.data.authenticated);
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

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={authenticated ? <Navigate to="/" /> : <Login onLogin={() => setAuthenticated(true)} />} 
        />
        <Route 
          path="/" 
          element={authenticated ? <Main onLogout={() => setAuthenticated(false)} /> : <Navigate to="/login" />} 
        />
      </Routes>
    </Router>
  );
}

export default App;
