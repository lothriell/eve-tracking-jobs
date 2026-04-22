import React, { useEffect, useState, useCallback } from 'react';
import { getTradeHubs, findTrades, getStockAnalysis, getAllCharacters, autoDetectTradeSkills, getTradeSettings, updateTradeSettings } from '../services/api';
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

// Cargo capacity presets (m³). Matches typical fits with skill-V cargo
// expansion / bulkheads where applicable.
const SHIP_PRESETS = [
  { key: 'dst',      label: 'Deep-Space Transport (62.5k)', m3: 62500 },
  { key: 'jf',       label: 'Jump Freighter (360k)',         m3: 360000 },
  { key: 'freighter',label: 'Freighter (1.125M)',            m3: 1125000 },
  { key: 'bowhead',  label: 'Bowhead (1.4M)',                m3: 1400000 },
  { key: 'custom',   label: 'Custom',                         m3: null },
];

/**
 * Greedy bounded knapsack — sort by profit_per_m3 desc, take min of
 * (source_sell_volume, capRem/volM3, budgetRem/buyPrice) at each step.
 * Near-optimal at our scale (<500 opps), O(N) after sort, easy to explain.
 */
function packCargo(opps, capM3, budget) {
  const sorted = [...opps].sort((a, b) => (b.profit_per_m3 || 0) - (a.profit_per_m3 || 0));
  const items = [];
  let capRem = capM3;
  let budgetRem = budget > 0 ? budget : Infinity;
  let totalVol = 0, totalCost = 0, totalProfit = 0;

  for (const o of sorted) {
    if (!o.volume_m3 || o.volume_m3 <= 0) continue;
    if (!o.buy_price || o.buy_price <= 0) continue;
    if (capRem <= 0 || budgetRem <= 0) break;

    const maxByCap = Math.floor(capRem / o.volume_m3);
    const maxByBudget = Math.floor(budgetRem / o.buy_price);
    const maxByStock = o.source_sell_volume || 0;
    const units = Math.min(maxByCap, maxByBudget, maxByStock);
    if (units <= 0) continue;

    const itemVol = units * o.volume_m3;
    const itemCost = units * o.buy_price;
    const itemProfit = units * o.net_profit;

    items.push({
      type_id: o.type_id,
      type_name: o.type_name,
      dest_hub_name: o.dest_hub_name,
      units,
      unit_volume_m3: o.volume_m3,
      total_volume_m3: itemVol,
      buy_price: o.buy_price,
      total_cost: itemCost,
      profit_per_unit: o.net_profit,
      total_profit: itemProfit,
      risk_level: o.risk_level,
    });

    capRem -= itemVol;
    budgetRem -= itemCost;
    totalVol += itemVol;
    totalCost += itemCost;
    totalProfit += itemProfit;
  }

  return { items, totalVol, totalCost, totalProfit, capM3, capRem, budget };
}

function TradeFinder({ onError, refreshKey }) {
  const [hubs, setHubs] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState('arbitrage'); // 'arbitrage' or 'stock'

  // Stock analysis
  const [stockResults, setStockResults] = useState(null);
  const [stockMarkup, setStockMarkup] = useState('20');
  const [stockNameFilter, setStockNameFilter] = useState('');
  const [iskPerM3, setIskPerM3] = useState('');
  const [collateralPct, setCollateralPct] = useState('');

  // Controls
  const [sourceHub, setSourceHub] = useState('');
  const [destHub, setDestHub] = useState('all');
  const [tradeType, setTradeType] = useState('B');
  const [minROI, setMinROI] = useState('5');
  const [maxROI, setMaxROI] = useState('');
  const [minProfit, setMinProfit] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [includeJunk, setIncludeJunk] = useState(false);
  const [intendedQty, setIntendedQty] = useState('100');

  // Cargo manifest optimizer state
  const [showCargo, setShowCargo] = useState(false);
  const [cargoShip, setCargoShip] = useState('jf');
  const [cargoCapM3, setCargoCapM3] = useState('360000');
  const [cargoBudget, setCargoBudget] = useState('');
  const [cargoSkipCritical, setCargoSkipCritical] = useState(true);
  const [manifest, setManifest] = useState(null);

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
      if (maxROI) params.maxROI = parseFloat(maxROI);
      if (minProfit) params.minProfit = parseFloat(minProfit);
      if (maxPrice) params.maxPrice = parseFloat(maxPrice);
      if (minVolume) params.minVolume = parseInt(minVolume);
      if (buyerChar) params.buyerCharId = buyerChar;
      if (sellerChar) params.sellerCharId = sellerChar;
      if (includeJunk) params.includeJunk = 'true';
      if (intendedQty) params.intendedQty = parseInt(intendedQty);

      const resp = await findTrades(params);
      setResults(resp.data);
    } catch (err) {
      onError?.('Failed to find trades');
    } finally {
      setSearching(false);
    }
  };

  const handleStockSearch = async () => {
    if (!sourceHub || !destHub || destHub === 'all') return;
    try {
      setSearching(true);
      const params = {
        source: sourceHub,
        dest: destHub,
        markup: parseFloat(stockMarkup) || 20,
        limit: 100,
        minVolume: parseInt(minVolume) || 10,
      };
      if (maxPrice) params.maxPrice = parseFloat(maxPrice);
      if (stockNameFilter) params.name = stockNameFilter;
      if (iskPerM3) params.iskPerM3 = parseFloat(iskPerM3);
      if (collateralPct) params.collateralPct = parseFloat(collateralPct);

      const resp = await getStockAnalysis(params);
      setStockResults(resp.data);
    } catch (err) {
      onError?.('Failed to analyze stocking opportunities');
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

  // Item name filter on results
  const [itemFilter, setItemFilter] = useState('');

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
  const hasShipping = stockResults && (stockResults.isk_per_m3 > 0 || stockResults.collateral_pct > 0);

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

      {/* Mode toggle */}
      <div className="trade-mode-toggle">
        <button className={mode === 'arbitrage' ? 'active' : ''} onClick={() => setMode('arbitrage')}>
          Hub Arbitrage
        </button>
        <button className={mode === 'stock' ? 'active' : ''} onClick={() => setMode('stock')}>
          Stock Nullsec
        </button>
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
              {mode === 'arbitrage' && <option value="all">All Other Hubs</option>}
              {enabledHubs.filter(h => String(h.id) !== sourceHub).map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          {mode === 'arbitrage' && (
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
          )}
          {mode === 'stock' && (
            <>
              <div className="control-group small">
                <label>Markup %</label>
                <input type="number" value={stockMarkup} onChange={e => setStockMarkup(e.target.value)} placeholder="20" />
              </div>
              <div className="control-group small">
                <label>ISK/m³</label>
                <input type="number" value={iskPerM3} onChange={e => setIskPerM3(e.target.value)} placeholder="Halo rate" title="Hauling cost per m³ from your freight service" />
              </div>
              <div className="control-group small">
                <label>Collateral %</label>
                <input type="number" value={collateralPct} onChange={e => setCollateralPct(e.target.value)} placeholder="e.g. 1.5" title="Collateral fee % charged by freight service" />
              </div>
            </>
          )}
        </div>
        {mode === 'arbitrage' && (
          <div className="trade-control-row">
            <div className="control-group">
              <label>Buyer (source hub)</label>
              <div className="char-detect-row">
                <select value={buyerChar} onChange={e => handleBuyerChange(e.target.value)}>
                  <option value="">Default fees</option>
                  {characters.map(c => (
                    <option key={c.character_id} value={c.character_id}>{c.name}</option>
                  ))}
                </select>
                {buyerChar && <button className="detect-btn" onClick={() => handleAutoDetect('buyer')} disabled={detectingBuyer}>{detectingBuyer ? '...' : 'Detect'}</button>}
              </div>
            </div>
            <div className="control-group">
              <label>Seller (dest hub)</label>
              <div className="char-detect-row">
                <select value={sellerChar} onChange={e => handleSellerChange(e.target.value)}>
                  <option value="">Default fees</option>
                  {characters.map(c => (
                    <option key={c.character_id} value={c.character_id}>{c.name}</option>
                  ))}
                </select>
                {sellerChar && <button className="detect-btn" onClick={() => handleAutoDetect('seller')} disabled={detectingSeller}>{detectingSeller ? '...' : 'Detect'}</button>}
              </div>
            </div>
          </div>
        )}
        <div className="trade-control-row">
          {mode === 'stock' && (
            <div className="control-group">
              <label>Filter by name</label>
              <input type="text" value={stockNameFilter} onChange={e => setStockNameFilter(e.target.value)} placeholder="e.g. Shuttle, Ammo..." />
            </div>
          )}
          {mode === 'arbitrage' && (
            <>
              <div className="control-group small">
                <label>Min ROI %</label>
                <input type="number" value={minROI} onChange={e => setMinROI(e.target.value)} placeholder="5" />
              </div>
              <div className="control-group small">
                <label title="Cap ROI — above ~200% is almost always decimal error, stale data, or thin market">Max ROI %</label>
                <input type="number" value={maxROI} onChange={e => setMaxROI(e.target.value)} placeholder="e.g. 200" />
              </div>
              <div className="control-group small">
                <label>Min Profit</label>
                <input type="number" value={minProfit} onChange={e => setMinProfit(e.target.value)} placeholder="ISK" />
              </div>
            </>
          )}
          <div className="control-group small">
            <label>Max Buy Price</label>
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="ISK" />
          </div>
          <div className="control-group small">
            <label>Min Volume</label>
            <input type="number" value={minVolume} onChange={e => setMinVolume(e.target.value)} placeholder="units" />
          </div>
          {mode === 'arbitrage' && (
            <>
              <div className="control-group small">
                <label title="Quantity you plan to haul. Used by the bait-risk score to flag opportunities that can't actually fill your intended size.">Intended Qty</label>
                <input type="number" value={intendedQty} onChange={e => setIntendedQty(e.target.value)} placeholder="100" />
              </div>
              <div className="control-group small" style={{ alignSelf: 'end', paddingBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Hide ship SKINs, SKINR/Paragon items, and legacy event leftovers like 'Expired …' boosters and filaments">
                  <input type="checkbox" checked={includeJunk} onChange={e => setIncludeJunk(e.target.checked)} />
                  Include junk (skins / expired)
                </label>
              </div>
            </>
          )}
          <div className="control-group">
            <label>&nbsp;</label>
            <button className="find-btn" onClick={mode === 'stock' ? handleStockSearch : handleSearch} disabled={searching || !sourceHub || (mode === 'stock' && (!destHub || destHub === 'all'))}>
              {searching ? 'Searching...' : mode === 'stock' ? 'Analyze' : 'Find Trades'}
            </button>
          </div>
        </div>
      </div>

      {/* Detected skills summary */}
      {(buyerSettings || sellerSettings) && (
        <div className="trade-skills-summary">
          {buyerSettings && (
            <span className="skill-chip buyer">Buyer: Broker {buyerSettings.effective_broker_fee?.toFixed(1)}% (Acct L{buyerSettings.accounting_level} / Broker L{buyerSettings.broker_relations_level} / Adv L{buyerSettings.advanced_broker_level})</span>
          )}
          {sellerSettings && (
            <span className="skill-chip seller">Seller: Broker {sellerSettings.effective_broker_fee?.toFixed(1)}% + Tax {sellerSettings.effective_sales_tax?.toFixed(1)}% (Acct L{sellerSettings.accounting_level} / Broker L{sellerSettings.broker_relations_level} / Adv L{sellerSettings.advanced_broker_level})</span>
          )}
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

          {/* Cargo manifest optimizer */}
          <div className="cargo-panel">
            <div className="cargo-panel-header">
              <strong>Cargo Manifest Optimizer</strong>
              <button
                type="button"
                className="cis-export-all"
                onClick={() => setShowCargo(s => !s)}
              >{showCargo ? 'Hide' : 'Show'}</button>
            </div>
            {showCargo && (
              <>
                <div className="cargo-panel-controls">
                  <div className="control-group small">
                    <label>Ship</label>
                    <select value={cargoShip} onChange={(e) => {
                      const k = e.target.value;
                      setCargoShip(k);
                      const preset = SHIP_PRESETS.find(p => p.key === k);
                      if (preset && preset.m3 != null) setCargoCapM3(String(preset.m3));
                    }}>
                      {SHIP_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="control-group small">
                    <label>Capacity (m³)</label>
                    <input type="number" value={cargoCapM3} onChange={e => { setCargoCapM3(e.target.value); setCargoShip('custom'); }} placeholder="m³" />
                  </div>
                  <div className="control-group small">
                    <label>Budget (ISK, optional)</label>
                    <input type="number" value={cargoBudget} onChange={e => setCargoBudget(e.target.value)} placeholder="∞" />
                  </div>
                  <div className="control-group small" style={{ alignSelf: 'end', paddingBottom: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={cargoSkipCritical} onChange={e => setCargoSkipCritical(e.target.checked)} />
                      Skip 🔴 critical
                    </label>
                  </div>
                  <div className="control-group" style={{ alignSelf: 'end' }}>
                    <button
                      type="button"
                      className="cis-export-all"
                      onClick={() => {
                        const cap = parseFloat(cargoCapM3) || 0;
                        const budget = parseFloat(cargoBudget) || 0;
                        const pool = sortedOpps.filter(o => !cargoSkipCritical || o.risk_level !== 'critical');
                        setManifest(packCargo(pool, cap, budget));
                      }}
                    >Build Manifest</button>
                  </div>
                </div>
                {manifest && manifest.items.length > 0 && (
                  <>
                    <table className="trade-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          {destHub === 'all' && <th>Dest Hub</th>}
                          <th className="num">Units</th>
                          <th className="num">m³ each</th>
                          <th className="num">Total m³</th>
                          <th className="num">Buy</th>
                          <th className="num">Total Cost</th>
                          <th className="num">Profit</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manifest.items.map(it => (
                          <tr key={`${it.type_id}-${it.dest_hub_name || ''}`}>
                            <td className="item-name">{it.type_name}</td>
                            {destHub === 'all' && <td className="dest-hub">{it.dest_hub_name || '—'}</td>}
                            <td className="num">{it.units.toLocaleString()}</td>
                            <td className="num">{it.unit_volume_m3}</td>
                            <td className="num">{it.total_volume_m3.toLocaleString()}</td>
                            <td className="num">{formatISK(it.buy_price)}</td>
                            <td className="num">{formatISK(it.total_cost)}</td>
                            <td className="num profit">{formatISK(it.total_profit)}</td>
                            <td><RiskBadge level={it.risk_level} reasons={[]} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="cargo-fill-bar">
                      <div className="cargo-fill-bar-fill" style={{ width: `${Math.min(100, (manifest.totalVol / manifest.capM3) * 100)}%` }} />
                    </div>
                    <div className="cargo-totals">
                      <span>Volume: <strong>{manifest.totalVol.toLocaleString()}</strong> / {manifest.capM3.toLocaleString()} m³ ({((manifest.totalVol / manifest.capM3) * 100).toFixed(1)}%)</span>
                      <span>Cost: <strong>{formatISK(manifest.totalCost)}</strong></span>
                      <span>Profit: <strong>{formatISK(manifest.totalProfit)}</strong></span>
                      <span>Margin: <strong>{manifest.totalCost > 0 ? ((manifest.totalProfit / manifest.totalCost) * 100).toFixed(1) : 0}%</strong></span>
                      <button
                        type="button"
                        className="cis-export-all"
                        title="Copy as EVE in-game multibuy paste (item + units per line)"
                        onClick={() => {
                          const lines = manifest.items.map(it => `${it.type_name} ${it.units}`).join('\n');
                          navigator.clipboard.writeText(lines).catch(() => onError?.('Failed to copy'));
                        }}
                      >📋 Copy Multibuy</button>
                      <button
                        type="button"
                        className="cis-export-all"
                        onClick={() => {
                          const csv = ['type_id,type_name,dest_hub,units,unit_volume_m3,total_volume_m3,buy_price,total_cost,profit_per_unit,total_profit,risk']
                            .concat(manifest.items.map(it => [
                              it.type_id, JSON.stringify(it.type_name), JSON.stringify(it.dest_hub_name || ''),
                              it.units, it.unit_volume_m3, it.total_volume_m3,
                              it.buy_price, it.total_cost, it.profit_per_unit, it.total_profit, it.risk_level
                            ].join(','))).join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url; a.download = `cargo-manifest-${cargoShip}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >↓ Export CSV</button>
                    </div>
                  </>
                )}
                {manifest && manifest.items.length === 0 && (
                  <div className="trade-empty">Nothing fits — try a larger budget, more capacity, or include 🔴 critical.</div>
                )}
              </>
            )}
          </div>

          <table className="trade-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('type_name')} className="sortable">Item {sortCol === 'type_name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                {destHub === 'all' && <th>Dest Hub</th>}
                <th title="Bait / scam risk score">Risk</th>
                <th className="num sortable" onClick={() => handleSort('buy_price')}>Buy {sortCol === 'buy_price' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('sell_price')}>Sell {sortCol === 'sell_price' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('net_profit')}>Net Profit {sortCol === 'net_profit' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('roi')}>ROI % {sortCol === 'roi' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('volume_m3')}>m³ {sortCol === 'volume_m3' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('profit_per_m3')}>ISK/m³ {sortCol === 'profit_per_m3' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th className="num sortable" onClick={() => handleSort('dest_sell_volume')}>Dest Vol {sortCol === 'dest_sell_volume' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {sortedOpps.map((opp, i) => (
                <tr key={`${opp.type_id}-${opp.dest_hub_id || i}`} className={opp.risk_level === 'critical' ? 'row-dimmed' : ''}>
                  <td className="item-name">
                    <span>{opp.type_name}</span>
                    <ExternalLinks type="item" typeId={opp.type_id} />
                    <span className="type-id-small">{opp.type_id}</span>
                  </td>
                  {destHub === 'all' && <td className="dest-hub">{opp.dest_hub_name}</td>}
                  <td>
                    <RiskBadge level={opp.risk_level} reasons={opp.risk_reasons} />
                  </td>
                  <td className="num">{formatISK(opp.buy_price)}</td>
                  <td className="num">{formatISK(opp.sell_price)}</td>
                  <td className="num profit">{formatISK(opp.net_profit)}</td>
                  <td className={`num roi ${opp.roi >= 10 ? 'roi-high' : opp.roi >= 5 ? 'roi-med' : ''}`}>
                    {opp.roi.toFixed(1)}%
                  </td>
                  <td className="num">{opp.volume_m3 ? opp.volume_m3.toLocaleString() : '—'}</td>
                  <td className="num">{opp.profit_per_m3 ? formatISK(opp.profit_per_m3) : '—'}</td>
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

      {mode === 'arbitrage' && !results && !searching && (
        <div className="trade-empty-initial">
          <p>Select source and destination hubs, set your filters, and click <strong>Find Trades</strong></p>
        </div>
      )}

      {/* Stock Analysis Results */}
      {mode === 'stock' && stockResults && (
        <div className="trade-results">
          <div className="trade-results-header">
            <span>{stockResults.total} items to stock ({stockResults.markup_pct}% markup)</span>
            <span className="trade-meta">
              {stockResults.source_hub?.name} → {stockResults.dest_hub?.name}
              {stockResults.isk_per_m3 > 0 && ` | Shipping: ${stockResults.isk_per_m3.toLocaleString()} ISK/m³`}
              {stockResults.collateral_pct > 0 && ` + ${stockResults.collateral_pct}% collateral`}
            </span>
          </div>
          <table className="trade-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                {hasShipping && <th>Haul</th>}
                <th className="num">Jita Sell</th>
                <th className="num">Dest Sell</th>
                <th className="num">Suggested</th>
                {hasShipping && <th className="num">Shipping</th>}
                {hasShipping && <th className="num">ISK/m³</th>}
                {hasShipping && <th className="num">m³</th>}
                <th className="num">Profit/unit</th>
                <th className="num">ROI %</th>
                <th className="num">Jita Vol</th>
              </tr>
            </thead>
            <tbody>
              {stockResults.opportunities.map((opp, i) => (
                <tr key={opp.type_id} className={opp.haul_grade === 'NEVER' ? 'row-dimmed' : ''}>
                  <td className="item-name">
                    <span>{opp.type_name}</span>
                    <ExternalLinks type="item" typeId={opp.type_id} />
                  </td>
                  <td>
                    <span className={`stock-status ${opp.status}`}>
                      {opp.status === 'missing' ? 'MISSING' : 'OVERPRICED'}
                    </span>
                  </td>
                  {hasShipping && (
                    <td>
                      <span className={`haul-grade grade-${(opp.haul_grade || 'GREAT').toLowerCase()}`}>
                        {opp.haul_grade || 'GREAT'}
                      </span>
                    </td>
                  )}
                  <td className="num">{formatISK(opp.jita_sell)}</td>
                  <td className="num">{opp.dest_sell > 0 ? formatISK(opp.dest_sell) : '—'}</td>
                  <td className="num">{formatISK(opp.suggested_sell)}</td>
                  {hasShipping && <td className="num shipping-cost">{formatISK(opp.shipping_cost)}</td>}
                  {hasShipping && <td className="num isk-density">{opp.isk_per_m3 > 0 ? formatISK(opp.isk_per_m3) : '—'}</td>}
                  {hasShipping && <td className="num">{opp.volume_m3 > 0 ? opp.volume_m3.toLocaleString() : '—'}</td>}
                  <td className="num profit">{formatISK(opp.profit_per_unit)}</td>
                  <td className={`num ${opp.roi >= 20 ? 'roi-high' : 'roi-med'}`}>{opp.roi.toFixed(1)}%</td>
                  <td className="num">{opp.jita_volume?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stockResults.opportunities.length === 0 && (
            <div className="trade-empty">No stocking opportunities found. Try adjusting filters.</div>
          )}
        </div>
      )}

      {mode === 'stock' && !stockResults && !searching && (
        <div className="trade-empty-initial">
          <p>Select source (Jita) and your nullsec hub, set markup %, and click <strong>Analyze</strong></p>
          <p className="stock-hint">Shows items available at source but missing or overpriced at your hub, sorted by demand</p>
        </div>
      )}
    </div>
  );
}

const RISK_GLYPH = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };
const RISK_LABEL = { low: 'Low', medium: 'Med', high: 'High', critical: 'Critical' };

function RiskBadge({ level, reasons }) {
  const lvl = level || 'low';
  const tip = reasons && reasons.length > 0
    ? reasons.join('\n')
    : 'No bait signals — passes all current checks.';
  return (
    <span className={`risk-badge risk-${lvl}`} title={tip}>
      {RISK_GLYPH[lvl]} {RISK_LABEL[lvl]}
    </span>
  );
}

export default TradeFinder;
