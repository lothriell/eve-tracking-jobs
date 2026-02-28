import React, { useEffect, useState } from 'react';
import { getCharacter, getCharacterPortrait, initiateEveAuth } from '../services/api';
import './CharacterInfo.css';

function CharacterInfo({ onError }) {
  const [character, setCharacter] = useState(null);
  const [portraitUrl, setPortraitUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadCharacter();
  }, []);

  const loadCharacter = async () => {
    try {
      const response = await getCharacter();
      if (response.data.linked) {
        setCharacter(response.data.character);
        loadPortrait();
      }
    } catch (error) {
      console.error('Failed to load character:', error);
      onError('Failed to load character information');
    } finally {
      setLoading(false);
    }
  };

  const loadPortrait = async () => {
    try {
      const response = await getCharacterPortrait();
      setPortraitUrl(response.data.portraitUrl);
    } catch (error) {
      console.error('Failed to load portrait:', error);
    }
  };

  const handleLinkCharacter = async () => {
    setLinking(true);
    try {
      const response = await initiateEveAuth();
      // Redirect to EVE SSO
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Failed to initiate EVE auth:', error);
      onError('Failed to initiate EVE authentication');
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading character...</p>
        </div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="card">
        <h2>Link EVE Character</h2>
        <p className="info-text">
          Connect your EVE Online character to access industry jobs and other features.
        </p>
        <button 
          onClick={handleLinkCharacter} 
          className="button"
          disabled={linking}
        >
          {linking ? 'Redirecting to EVE SSO...' : 'Link EVE Character'}
        </button>
      </div>
    );
  }

  return (
    <div className="card character-card">
      <div className="character-info">
        {portraitUrl && (
          <img 
            src={portraitUrl} 
            alt={character.name} 
            className="character-portrait"
          />
        )}
        <div className="character-details">
          <h2>{character.name}</h2>
          <p className="character-id">Character ID: {character.id}</p>
          <p className="status-badge">✓ Linked</p>
        </div>
      </div>
    </div>
  );
}

export default CharacterInfo;
