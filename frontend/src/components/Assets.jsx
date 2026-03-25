import React, { useEffect, useState, useCallback } from 'react';
import { getCharacterAssets, getCorporationAssets, getAllCharacters } from '../services/api';
import './Assets.css';

function Assets({ selectedCharacter, onError }) {
  const [activeTab, setActiveTab] = useState('personal');
  const [personalAssets, setPersonalAssets] = useState([]);
  const [corpAssets, setCorpAssets] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corpLoading, setCorpLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [characterFilter, setCharacterFilter] = useState('all');
  const [scopeError, setScopeError] = useState(false);
  const [corpAccessError, setCorpAccessError] = useState(null);
  const [expandedLocations, setExpandedLocations] = useState({});

  const loadPersonalAssets = useCallback(async () => {
    setLoading(true);
    setScopeError(false);

    try {
      // Load characters list
      const charsResponse = await getAllCharacters();
      const charsList = charsResponse.data.characters || [];
      setCharacters(charsList);

      const charId = selectedCharacter?.character_id || null;
      const all = !selectedCharacter;
      const response = await getCharacterAssets(charId, all);
      const data = response.data;

      if (data.error === 'missing_scope') {
        setScopeError(true);
        setPersonalAssets([]);
      } else {
        setPersonalAssets(data.assets || []);
      }
    } catch (err) {
      console.error('Failed to load personal assets:', err);
      if (onError) onError('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [selectedCharacter, onError]);

  const loadCorpAssets = useCallback(async () => {
    if (!selectedCharacter) {
      setCorpAccessError({ type: 'info', message: 'Select a character to view corporation assets' });
      return;
    }
    setCorpLoading(true);
    setCorpAccessError(null);

    try {
      const response = await getCorporationAssets(selectedCharacter.character_id);
      const data = response.data;

      if (data.error === 'missing_scope' || data.error === 'needs_reauthorization') {
        setCorpAccessError({ type: 'reauth', message: data.message });
        setCorpAssets([]);
      } else if (data.error === 'missing_role') {
        setCorpAccessError({ type: 'role', message: data.message });
        setCorpAssets([]);
      } else {
        setCorpAssets(data.assets || []);
      }
    } catch (err) {
      console.error('Failed to load corp assets:', err);
      setCorpAccessError({ type: 'error', message: 'Failed to load corporation assets' });
    } finally {
      setCorpLoading(false);
    }
  }, [selectedCharacter]);

  useEffect(() => {
    setFilter('');
    setCharacterFilter('all');
    setExpandedLocations({});
    setCorpAssets([]);
    setCorpAccessError(null);
    loadPersonalAssets();
  }, [loadPersonalAssets]);

  useEffect(() => {
    if (activeTab === 'corp' && corpAssets.length === 0 && !corpAccessError) {
      loadCorpAssets();
    }
  }, [activeTab, corpAssets.length, corpAccessError, loadCorpAssets]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFilter('');
  };

  const toggleLocation = (locId) => {
    setExpandedLocations(prev => ({ ...prev, [locId]: !prev[locId] }));
  };

  const getFilteredGrouped = (assets) => {
    // Apply character filter first
    let filtered = assets;
    if (characterFilter !== 'all') {
      filtered = filtered.filter(a => String(a.character_id) === characterFilter);
    }

    // Apply text filter
    const f = filter.toLowerCase();
    if (f) {
      filtered = filtered.filter(a =>
        (a.type_name || '').toLowerCase().includes(f) ||
        (a.location_name || '').toLowerCase().includes(f) ||
        (a.character_name || '').toLowerCase().includes(f) ||
        String(a.type_id).includes(f)
      );
    }

    const grouped = {};
    filtered.forEach(a => {
      const loc = a.location_name || `Location ${a.location_id || 'Unknown'}`;
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(a);
    });

    return {
      grouped,
      totalItems: filtered.length,
      totalUnits: filtered.reduce((s, a) => s + (a.quantity || 1), 0),
      locationCount: Object.keys(grouped).length
    };
  };

  // Get unique characters from loaded assets
  const assetCharacters = [...new Map(
    personalAssets
      .filter(a => a.character_id && a.character_name)
      .map(a => [a.character_id, { character_id: a.character_id, character_name: a.character_name }])
  ).values()];

  const currentAssets = activeTab === 'personal' ? personalAssets : corpAssets;
  const { grouped, totalItems, totalUnits, locationCount } = getFilteredGrouped(currentAssets);

  const renderCorpContent = () => {
    if (corpLoading) {
      return (
        <div className="assets-loading">
          <div className="spinner"></div>
          <span>Loading corporation assets...</span>
        </div>
      );
    }

    if (corpAccessError) {
      if (corpAccessError.type === 'info') {
        return (
          <div className="assets-empty">
            <p>{corpAccessError.message}</p>
          </div>
        );
      }
      if (corpAccessError.type === 'reauth') {
        return (
          <div className="reauth-banner">
            <span className="reauth-icon">⚠️</span>
            <span>{corpAccessError.message}. Re-add the character to grant the new scopes.</span>
          </div>
        );
      }
      if (corpAccessError.type === 'role') {
        return (
          <div className="no-access-panel">
            <div className="no-access-icon">🔒</div>
            <strong>Access Denied</strong>
            <p>{corpAccessError.message}</p>
          </div>
        );
      }
      return <div className="assets-error">{corpAccessError.message}</div>;
    }

    return null;
  };

  return (
    <div className="assets-container">
      {scopeError && activeTab === 'personal' && (
        <div className="reauth-banner">
          <span className="reauth-icon">⚠️</span>
          <span>
            Some characters need re-authorization to read assets. Re-add the character to grant the new scopes.
          </span>
        </div>
      )}

      <div className="assets-tabs">
        <button
          className={`assets-tab ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => handleTabChange('personal')}
        >
          Personal Assets
        </button>
        <button
          className={`assets-tab ${activeTab === 'corp' ? 'active' : ''}`}
          onClick={() => handleTabChange('corp')}
        >
          Corporation Assets
        </button>
      </div>

      {activeTab === 'corp' && renderCorpContent()}

      {(activeTab === 'personal' ? !loading && !scopeError : !corpLoading && !corpAccessError) && (
        <>
          <div className="assets-filter-bar">
            <input
              type="text"
              className="assets-filter-input"
              placeholder="Filter by item name, station, system, character..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            {activeTab === 'personal' && assetCharacters.length > 1 && (
              <select
                className="assets-char-filter"
                value={characterFilter}
                onChange={e => setCharacterFilter(e.target.value)}
              >
                <option value="all">All Characters</option>
                {assetCharacters.map(c => (
                  <option key={c.character_id} value={c.character_id}>
                    {c.character_name}
                  </option>
                ))}
              </select>
            )}
            <span className="assets-stats">
              {totalItems} items &bull; {totalUnits.toLocaleString()} units &bull; {locationCount} locations
            </span>
          </div>

          {loading ? (
            <div className="assets-loading">
              <div className="spinner"></div>
              <span>Loading assets...</span>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="assets-empty">No assets found.</div>
          ) : (
            Object.entries(grouped)
              .sort(([, a], [, b]) => b.length - a.length)
              .map(([locId, items]) => {
                const isExpanded = expandedLocations[locId] !== false;
                const sortedItems = [...items].sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
                const showCharCol = !selectedCharacter && characterFilter === 'all';

                return (
                  <div className="assets-location-group" key={locId}>
                    <div
                      className="assets-location-header"
                      onClick={() => toggleLocation(locId)}
                    >
                      <span className="assets-location-title">
                        {isExpanded ? '▾' : '▸'} {locId}
                      </span>
                      <div className="assets-location-badges">
                        <span className="badge badge-amber">{items.length} items</span>
                        <span className="badge badge-gray">
                          {items.reduce((s, a) => s + (a.quantity || 1), 0).toLocaleString()} units
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <table className="assets-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th className="text-right">Qty</th>
                            <th>Flag</th>
                            <th>State</th>
                            {showCharCol && <th>Character</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedItems.map((asset, idx) => (
                            <tr key={`${asset.item_id || idx}`}>
                              <td className="item-name">{asset.type_name || `Type ${asset.type_id}`}</td>
                              <td className="text-right qty-value">
                                {(asset.quantity || 1).toLocaleString()}
                              </td>
                              <td>
                                <span className="badge badge-blue">
                                  {asset.location_flag || '—'}
                                </span>
                              </td>
                              <td>
                                {asset.is_singleton ? (
                                  <span className="badge assembled-badge">Assembled</span>
                                ) : (
                                  <span className="badge badge-gray">Stack</span>
                                )}
                              </td>
                              {showCharCol && (
                                <td style={{ color: '#a0aec0', fontSize: 12 }}>
                                  {asset.character_name || '—'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })
          )}
        </>
      )}
    </div>
  );
}

export default Assets;
