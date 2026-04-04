import React, { useState } from 'react';
import { getBuildVsBuy, searchTypes } from '../services/api';
import ExternalLinks from './ExternalLinks';
import './BuildVsBuy.css';

function loadSaved(key, fallback) {
  try {
    const v = localStorage.getItem('prodPlanner_' + key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function formatISK(value) {
  if (!value && value !== 0) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function BuildVsBuy({ onError, refreshKey }) {
  const [searchText, setSearchText] = useState('');
  const [typeResults, setTypeResults] = useState([]);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [meLevel, setMeLevel] = useState('0');
  const [shippingMinFee, setShippingMinFee] = useState(loadSaved('shippingMinFee', '25000000'));
  const [shippingPerM3, setShippingPerM3] = useState(loadSaved('shippingPerM3', '600'));
  const [collateralPct, setCollateralPct] = useState(loadSaved('collateralPct', '0'));
  const [maxVolume, setMaxVolume] = useState(loadSaved('maxVolume', '375000'));
  const [destPrice, setDestPrice] = useState('');
  const [bpcCost, setBpcCost] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearchInput = (value) => {
    setSearchText(value);
    setTypeResults([]);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (/^\d+$/.test(value.trim()) || value.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const resp = await searchTypes(value.trim());
        setTypeResults(resp.data.results || []);
      } catch { setTypeResults([]); }
    }, 300);
    setSearchTimeout(timeout);
  };

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setSearchText(type.name);
    setTypeResults([]);
  };

  const handleCalculate = async () => {
    const typeId = selectedType?.type_id || parseInt(searchText);
    if (!typeId) return;
    try {
      setLoading(true);
      const resp = await getBuildVsBuy({
        typeId,
        quantity: parseInt(quantity) || 1,
        me: parseInt(meLevel) || 0,
        shippingMinFee: parseFloat(shippingMinFee) || 25000000,
        shippingPerM3: parseFloat(shippingPerM3) || 600,
        collateralPct: parseFloat(collateralPct) || 0,
        maxVolume: parseFloat(maxVolume) || 375000,
        destPrice: parseFloat(destPrice) || 0,
        bpcCost: parseFloat(bpcCost) || 0,
      });
      setResult(resp.data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to calculate';
      onError?.(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const r = result;
  const imp = r?.import_finished;
  const bld = r?.build_locally;
  const cmp = r?.comparison;

  return (
    <div className="bvb-container">
      <h2>Build vs Buy</h2>

      {/* Item Search */}
      <div className="bvb-search-container">
        <div className="bvb-search">
          <input
            type="text"
            placeholder="Search item name or type ID..."
            value={searchText}
            onChange={e => handleSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCalculate()}
          />
        </div>
        {typeResults.length > 0 && (
          <div className="bvb-search-results">
            {typeResults.map(t => (
              <div key={t.type_id} className="bvb-search-result" onClick={() => handleTypeSelect(t)}>
                <span>{t.name}</span>
                <span className="bvb-type-id">ID: {t.type_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config */}
      <div className="bvb-controls">
        <div className="bvb-row">
          <div className="bvb-field">
            <label>Quantity</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="bvb-field">
            <label>ME Level (0-10)</label>
            <input type="number" value={meLevel} onChange={e => setMeLevel(e.target.value)} min="0" max="10" />
          </div>
          <div className="bvb-field">
            <label>BPC Cost/run</label>
            <input type="number" value={bpcCost} onChange={e => setBpcCost(e.target.value)} placeholder="ISK per BPC" />
          </div>
          <div className="bvb-field">
            <label>Dest Sell Price</label>
            <input type="number" value={destPrice} onChange={e => setDestPrice(e.target.value)} placeholder="ISK per unit" />
          </div>
        </div>
        <div className="bvb-row">
          <div className="bvb-field">
            <label>Min Fee</label>
            <input type="number" value={shippingMinFee} onChange={e => setShippingMinFee(e.target.value)} />
          </div>
          <div className="bvb-field">
            <label>ISK/m³</label>
            <input type="number" value={shippingPerM3} onChange={e => setShippingPerM3(e.target.value)} />
          </div>
          <div className="bvb-field">
            <label>Collateral %</label>
            <input type="number" value={collateralPct} onChange={e => setCollateralPct(e.target.value)} />
          </div>
          <div className="bvb-field">
            <label>Max m³</label>
            <input type="number" value={maxVolume} onChange={e => setMaxVolume(e.target.value)} />
          </div>
          <div className="bvb-field">
            <label>&nbsp;</label>
            <button className="bvb-calc-btn" onClick={handleCalculate} disabled={loading || (!selectedType && !parseInt(searchText))}>
              {loading ? 'Calculating...' : 'Calculate'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {r && (
        <div className="bvb-results">
          {/* Product Header */}
          <div className="bvb-product-header">
            <div className="bvb-product-name">
              <h3>{r.product.type_name} x{r.product.quantity}</h3>
              <ExternalLinks type="item" typeId={r.product.type_id} />
              <span className={`bvb-item-type type-${r.product.item_type.toLowerCase()}`}>{r.product.item_type}</span>
              {r.product.bpo_price && <span className="bvb-bpo-price">BPO: {formatISK(r.product.bpo_price)}</span>}
            </div>
            <span className="bvb-jita-price">Jita: {formatISK(r.product.jita_price)}/unit | {r.product.volume_m3?.toLocaleString()} m3</span>
          </div>

          {/* Verdict Banner */}
          <div className={`bvb-verdict ${cmp.recommendation.toLowerCase()}`}>
            <span className="verdict-label">{cmp.recommendation}</span>
            <span className="verdict-detail">
              {cmp.recommendation === 'BUILD'
                ? `Building saves ${formatISK(cmp.savings_from_building)} (${formatISK(cmp.savings_per_unit)}/unit) — ${cmp.jf_loads_saved} fewer JF loads`
                : `Importing saves ${formatISK(-cmp.savings_from_building)} (${formatISK(-cmp.savings_per_unit)}/unit)`
              }
            </span>
          </div>

          {/* Side by Side Comparison */}
          <div className="bvb-comparison">
            <div className={`bvb-path ${cmp.recommendation === 'IMPORT' ? 'winner' : ''}`}>
              <h4>Import Finished</h4>
              <div className="bvb-cost-line"><span>Buy at Jita</span><span>{formatISK(imp.buy_cost)}</span></div>
              <div className="bvb-cost-line"><span>Volume</span><span>{imp.total_m3?.toLocaleString()} m3</span></div>
              <div className="bvb-cost-line"><span>JF Loads</span><span>{imp.jf_loads}</span></div>
              <div className="bvb-cost-line"><span>Shipping</span><span className="shipping">{formatISK(imp.shipping)}</span></div>
              <div className="bvb-cost-line"><span>Collateral</span><span className="shipping">{formatISK(imp.collateral)}</span></div>
              <div className="bvb-cost-line total"><span>Total Cost</span><span>{formatISK(imp.total_cost)}</span></div>
              <div className="bvb-cost-line"><span>Cost/unit</span><span>{formatISK(imp.cost_per_unit)}</span></div>
              {imp.profit !== null && (
                <div className={`bvb-cost-line ${imp.profit >= 0 ? 'profit' : 'loss'}`}>
                  <span>Profit</span><span>{formatISK(imp.profit)}</span>
                </div>
              )}
            </div>

            <div className={`bvb-path ${cmp.recommendation === 'BUILD' ? 'winner' : ''}`}>
              <h4>Build Locally {bld.me_level > 0 ? `(ME${bld.me_level})` : ''}</h4>
              <div className="bvb-cost-line"><span>Materials</span><span>{formatISK(bld.material_cost)}</span></div>
              {bld.bpc_cost > 0 && <div className="bvb-cost-line"><span>BPC Cost</span><span>{formatISK(bld.bpc_cost)}</span></div>}
              <div className="bvb-cost-line"><span>Volume</span><span>{bld.total_m3?.toLocaleString()} m3</span></div>
              <div className="bvb-cost-line"><span>JF Loads</span><span>{bld.jf_loads}</span></div>
              <div className="bvb-cost-line"><span>Shipping</span><span className="shipping">{formatISK(bld.shipping)}</span></div>
              <div className="bvb-cost-line"><span>Collateral</span><span className="shipping">{formatISK(bld.collateral)}</span></div>
              <div className="bvb-cost-line total"><span>Total Cost</span><span>{formatISK(bld.total_cost)}</span></div>
              <div className="bvb-cost-line"><span>Cost/unit</span><span>{formatISK(bld.cost_per_unit)}</span></div>
              {bld.profit !== null && (
                <div className={`bvb-cost-line ${bld.profit >= 0 ? 'profit' : 'loss'}`}>
                  <span>Profit</span><span>{formatISK(bld.profit)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Material Breakdown */}
          <div className="bvb-materials">
            <h4>Material Breakdown (per unit{bld.me_level > 0 ? `, ME${bld.me_level} applied` : ''})</h4>
            <table className="bvb-mat-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">Base Qty</th>
                  {bld.me_level > 0 && <th className="num">ME Qty</th>}
                  <th className="num">Jita Price</th>
                  <th className="num">Cost/unit</th>
                  <th className="num">m3/unit</th>
                </tr>
              </thead>
              <tbody>
                {bld.materials.map(m => (
                  <tr key={m.type_id}>
                    <td className="mat-name">
                      {m.type_name}
                      <ExternalLinks type="item" typeId={m.type_id} />
                    </td>
                    <td className="num">{m.quantity_base.toLocaleString()}</td>
                    {bld.me_level > 0 && <td className="num me-qty">{m.quantity_me.toLocaleString()}</td>}
                    <td className="num">{formatISK(m.unit_price)}</td>
                    <td className="num">{formatISK(m.unit_price * m.quantity_me)}</td>
                    <td className="num">{(m.volume_per_unit * m.quantity_me).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!r && !loading && (
        <div className="bvb-empty">
          <p>Search for an item, set quantity and shipping config, then click <strong>Calculate</strong></p>
          <p className="bvb-hint">Compares importing finished items vs hauling components and building locally</p>
        </div>
      )}
    </div>
  );
}

export default BuildVsBuy;
