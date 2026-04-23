import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCharacterIndustryStats, getAllCharacterIndustryHistory } from '../services/api';
import { exportToCSV } from '../services/export';
import ExternalLinks from './ExternalLinks';
import ExportButton from './ExportButton';
import MonthlyTrendChart from './MonthlyTrendChart';
import './CorporationIndustryStats.css';

const ACTIVITY_LABELS = {
  1: 'Manufacturing',
  3: 'Researching Time Efficiency',
  4: 'Researching Material Efficiency',
  5: 'Copying',
  8: 'Invention',
  9: 'Reactions',
  11: 'Reactions',
};

const PRESETS = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '90d', label: 'Last 90 Days' },
  { key: '6m', label: 'Last 6 Months' },
  { key: 'all', label: 'All Time' },
];

function presetRange(key) {
  const now = new Date();
  const iso = (d) => d.toISOString();
  switch (key) {
    case 'this-month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(from), to: null };
    }
    case 'last-month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(from), to: iso(to) };
    }
    case '30d': return { from: iso(new Date(Date.now() - 30 * 864e5)), to: null };
    case '90d': return { from: iso(new Date(Date.now() - 90 * 864e5)), to: null };
    case '6m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      return { from: iso(from), to: null };
    }
    case 'all':
    default: return { from: null, to: null };
  }
}

function formatISK(value) {
  if (!value) return '0';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function formatNumber(n) {
  if (n == null) return '0';
  return n.toLocaleString();
}

// Shared sort helpers (same pattern as CorporationIndustryStats).
function sortRows(rows, col, dir, numericCols) {
  if (!col) return rows;
  const isNum = numericCols && numericCols.has(col);
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col];
    if (isNum) {
      const an = av == null ? -Infinity : Number(av);
      const bn = bv == null ? -Infinity : Number(bv);
      return (an - bn) * mul;
    }
    const as = (av ?? '').toString().toLowerCase();
    const bs = (bv ?? '').toString().toLowerCase();
    return as.localeCompare(bs) * mul;
  });
}

function SortableTh({ col, label, activeCol, dir, onClick, className, title }) {
  const isActive = activeCol === col;
  const arrow = isActive ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      className={`sortable ${className || ''}`}
      onClick={() => onClick(col)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      title={title || undefined}
    >
      {label}{arrow}
    </th>
  );
}

function CharacterIndustryStats({ onError, refreshKey }) {
  const [preset, setPreset] = useState('this-month');
  const [activityId, setActivityId] = useState('');
  const [charId, setCharId] = useState('');
  const [metric, setMetric] = useState('jobs');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllShips, setShowAllShips] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const PRODUCT_TABLE_DEFAULT = 100;
  const [productSort, setProductSort] = useState({ col: 'total_runs', dir: 'desc' });
  const [characterSort, setCharacterSort] = useState({ col: 'job_count', dir: 'desc' });

  const toggleProductSort = (col) => {
    setProductSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  };
  const toggleCharacterSort = (col) => {
    setCharacterSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  };

  const PRODUCT_NUMERIC = new Set(['job_count', 'total_runs', 'total_cost', 'isk_produced_est', 'isk_sold', 'units_sold']);
  const CHARACTER_NUMERIC = new Set(['job_count', 'total_runs', 'unique_products', 'total_cost']);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const { from, to } = presetRange(preset);
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (activityId) params.activity = activityId;
      if (charId) params.character_id = charId;
      params.top_limit = 2000;
      const res = await getCharacterIndustryStats(params);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load character industry stats:', err);
      onError?.('Failed to load personal industry stats');
    } finally {
      setLoading(false);
    }
  }, [preset, activityId, charId, onError]);

  useEffect(() => {
    loadStats();
  }, [loadStats, refreshKey]);

  const summary = data?.summary;
  const characters = data?.characters || [];
  const topProducts = data?.top_products || [];
  const byCharacter = data?.by_character || [];
  const byGroup = data?.by_group || [];
  const byActivity = data?.by_activity || [];
  const byMonth = data?.by_month || [];
  const byMonthCategory = data?.by_month_category || [];

  // Dedicated unbounded ships list from backend, independent of the
  // top-products top-500 bucket.
  const allShips = data?.ships_built || [];
  const topShips = useMemo(() => {
    return showAllShips ? allShips : allShips.slice(0, 12);
  }, [allShips, showAllShips]);

  const activityRollup = useMemo(() => {
    const kindFor = (id) => {
      if (id === 1) return 'manufacturing';
      if (id === 9 || id === 11) return 'reactions';
      return 'science';
    };
    const kindOrder = { manufacturing: 0, science: 1, reactions: 2 };
    const bucket = {};
    for (const row of byActivity) {
      const key = (row.activity_id === 9 || row.activity_id === 11) ? 'reactions' : String(row.activity_id);
      const label = (row.activity_id === 9 || row.activity_id === 11)
        ? 'Reactions'
        : (ACTIVITY_LABELS[row.activity_id] || `Activity ${row.activity_id}`);
      if (!bucket[key]) bucket[key] = { label, kind: kindFor(row.activity_id), job_count: 0, total_runs: 0, total_cost: 0 };
      bucket[key].job_count += row.job_count || 0;
      bucket[key].total_runs += row.total_runs || 0;
      bucket[key].total_cost += row.total_cost || 0;
    }
    return Object.values(bucket).sort((a, b) => {
      const ko = kindOrder[a.kind] - kindOrder[b.kind];
      return ko !== 0 ? ko : b.job_count - a.job_count;
    });
  }, [byActivity]);

  const metricValue = useCallback((row) => {
    if (metric === 'jobs') return row.job_count || 0;
    if (metric === 'cost') return row.total_cost || 0;
    return row.total_runs || 0;
  }, [metric]);

  const formatMetric = useCallback((n) => {
    if (metric === 'cost') return `${formatISK(n)} ISK`;
    return formatNumber(n);
  }, [metric]);

  const metricLabel = metric === 'jobs' ? 'jobs' : metric === 'cost' ? 'ISK' : 'runs';

  const groupedByCategory = useMemo(() => {
    const map = {};
    for (const row of byGroup) {
      const key = row.product_category_id || 'unknown';
      if (!map[key]) {
        map[key] = {
          category_id: row.product_category_id,
          category_name: row.product_category_name,
          groups: [],
          total: 0,
        };
      }
      map[key].groups.push(row);
      map[key].total += metricValue(row);
    }
    for (const cat of Object.values(map)) {
      cat.groups.sort((a, b) => metricValue(b) - metricValue(a));
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [byGroup, metricValue]);

  return (
    <div className="corp-industry-stats">
      <div className="cis-header">
        <h2>My Industry History</h2>
        <div className="cis-filters">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            <option value="">All activities</option>
            <option value="1">Manufacturing</option>
            <option value="11">Reactions</option>
            <option value="8">Invention</option>
            <option value="5">Copying</option>
            <option value="3">Researching Time Efficiency</option>
            <option value="4">Researching Material Efficiency</option>
          </select>
          {characters.length > 1 && (
            <select value={charId} onChange={(e) => setCharId(e.target.value)}>
              <option value="">All my characters</option>
              {characters.map(c => (
                <option key={c.character_id} value={c.character_id}>{c.character_name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="cis-export-all"
            onClick={async () => {
              const { from, to } = presetRange(preset);
              const params = {};
              if (from) params.from = from;
              if (to) params.to = to;
              if (activityId) params.activity = activityId;
              if (charId) params.character_id = charId;
              try {
                const rows = await getAllCharacterIndustryHistory(params);
                exportToCSV(
                  rows,
                  [
                    { key: 'end_date', label: 'Completed' },
                    { key: 'start_date', label: 'Started' },
                    { key: 'status', label: 'Status' },
                    { key: 'activity_id', label: 'Activity ID' },
                    { key: 'product_name', label: 'Product' },
                    { key: 'product_type_id', label: 'Type ID' },
                    { key: 'product_group_name', label: 'Group' },
                    { key: 'product_category_name', label: 'Category' },
                    { key: 'runs', label: 'Runs' },
                    { key: 'licensed_runs', label: 'Licensed Runs' },
                    { key: 'cost', label: 'Job Cost (ISK)' },
                    { key: 'character_name', label: 'Character' },
                    { key: 'character_id', label: 'Character ID' },
                    { key: 'facility_name', label: 'Facility' },
                    { key: 'facility_id', label: 'Facility ID' },
                    { key: 'location_name', label: 'Location' },
                    { key: 'location_id', label: 'Location ID' },
                  ],
                  `my-industry-history-${preset}${charId ? '-' + charId : ''}`
                );
              } catch (err) {
                onError?.('Export failed: ' + err.message);
              }
            }}
          >↓ Export CSV</button>
        </div>
      </div>

      {loading && <div className="cis-loading">Loading…</div>}

      {!loading && !summary && (
        <div className="cis-empty">
          No archived jobs yet. Personal jobs are archived every 15 minutes —
          completed jobs appear here once captured from ESI.
        </div>
      )}

      {!loading && summary && (
        <>
          <div className="cis-cards">
            <Card label="Jobs Completed" value={formatNumber(summary.job_count)} />
            <Card label="Total Runs" value={formatNumber(summary.total_runs)} />
            <Card label="Unique Products" value={formatNumber(summary.unique_products)} />
            <Card label="Active Characters" value={formatNumber(summary.unique_characters)} />
            <Card label="Total Job Cost" value={`${formatISK(summary.total_cost)} ISK`} />
            <Card
              label="ISK Produced (est)"
              value={`${formatISK(summary.isk_produced_est)} ISK`}
              hint="Σ runs × current Jita sell; manufacturing + reactions only"
            />
            <Card
              label="ISK Sold (real)"
              value={`${formatISK(summary.isk_sold_real)} ISK`}
              hint="Σ wallet sales (is_buy=0) in this window across all characters — may include inventory built before the window"
            />
          </div>

          {allShips.length > 0 && (
            <section className="cis-panel cis-ships">
              <div className="cis-panel-header">
                <h3>Ships Built ({allShips.length})</h3>
                {allShips.length > 12 && (
                  <button
                    type="button"
                    className="cis-export-all"
                    onClick={() => setShowAllShips(s => !s)}
                  >{showAllShips ? `Show Top 12` : `Show All ${allShips.length}`}</button>
                )}
              </div>
              <div className="cis-ship-grid">
                {topShips.map(ship => (
                  <div className="cis-ship-tile" key={ship.product_type_id}>
                    {ship.product_type_id && (
                      <img
                        className="cis-ship-icon"
                        src={`https://images.evetech.net/types/${ship.product_type_id}/icon?size=64`}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <div className="cis-ship-info">
                      <div className="cis-ship-name">{ship.product_name || `Type ${ship.product_type_id}`}</div>
                      <div className="cis-ship-group">{ship.product_group_name || ''}</div>
                    </div>
                    <div className="cis-ship-count">
                      <span className="cis-ship-runs">{formatNumber(ship.total_runs)}</span>
                      <span className="cis-ship-jobs">{formatNumber(ship.job_count)} jobs</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activityRollup.length > 0 && (
            <section className="cis-panel cis-activities">
              <h3>By Activity</h3>
              <div className="cis-activity-grid">
                {activityRollup.map(a => (
                  <div className={`cis-activity-tile cis-kind-${a.kind}`} key={a.label}>
                    <div className="cis-activity-label">{a.label}</div>
                    <div className="cis-activity-jobs">{formatNumber(a.job_count)} jobs</div>
                    <div className="cis-activity-runs">{formatNumber(a.total_runs)} runs</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <MonthlyTrendChart
            by_month={byMonth}
            by_month_category={byMonthCategory}
            metric={metric}
            onMetricChange={setMetric}
          />

          {groupedByCategory.length > 0 && (
            <section className="cis-panel cis-categories">
              <div className="cis-monthly-header">
                <h3>By Category</h3>
                <div className="cis-metric-toggle">
                  <button className={metric === 'jobs' ? 'active' : ''} onClick={() => setMetric('jobs')}>Jobs</button>
                  <button className={metric === 'cost' ? 'active' : ''} onClick={() => setMetric('cost')}>Cost (ISK)</button>
                  <button className={metric === 'runs' ? 'active' : ''} onClick={() => setMetric('runs')}>Runs</button>
                </div>
              </div>
              <div className="cis-category-grid">
                {groupedByCategory.map(cat => {
                  const topVal = metricValue(cat.groups[0]) || 1;
                  return (
                    <div className="cis-category-block" key={cat.category_id || 'unknown'}>
                      <div className="cis-category-header">
                        <span className="cis-category-name">
                          {cat.category_name || (cat.category_id ? `Category ${cat.category_id}` : 'Unknown')}
                        </span>
                        <span className="cis-category-total">{formatMetric(cat.total)}{metric !== 'cost' ? ` ${metricLabel}` : ''}</span>
                      </div>
                      <div className="cis-group-bars">
                        {cat.groups.slice(0, 8).map(g => {
                          const v = metricValue(g);
                          const width = Math.max(2, (v / topVal) * 100);
                          return (
                            <div className="cis-group-bar-row" key={g.product_group_id || 'unknown-group'}>
                              <span className="cis-group-bar-label" title={g.product_group_name || ''}>
                                {g.product_group_name || (g.product_group_id ? `Group ${g.product_group_id}` : 'Unknown')}
                              </span>
                              <span className="cis-group-bar-track">
                                <span className="cis-group-bar-fill" style={{ width: `${width}%` }} />
                              </span>
                              <span className="cis-group-bar-value">{formatMetric(v)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="cis-columns">
            <section className="cis-panel">
              <div className="cis-panel-header">
                <h3>Top Products ({topProducts.length})</h3>
                {topProducts.length > PRODUCT_TABLE_DEFAULT && (
                  <button
                    type="button"
                    className="cis-export-all"
                    onClick={() => setShowAllProducts(s => !s)}
                    style={{ marginRight: 8 }}
                  >{showAllProducts ? `Show Top ${PRODUCT_TABLE_DEFAULT}` : `Show All ${topProducts.length}`}</button>
                )}
                <ExportButton
                  getData={() => topProducts.map(p => ({
                    product: p.product_name || `Type ${p.product_type_id}`,
                    product_type_id: p.product_type_id,
                    group: p.product_group_name || '',
                    category: p.product_category_name || '',
                    activity: ACTIVITY_LABELS[p.activity_id] || `Activity ${p.activity_id}`,
                    jobs: p.job_count,
                    runs: p.total_runs,
                    cost_isk: p.total_cost,
                    isk_produced_est: p.isk_produced_est,
                    units_sold: p.units_sold,
                    isk_sold_real: p.isk_sold,
                  }))}
                  columns={[
                    { key: 'product', label: 'Product' },
                    { key: 'product_type_id', label: 'Type ID' },
                    { key: 'group', label: 'Group' },
                    { key: 'category', label: 'Category' },
                    { key: 'activity', label: 'Activity' },
                    { key: 'jobs', label: 'Jobs' },
                    { key: 'runs', label: 'Runs' },
                    { key: 'cost_isk', label: 'Job Cost (ISK)' },
                    { key: 'isk_produced_est', label: 'ISK Produced (est)' },
                    { key: 'units_sold', label: 'Units Sold' },
                    { key: 'isk_sold_real', label: 'ISK Sold (real)' },
                  ]}
                  filename="my-top-products"
                />
              </div>
              <table className="cis-table">
                <thead>
                  <tr>
                    <SortableTh col="product_name" label="Product" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} />
                    <SortableTh col="activity_id" label="Activity" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} />
                    <SortableTh col="job_count" label="Jobs" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} className="num" />
                    <SortableTh col="total_runs" label="Runs" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} className="num" />
                    <SortableTh col="total_cost" label="Cost" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} className="num" />
                    <SortableTh col="isk_produced_est" label="Produced" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} className="num" title="Σ runs × current Jita sell (manufacturing + reactions only)" />
                    <SortableTh col="isk_sold" label="Sold" activeCol={productSort.col} dir={productSort.dir} onClick={toggleProductSort} className="num" title="Σ wallet sales (is_buy=0) in this window — actual ISK earned from selling these types" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sorted = sortRows(topProducts, productSort.col, productSort.dir, PRODUCT_NUMERIC);
                    return showAllProducts ? sorted : sorted.slice(0, PRODUCT_TABLE_DEFAULT);
                  })().map(p => (
                    <tr key={`${p.product_type_id}-${p.activity_id}`}>
                      <td>
                        <span className="cis-product-name">{p.product_name || `Type ${p.product_type_id}`}</span>
                        {p.product_type_id && <ExternalLinks typeId={p.product_type_id} compact />}
                      </td>
                      <td className="cis-activity">{ACTIVITY_LABELS[p.activity_id] || `Activity ${p.activity_id}`}</td>
                      <td className="num">{formatNumber(p.job_count)}</td>
                      <td className="num">{formatNumber(p.total_runs)}</td>
                      <td className="num">{formatISK(p.total_cost)}</td>
                      <td className="num">{p.isk_produced_est ? formatISK(p.isk_produced_est) : '—'}</td>
                      <td className="num" title={p.units_sold ? `${formatNumber(p.units_sold)} units sold` : ''}>
                        {p.isk_sold ? formatISK(p.isk_sold) : '—'}
                      </td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={7} className="cis-empty-row">No products in range</td></tr>}
                </tbody>
              </table>
            </section>

            <section className="cis-panel">
              <div className="cis-panel-header">
                <h3>By Character ({byCharacter.length})</h3>
                <ExportButton
                  getData={() => byCharacter.map(c => ({
                    character: c.character_name || `Character ${c.character_id}`,
                    character_id: c.character_id,
                    jobs: c.job_count,
                    runs: c.total_runs,
                    unique_products: c.unique_products,
                    cost_isk: c.total_cost,
                  }))}
                  columns={[
                    { key: 'character', label: 'Character' },
                    { key: 'character_id', label: 'Character ID' },
                    { key: 'jobs', label: 'Jobs' },
                    { key: 'runs', label: 'Runs' },
                    { key: 'unique_products', label: 'Unique Products' },
                    { key: 'cost_isk', label: 'Total Cost (ISK)' },
                  ]}
                  filename="my-character-breakdown"
                />
              </div>
              <table className="cis-table">
                <thead>
                  <tr>
                    <SortableTh col="character_name" label="Character" activeCol={characterSort.col} dir={characterSort.dir} onClick={toggleCharacterSort} />
                    <SortableTh col="job_count" label="Jobs" activeCol={characterSort.col} dir={characterSort.dir} onClick={toggleCharacterSort} className="num" />
                    <SortableTh col="total_runs" label="Runs" activeCol={characterSort.col} dir={characterSort.dir} onClick={toggleCharacterSort} className="num" />
                    <SortableTh col="unique_products" label="Products" activeCol={characterSort.col} dir={characterSort.dir} onClick={toggleCharacterSort} className="num" />
                    <SortableTh col="total_cost" label="Cost" activeCol={characterSort.col} dir={characterSort.dir} onClick={toggleCharacterSort} className="num" />
                  </tr>
                </thead>
                <tbody>
                  {sortRows(byCharacter, characterSort.col, characterSort.dir, CHARACTER_NUMERIC).map(c => (
                    <tr key={c.character_id}>
                      <td>{c.character_name || `Character ${c.character_id}`}</td>
                      <td className="num">{formatNumber(c.job_count)}</td>
                      <td className="num">{formatNumber(c.total_runs)}</td>
                      <td className="num">{formatNumber(c.unique_products)}</td>
                      <td className="num">{formatISK(c.total_cost)}</td>
                    </tr>
                  ))}
                  {byCharacter.length === 0 && <tr><td colSpan={5} className="cis-empty-row">No characters in range</td></tr>}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, hint }) {
  return (
    <div className="cis-card" title={hint || undefined}>
      <div className="cis-card-label">{label}</div>
      <div className="cis-card-value">{value}</div>
    </div>
  );
}

export default CharacterIndustryStats;
