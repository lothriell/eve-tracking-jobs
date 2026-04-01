import React, { useEffect, useState, useCallback } from 'react';
import { getWalletJournal } from '../services/api';
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

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function WalletJournal({ characterId, refreshKey }) {
  const [entries, setEntries] = useState([]);
  const [refTypes, setRefTypes] = useState([]);
  const [selectedRefType, setSelectedRefType] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsScope, setNeedsScope] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 100;

  const loadJournal = useCallback(async (append = false) => {
    if (!characterId) return;
    setLoading(true);
    try {
      const currentOffset = append ? offset : 0;
      const resp = await getWalletJournal(characterId, LIMIT, currentOffset, selectedRefType || null);
      if (resp.data.needs_scope) {
        setNeedsScope(true);
        setEntries([]);
        return;
      }
      setNeedsScope(false);
      setRefTypes(resp.data.ref_types || []);
      if (append) {
        setEntries(prev => [...prev, ...resp.data.entries]);
      } else {
        setEntries(resp.data.entries || []);
      }
      setHasMore(resp.data.entries?.length === LIMIT);
      if (!append) setOffset(LIMIT);
      else setOffset(prev => prev + LIMIT);
    } catch {
      if (!append) setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [characterId, selectedRefType, offset]);

  useEffect(() => {
    setOffset(0);
    loadJournal(false);
  }, [characterId, selectedRefType, refreshKey]);

  if (needsScope) {
    return <div className="wj-needs-scope">Wallet journal requires re-authorization with wallet scope.</div>;
  }

  return (
    <div className="wj-container">
      <div className="wj-toolbar">
        <select className="wj-filter" value={selectedRefType} onChange={e => setSelectedRefType(e.target.value)}>
          <option value="">All types</option>
          {refTypes.map(rt => <option key={rt} value={rt}>{rt.replace(/_/g, ' ')}</option>)}
        </select>
        <ExportButton
          getData={() => entries}
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'ref_type', label: 'Type' },
            { key: 'amount', label: 'Amount' },
            { key: 'balance', label: 'Balance' },
            { key: 'description', label: 'Description' },
            { key: 'first_party_name', label: 'From' },
            { key: 'second_party_name', label: 'To' },
          ]}
          filename="wallet-journal"
        />
        <span className="wj-count">{entries.length} entries</span>
      </div>

      {loading && entries.length === 0 ? (
        <div className="wj-loading">Loading journal...</div>
      ) : entries.length === 0 ? (
        <div className="wj-empty">No journal entries found.</div>
      ) : (
        <>
          <div className="wj-table-wrap">
            <table className="wj-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="wj-amount-col">Amount</th>
                  <th className="wj-balance-col">Balance</th>
                  <th>Description</th>
                  <th>Parties</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.entry_id || i}>
                    <td className="wj-date">{formatDate(e.date)}</td>
                    <td className="wj-type">{(e.ref_type || '').replace(/_/g, ' ')}</td>
                    <td className={`wj-amount ${e.amount > 0 ? 'positive' : e.amount < 0 ? 'negative' : ''}`}>
                      {formatISK(e.amount)}
                    </td>
                    <td className="wj-balance">{formatISK(e.balance)}</td>
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
          {hasMore && (
            <button className="wj-load-more" onClick={() => loadJournal(true)} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default WalletJournal;
