import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCorpIndustryStats } from '../services/api';
import ExternalLinks from './ExternalLinks';
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

function CorporationIndustryStats({ onError, refreshKey }) {
  const [preset, setPreset] = useState('this-month');
  const [activityId, setActivityId] = useState('');
  const [corpId, setCorpId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const { from, to } = presetRange(preset);
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (activityId) params.activity = activityId;
      if (corpId) params.corporation_id = corpId;
      params.top_limit = 100;
      const res = await getCorpIndustryStats(params);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load corp industry stats:', err);
      onError?.('Failed to load corporation industry stats');
    } finally {
      setLoading(false);
    }
  }, [preset, activityId, corpId, onError]);

  useEffect(() => {
    loadStats();
  }, [loadStats, refreshKey]);

  const summary = data?.summary;
  const corporations = data?.corporations || [];
  const topProducts = data?.top_products || [];
  const topInstallers = data?.top_installers || [];
  const byGroup = data?.by_group || [];
  const byActivity = data?.by_activity || [];
  const byMonth = data?.by_month || [];
  const byMonthCategory = data?.by_month_category || [];

  const topShips = useMemo(() => {
    return topProducts
      .filter(p => p.product_category_name === 'Ship' && p.activity_id === 1)
      .slice(0, 12);
  }, [topProducts]);

  // ESI reports reactions as activity 9 (legacy) or 11 (modern); merge them.
  // `kind` maps to the dashboard's manufacturing/science/reactions palette.
  const activityRollup = useMemo(() => {
    const kindFor = (id) => {
      if (id === 1) return 'manufacturing';
      if (id === 9 || id === 11) return 'reactions';
      return 'science';
    };
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
    return Object.values(bucket).sort((a, b) => b.job_count - a.job_count);
  }, [byActivity]);

  const groupedByCategory = useMemo(() => {
    const map = {};
    for (const row of byGroup) {
      const key = row.product_category_id || 'unknown';
      if (!map[key]) {
        map[key] = {
          category_id: row.product_category_id,
          category_name: row.product_category_name,
          groups: [],
          total_runs: 0,
          job_count: 0,
        };
      }
      map[key].groups.push(row);
      map[key].total_runs += row.total_runs || 0;
      map[key].job_count += row.job_count || 0;
    }
    return Object.values(map).sort((a, b) => b.total_runs - a.total_runs);
  }, [byGroup]);

  return (
    <div className="corp-industry-stats">
      <div className="cis-header">
        <h2>Corporation Industry History</h2>
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
          {corporations.length > 1 && (
            <select value={corpId} onChange={(e) => setCorpId(e.target.value)}>
              <option value="">All my corps</option>
              {corporations.map(c => (
                <option key={c.corporation_id} value={c.corporation_id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && <div className="cis-loading">Loading…</div>}

      {!loading && !summary && (
        <div className="cis-empty">
          No archived jobs yet. The tracker archives completed corp jobs every 15 minutes —
          data will appear here once a completed job is captured from ESI.
        </div>
      )}

      {!loading && summary && (
        <>
          <div className="cis-cards">
            <Card label="Jobs Completed" value={formatNumber(summary.job_count)} />
            <Card label="Total Runs" value={formatNumber(summary.total_runs)} />
            <Card label="Unique Products" value={formatNumber(summary.unique_products)} />
            <Card label="Active Installers" value={formatNumber(summary.unique_installers)} />
            <Card label="Total Job Cost" value={`${formatISK(summary.total_cost)} ISK`} />
          </div>

          {topShips.length > 0 && (
            <section className="cis-panel cis-ships">
              <h3>Ships Built</h3>
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

          <div className="cis-columns">
            <section className="cis-panel">
              <h3>Top Products</h3>
              <table className="cis-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Activity</th>
                    <th className="num">Jobs</th>
                    <th className="num">Runs</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map(p => (
                    <tr key={`${p.product_type_id}-${p.activity_id}`}>
                      <td>
                        <span className="cis-product-name">{p.product_name || `Type ${p.product_type_id}`}</span>
                        {p.product_type_id && <ExternalLinks typeId={p.product_type_id} compact />}
                      </td>
                      <td className="cis-activity">{ACTIVITY_LABELS[p.activity_id] || `Activity ${p.activity_id}`}</td>
                      <td className="num">{formatNumber(p.job_count)}</td>
                      <td className="num">{formatNumber(p.total_runs)}</td>
                      <td className="num">{formatISK(p.total_cost)}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={5} className="cis-empty-row">No products in range</td></tr>}
                </tbody>
              </table>
            </section>

            <section className="cis-panel">
              <h3>Top Installers</h3>
              <table className="cis-table">
                <thead>
                  <tr>
                    <th>Character</th>
                    <th className="num">Jobs</th>
                    <th className="num">Runs</th>
                    <th className="num">Products</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {topInstallers.map(i => (
                    <tr key={i.installer_id}>
                      <td>{i.installer_name || `Character ${i.installer_id}`}</td>
                      <td className="num">{formatNumber(i.job_count)}</td>
                      <td className="num">{formatNumber(i.total_runs)}</td>
                      <td className="num">{formatNumber(i.unique_products)}</td>
                      <td className="num">{formatISK(i.total_cost)}</td>
                    </tr>
                  ))}
                  {topInstallers.length === 0 && <tr><td colSpan={5} className="cis-empty-row">No installers in range</td></tr>}
                </tbody>
              </table>
            </section>
          </div>

          <MonthlyTrendChart by_month={byMonth} by_month_category={byMonthCategory} />

          {groupedByCategory.length > 0 && (
            <section className="cis-panel cis-categories">
              <h3>By Category</h3>
              <div className="cis-category-grid">
                {groupedByCategory.map(cat => {
                  const topGroup = cat.groups[0]?.total_runs || 1;
                  return (
                    <div className="cis-category-block" key={cat.category_id || 'unknown'}>
                      <div className="cis-category-header">
                        <span className="cis-category-name">
                          {cat.category_name || (cat.category_id ? `Category ${cat.category_id}` : 'Unknown')}
                        </span>
                        <span className="cis-category-total">{formatNumber(cat.total_runs)} runs</span>
                      </div>
                      <div className="cis-group-bars">
                        {cat.groups.slice(0, 8).map(g => {
                          const width = Math.max(2, ((g.total_runs || 0) / topGroup) * 100);
                          return (
                            <div className="cis-group-bar-row" key={g.product_group_id || 'unknown-group'}>
                              <span className="cis-group-bar-label" title={g.product_group_name || ''}>
                                {g.product_group_name || (g.product_group_id ? `Group ${g.product_group_id}` : 'Unknown')}
                              </span>
                              <span className="cis-group-bar-track">
                                <span className="cis-group-bar-fill" style={{ width: `${width}%` }} />
                              </span>
                              <span className="cis-group-bar-value">{formatNumber(g.total_runs)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="cis-note">
                Category/group names resolve lazily from ESI on first archive — re-visit after the next
                archive cycle if you see bare IDs here.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="cis-card">
      <div className="cis-card-label">{label}</div>
      <div className="cis-card-value">{value}</div>
    </div>
  );
}

export default CorporationIndustryStats;
