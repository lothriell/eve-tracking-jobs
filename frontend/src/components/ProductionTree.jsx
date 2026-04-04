import React, { useState, useCallback } from 'react';
import { getBuildTree, searchTypes } from '../services/api';
import ExternalLinks from './ExternalLinks';
import ExportButton from './ExportButton';
import './ProductionTree.css';

function formatISK(value) {
  if (!value && value !== 0) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatTime(seconds) {
  if (!seconds) return '—';
  const hours = seconds / 3600;
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.ceil(seconds / 60)}m`;
}

// Recursive tree node component
function TreeNode({ node, depth, expanded, onToggleExpand, onToggleDecision }) {
  const isExpanded = expanded[node.type_id + '_' + depth] !== false; // default expanded for depth 0-1
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 24;
  const cost = node.decision === 'build' && node.build_cost !== null ? node.build_cost : node.buy_cost;
  const savings = node.build_cost !== null && node.buy_cost > 0 ? node.buy_cost - node.build_cost : 0;

  return (
    <>
      <div className={`tree-node depth-${Math.min(depth, 4)}`} style={{ paddingLeft: indent + 8 }}>
        {/* Expand/collapse */}
        <span className="tree-expand" onClick={() => hasChildren && onToggleExpand(node.type_id + '_' + depth)}>
          {hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
        </span>

        {/* Name + links */}
        <span className="tree-name">
          {node.name}
          <ExternalLinks type="item" typeId={node.type_id} />
        </span>

        {/* Quantity */}
        <span className="tree-qty">x{node.quantity.toLocaleString()}</span>

        {/* Category badge */}
        {node.category === 'reaction' && (
          <span className="tree-category reaction" title={`Reaction: ${node.runs_needed} runs × ${node.batch_size}/run`}>REACT</span>
        )}

        {/* Decision toggle */}
        {node.is_buildable && node.build_cost !== null && (
          <button
            className={`tree-decision ${node.decision}`}
            onClick={() => onToggleDecision(node)}
            title={node.decision === 'build' ? 'Click to switch to BUY' : node.category === 'reaction' ? 'Click to switch to REACT' : 'Click to switch to BUILD'}
          >
            {node.decision === 'build' ? (node.category === 'reaction' ? 'REACT' : 'BUILD') : 'BUY'}
          </button>
        )}
        {!node.is_buildable && <span className="tree-decision buy-only">BUY</span>}

        {/* Cost */}
        <span className="tree-cost">{formatISK(cost)}</span>

        {/* Savings indicator */}
        {savings > 0 && node.decision === 'build' && (
          <span className="tree-savings">-{formatISK(savings)}</span>
        )}

        {/* Job time */}
        {node.job_time > 0 && node.decision === 'build' && (
          <span className="tree-time">{formatTime(node.job_time)}</span>
        )}

        {/* Owned blueprint indicator */}
        {node.owned_blueprint && (
          <span className={`tree-owned ${node.owned_blueprint.is_bpo ? 'bpo' : 'bpc'}`} title={`${node.owned_blueprint.owner}: ${node.owned_blueprint.is_bpo ? 'BPO' : 'BPC'} ME${node.owned_blueprint.me}/TE${node.owned_blueprint.te}${node.owned_blueprint.runs > 0 ? ' (' + node.owned_blueprint.runs + ' runs)' : ''}`}>
            {node.owned_blueprint.is_bpo ? 'BPO' : 'BPC'} ME{node.owned_blueprint.me}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className={node.decision === 'buy' ? 'tree-children-dimmed' : ''}>
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.type_id}_${depth + 1}_${i}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onToggleDecision={onToggleDecision}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProductionTree({ onError, refreshKey }) {
  const [searchText, setSearchText] = useState('');
  const [typeResults, setTypeResults] = useState([]);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [selectedType, setSelectedType] = useState(null);

  // Config
  const [quantity, setQuantity] = useState('1');
  const [meLevel, setMeLevel] = useState('0');
  const [contractPrice, setContractPrice] = useState('');
  const [shippingFee, setShippingFee] = useState('25000000');
  const [collateralPct, setCollateralPct] = useState('1.5');
  const [jfCapacity, setJfCapacity] = useState('225000');
  const [structureType, setStructureType] = useState('raitaru');
  const [rigTier, setRigTier] = useState('none');
  const [secStatus, setSecStatus] = useState('null'); // null, low, high

  // Results
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' or 'shopping'

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
      const resp = await getBuildTree(typeId, {
        quantity: parseInt(quantity) || 1,
        me: parseInt(meLevel) || 0,
        contractPrice: parseFloat(contractPrice) || 0,
        shippingFee: parseFloat(shippingFee) || 25000000,
        collateralPct: parseFloat(collateralPct) || 0,
        jfCapacity: parseFloat(jfCapacity) || 225000,
        structure: structureType,
        rig: rigTier,
        sec: secStatus,
      });
      setResult(resp.data);
      setExpanded({});
    } catch (err) {
      onError?.(err.response?.data?.error || 'Failed to build production tree');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (key) => {
    setExpanded(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  const handleToggleDecision = useCallback((node) => {
    // Toggle decision in the tree — this is a simplified client-side toggle
    // In a full implementation we'd re-request the tree from the server
    node.decision = node.decision === 'build' ? 'buy' : 'build';
    setResult(r => ({ ...r })); // force re-render
  }, []);

  const handleCopyBuyAll = () => {
    if (!result?.shopping_list) return;
    const lines = result.shopping_list.map(item => `${item.name} ${item.quantity}`).join('\n');
    navigator.clipboard.writeText(lines).catch(() => onError?.('Failed to copy'));
  };

  const s = result?.summary;
  const tree = result?.tree;

  return (
    <div className="ptree-container">
      <h2>Production Planner</h2>

      {/* Search */}
      <div className="ptree-search-wrap">
        <div className="ptree-search">
          <input
            type="text"
            placeholder="Search item to build (e.g. Gila, Ishtar, Cerberus)..."
            value={searchText}
            onChange={e => handleSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCalculate()}
          />
        </div>
        {typeResults.length > 0 && (
          <div className="ptree-search-results">
            {typeResults.map(t => (
              <div key={t.type_id} className="ptree-search-result" onClick={() => handleTypeSelect(t)}>
                <span>{t.name}</span>
                <span className="ptree-type-id">ID: {t.type_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config */}
      <div className="ptree-controls">
        <div className="ptree-row">
          <div className="ptree-field">
            <label>Quantity</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="ptree-field">
            <label>ME (0-10)</label>
            <input type="number" value={meLevel} onChange={e => setMeLevel(e.target.value)} min="0" max="10" />
          </div>
          <div className="ptree-field">
            <label>Contract Price</label>
            <input type="number" value={contractPrice} onChange={e => setContractPrice(e.target.value)} placeholder="Jita contract" />
          </div>
          <div className="ptree-field">
            <label>JF Ship Fee</label>
            <input type="number" value={shippingFee} onChange={e => setShippingFee(e.target.value)} />
          </div>
          <div className="ptree-field">
            <label>Collateral %</label>
            <input type="number" value={collateralPct} onChange={e => setCollateralPct(e.target.value)} />
          </div>
          <div className="ptree-field">
            <label>JF Capacity</label>
            <input type="number" value={jfCapacity} onChange={e => setJfCapacity(e.target.value)} />
          </div>
          <div className="ptree-field">
            <label>&nbsp;</label>
            <button className="ptree-calc-btn" onClick={handleCalculate} disabled={loading || (!selectedType && !parseInt(searchText))}>
              {loading ? 'Building...' : 'Build Tree'}
            </button>
          </div>
        </div>
        <div className="ptree-row" style={{ marginTop: 10 }}>
          <div className="ptree-field">
            <label>Structure</label>
            <select value={structureType} onChange={e => setStructureType(e.target.value)}>
              <option value="raitaru">Raitaru (S)</option>
              <option value="azbel">Azbel (M)</option>
              <option value="sotiyo">Sotiyo (L)</option>
              <option value="tatara">Tatara (Reactions)</option>
              <option value="athanor">Athanor (Reactions)</option>
              <option value="npc">NPC Station</option>
            </select>
          </div>
          <div className="ptree-field">
            <label>Rig</label>
            <select value={rigTier} onChange={e => setRigTier(e.target.value)}>
              <option value="none">No Rig</option>
              <option value="t1">T1 Rig (2% ME / 20% TE)</option>
              <option value="t2">T2 Rig (2.4% ME / 24% TE)</option>
            </select>
          </div>
          <div className="ptree-field">
            <label>Security</label>
            <select value={secStatus} onChange={e => setSecStatus(e.target.value)}>
              <option value="null">Nullsec / WH (2.1x rig)</option>
              <option value="low">Lowsec (1.9x rig)</option>
              <option value="high">Highsec (1.0x rig)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          <div className="ptree-summary">
            <div className="ptree-product-header">
              <h3>
                {result.product.name} x{result.product.quantity}
                <ExternalLinks type="item" typeId={result.product.type_id} />
                <span className={`ptree-item-type type-${result.product.item_type.toLowerCase()}`}>{result.product.item_type}</span>
              </h3>
            </div>

            <div className={`ptree-verdict ${s.recommendation.toLowerCase()}`}>
              <span className="verdict-label">{s.recommendation}</span>
              <span className="verdict-detail">
                {s.buy_finished_cost === 0
                  ? `Not on market — must build | Materials: ${formatISK(s.material_cost)} + Shipping: ${formatISK(s.shipping_cost)} = ${formatISK(s.total_build_cost)}`
                  : s.recommendation === 'BUILD'
                  ? `Building saves ${formatISK(s.savings)} vs ${s.buy_source === 'contract' ? 'contract' : 'market'} (${formatISK(s.buy_finished_cost)})`
                  : `${s.buy_source === 'contract' ? 'Contract' : 'Market'} buy cheaper: ${formatISK(s.buy_finished_cost)} vs building ${formatISK(s.total_build_cost)}`
                }
              </span>
            </div>

            <div className="ptree-stats">
              <div className="stat-box">
                <span className="stat-label">{s.buy_source === 'contract' ? 'Contract Price' : s.buy_source === 'market' ? 'Jita Market' : 'Buy Finished'}</span>
                <span className="stat-value">{s.buy_finished_cost > 0 ? formatISK(s.buy_finished_cost) : 'N/A'}</span>
              </div>
              <div className="stat-box highlight">
                <span className="stat-label">Build Cost</span>
                <span className="stat-value">{formatISK(s.total_build_cost)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Materials</span>
                <span className="stat-value">{formatISK(s.material_cost)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Shipping</span>
                <span className="stat-value">{formatISK(s.shipping_cost)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Volume</span>
                <span className="stat-value">{s.total_volume_m3?.toLocaleString()} m3</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">JF Loads</span>
                <span className="stat-value">{s.jf_loads}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Jobs</span>
                <span className="stat-value">{s.total_jobs}</span>
              </div>
              {s.owned_blueprints > 0 && (
                <div className="stat-box owned">
                  <span className="stat-label">Owned BPs</span>
                  <span className="stat-value">{s.owned_blueprints}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="ptree-tabs">
            <button className={activeTab === 'tree' ? 'active' : ''} onClick={() => setActiveTab('tree')}>
              Build Tree
            </button>
            <button className={activeTab === 'shopping' ? 'active' : ''} onClick={() => setActiveTab('shopping')}>
              Shopping List ({result.shopping_list?.length || 0})
            </button>
          </div>

          {/* Tree View */}
          {activeTab === 'tree' && tree && (
            <div className="ptree-tree">
              <div className="tree-header">
                <span className="tree-header-name">Item</span>
                <span className="tree-header-qty">Qty</span>
                <span className="tree-header-decision">Action</span>
                <span className="tree-header-cost">Cost</span>
              </div>
              <TreeNode
                node={tree}
                depth={0}
                expanded={expanded}
                onToggleExpand={handleToggleExpand}
                onToggleDecision={handleToggleDecision}
              />
            </div>
          )}

          {/* Shopping List */}
          {activeTab === 'shopping' && result.shopping_list && (
            <div className="ptree-shopping">
              <div className="shopping-header">
                <span>Materials to buy ({result.shopping_list.length} items)</span>
                <div className="shopping-actions">
                  <button className="buy-all-btn" onClick={handleCopyBuyAll}>Copy Multi-Buy</button>
                  <ExportButton
                    getData={() => result.shopping_list.map(i => ({
                      item: i.name, quantity: i.quantity, unit_price: i.unit_price,
                      total_cost: i.total_cost, volume: i.total_volume,
                    }))}
                    columns={[
                      { key: 'item', label: 'Item' }, { key: 'quantity', label: 'Qty' },
                      { key: 'unit_price', label: 'Unit Price' }, { key: 'total_cost', label: 'Total' },
                      { key: 'volume', label: 'Volume m3' },
                    ]}
                    filename="shopping-list"
                  />
                </div>
              </div>
              <table className="shopping-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="num">Quantity</th>
                    <th className="num">Unit Price</th>
                    <th className="num">Total Cost</th>
                    <th className="num">Volume (m3)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.shopping_list.map(item => (
                    <tr key={item.type_id}>
                      <td className="mat-name">
                        {item.name}
                        <ExternalLinks type="item" typeId={item.type_id} />
                      </td>
                      <td className="num">{item.quantity.toLocaleString()}</td>
                      <td className="num">{formatISK(item.unit_price)}</td>
                      <td className="num">{formatISK(item.total_cost)}</td>
                      <td className="num">{item.total_volume?.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td></td>
                    <td></td>
                    <td className="num">{formatISK(result.shopping_list.reduce((s, i) => s + i.total_cost, 0))}</td>
                    <td className="num">{result.shopping_list.reduce((s, i) => s + (i.total_volume || 0), 0).toFixed(1)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="ptree-empty">
          <p>Search for an item, configure ME and shipping, then click <strong>Build Tree</strong></p>
          <p className="ptree-hint">Recursively resolves materials — each component shows build vs buy with optimal decision</p>
        </div>
      )}
    </div>
  );
}

export default ProductionTree;
