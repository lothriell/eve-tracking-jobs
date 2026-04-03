import React, { useEffect, useState, useCallback } from 'react';
import { getTradeHubs, findTrades, getAllCharacters, autoDetectTradeSkills, getTradeSettings, updateTradeSettings } from '../services/api';
import ExportButton from './ExportButton';
import ExternalLinks from './ExternalLinks';
import './TradeFinder.css';

function formatISK(value) {
  if (!value || value === 0) return '—';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
}

function TradeFinder({ onError, refreshKey }) {
  const [hubs, setHubs] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Controls
  const [sourceHub, setSourceHub] = useState('');
  const [destHub, setDestHub] = useState('all');
  const [tradeType, setTradeType] = useState('B');
  const [minROI, setMinROI] = useState('5');
  const [minProfit, setMinProfit] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minVolume, setMinVolume] = useState('');

  // Results
  const [results, setResults] = useState(null);

  // Settings — separate buyer/seller characters
  const [showSettings, setShowSettings] = useState(false);
  const [buyerChar, setBuyerChar] = useState('');
  const [sellerChar, setSellerChar] = useState('');
  const [buyerSettings, setBuyerSettings] = useState(null);
  const [sellerSettings, setSellerSettings] = useState(null);
  const [detectingBuyer, setDetectingBuyer] = useState(false);
  const [detectingSeller, setDetectingSeller] = useState(false);

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      const [hubsResp, charsResp] = await Promise.all([
        getTradeHubs(),
        getAllCharacters()
      ]);
      const hubList = hubsResp.data.hubs || [];
      setHubs(hubList);
      setCharacters(charsResp.data.characters || []);

      // Default source to Jita
      const jita = hubList.find(h => h.name.includes('Jita'));
      if (jita) setSourceHub(String(jita.id));
      else if (hubList.length > 0) setSourceHub(String(hubList[0].id));
    } catch (err) {
      if (err.response?.status !== 403) {
        onError?.('Failed to load trading data');
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { loadInitial(); }, [loadInitial, refreshKey]);

  const handleSearch = async () => {
    if (!sourceHub) return;
    try {
      setSearching(true);
      const params = {
        source: sourceHub,
        dest: destHub,
        type: tradeType,
        limit: 100,
      };
      if (minROI) params.minROI = parseFloat(minROI);
      if (minProfit) params.minProfit = parseFloat(minProfit);
      if (maxPrice) params.maxPrice = parseFloat(maxPrice);
      if (minVolume) params.minVolume = parseInt(minVolume);
      if (buyerChar) params.buyerCharId = buyerChar;
      if (sellerChar) params.sellerCharId = sellerChar;

      const resp = await findTrades(params);
      setResults(resp.data);
    } catch (err) {
      onError?.('Failed to find trades');
    } finally {
      setSearching(false);
    }
  };

  const handleCopyMultiBuy = () => {
    if (!results?.opportunities?.length) return;
    const lines = results.opportunities.map(o => `${o.type_name} 1`).join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      // Brief feedback
    }).catch(() => {
      onError?.('Failed to copy to clipboard');
    });
  };

  const handleAutoDetect = async (role) => {
    const charId = role === 'buyer' ? buyerChar : sellerChar;
    if (!charId) return;
    const setDetecting = role === 'buyer' ? setDetectingBuyer : setDetectingSeller;
    const setResult = role === 'buyer' ? setBuyerSettings : setSellerSettings;
    try {
      setDetecting(true);
      const resp = await autoDetectTradeSkills(charId);
      setResult(resp.data);
    } catch (err) {
      onError?.('Failed to auto-detect skills');
    } finally {
      setDetecting(false);
    }
  };

  const loadSettings = async (charId, setResult) => {
    try {
      const resp = await getTradeSettings(charId);
      setResult(resp.data);
    } catch {
      setResult(null);
    }
  };

  const handleBuyerChange = (charId) => {
    setBuyerChar(charId);
    if (charId) loadSettings(charId, setBuyerSettings);
    // If seller not set, default to same character
    if (!sellerChar && charId) {
      setSellerChar(charId);
      loadSettings(charId, setSellerSettings);
    }
  };

  const handleSellerChange = (charId) => {
    setSellerChar(charId);
    if (charId) loadSettings(charId, setSellerSettings);
  };

  // Recap top N
  const [recapTopN, setRecapTopN] = useState(5);

  // Sort state
  const [sortCol, setSortCol] = useState('roi');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sortedOpps = results?.opportunities ? [...results.opportunities].sort((a, b) => {
    const aVal = a[sortCol] ?? 0;
    const bVal = b[sortCol] ?? 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  }) : [];

  const enabledHubs = hubs.filter(h => h.enabled);

  // Data freshness check
  const oldestRefresh = enabledHubs.reduce((oldest, h) => {
    const t = h.refresh?.last_refresh_at ? new Date(h.refresh.last_refresh_at + 'Z').getTime() : 0;
    return t > 0 && (oldest === 0 || t < oldest) ? t : oldest;
  }, 0);
  const dataAge = oldestRefresh > 0 ? Math.floor((Date.now() - oldestRefresh) / 60000) : null;
  const isStale = dataAge !== null && dataAge > 60;

  if (loading) {
    return (
      <div className="trade-finder-container">
        <div className="trade-loading"><div className="spinner"></div><p>Loading trade finder...</p></div>
      </div>
    );
  }

  return (
    <div className="trade-finder-container">
      <div className="trade-toolbar">
        <h2>Trade Finder</h2>
        <div className="trade-toolbar-right">
          {results && (
            <>
              <button className="multi-buy-btn" onClick={handleCopyMultiBuy} title="Copy item list for EVE multi-buy">
                Copy Multi-Buy
              </button>
              <ExportButton
                getData={() => sortedOpps.map(o => ({
                  item: o.type_name,
                  type_id: o.type_id,
                  buy_price: o.buy_price,
                  sell_price: o.sell_price,
                  net_profit: o.net_profit,
                  roi_pct: o.roi,
                  dest_hub: o.dest_hub_name || '',
                  dest_volume: o.dest_sell_volume,
                }))}
                columns={[
                  { key: 'item', label: 'Item' },
                  { key: 'type_id', label: 'Type ID' },
                  { key: 'buy_price', label: 'Buy Price' },
                  { key: 'sell_price', label: 'Sell Price' },
                  { key: 'net_profit', label: 'Net Profit' },
                  { key: 'roi_pct', label: 'ROI %' },
                  { key: 'dest_hub', label: 'Dest Hub' },
                  { key: 'dest_volume', label: 'Dest Volume' },
                ]}
                filename="trade-opportunities"
              />
            </>
          )}
        </div>
      </div>

      {/* Data freshness */}
      {dataAge !== null && (
        <div className={`trade-freshness ${isStale ? 'stale' : 'fresh'}`}>
          {isStale ? '⚠ ' : ''}Market data updated {dataAge < 1 ? 'just now' : dataAge < 60 ? `${dataAge}m ago` : `${Math.floor(dataAge / 60)}h ${dataAge % 60}m ago`}
          {isStale && ' — prices may be outdated'}
        </div>
      )}

      {/* Controls */}
      <div className="trade-controls">
        <div className="trade-control-row">
          <div className="control-group">
            <label>Source Hub</label>
            <select value={sourceHub} onChange={e => setSourceHub(e.target.value)}>
              {enabledHubs.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Destination</label>
            <select value={destHub} onChange={e => setDestHub(e.target.value)}>
              <option value="all">All Other Hubs</option>
              {enabledHubs.filter(h => String(h.id) !== sourceHub).map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label>Trade Type</label>
            <div className="trade-type-toggle">
              <button className={tradeType === 'B' ? 'active' : ''} onClick={() => setTradeType('B')}>
                Type B (Instant)
              </button>
              <button className={tradeType === 'A' ? 'active' : ''} onClick={() => setTradeType('A')}>
                Type A (Buy Order)
              </button>
            </div>
          </div>
        </div>
        <div className="trade-control-row">
          <div className="control-group small">
            <label>Min ROI %</label>
            <input type="number" value={minROI} onChange={e => setMinROI(e.target.value)} placeholder="5" />
          </div>
          <div className="control-group small">
            <label>Min Profit</label>
            <input type="number" value={minProfit} onChange={e => setMinProfit(e.target.value)} placeholder="ISK" />
          </div>
          <div className="control-group small">
            <label>Max Buy Price</label>
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="ISK" />
          </div>
          <div className="control-group small">
            <label>Min Volume</label>
            <input type="number" value={minVolume} onChange={e => setMinVolume(e.target.value)} placeholder="units" />
          </div>
          <div className="control-group">
            <label>&nbsp;</label>
            <button className="find-btn" onClick={handleSearch} disabled={searching || !sourceHub}>
              {searching ? 'Searching...' : 'Find Trades'}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Toggle */}
      <div className="trade-settings-bar">
        <button className={`settings-toggle ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)}>
          ⚙ Fee Settings
          {buyerSettings || sellerSettings ? ` (Buy: ${(buyerSettings?.effective_broker_fee ?? 3.0).toFixed(1)}% / Sell: ${(sellerSettings?.effective_broker_fee ?? 3.0).toFixed(1)}% + ${(sellerSettings?.effective_sales_tax ?? 3.6).toFixed(1)}% tax)` : ' (Default: 3.0% / 3.6%)'}
        </button>
      </div>

      {showSettings && (
        <div className="trade-settings-panel">
          <div className="settings-row">
            <div className="control-group">
              <label>Buyer (at source hub)</label>
              <select value={buyerChar} onChange={e => handleBuyerChange(e.target.value)}>
                <option value="">Select character...</option>
                {characters.map(c => (
                  <option key={c.character_id} value={c.character_id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button className="auto-detect-btn" onClick={() => handleAutoDetect('buyer')} disabled={!buyerChar || detectingBuyer}>
              {detectingBuyer ? '...' : 'Detect'}
            </button>
            <div className="control-group">
              <label>Seller (at dest hub)</label>
              <select value={sellerChar} onChange={e => handleSellerChange(e.target.value)}>
                <option value="">Select character...</option>
                {characters.map(c => (
                  <option key={c.character_id} value={c.character_id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button className="auto-detect-btn" onClick={() => handleAutoDetect('seller')} disabled={!sellerChar || detectingSeller}>
              {detectingSeller ? '...' : 'Detect'}
            </button>
          </div>
          <div className="settings-display-dual">
            {buyerSettings && (
              <div className="settings-char-block">
                <span className="settings-char-label">Buyer:</span>
                <span>Acct L{buyerSettings.accounting_level} / Broker L{buyerSettings.broker_relations_level} / Adv L{buyerSettings.advanced_broker_level}</span>
                <span className="settings-result">Broker: {buyerSettings.effective_broker_fee?.toFixed(2)}%</span>
              </div>
            )}
            {sellerSettings && (
              <div className="settings-char-block">
                <span className="settings-char-label">Seller:</span>
                <span>Acct L{sellerSettings.accounting_level} / Broker L{sellerSettings.broker_relations_level} / Adv L{sellerSettings.advanced_broker_level}</span>
                <span className="settings-result">Broker: {sellerSettings.effective_broker_fee?.toFixed(2)}% | Tax: {sellerSettings.effective_sales_tax?.toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.opportunities?.length > 0 && (() => {
        // Build route summaries
        const routes = {};
        for (const opp of results.opportunities) {
          const key = opp.dest_hub_name || 'Destination';
          if (!routes[key]) routes[key] = { items: 0, totalProfit: 0, bestItem: null, bestROI: 0, topItems: [] };
          const r = routes[key];
          r.items++;
          r.totalProfit += opp.net_profit;
          if (opp.roi > r.bestROI) {
            r.bestROI = opp.roi;
            r.bestItem = opp.type_name;
          }
          if (r.topItems.length < recapTopN) {
            r.topItems.push(opp);
          }
        }
        const routeEntries = Object.entries(routes).sort((a, b) => b[1].totalProfit - a[1].totalProfit);
        const grandProfit = routeEntries.reduce((s, [, r]) => s + r.totalProfit, 0);

        return (
          <div className="trade-recap">
            <div className="recap-header">
              <h3>Trade Summary</h3>
              <div className="recap-header-right">
                <span className="recap-total">{results.total} opportunities | Est. profit/unit: {formatISK(grandProfit)}</span>
                <div className="recap-topn">
                  Top
                  {[3, 5, 10, 20].map(n => (
                    <button key={n} className={recapTopN === n ? 'active' : ''} onClick={() => setRecapTopN(n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="recap-routes">
              {routeEntries.map(([dest, r]) => (
                <div key={dest} className="recap-route-card">
                  <div className="recap-route-header">
                    <span className="recap-route-name">{results.source_hub?.name} → {dest}</span>
                    <span className="recap-route-profit">{formatISK(r.totalProfit)} profit</span>
                  </div>
                  <div className="recap-route-stats">
                    <span>{r.items} items</span>
                    <span>Best ROI: {r.bestROI.toFixed(1)}%</span>
                  </div>
                  <div className="recap-top-items">
                    {r.topItems.map((item, i) => (
                      <div key={i} className="recap-item">
                        <span className="recap-item-name">{item.type_name}</span>
                        <span className="recap-item-detail">
                          Buy {formatISK(item.buy_price)} → Sell {formatISK(item.sell_price)} = <strong>{formatISK(item.net_profit)}</strong> ({item.roi.toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {results && (
        <div className="trade-results">
          <div className="trade-results-header">
            <span>{results.total} opportunities found</span>
            <span className="trade-meta">
              Source: {results.source_hub?.name} | Type {results.trade_type} | Buy Broker: {results.buy_broker_fee_pct?.toFixed(1)}% | Sell Broker: {results.sell_broker_fee_pct?.toFixed(1)}% | Tax: {results.sales_tax_pct?.toFixed(1)}%
            </span>
          </div>
          <table className="trade-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('type_name')} className="sortable">Item {sortCol === 'type_name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                {destHub === 'all' && <th>Dest Hub</th>}
                <th className="num sortable" onClick={() => handleSort('buy_price')}>Buy {sortCol === 'buy_price' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('sell_price')}>Sell {sortCol === 'sell_price' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('net_profit')}>Net Profit {sortCol === 'net_profit' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('roi')}>ROI % {sortCol === 'roi' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('dest_sell_volume')}>Dest Vol {sortCol === 'dest_sell_volume' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {sortedOpps.map((opp, i) => (
                <tr key={`${opp.type_id}-${opp.dest_hub_id || i}`}>
                  <td className="item-name">
                    <span>{opp.type_name}</span>
                    <ExternalLinks type="item" typeId={opp.type_id} />
                    <span className="type-id-small">{opp.type_id}</span>
                  </td>
                  {destHub === 'all' && <td className="dest-hub">{opp.dest_hub_name}</td>}
                  <td className="num">{formatISK(opp.buy_price)}</td>
                  <td className="num">{formatISK(opp.sell_price)}</td>
                  <td className="num profit">{formatISK(opp.net_profit)}</td>
                  <td className={`num roi ${opp.roi >= 10 ? 'roi-high' : opp.roi >= 5 ? 'roi-med' : ''}`}>
                    {opp.roi.toFixed(1)}%
                  </td>
                  <td className="num">{opp.dest_sell_volume?.toLocaleString() || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedOpps.length === 0 && (
            <div className="trade-empty">No opportunities match your filters. Try relaxing the criteria.</div>
          )}
        </div>
      )}

      {!results && !searching && (
        <div className="trade-empty-initial">
          <p>Select source and destination hubs, set your filters, and click <strong>Find Trades</strong></p>
        </div>
      )}
    </div>
  );
}

export default TradeFinder;
