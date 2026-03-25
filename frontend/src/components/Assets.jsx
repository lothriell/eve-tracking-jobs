import React, { useEffect, useState, useCallback } from 'react';
import { getCharacterAssets, getCorporationAssets } from '../services/api';
import './Assets.css';

function Assets({ selectedCharacter, onError }) {
  const [activeTab, setActiveTab] = useState('personal');
  const [personalAssets, setPersonalAssets] = useState([]);
  const [corpAssets, setCorpAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corpLoading, setCorpLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [scopeError, setScopeError] = useState(false);
  const [corpAccessError, setCorpAccessError] = useState(null);
  const [expandedLocations, setExpandedLocations] = useState({});

  const loadPersonalAssets = useCallback(async () => {
    if (!selectedCharacter) return;
    setLoading(true);
    setScopeError(false);

    try {
      const response = await getCharacterAssets(selectedCharacter.character_id);
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
    if (!selectedCharacter) return;
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
    if (!selectedCharacter) {
      setLoading(false);
      return;
    }
    setFilter('');
    setExpandedLocations({});
    loadPersonalAssets();
  }, [selectedCharacter, loadPersonalAssets]);

  useEffect(() => {
    if (activeTab === 'corp' && selectedCharacter && corpAssets.length === 0 && !corpAccessError) {
      loadCorpAssets();
    }
  }, [activeTab, selectedCharacter, corpAssets.length, corpAccessError, loadCorpAssets]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setFilter('');
  };

  const toggleLocation = (locId) => {
    setExpandedLocations(prev => ({ ...prev, [locId]: !prev[locId] }));
  };

  const getFilteredGrouped = (assets) => {
    const f = filter.toLowerCase();
    const filtered = f
      ? assets.filter(a =>
          (a.type_name || '').toLowerCase().includes(f) ||
          (a.location_name || '').toLowerCase().includes(f) ||
          String(a.type_id).includes(f) ||
          String(a.location_id).includes(f)
        )
      : assets;

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

  if (!selectedCharacter) {
    return (
      <div className="assets-container">
        <div className="select-character-prompt">
          <div className="prompt-icon">📦</div>
          <h3>Select a Character</h3>
          <p>Choose a character from the sidebar to view their assets.</p>
        </div>
      </div>
    );
  }

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
            This character needs re-authorization to read assets. Re-add the character to grant the new scopes.
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
              placeholder="Filter by item name, station, system..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <span className="assets-stats">
              {totalItems} items &bull; {totalUnits.toLocaleString()} units &bull; {locationCount} locations
            </span>
          </div>

          {activeTab === 'personal' && loading ? (
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
                const isExpanded = expandedLocations[locId] !== false; // default expanded
                const sortedItems = [...items].sort((a, b) => (b.quantity || 1) - (a.quantity || 1));

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
