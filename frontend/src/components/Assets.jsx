import React, { useEffect, useState, useCallback } from 'react';
import { getCharacterAssets, getCorporationAssets, getAllCharacters, nameStructure } from '../services/api';
import ExternalLinks from './ExternalLinks';
import ExportButton from './ExportButton';
import './Assets.css';

function formatISK(value) {
  if (!value || value === 0) return '—';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function Assets({ onError, refreshKey }) {
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
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [viewMode, setViewMode] = useState('tree'); // 'tree' or 'value'
  const [priceMode, setPriceMode] = useState('average'); // 'average', 'jita_sell', 'jita_buy'

  const loadPersonalAssets = useCallback(async () => {
    setLoading(true);
    setScopeError(false);
    try {
      const charsResponse = await getAllCharacters();
      setCharacters(charsResponse.data.characters || []);
      // Always fetch all — filter client-side via characterFilter
      const response = await getCharacterAssets(null, true, priceMode);
      const data = response.data;
      if (data.error === 'missing_scope') {
        setScopeError(true);
        setPersonalAssets([]);
      } else {
        setPersonalAssets(data.assets || []);
      }
    } catch (err) {
      console.error('Failed to load personal assets:', err);
      const status = err.response?.status;
      if (status === 502 || status === 503 || status === 504) {
        if (onError) onError('EVE servers are in maintenance — data will refresh automatically when they come back online.');
      } else {
        if (onError) onError('Failed to load assets');
      }
    } finally {
      setLoading(false);
    }
  }, [onError, priceMode]);

  const loadCorpAssets = useCallback(async () => {
    if (characterFilter === 'all') {
      setCorpAccessError({ type: 'info', message: 'Select a character to view corporation assets' });
      return;
    }
    setCorpLoading(true);
    setCorpAccessError(null);
    try {
      const response = await getCorporationAssets(parseInt(characterFilter), priceMode);
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
  }, [characterFilter, priceMode]);

  useEffect(() => {
    setFilter('');
    setExpanded({});
    setCorpAssets([]);
    setCorpAccessError(null);
    loadPersonalAssets();
  }, [loadPersonalAssets, refreshKey]);

  useEffect(() => {
    if (activeTab === 'corp') {
      loadCorpAssets();
    }
  }, [activeTab, characterFilter, loadCorpAssets]);

  const toggle = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const collapseAll = (treeData) => {
    const collapsed = {};
    Object.keys(treeData).forEach(sys => {
      collapsed[`sys_${sys}`] = false;
    });
    setExpanded(collapsed);
  };

  const expandAll = () => {
    setExpanded({});
  };

  const startRename = (e, key, structureId, currentName) => {
    e.stopPropagation();
    setRenaming({ key, structureId });
    setRenameValue(currentName.startsWith('Player Structure') ? '' : currentName);
  };

  const submitRename = async (e) => {
    e.preventDefault();
    if (!renaming || !renameValue.trim()) return;
    try {
      await nameStructure(renaming.structureId, renameValue.trim());
      setRenaming(null);
      loadPersonalAssets(); // Reload to show new name
    } catch (err) {
      console.error('Failed to rename structure:', err);
    }
  };

  // Build hierarchical tree: System → Station → Container → Items
  const buildTree = (assets) => {
    let filtered = assets;

    // Character filter (only for personal assets — corp assets are corp-wide)
    if (activeTab === 'personal' && characterFilter !== 'all') {
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
    const tree = {};
    const structureIds = {}; // map system/station label → structure location_id
    filtered.forEach(a => {
      const sys = a.system_name || a.location_name || 'Unknown Location';
      const station = a.system_name ? (a.location_name || 'Unknown Location') : null;
      const container = a.container_name || null;

      if (!tree[sys]) tree[sys] = {};

      // Track structure IDs for rename feature
      if (a.location_name && a.location_name.startsWith('Player Structure') && a.root_location_id) {
        structureIds[a.location_name] = a.root_location_id;
      }

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

    const totalValue = filtered.reduce((s, a) => s + (a.total_price || 0), 0);
    return { tree, structureIds, totalItems: filtered.length, totalUnits: filtered.reduce((s, a) => s + (a.quantity || 1), 0), totalValue };
  };

  const assetCharacters = [...new Map(
    personalAssets
      .filter(a => a.character_id && a.character_name)
      .map(a => [a.character_id, { character_id: a.character_id, character_name: a.character_name }])
  ).values()];

  const currentAssets = activeTab === 'personal' ? personalAssets : corpAssets;
  const { tree, structureIds, totalItems, totalUnits, totalValue } = buildTree(currentAssets);
  const systemCount = Object.keys(tree).length;
  const allCollapsed = systemCount > 0 && Object.keys(tree).every(sys => expanded[`sys_${sys}`] === false);
  const showCharCol = characterFilter === 'all';

  const renderItemsTable = (items) => {
    const sorted = [...items].sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
    return (
      <table className="assets-table">
        <thead>
          <tr>
            <th className="col-item">Item</th>
            <th className="col-qty text-right">Qty</th>
            <th className="col-isk text-right">Value</th>
            <th className="col-flag">Flag</th>
            <th className="col-state">State</th>
            {showCharCol && <th className="col-character">Character</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((asset, idx) => (
            <tr key={asset.item_id || idx}>
              <td className="item-name">{asset.type_name || `Type ${asset.type_id}`} <ExternalLinks type="item" typeId={asset.type_id} /></td>
              <td className="text-right qty-value">{(asset.quantity || 1).toLocaleString()}</td>
              <td className="text-right isk-cell">{asset.total_price > 0 ? formatISK(asset.total_price) : '—'}</td>
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

  const getFilteredFlat = (assets) => {
    let filtered = assets;
    if (activeTab === 'personal' && characterFilter !== 'all') {
      filtered = filtered.filter(a => String(a.character_id) === characterFilter);
    }
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
    return [...filtered].sort((a, b) => (b.total_price || 0) - (a.total_price || 0));
  };

  const renderValueView = () => {
    const sorted = getFilteredFlat(currentAssets);
    const valTotal = sorted.reduce((s, a) => s + (a.total_price || 0), 0);

    if (sorted.length === 0) return <div className="assets-empty">No assets found.</div>;

    return (
      <div className="value-view">
        <table className="assets-table value-table">
          <thead>
            <tr>
              <th className="col-val-item">Item</th>
              <th className="col-val-qty text-right">Qty</th>
              <th className="col-val-value text-right">Value</th>
              <th className="col-val-location">Location</th>
              {showCharCol && <th className="col-val-char">Character</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((asset, idx) => {
              const breadcrumb = [
                asset.system_name,
                asset.location_name,
                asset.container_name,
              ].filter(Boolean).join(' › ');

              return (
                <tr key={asset.item_id || idx}>
                  <td className="item-name">{asset.type_name || `Type ${asset.type_id}`} <ExternalLinks type="item" typeId={asset.type_id} /></td>
                  <td className="text-right qty-value">{(asset.quantity || 1).toLocaleString()}</td>
                  <td className="text-right isk-cell">{asset.total_price > 0 ? formatISK(asset.total_price) : '—'}</td>
                  <td className="location-breadcrumb" title={breadcrumb}>{breadcrumb || '—'}</td>
                  {showCharCol && <td style={{ color: '#a0aec0', fontSize: 12 }}>{asset.character_name || '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="value-view-footer">
          {sorted.length} items &bull; Total: <span className="isk-value">{formatISK(valTotal)} ISK</span>
        </div>
      </div>
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

      <div className="assets-toolbar">
        <div className="assets-toolbar-left">
          <button className={`assets-tab ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => { setActiveTab('personal'); setFilter(''); }}>
            Personal Assets
          </button>
          <button className={`assets-tab ${activeTab === 'corp' ? 'active' : ''}`} onClick={() => { setActiveTab('corp'); setFilter(''); }}>
            Corporation Assets
          </button>
          {characters.length > 1 && (
            <select className="assets-char-filter" value={characterFilter} onChange={e => setCharacterFilter(e.target.value)}>
              <option value="all">All Characters</option>
              {characters.map(c => <option key={c.character_id} value={c.character_id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="assets-toolbar-right">
          <select className="assets-price-mode" value={priceMode} onChange={e => setPriceMode(e.target.value)} title="Price source">
            <option value="average">AVG Price</option>
            <option value="jita_sell">Jita Sell</option>
            <option value="jita_buy">Jita Buy</option>
          </select>
          <button
            className={`assets-view-btn ${viewMode === 'value' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === 'tree' ? 'value' : 'tree')}
            title={viewMode === 'tree' ? 'Sort by value' : 'Tree view'}
          >
            {viewMode === 'tree' ? '💰 Value' : '🌳 Tree'}
          </button>
          {viewMode === 'tree' && systemCount > 0 && (
            <button className="assets-collapse-btn" onClick={allCollapsed ? expandAll : () => collapseAll(tree)} title={allCollapsed ? 'Expand All' : 'Collapse All'}>
              {allCollapsed ? '▸ Expand' : '▾ Collapse'}
            </button>
          )}
          <input
            type="text"
            className="assets-filter-input"
            placeholder="Filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <ExportButton
            getData={() => getFilteredFlat(currentAssets)}
            columns={[
              { key: 'type_name', label: 'Item' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'total_price', label: 'Value' },
              { key: 'system_name', label: 'System' },
              { key: 'location_name', label: 'Location' },
              { key: 'container_name', label: 'Container' },
              { key: 'character_name', label: 'Character' },
              { key: 'location_flag', label: 'Flag' },
            ]}
            filename="assets"
          />
          <span className="assets-stats">
            {totalItems} items &bull; {totalUnits.toLocaleString()} units &bull; {systemCount} systems
            {totalValue > 0 && <> &bull; <span className="isk-value">{formatISK(totalValue)} ISK</span></>}
          </span>
        </div>
      </div>

      {activeTab === 'corp' && renderCorpContent()}

      {isContentReady && (
        <>

          {loading ? (
            <div className="assets-loading"><div className="spinner"></div><span>Loading assets...</span></div>
          ) : viewMode === 'value' ? (
            renderValueView()
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
                const sysValue = Object.values(stations).reduce((s, st) =>
                  s + st.direct.reduce((ds, a) => ds + (a.total_price || 0), 0) +
                  Object.values(st.containers).reduce((cs, c) => cs + c.items.reduce((is, a) => is + (a.total_price || 0), 0), 0), 0);

                return (
                  <div className="asset-system-group" key={systemName}>
                    <div className="asset-system-header" onClick={() => toggle(sysKey)}>
                      <span className="asset-system-title">
                        {sysExpanded ? '▾' : '▸'} {renaming?.key === `sys_${systemName}` ? (
                          <form onSubmit={submitRename} style={{ display: 'inline' }} onClick={e => e.stopPropagation()}>
                            <input
                              className="rename-input"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              placeholder="Enter structure name..."
                              autoFocus
                              onBlur={() => setRenaming(null)}
                            />
                          </form>
                        ) : systemName}
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {systemName.startsWith('Player Structure') && structureIds[systemName] && !renaming && (
                          <button
                            className="rename-btn"
                            onClick={e => startRename(e, `sys_${systemName}`, structureIds[systemName], systemName)}
                            title="Click to name this structure"
                          >
                            Rename
                          </button>
                        )}
                        <span className="badge badge-blue">{sysItemCount} items</span>
                        {sysValue > 0 && <span className="badge badge-isk">{formatISK(sysValue)}</span>}
                      </div>
                    </div>

                    {sysExpanded && Object.entries(stations)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([stationName, stationData]) => {
                        const isDirectLevel = stationName === '__direct__';
                        const staKey = `sta_${systemName}_${stationName}`;
                        const staExpanded = expanded[staKey] !== false;
                        const staItemCount = stationData.direct.length +
                          Object.values(stationData.containers).reduce((s, c) => s + c.items.length, 0);
                        const staValue = stationData.direct.reduce((s, a) => s + (a.total_price || 0), 0) +
                          Object.values(stationData.containers).reduce((s, c) => s + c.items.reduce((is, a) => is + (a.total_price || 0), 0), 0);
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
                                      <div className="assets-location-badges">
                                        <span className="badge badge-gray">{contData.items.length} items</span>
                                        {(() => { const cv = contData.items.reduce((s, a) => s + (a.total_price || 0), 0); return cv > 0 ? <span className="badge badge-isk">{formatISK(cv)}</span> : null; })()}
                                      </div>
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
                                {staValue > 0 && <span className="badge badge-isk">{formatISK(staValue)}</span>}
                              </div>
                            </div>

                            {staExpanded && (
                              <div className="asset-station-content">
                                {stationData.direct.length > 0 && renderItemsTable(stationData.direct)}
                                {containerEntries.map(([contKey, contData]) => {
                                  const cKey = `cont_${systemName}_${stationName}_${contKey}`;
                                  const contExpanded = expanded[cKey] === true;
                                  const contValue = contData.items.reduce((s, a) => s + (a.total_price || 0), 0);
                                  return (
                                    <div className="asset-container-group" key={contKey}>
                                      <div className="asset-container-header" onClick={() => toggle(cKey)}>
                                        <span className="asset-container-title">{contExpanded ? '▾' : '▸'} {contData.name}</span>
                                        <div className="assets-location-badges">
                                          <span className="badge badge-gray">{contData.items.length} items</span>
                                          {contValue > 0 && <span className="badge badge-isk">{formatISK(contValue)}</span>}
                                        </div>
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
