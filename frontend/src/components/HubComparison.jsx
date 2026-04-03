import React, { useEffect, useState, useCallback } from 'react';
import { getTradeHubs, getHubComparison, addTradeHub, removeTradeHub, toggleTradeHub, searchStations, searchTypes } from '../services/api';
import ExportButton from './ExportButton';
import ExternalLinks from './ExternalLinks';
import './HubComparison.css';

function formatISK(value) {
  if (!value || value === 0) return '—';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
}

function formatVolume(value) {
  if (!value || value === 0) return '—';
  return value.toLocaleString();
}

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function HubComparison({ onError, refreshKey }) {
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [searchTypeId, setSearchTypeId] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [typeResults, setTypeResults] = useState([]);
  const [typeSearchTimeout, setTypeSearchTimeout] = useState(null);
  const [searchingTypes, setSearchingTypes] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [addingHub, setAddingHub] = useState(false);
  const [stationSearch, setStationSearch] = useState('');
  const [stationResults, setStationResults] = useState([]);
  const [searchingStations, setSearchingStations] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  const loadHubs = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await getTradeHubs();
      setHubs(resp.data.hubs || []);
    } catch (err) {
      if (err.response?.status !== 403) {
        onError?.('Failed to load trade hubs');
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { loadHubs(); }, [loadHubs, refreshKey]);

  const handleSearchInput = (value) => {
    setSearchText(value);
    setTypeResults([]);
    if (typeSearchTimeout) clearTimeout(typeSearchTimeout);

    // If it's a number, don't autocomplete
    if (/^\d+$/.test(value.trim())) return;

    if (value.trim().length < 2) return;

    const timeout = setTimeout(async () => {
      try {
        setSearchingTypes(true);
        const resp = await searchTypes(value.trim());
        setTypeResults(resp.data.results || []);
      } catch {
        setTypeResults([]);
      } finally {
        setSearchingTypes(false);
      }
    }, 300);
    setTypeSearchTimeout(timeout);
  };

  const handleSearch = async () => {
    const text = searchText.trim();
    if (!text) return;
    setTypeResults([]);

    const typeId = parseInt(text);
    if (typeId && typeId > 0) {
      await fetchComparison(typeId);
    }
  };

  const handleTypeSelect = (type) => {
    setSearchText(type.name);
    setTypeResults([]);
    fetchComparison(type.type_id);
  };

  const fetchComparison = async (typeId) => {
    try {
      setComparing(true);
      setSearchTypeId(typeId);
      const resp = await getHubComparison(typeId);
      setComparison(resp.data);
    } catch (err) {
      onError?.('Failed to compare item');
    } finally {
      setComparing(false);
    }
  };

  const handleStationSearch = (query) => {
    setStationSearch(query);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (query.length < 2) {
      setStationResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setSearchingStations(true);
        const resp = await searchStations(query);
        setStationResults(resp.data.results || []);
      } catch {
        setStationResults([]);
      } finally {
        setSearchingStations(false);
      }
    }, 300);
    setSearchTimeout(timeout);
  };

  const handleAddFromSearch = async (station) => {
    try {
      setAddingHub(true);
      await addTradeHub(station.name, station.station_id, station.region_id);
      setStationSearch('');
      setStationResults([]);
      await loadHubs();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to add hub');
    } finally {
      setAddingHub(false);
    }
  };

  const handleRemoveHub = async (hubId) => {
    try {
      await removeTradeHub(hubId);
      await loadHubs();
    } catch (err) {
      onError?.('Failed to remove hub');
    }
  };

  const handleToggleHub = async (hubId, enabled) => {
    try {
      await toggleTradeHub(hubId, enabled);
      await loadHubs();
    } catch (err) {
      onError?.('Failed to toggle hub');
    }
  };

  // Find best prices for highlighting
  const bestSell = comparison?.hubs ? Math.min(...comparison.hubs.filter(h => h.sell_min > 0).map(h => h.sell_min)) : 0;
  const bestBuy = comparison?.hubs ? Math.max(...comparison.hubs.map(h => h.buy_max)) : 0;

  if (loading) {
    return (
      <div className="hub-comparison-container">
        <div className="hub-loading"><div className="spinner"></div><p>Loading trade hubs...</p></div>
      </div>
    );
  }

  return (
    <div className="hub-comparison-container">
      <div className="hub-toolbar">
        <div className="hub-toolbar-left">
          <h2>Hub Price Comparison</h2>
        </div>
        <div className="hub-toolbar-right">
          <button
            className={`hub-manager-btn ${showManager ? 'active' : ''}`}
            onClick={() => setShowManager(!showManager)}
            title="Manage Hubs"
          >
            ⚙ Hubs ({hubs.length})
          </button>
          {comparison && (
            <ExportButton
              getData={() => comparison.hubs.map(h => ({
                hub: h.hub_name,
                sell_min: h.sell_min,
                buy_max: h.buy_max,
                sell_volume: h.sell_volume,
                buy_volume: h.buy_volume,
              }))}
              columns={[
                { key: 'hub', label: 'Hub' },
                { key: 'sell_min', label: 'Sell Min' },
                { key: 'buy_max', label: 'Buy Max' },
                { key: 'sell_volume', label: 'Sell Volume' },
                { key: 'buy_volume', label: 'Buy Volume' },
              ]}
              filename={`hub-compare-${comparison.type_id}`}
            />
          )}
        </div>
      </div>

      {/* Hub Manager Panel */}
      {showManager && (
        <div className="hub-manager-panel">
          <div className="hub-manager-header">
            <h3>Trade Hubs</h3>
          </div>
          <div className="hub-manager-list">
            {hubs.map(hub => (
              <div key={hub.id} className={`hub-manager-item ${!hub.enabled ? 'disabled' : ''}`}>
                <div className="hub-manager-info">
                  <span className="hub-name">{hub.name}</span>
                  {hub.is_default ? <span className="hub-badge default">Default</span> : null}
                  {hub.is_structure ? <span className="hub-badge structure">Structure</span> : null}
                  <span className={`hub-status ${hub.refresh?.status || 'pending'}`}>
                    {hub.refresh?.last_refresh_at ? timeAgo(hub.refresh.last_refresh_at) : 'pending'}
                  </span>
                </div>
                <div className="hub-manager-actions">
                  <button
                    className={`hub-toggle-btn ${hub.enabled ? 'on' : 'off'}`}
                    onClick={() => handleToggleHub(hub.id, !hub.enabled)}
                    title={hub.enabled ? 'Disable' : 'Enable'}
                  >
                    {hub.enabled ? 'ON' : 'OFF'}
                  </button>
                  {!hub.is_default && (
                    <button
                      className="hub-remove-btn"
                      onClick={() => handleRemoveHub(hub.id)}
                      title="Remove hub"
                    >
                      x
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="hub-add-search">
            <div className="hub-search-input-wrap">
              <input
                type="text"
                placeholder="Search station or structure name..."
                value={stationSearch}
                onChange={e => handleStationSearch(e.target.value)}
              />
              {searchingStations && <span className="search-spinner">...</span>}
            </div>
            {stationResults.length > 0 && (
              <div className="hub-search-results">
                {stationResults.map(s => (
                  <div
                    key={s.station_id}
                    className="hub-search-result"
                    onClick={() => !addingHub && handleAddFromSearch(s)}
                  >
                    <span className="result-name">{s.name}</span>
                    <span className={`result-type ${s.type}`}>{s.type === 'structure' ? 'Player Structure' : 'NPC Station'}</span>
                  </div>
                ))}
              </div>
            )}
            {stationSearch.length >= 2 && stationResults.length === 0 && !searchingStations && (
              <div className="hub-search-results">
                <div className="hub-search-empty">No stations found matching "{stationSearch}"</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="hub-search-container">
        <div className="hub-search">
          <input
            type="text"
            placeholder="Search item name or enter type ID..."
            value={searchText}
            onChange={e => handleSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={comparing || !searchText.trim()}>
            {comparing ? 'Searching...' : 'Compare'}
          </button>
        </div>
        {typeResults.length > 0 && (
          <div className="type-search-results">
            {typeResults.map(t => (
              <div key={t.type_id} className="type-search-result" onClick={() => handleTypeSelect(t)}>
                <span className="result-name">{t.name}</span>
                <span className="result-type-id">ID: {t.type_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick search buttons */}
      <div className="hub-quick-search">
        {[
          { id: 34, name: 'Tritanium' },
          { id: 36, name: 'Mexallon' },
          { id: 44992, name: 'PLEX' },
          { id: 40520, name: 'Skill Injector' },
          { id: 29668, name: 'PLEX (old)' },
        ].map(item => (
          <button
            key={item.id}
            className={`quick-btn ${searchTypeId === item.id ? 'active' : ''}`}
            onClick={() => { setSearchText(String(item.id)); fetchComparison(item.id); }}
          >
            {item.name}
          </button>
        ))}
      </div>

      {/* Comparison Table */}
      {comparison && (
        <div className="hub-comparison-results">
          <h3 className="comparison-title">
            {comparison.type_name}
            <span className="type-id-label"> (ID: {comparison.type_id})</span>
            <ExternalLinks type="item" typeId={comparison.type_id} />
          </h3>
          <table className="hub-table">
            <thead>
              <tr>
                <th>Hub</th>
                <th className="num">Sell Min</th>
                <th className="num">Buy Max</th>
                <th className="num">Spread</th>
                <th className="num">Sell Volume</th>
                <th className="num">Buy Volume</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {comparison.hubs.map(hub => {
                const spread = hub.sell_min > 0 && hub.buy_max > 0
                  ? ((hub.sell_min - hub.buy_max) / hub.sell_min * 100).toFixed(1)
                  : null;
                return (
                  <tr key={hub.hub_id}>
                    <td className="hub-name-cell">{hub.hub_name}</td>
                    <td className={`num ${hub.sell_min === bestSell && hub.sell_min > 0 ? 'best-price' : ''}`}>
                      {formatISK(hub.sell_min)}
                    </td>
                    <td className={`num ${hub.buy_max === bestBuy && hub.buy_max > 0 ? 'best-price' : ''}`}>
                      {formatISK(hub.buy_max)}
                    </td>
                    <td className="num">{spread ? `${spread}%` : '—'}</td>
                    <td className="num">{formatVolume(hub.sell_volume)}</td>
                    <td className="num">{formatVolume(hub.buy_volume)}</td>
                    <td>
                      <span className={`refresh-badge ${hub.refresh?.status || 'pending'}`}>
                        {hub.refresh?.last_refresh_at ? timeAgo(hub.refresh.last_refresh_at) : 'pending'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Freshness bar */}
      {hubs.length > 0 && (
        <div className="hub-freshness">
          {hubs.filter(h => h.enabled).map(h => {
            const refresh = h.refresh || {};
            const isStale = refresh.last_refresh_at && (Date.now() - new Date(refresh.last_refresh_at + 'Z').getTime()) > 3600000;
            return (
              <span key={h.id} className={`freshness-chip ${refresh.status === 'error' ? 'error' : isStale ? 'stale' : refresh.status === 'ok' ? 'fresh' : 'pending'}`}>
                {h.name}: {refresh.last_refresh_at ? timeAgo(refresh.last_refresh_at) : 'pending'}
                {isStale && ' ⚠'}
              </span>
            );
          })}
        </div>
      )}

      {!comparison && !comparing && (
        <div className="hub-empty">
          <p>Search for an item to compare prices across {hubs.filter(h => h.enabled).length} trade hubs</p>
        </div>
      )}
    </div>
  );
}

export default HubComparison;
