import React, { useState, useEffect, useCallback } from 'react';
import { getAllCharacters, initiateEveAuth, deleteCharacter } from '../services/api';
import './Sidebar.css';

// Apply saved character order from localStorage
function applySavedOrder(chars) {
  const saved = localStorage.getItem('characterOrder');
  if (!saved) return chars;
  try {
    const order = JSON.parse(saved);
    const ordered = [];
    const remaining = [...chars];
    for (const id of order) {
      const idx = remaining.findIndex(c => c.character_id === id);
      if (idx >= 0) {
        ordered.push(remaining.splice(idx, 1)[0]);
      }
    }
    return [...ordered, ...remaining]; // Append any new characters at the end
  } catch {
    return chars;
  }
}

function Sidebar({ selectedCharacter, onSelectCharacter, onShowAllCharacters, currentView, onViewChange, onCharactersChange, collapsed, onCollapsedChange }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const loadCharacters = useCallback(async () => {
    try {
      const response = await getAllCharacters();
      const chars = applySavedOrder(response.data.characters || []);
      setCharacters(chars);
      if (onCharactersChange) {
        onCharactersChange(chars);
      }
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  }, [onCharactersChange]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    setDragOverIdx(null);
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return; }
    const updated = [...characters];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(dropIdx, 0, moved);
    setCharacters(updated);
    setDragIdx(null);
    // Persist order
    localStorage.setItem('characterOrder', JSON.stringify(updated.map(c => c.character_id)));
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
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
    // Toggle: click active character again to deselect (show all)
    if (selectedCharacter?.character_id === character.character_id) {
      onShowAllCharacters();
    } else {
      onSelectCharacter(character);
    }
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
        onClick={() => onCollapsedChange && onCollapsedChange(!collapsed)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '→' : '←'}
      </button>

      {/* Collapsed State - Show icons only */}
      {collapsed && (
        <div className="sidebar-collapsed">
          <div className="collapsed-header">
            <div className="collapsed-logo" title="EVE Industry Tracker">
              <img src="/favicon.svg" alt="EVE Industry Tracker" />
            </div>
          </div>

          <div className="collapsed-characters">
            <div 
              className={`collapsed-char-item ${!selectedCharacter ? 'active' : ''}`}
              onClick={handleShowAll}
              title="All Characters"
            >
              <div className="collapsed-all-icon">∀</div>
            </div>
            {characters.map((char, idx) => (
              <div
                key={char.character_id}
                className={`collapsed-char-item ${selectedCharacter?.character_id === char.character_id ? 'active' : ''} ${dragOverIdx === idx ? 'drag-over' : ''}`}
                onClick={() => handleSelectCharacter(char)}
                title={char.name}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              >
                <div className="portrait-wrapper">
                  <img
                    src={char.portrait_url}
                    alt={char.name}
                    className="collapsed-portrait"
                  />
                  <span
                    className={`scope-dot ${char.scopes_complete ? 'scope-ok' : 'scope-missing'}`}
                    title={char.scopes_complete ? 'All ESI scopes granted' : `Missing ${char.missing_scopes?.length || 0} scope(s)`}
                  />
                </div>
              </div>
            ))}
            <div
              className="collapsed-char-item add-btn"
              onClick={handleAddCharacter}
              title="Add Character"
            >
              +
            </div>
          </div>

          <div className="collapsed-divider"></div>

          <div className="collapsed-nav">
            <div
              className={`collapsed-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => onViewChange('dashboard')}
              title="Dashboard"
            >
              📊
            </div>
            <div
              className={`collapsed-nav-item ${currentView === 'jobs' ? 'active' : ''}`}
              onClick={() => onViewChange('jobs')}
              title="My Industry Jobs"
            >
              🏭
            </div>
            <div
              className={`collapsed-nav-item ${currentView === 'corp-jobs' ? 'active' : ''}`}
              onClick={() => onViewChange('corp-jobs')}
              title="Corporation Jobs"
            >
              🏢
            </div>
            <div
              className={`collapsed-nav-item ${currentView === 'assets' ? 'active' : ''}`}
              onClick={() => onViewChange('assets')}
              title="Assets"
            >
              📦
            </div>
            <div
              className={`collapsed-nav-item ${currentView === 'planets' ? 'active' : ''}`}
              onClick={() => onViewChange('planets')}
              title="Planets"
            >
              🪐
            </div>
          </div>
        </div>
      )}

      {/* Expanded State */}
      {!collapsed && (
        <>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <img src="/favicon.svg" alt="" className="sidebar-logo-icon" />
              <span className="sidebar-logo-text">EVE Industry</span>
            </div>
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
                  <span className="character-count">{characters.length}</span>
                </div>

                {characters.map((char, idx) => (
                  <div
                    key={char.character_id}
                    className={`character-item ${selectedCharacter?.character_id === char.character_id ? 'active' : ''} ${dragOverIdx === idx ? 'drag-over' : ''}`}
                    onClick={() => handleSelectCharacter(char)}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="portrait-wrapper">
                      <img
                        src={char.portrait_url}
                        alt={char.name}
                        className="character-portrait"
                      />
                      <span
                        className={`scope-dot ${char.scopes_complete ? 'scope-ok' : 'scope-missing'}`}
                        title={char.scopes_complete ? 'All ESI scopes granted' : `Missing ${char.missing_scopes?.length || 0} scope(s) — re-add character to fix`}
                      />
                    </div>
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
              <span>My Industry Jobs</span>
            </div>
            <div
              className={`nav-item ${currentView === 'corp-jobs' ? 'active' : ''}`}
              onClick={() => onViewChange('corp-jobs')}
            >
              <span className="nav-icon">🏢</span>
              <span>Corporation Jobs</span>
            </div>
            <div
              className={`nav-item ${currentView === 'assets' ? 'active' : ''}`}
              onClick={() => onViewChange('assets')}
            >
              <span className="nav-icon">📦</span>
              <span>Assets</span>
            </div>
            <div
              className={`nav-item ${currentView === 'planets' ? 'active' : ''}`}
              onClick={() => onViewChange('planets')}
            >
              <span className="nav-icon">🪐</span>
              <span>Planets</span>
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
