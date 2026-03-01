import React, { useState, useEffect } from 'react';
import { getAllCharacters, initiateEveAuth, deleteCharacter } from '../services/api';
import './Sidebar.css';

function Sidebar({ selectedCharacter, onSelectCharacter, onShowAllCharacters, currentView, onViewChange, onCharactersChange }) {
  const [characters, setCharacters] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      const response = await getAllCharacters();
      const chars = response.data.characters || [];
      setCharacters(chars);
      if (onCharactersChange) {
        onCharactersChange(chars);
      }
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCharacter = async () => {
    try {
      setLinking(true);
      const response = await initiateEveAuth();
      if (response.data.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate EVE auth:', error);
      setLinking(false);
    }
  };

  const handleSelectCharacter = (character) => {
    onSelectCharacter(character);
  };

  const handleShowAll = () => {
    onShowAllCharacters();
  };

  const handleDeleteClick = (e, character) => {
    e.stopPropagation();
    setConfirmDelete(character);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    
    try {
      setDeletingId(confirmDelete.character_id);
      await deleteCharacter(confirmDelete.character_id);
      
      // If the deleted character was selected, switch to "All Characters"
      if (selectedCharacter?.character_id === confirmDelete.character_id) {
        onShowAllCharacters();
      }
      
      // Refresh character list
      await loadCharacters();
      setConfirmDelete(null);
    } catch (error) {
      console.error('Failed to delete character:', error);
      alert('Failed to delete character. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button 
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '→' : '←'}
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-header">
            <h3>Characters</h3>
            <span className="character-count">{characters.length}</span>
          </div>

          <div className="sidebar-characters">
            {loading ? (
              <div className="sidebar-loading">
                <div className="spinner-small"></div>
              </div>
            ) : (
              <>
                <div 
                  className={`character-item all-characters ${!selectedCharacter ? 'active' : ''}`}
                  onClick={handleShowAll}
                >
                  <div className="character-icon all-icon">∀</div>
                  <span className="character-name">All Characters</span>
                </div>

                {characters.map((char) => (
                  <div 
                    key={char.character_id}
                    className={`character-item ${selectedCharacter?.character_id === char.character_id ? 'active' : ''}`}
                    onClick={() => handleSelectCharacter(char)}
                  >
                    <img 
                      src={char.portrait_url}
                      alt={char.name}
                      className="character-portrait"
                    />
                    <span className="character-name">{char.name}</span>
                    <button
                      className="delete-character-btn"
                      onClick={(e) => handleDeleteClick(e, char)}
                      disabled={deletingId === char.character_id}
                      title="Remove character"
                    >
                      {deletingId === char.character_id ? '...' : '×'}
                    </button>
                  </div>
                ))}

                <button 
                  className="add-character-btn"
                  onClick={handleAddCharacter}
                  disabled={linking}
                >
                  {linking ? (
                    <span className="spinner-small"></span>
                  ) : (
                    <>
                      <span className="plus-icon">+</span>
                      <span>Add Character</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          <div className="sidebar-nav">
            <div className="nav-header">Navigation</div>
            <div 
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => onViewChange('dashboard')}
            >
              <span className="nav-icon">📊</span>
              <span>Dashboard</span>
            </div>
            <div 
              className={`nav-item ${currentView === 'jobs' ? 'active' : ''}`}
              onClick={() => onViewChange('jobs')}
            >
              <span className="nav-icon">🏭</span>
              <span>Industry Jobs</span>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="delete-modal-overlay" onClick={handleCancelDelete}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Remove Character</h4>
            <p>Are you sure you want to remove <strong>{confirmDelete.name}</strong>?</p>
            <p className="delete-warning">
              ⚠️ You can re-add this character later with updated permissions.
            </p>
            <div className="delete-modal-buttons">
              <button className="cancel-btn" onClick={handleCancelDelete}>
                Cancel
              </button>
              <button className="confirm-delete-btn" onClick={handleConfirmDelete}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
