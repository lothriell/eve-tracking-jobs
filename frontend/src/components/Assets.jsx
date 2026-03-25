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
  const [expanded, setExpanded] = useState({});

  const loadPersonalAssets = useCallback(async () => {
    setLoading(true);
    setScopeError(false);
    try {
      const charsResponse = await getAllCharacters();
      setCharacters(charsResponse.data.characters || []);
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
      setCorpAccessError({ type: 'error', message: 'Failed to load corporation assets' });
    } finally {
      setCorpLoading(false);
    }
  }, [selectedCharacter]);

  useEffect(() => {
    setFilter('');
    setCharacterFilter('all');
    setExpanded({});
    setCorpAssets([]);
    setCorpAccessError(null);
    loadPersonalAssets();
  }, [loadPersonalAssets]);

  useEffect(() => {
    if (activeTab === 'corp' && corpAssets.length === 0 && !corpAccessError) {
      loadCorpAssets();
    }
  }, [activeTab, corpAssets.length, corpAccessError, loadCorpAssets]);

  const toggle = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Build hierarchical tree: System → Station → Container → Items
  const buildTree = (assets) => {
    let filtered = assets;

    // Character filter
    if (characterFilter !== 'all') {
      filtered = filtered.filter(a => String(a.character_id) === characterFilter);
    }

    // Text filter
    const f = filter.toLowerCase();
    if (f) {
      filtered = filtered.filter(a =>
        (a.type_name || '').toLowerCase().includes(f) ||
        (a.location_name || '').toLowerCase().includes(f) ||
        (a.system_name || '').toLowerCase().includes(f) ||
        (a.container_name || '').toLowerCase().includes(f) ||
        (a.character_name || '').toLowerCase().includes(f)
      );
    }

    // Group: system → station → container → items
    // If system_name is missing, use location_name as the system-level label
    const tree = {};
    filtered.forEach(a => {
      const sys = a.system_name || a.location_name || 'Unknown Location';
      const station = a.system_name ? (a.location_name || 'Unknown Location') : null;
      const container = a.container_name || null;

      if (!tree[sys]) tree[sys] = {};

      // If station is null (no system resolved), items go directly under system level
      const stationKey = station || '__direct__';
      if (!tree[sys][stationKey]) tree[sys][stationKey] = { direct: [], containers: {} };

      if (container) {
        const contKey = `${container} #${a.container_id || ''}`;
        if (!tree[sys][stationKey].containers[contKey]) {
          tree[sys][stationKey].containers[contKey] = { name: container, items: [] };
        }
        tree[sys][stationKey].containers[contKey].items.push(a);
      } else {
        tree[sys][stationKey].direct.push(a);
      }
    });

    return { tree, totalItems: filtered.length, totalUnits: filtered.reduce((s, a) => s + (a.quantity || 1), 0) };
  };

  const assetCharacters = [...new Map(
    personalAssets
      .filter(a => a.character_id && a.character_name)
      .map(a => [a.character_id, { character_id: a.character_id, character_name: a.character_name }])
  ).values()];

  const currentAssets = activeTab === 'personal' ? personalAssets : corpAssets;
  const { tree, totalItems, totalUnits } = buildTree(currentAssets);
  const systemCount = Object.keys(tree).length;
  const showCharCol = !selectedCharacter && characterFilter === 'all';

  const renderItemsTable = (items) => {
    const sorted = [...items].sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
    return (
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
          {sorted.map((asset, idx) => (
            <tr key={asset.item_id || idx}>
              <td className="item-name">{asset.type_name || `Type ${asset.type_id}`}</td>
              <td className="text-right qty-value">{(asset.quantity || 1).toLocaleString()}</td>
              <td><span className="badge badge-blue">{asset.location_flag || '—'}</span></td>
              <td>
                {asset.is_singleton
                  ? <span className="badge assembled-badge">Assembled</span>
                  : <span className="badge badge-gray">Stack</span>
                }
              </td>
              {showCharCol && <td style={{ color: '#a0aec0', fontSize: 12 }}>{asset.character_name || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderCorpContent = () => {
    if (corpLoading) return <div className="assets-loading"><div className="spinner"></div><span>Loading corporation assets...</span></div>;
    if (corpAccessError) {
      if (corpAccessError.type === 'info') return <div className="assets-empty"><p>{corpAccessError.message}</p></div>;
      if (corpAccessError.type === 'reauth') return <div className="reauth-banner"><span className="reauth-icon">⚠️</span><span>{corpAccessError.message}. Re-add the character to grant the new scopes.</span></div>;
      if (corpAccessError.type === 'role') return <div className="no-access-panel"><div className="no-access-icon">🔒</div><strong>Access Denied</strong><p>{corpAccessError.message}</p></div>;
      return <div className="assets-error">{corpAccessError.message}</div>;
    }
    return null;
  };

  const isContentReady = activeTab === 'personal' ? !loading && !scopeError : !corpLoading && !corpAccessError;

  return (
    <div className="assets-container">
      {scopeError && activeTab === 'personal' && (
        <div className="reauth-banner">
          <span className="reauth-icon">⚠️</span>
          <span>Some characters need re-authorization to read assets.</span>
        </div>
      )}

      <div className="assets-tabs">
        <button className={`assets-tab ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => { setActiveTab('personal'); setFilter(''); }}>
          Personal Assets
        </button>
        <button className={`assets-tab ${activeTab === 'corp' ? 'active' : ''}`} onClick={() => { setActiveTab('corp'); setFilter(''); }}>
          Corporation Assets
        </button>
      </div>

      {activeTab === 'corp' && renderCorpContent()}

      {isContentReady && (
        <>
          <div className="assets-filter-bar">
            <input
              type="text"
              className="assets-filter-input"
              placeholder="Filter by item, station, system, container, character..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            {activeTab === 'personal' && assetCharacters.length > 1 && (
              <select className="assets-char-filter" value={characterFilter} onChange={e => setCharacterFilter(e.target.value)}>
                <option value="all">All Characters</option>
                {assetCharacters.map(c => <option key={c.character_id} value={c.character_id}>{c.character_name}</option>)}
              </select>
            )}
            <span className="assets-stats">
              {totalItems} items &bull; {totalUnits.toLocaleString()} units &bull; {systemCount} systems
            </span>
          </div>

          {loading ? (
            <div className="assets-loading"><div className="spinner"></div><span>Loading assets...</span></div>
          ) : systemCount === 0 ? (
            <div className="assets-empty">No assets found.</div>
          ) : (
            Object.entries(tree)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([systemName, stations]) => {
                const sysKey = `sys_${systemName}`;
                const sysExpanded = expanded[sysKey] !== false; // default open
                const sysItemCount = Object.values(stations).reduce((s, st) =>
                  s + st.direct.length + Object.values(st.containers).reduce((cs, c) => cs + c.items.length, 0), 0);

                return (
                  <div className="asset-system-group" key={systemName}>
                    <div className="asset-system-header" onClick={() => toggle(sysKey)}>
                      <span className="asset-system-title">
                        {sysExpanded ? '▾' : '▸'} {systemName}
                      </span>
                      <span className="badge badge-blue">{sysItemCount} items</span>
                    </div>

                    {sysExpanded && Object.entries(stations)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([stationName, stationData]) => {
                        const isDirectLevel = stationName === '__direct__';
                        const staKey = `sta_${systemName}_${stationName}`;
                        const staExpanded = expanded[staKey] !== false;
                        const staItemCount = stationData.direct.length +
                          Object.values(stationData.containers).reduce((s, c) => s + c.items.length, 0);
                        const containerEntries = Object.entries(stationData.containers);

                        // If no station level (unresolved system), render items directly under system
                        if (isDirectLevel) {
                          return (
                            <div className="asset-station-content" key="__direct__">
                              {stationData.direct.length > 0 && renderItemsTable(stationData.direct)}
                              {containerEntries.map(([contKey, contData]) => {
                                const cKey = `cont_${systemName}_direct_${contKey}`;
                                const contExpanded = expanded[cKey] === true;
                                return (
                                  <div className="asset-container-group" key={contKey}>
                                    <div className="asset-container-header" onClick={() => toggle(cKey)}>
                                      <span className="asset-container-title">{contExpanded ? '▾' : '▸'} {contData.name}</span>
                                      <span className="badge badge-gray">{contData.items.length} items</span>
                                    </div>
                                    {contExpanded && <div className="asset-container-content">{renderItemsTable(contData.items)}</div>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        return (
                          <div className="asset-station-group" key={stationName}>
                            <div className="asset-station-header" onClick={() => toggle(staKey)}>
                              <span className="asset-station-title">
                                {staExpanded ? '▾' : '▸'} {stationName}
                              </span>
                              <div className="assets-location-badges">
                                <span className="badge badge-amber">{staItemCount} items</span>
                                {containerEntries.length > 0 && (
                                  <span className="badge badge-gray">{containerEntries.length} containers</span>
                                )}
                              </div>
                            </div>

                            {staExpanded && (
                              <div className="asset-station-content">
                                {stationData.direct.length > 0 && renderItemsTable(stationData.direct)}
                                {containerEntries.map(([contKey, contData]) => {
                                  const cKey = `cont_${systemName}_${stationName}_${contKey}`;
                                  const contExpanded = expanded[cKey] === true;
                                  return (
                                    <div className="asset-container-group" key={contKey}>
                                      <div className="asset-container-header" onClick={() => toggle(cKey)}>
                                        <span className="asset-container-title">{contExpanded ? '▾' : '▸'} {contData.name}</span>
                                        <span className="badge badge-gray">{contData.items.length} items</span>
                                      </div>
                                      {contExpanded && <div className="asset-container-content">{renderItemsTable(contData.items)}</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    }
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
