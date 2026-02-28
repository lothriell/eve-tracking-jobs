import React, { useEffect, useState } from 'react';
import { getCharacterById, getCharacterPortrait, initiateEveAuth } from '../services/api';
import './CharacterInfo.css';

function CharacterInfo({ characterId, onError }) {
  const [character, setCharacter] = useState(null);
  const [portraitUrl, setPortraitUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (characterId) {
      loadCharacter();
    } else {
      setLoading(false);
    }
  }, [characterId]);

  const loadCharacter = async () => {
    try {
      setLoading(true);
      const [charResponse, portraitResponse] = await Promise.all([
        getCharacterById(characterId),
        getCharacterPortrait(characterId)
      ]);
      setCharacter(charResponse.data);
      setPortraitUrl(portraitResponse.data.portraitUrl);
    } catch (error) {
      console.error('Failed to load character:', error);
      onError?.('Failed to load character info');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkCharacter = async () => {
    try {
      setLinking(true);
      const response = await initiateEveAuth();
      if (response.data.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate EVE auth:', error);
      onError?.('Failed to start character linking');
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="character-info loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!characterId || !character) {
    return (
      <div className="character-info empty">
        <h3>Link EVE Character</h3>
        <p>Connect your EVE Online character to access industry jobs and other features.</p>
        <button 
          onClick={handleLinkCharacter} 
          className="button button-primary"
          disabled={linking}
        >
          {linking ? 'Connecting...' : 'Link EVE Character'}
        </button>
      </div>
    );
  }

  return (
    <div className="character-info">
      <div className="character-content">
        {portraitUrl && (
          <img 
            src={portraitUrl} 
            alt={character.name}
            className="character-portrait-large"
          />
        )}
        <div className="character-details">
          <h3 className="character-name-large">{character.name}</h3>
          <span className="character-id">Character ID: {character.character_id}</span>
          <span className="linked-badge">✓ Linked</span>
        </div>
      </div>
    </div>
  );
}

export default CharacterInfo;
