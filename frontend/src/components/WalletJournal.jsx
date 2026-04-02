import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getWalletJournal, getWalletTransactions } from '../services/api';
import ExportButton from './ExportButton';
import './WalletJournal.css';

function formatISK(value) {
  if (!value || value === 0) return '0';
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : '';
  if (abs >= 1e12) return `${sign}${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(value / 1e3).toFixed(0)}K`;
  return `${sign}${value.toFixed(0)}`;
}

function formatISKPlain(value) {
  if (!value || value === 0) return '0';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// Category grouping for overview
const REF_CATEGORIES = {
  'market_transaction': 'Trade', 'transaction_tax': 'Trade', 'brokers_fee': 'Trade',
  'bounty_prizes': 'Bounty', 'bounty_prize': 'Bounty', 'agent_mission_reward': 'Bounty', 'agent_mission_time_bonus_reward': 'Bounty',
  'player_donation': 'Transfers', 'player_trading': 'Transfers', 'corporation_account_withdrawal': 'Transfers', 'contract_price': 'Transfers', 'contract_reward': 'Transfers', 'contract_collateral': 'Transfers',
  'industry_job_tax': 'Industry', 'manufacturing': 'Industry', 'reprocessing_tax': 'Industry',
  'planetary_import_tax': 'Planetary', 'planetary_export_tax': 'Planetary', 'planetary_construction': 'Planetary',
  'insurance': 'Insurance', 'structure_gate_jump': 'Fees', 'jump_clone_activation_fee': 'Fees', 'office_rental_fee': 'Fees',
};

const CATEGORY_COLORS = {
  'Trade': '#f6ad55', 'Bounty': '#68d391', 'Transfers': '#63b3ed',
  'Industry': '#fc8181', 'Planetary': '#b794f4', 'Insurance': '#f687b3',
  'Fees': '#a0aec0', 'Other': '#718096',
};

function getCategory(refType) {
  return REF_CATEGORIES[refType] || 'Other';
}

// ===== OVERVIEW TAB (Donut Chart) =====
function OverviewTab({ entries }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(300);

  const stats = React.useMemo(() => {
    let income = 0, expenses = 0;
    const byCategory = {};
    entries.forEach(e => {
      const cat = getCategory(e.ref_type);
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expenses: 0 };
      if (e.amount > 0) { income += e.amount; byCategory[cat].income += e.amount; }
      else if (e.amount < 0) { expenses += Math.abs(e.amount); byCategory[cat].expenses += Math.abs(e.amount); }
    });
    return { income, expenses, byCategory };
  }, [entries]);

  // Size canvas to fill container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height - 40; // padding
      if (h > 100) setCanvasSize(Math.min(h, 500));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, r = size * 0.38, lineWidth = size * 0.09;
    const total = stats.income + stats.expenses;
    if (total === 0) return;

    // Draw donut — income categories
    let angle = -Math.PI / 2;
    const categories = Object.entries(stats.byCategory).sort((a, b) => (b[1].income + b[1].expenses) - (a[1].income + a[1].expenses));
    categories.forEach(([cat, data]) => {
      const val = data.income + data.expenses;
      const sweep = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.strokeStyle = CATEGORY_COLORS[cat] || '#718096';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      angle += sweep;
    });

    // Center text
    const fontSize = Math.max(16, size * 0.08);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${fontSize}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(formatISKPlain(stats.income), cx, cy - 6);
    ctx.fillStyle = '#718096';
    ctx.font = `${Math.max(10, fontSize * 0.5)}px sans-serif`;
    ctx.fillText('30 Days Income', cx, cy + fontSize * 0.6);
  }, [stats, canvasSize]);

  if (entries.length === 0 || (stats.income === 0 && stats.expenses === 0)) {
    return (
      <div className="wj-overview wj-overview-empty" ref={containerRef}>
        <span className="wj-empty">No wallet journal data yet. Data will appear after the first ESI sync.</span>
      </div>
    );
  }

  return (
    <div className="wj-overview" ref={containerRef}>
      <div className="wj-overview-chart">
        <canvas ref={canvasRef} style={{ width: canvasSize, height: canvasSize }} />
      </div>
      <div className="wj-overview-stats">
        <div className="wj-overview-totals">
          <div className="wj-overview-total income">
            <span className="wj-ov-label">Income</span>
            <span className="wj-ov-value positive">+{formatISKPlain(stats.income)} ISK</span>
          </div>
          <div className="wj-overview-total expenses">
            <span className="wj-ov-label">Expenses</span>
            <span className="wj-ov-value negative">-{formatISKPlain(stats.expenses)} ISK</span>
          </div>
        </div>
        <div className="wj-overview-categories">
          {Object.entries(stats.byCategory)
            .sort((a, b) => (b[1].income + b[1].expenses) - (a[1].income + a[1].expenses))
            .map(([cat, data]) => (
              <div key={cat} className="wj-ov-cat">
                <span className="wj-ov-cat-dot" style={{ background: CATEGORY_COLORS[cat] || '#718096' }} />
                <span className="wj-ov-cat-pct">{((data.income + data.expenses) / (stats.income + stats.expenses) * 100).toFixed(1)}%</span>
                <span className="wj-ov-cat-name">{cat}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ===== JOURNAL TABLE (shared between All and Transactions tabs) =====
function JournalTable({ entries }) {
  return (
    <>
      <div className="wj-table-wrap">
        <table className="wj-table">
          <thead>
            <tr>
              <th className="wj-col-date">Date</th>
              <th className="wj-col-qty">Qty</th>
              <th className="wj-col-item">Item</th>
              <th className="wj-col-badge">Buy/Sell</th>
              <th className="wj-col-amount">Amount</th>
              <th className="wj-col-amount">Balance</th>
              <th className="wj-col-desc">Description</th>
              <th className="wj-col-parties">Parties</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.entry_id || i}>
                <td className="wj-date">{formatDate(e.date)}</td>
                <td className="wj-qty">{e.transaction ? (e.transaction.quantity || 0).toLocaleString() : ''}</td>
                <td className="wj-typename">
                  {e.transaction ? e.transaction.type_name : <span className="wj-type">{(e.ref_type || '').replace(/_/g, ' ')}</span>}
                </td>
                <td>{e.transaction ? <span className={`wj-bs-badge ${e.transaction.is_buy ? 'buy' : 'sell'}`}>{e.transaction.is_buy ? 'Buy' : 'Sell'}</span> : ''}</td>
                <td className={`wj-amount ${e.amount > 0 ? 'positive' : e.amount < 0 ? 'negative' : ''}`}>
                  {formatISK(e.amount)}
                </td>
                <td className="wj-balance">{formatISKPlain(e.balance)}</td>
                <td className="wj-desc">{e.description || e.reason || '—'}</td>
                <td className="wj-parties">
                  {e.first_party_name && <span>{e.first_party_name}</span>}
                  {e.first_party_name && e.second_party_name && <span className="wj-arrow"> → </span>}
                  {e.second_party_name && <span>{e.second_party_name}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== MARKET TRANSACTIONS TAB =====
function MarketTransactionsTab({ filtered, loading }) {
  if (loading) return <div className="wj-loading">Loading market transactions...</div>;
  if (filtered.length === 0) return <div className="wj-empty">No market transactions found.</div>;

  return (
    <div className="wj-table-wrap">
      <table className="wj-table">
        <thead>
          <tr>
            <th className="wj-col-date">Date</th>
            <th className="wj-col-qty">Qty</th>
            <th className="wj-col-item">Item</th>
            <th className="wj-col-badge">Buy/Sell</th>
            <th className="wj-col-amount">Unit Price</th>
            <th className="wj-col-amount">Total</th>
            <th className="wj-col-desc">Description</th>
            <th className="wj-col-parties">Parties</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t, i) => (
            <tr key={t.transaction_id || i}>
              <td className="wj-date">{formatDate(t.date)}</td>
              <td className="wj-qty">{(t.quantity || 0).toLocaleString()}</td>
              <td className="wj-typename">{t.type_name || `Type ${t.type_id}`}</td>
              <td><span className={`wj-bs-badge ${t.is_buy ? 'buy' : 'sell'}`}>{t.is_buy ? 'Buy' : 'Sell'}</span></td>
              <td className={`wj-amount ${t.is_buy ? 'negative' : 'positive'}`}>{formatISKPlain(t.unit_price)} ISK</td>
              <td className={`wj-amount ${t.is_buy ? 'negative' : 'positive'}`}>{formatISKPlain(t.total)} ISK</td>
              <td className="wj-desc">{t.location_name || '—'}</td>
              <td className="wj-parties">{t.client_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== MAIN COMPONENT =====
function WalletJournal({ characterId, refreshKey }) {
  const [entries, setEntries] = useState([]);
  const [refTypes, setRefTypes] = useState([]);
  const [selectedRefType, setSelectedRefType] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsScope, setNeedsScope] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [marketTx, setMarketTx] = useState([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [buyFilter, setBuyFilter] = useState('all');
  const [journalBuySell, setJournalBuySell] = useState('all');
  const tabsRef = useRef(null);
  const LIMIT = 200;

  const loadJournal = useCallback(async (append = false) => {
    if (!characterId) return;
    setLoading(true);
    try {
      const currentOffset = append ? offset : 0;
      const resp = await getWalletJournal(characterId, LIMIT, currentOffset, selectedRefType || null);
      if (resp.data.needs_scope) { setNeedsScope(true); setEntries([]); return; }
      setNeedsScope(false);
      setRefTypes(resp.data.ref_types || []);
      if (append) setEntries(prev => [...prev, ...resp.data.entries]);
      else setEntries(resp.data.entries || []);
      setHasMore(resp.data.entries?.length === LIMIT);
      if (!append) setOffset(LIMIT); else setOffset(prev => prev + LIMIT);
    } catch { if (!append) setEntries([]); }
    finally { setLoading(false); }
  }, [characterId, selectedRefType, offset]);

  useEffect(() => { setOffset(0); loadJournal(false); }, [characterId, selectedRefType, refreshKey]);

  // Load market transactions
  const loadMarketTx = useCallback(async () => {
    if (!characterId) return;
    setMarketLoading(true);
    try {
      const resp = await getWalletTransactions(characterId, 500, 0);
      setMarketTx(resp.data.transactions || []);
    } catch { setMarketTx([]); }
    finally { setMarketLoading(false); }
  }, [characterId]);

  useEffect(() => { loadMarketTx(); }, [loadMarketTx, refreshKey]);

  const filteredMarketTx = buyFilter === 'all' ? marketTx
    : marketTx.filter(t => buyFilter === 'buy' ? t.is_buy : !t.is_buy);

  if (needsScope) return <div className="wj-needs-scope">Wallet requires re-authorization with wallet scope.</div>;

  return (
    <div className="wj-container">
      <div className="wj-tabs" ref={tabsRef}>
        {['overview', 'transactions', 'market', 'all'].map(tab => (
          <button
            key={tab}
            className={`wj-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              requestAnimationFrame(() => {
                tabsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              });
            }}
          >
            {tab === 'all' ? 'All' : tab === 'overview' ? 'Overview' : tab === 'transactions' ? 'Transactions' : 'Market Transactions'}
          </button>
        ))}
        {(activeTab === 'all' || activeTab === 'transactions') && (
          <select className="wj-ref-filter" value={selectedRefType} onChange={e => setSelectedRefType(e.target.value)}>
            <option value="">All types</option>
            {refTypes.map(rt => <option key={rt} value={rt}>{rt.replace(/_/g, ' ')}</option>)}
          </select>
        )}
        {activeTab === 'all' && (
          <select className="wj-ref-filter" value={journalBuySell} onChange={e => setJournalBuySell(e.target.value)}>
            <option value="all">All trades</option>
            <option value="buy">Buy only</option>
            <option value="sell">Sell only</option>
          </select>
        )}
        {activeTab === 'market' && (
          <select className="wj-ref-filter" value={buyFilter} onChange={e => setBuyFilter(e.target.value)}>
            <option value="all">All transactions</option>
            <option value="buy">Buy only</option>
            <option value="sell">Sell only</option>
          </select>
        )}
        <span className="wj-tabs-right">
          {activeTab === 'market' && (
            <ExportButton
              getData={() => filteredMarketTx}
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'quantity', label: 'Qty' },
                { key: 'type_name', label: 'Type' },
                { key: 'unit_price', label: 'Unit Price' },
                { key: 'total', label: 'Total' },
                { key: 'is_buy', label: 'Buy/Sell' },
                { key: 'client_name', label: 'Client' },
                { key: 'location_name', label: 'Where' },
              ]}
              filename="market-transactions"
            />
          )}
          {activeTab !== 'overview' && activeTab !== 'market' && (
            <ExportButton
              getData={() => entries.map(e => ({
                ...e,
                _item: e.transaction ? `${e.transaction.quantity}x ${e.transaction.type_name} (${e.transaction.is_buy ? 'buy' : 'sell'})` : '',
              }))}
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'ref_type', label: 'Type' },
                ...(activeTab === 'all' ? [{ key: '_item', label: 'Item' }] : []),
                { key: 'amount', label: 'Amount' },
                { key: 'balance', label: 'Balance' },
                { key: 'description', label: 'Description' },
                { key: 'first_party_name', label: 'From' },
                { key: 'second_party_name', label: 'To' },
              ]}
              filename={activeTab === 'all' ? 'wallet-all' : 'wallet-journal'}
            />
          )}
          <span className="wj-count">
            {activeTab === 'market' ? `${filteredMarketTx.length} transactions` : `${entries.length} entries`}
          </span>
        </span>
      </div>

      <div className="wj-tab-content">
        {loading && entries.length === 0 ? (
          <div className="wj-loading">Loading wallet data...</div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab entries={entries} />}

            {activeTab === 'all' && (
              <>
                <JournalTable entries={journalBuySell === 'all' ? entries : entries.filter(e => {
                  if (!e.transaction) return journalBuySell === 'all';
                  return journalBuySell === 'buy' ? e.transaction.is_buy : !e.transaction.is_buy;
                })} />
                <button className="wj-load-more" onClick={() => loadJournal(true)} disabled={loading || !hasMore}>{loading ? 'Loading...' : hasMore ? 'Load more' : 'All loaded'}</button>
              </>
            )}

            {activeTab === 'transactions' && (
              <>
                <JournalTable entries={entries} />
                <button className="wj-load-more" onClick={() => loadJournal(true)} disabled={loading || !hasMore}>{loading ? 'Loading...' : hasMore ? 'Load more' : 'All loaded'}</button>
              </>
            )}

            {activeTab === 'market' && (
              <>
                <MarketTransactionsTab filtered={filteredMarketTx} loading={marketLoading} />
                <button className="wj-load-more" disabled>All loaded</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default WalletJournal;
