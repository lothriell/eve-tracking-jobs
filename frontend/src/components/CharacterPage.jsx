import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getCharacterSummary, getWealth } from '../services/api';
import WealthChart from './WealthChart';
import WalletJournal from './WalletJournal';
import ExternalLinks from './ExternalLinks';
import './CharacterPage.css';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

const ACTIVITY_LABELS = {
  1: 'Manufacturing',
  3: 'TE Research',
  4: 'ME Research',
  5: 'Copying',
  7: 'Reverse Engineering',
  8: 'Invention',
  9: 'Reactions'
};

const ACTIVITY_CATEGORIES = {
  1: 'manufacturing',
  3: 'science', 4: 'science', 5: 'science', 7: 'science', 8: 'science',
  9: 'reactions'
};

const PLANET_COLORS = {
  temperate: '#4a8840', barren: '#c89860', oceanic: '#3870a8', ice: '#88b8d8',
  gas: '#c8884a', lava: '#d84a2a', storm: '#7858a8', plasma: '#d87028', shattered: '#888888',
};

function formatTimeRemaining(endDateStr) {
  const remaining = new Date(endDateStr) - new Date();
  if (remaining <= 0) return 'Done';
  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  if (d > 0) return `${d}D ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateString) {
  const d = new Date(dateString);
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatCountdown(diff) {
  if (diff <= 0) return 'EXPIRED';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function CharacterPage({ characterId, onError, refreshKey }) {
  const [data, setData] = useState(null);
  const [assetValue, setAssetValue] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [needsWalletScope, setNeedsWalletScope] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryResp, wealthResp] = await Promise.all([
        getCharacterSummary(characterId),
        getWealth(characterId).catch(() => null)
      ]);
      setData(summaryResp.data);
      const cw = wealthResp?.data?.per_character?.[0];
      setAssetValue(cw?.asset_value || null);
      setWalletBalance(cw?.wallet_balance ?? null);
      setNeedsWalletScope(cw?.needs_wallet_scope || false);
    } catch (error) {
      console.error('Failed to load character summary:', error);
      onError?.('Failed to load character data');
    } finally {
      setLoading(false);
    }
  }, [characterId, onError]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // 1-second timer for live countdowns
  useEffect(() => {
    timerRef.current = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (loading) {
    return (
      <div className="charpage-container">
        <div className="charpage-loading"><div className="spinner"></div><p>Loading character data...</p></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="charpage-container">
        <div className="charpage-empty">Character data not available.</div>
      </div>
    );
  }

  const activePersonalJobs = data.personal_jobs.filter(j => j.status === 'active');
  const activeCorpJobs = data.corp_jobs.filter(j => j.status === 'active');
  const now = new Date();

  return (
    <div className="charpage-container">
      {/* Character Header */}
      <div className="charpage-header">
        <img src={data.portrait_url} alt={data.character_name} className="charpage-portrait" />
        <div className="charpage-header-info">
          <h2>{data.character_name} <ExternalLinks type="character" characterId={data.character_id} /></h2>
          <div className="charpage-affiliation">
            {data.corporation && (
              <div className="charpage-affiliation-row">
                <img
                  src={`https://images.evetech.net/corporations/${data.corporation.id}/logo?size=32`}
                  alt=""
                  className="charpage-affiliation-logo"
                />
                <span className="charpage-affiliation-ticker">[{data.corporation.ticker}]</span>
                <span className="charpage-affiliation-name">{data.corporation.name}</span>
              </div>
            )}
            {data.alliance && (
              <div className="charpage-affiliation-row alliance">
                <img
                  src={`https://images.evetech.net/alliances/${data.alliance.id}/logo?size=32`}
                  alt=""
                  className="charpage-affiliation-logo"
                />
                <span className="charpage-affiliation-ticker">[{data.alliance.ticker}]</span>
                <span className="charpage-affiliation-name">{data.alliance.name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="charpage-header-right">
          <div className="charpage-wealth-row">
            <span className="wealth-box assets">
              <span className="wealth-box-label">Assets</span>
              <span className="wealth-box-value">{assetValue > 0 ? (() => {
                if (assetValue >= 1e12) return `${(assetValue / 1e12).toFixed(2)}T`;
                if (assetValue >= 1e9) return `${(assetValue / 1e9).toFixed(2)}B`;
                if (assetValue >= 1e6) return `${(assetValue / 1e6).toFixed(1)}M`;
                if (assetValue >= 1e3) return `${(assetValue / 1e3).toFixed(0)}K`;
                return assetValue.toFixed(0);
              })() : '—'} ISK</span>
            </span>
            <span className={`wealth-box wallet ${needsWalletScope ? 'needs-reauth' : walletBalance != null ? '' : 'placeholder'}`}>
              <span className="wealth-box-label">Wallet</span>
              <span className="wealth-box-value">{needsWalletScope ? 'Re-auth' : walletBalance != null ? (() => {
                const v = walletBalance;
                if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
                if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
                if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
                if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                return v.toFixed(0);
              })() + ' ISK' : '— ISK'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Skill Training Section */}
      <div className="charpage-section">
        <h3>Skill Training</h3>
        {data.skill_queue.status === 'not_training' || data.skill_queue.status === 'unknown' ? (
          <div className="charpage-alert">
            {data.skill_queue.status === 'not_training' ? 'No Skill in Training' : 'Skill queue unavailable (missing scope)'}
          </div>
        ) : data.skill_queue.status === 'paused' ? (
          <div className="charpage-alert warning">Training Paused — {data.skill_queue.queue.length} skill{data.skill_queue.queue.length !== 1 ? 's' : ''} queued</div>
        ) : null}

        {data.skill_queue.queue.length > 0 && (
          <>
            {data.skill_queue.status === 'training' && (
              <div className="charpage-training-active">
                <span className="training-label">Currently training:</span>
                <span className="training-skill">{data.skill_queue.queue[0].skill_name} {ROMAN[data.skill_queue.queue[0].finished_level]}</span>
                <span className="training-time">{formatTimeRemaining(data.skill_queue.queue[0].finish_date)}</span>
              </div>
            )}
            <div className="charpage-queue-toggle" onClick={() => setQueueExpanded(!queueExpanded)}>
              {queueExpanded ? '▾' : '▸'} Full Queue ({data.skill_queue.queue.length} skill{data.skill_queue.queue.length !== 1 ? 's' : ''})
            </div>
            {queueExpanded && (() => {
              const totalTime = data.skill_queue.queue.reduce((sum, s) => {
                const start = s.start_date ? new Date(s.start_date) : now;
                const finish = new Date(s.finish_date);
                return sum + Math.max(0, finish - start);
              }, 0);
              return (
                <>
                  <div className="charpage-queue-table-wrap">
                    <table className="charpage-queue-table">
                      <thead>
                        <tr>
                          <th>Level</th>
                          <th>Skill</th>
                          <th>Finishes</th>
                          <th>Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.skill_queue.queue.map((s, i) => {
                          const start = s.start_date ? new Date(s.start_date) : null;
                          const finish = new Date(s.finish_date);
                          const isActive = start && start <= now && finish > now;
                          return (
                            <tr key={i} className={isActive ? 'queue-active' : ''}>
                              <td className="queue-level">
                                <div className="skill-level-boxes">
                                  {[1,2,3,4,5].map(l => (
                                    <span key={l} className={`skill-box ${l <= s.finished_level ? 'filled' : ''} ${l === s.finished_level && isActive ? 'training' : ''}`} />
                                  ))}
                                </div>
                              </td>
                              <td className="queue-name">{s.skill_name} {ROMAN[s.finished_level]}</td>
                              <td className="queue-date">{formatDate(s.finish_date)}</td>
                              <td className="queue-time">{finish > now ? formatTimeRemaining(s.finish_date) : 'Done'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="queue-timeline-row">
                    <span className="queue-timeline-label">
                      <span className="queue-timeline-title">Training Time</span>
                      <span className="queue-timeline-value">{(() => {
                        const lastFinish = new Date(data.skill_queue.queue[data.skill_queue.queue.length - 1].finish_date);
                        const rem = Math.max(0, lastFinish - now);
                        const d = Math.floor(rem / 86400000);
                        const h = Math.floor((rem % 86400000) / 3600000);
                        const m = Math.floor((rem % 3600000) / 60000);
                        return `${d}d ${h}h ${m}m`;
                      })()}</span>
                    </span>
                    <div className="queue-timeline">
                      {data.skill_queue.queue.map((s, i) => {
                        const start = s.start_date ? new Date(s.start_date) : now;
                        const finish = new Date(s.finish_date);
                        const duration = Math.max(0, finish - start);
                        const pct = totalTime > 0 ? (duration / totalTime) * 100 : 0;
                        if (pct < 0.3) return null;
                        return (
                          <div key={i} className={`queue-timeline-block ${i % 2 === 0 ? 'even' : 'odd'}`} style={{ width: `${pct}%` }} title={`${s.skill_name} ${ROMAN[s.finished_level]} — ${formatTimeRemaining(s.finish_date)}`} />
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* Job Slots Summary */}
      <div className="charpage-slots-row">
        <div className="charpage-slot manufacturing">
          <span className="slot-label">Manufacturing</span>
          <span className="slot-value">{data.slots?.manufacturing?.current || 0}/{data.slots?.manufacturing?.max || 0}</span>
        </div>
        <div className="charpage-slot science">
          <span className="slot-label">Science</span>
          <span className="slot-value">{data.slots?.science?.current || 0}/{data.slots?.science?.max || 0}</span>
        </div>
        <div className="charpage-slot reactions">
          <span className="slot-label">Reactions</span>
          <span className="slot-value">{data.slots?.reactions?.current || 0}/{data.slots?.reactions?.max || 0}</span>
        </div>
      </div>

      {/* Personal Industry Jobs */}
      <div className="charpage-section">
        <h3>Personal Industry Jobs <span className="section-count">{activePersonalJobs.length} active</span></h3>
        {activePersonalJobs.length === 0 ? (
          <div className="charpage-empty-section">No active personal jobs</div>
        ) : (
          <div className="charpage-jobs-table-wrap">
            <table className="charpage-jobs-table">
              <thead>
                <tr>
                  <th className="col-blueprint">Blueprint</th>
                  <th className="col-activity">Activity</th>
                  <th className="col-status">Status</th>
                  <th className="col-progress">Progress</th>
                  <th className="col-remaining">Remaining</th>
                  <th className="col-location">Location</th>
                </tr>
              </thead>
              <tbody>
                {activePersonalJobs.map(job => {
                  const progress = job.progress || 0;
                  return (
                    <tr key={job.job_id}>
                      <td className="job-bp">
                        <img src={`https://images.evetech.net/types/${job.blueprint_type_id}/${job.runs === -1 ? 'bp' : 'bpc'}?size=32`} alt="" className="job-bp-icon" />
                        <span>{job.blueprint_name || `Type ${job.blueprint_type_id}`}</span>
                        <ExternalLinks type="item" typeId={job.blueprint_type_id} />
                      </td>
                      <td><span className={`activity-tag ${ACTIVITY_CATEGORIES[job.activity_id] || ''}`}>{ACTIVITY_LABELS[job.activity_id] || job.activity_id}</span></td>
                      <td><span className={`status-badge status-${job.status}`}>{job.status}</span></td>
                      <td>
                        <div className="progress-bar-mini">
                          <div className={`progress-fill ${progress >= 100 ? 'complete' : ''}`} style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                        <span className="progress-text">{Math.round(progress)}%</span>
                      </td>
                      <td className="job-time">{job.status === 'active' ? formatTimeRemaining(job.end_date) : '—'}</td>
                      <td className="job-location">{job.location_name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Corporation Industry Jobs */}
      <div className="charpage-section">
        <h3>Corporation Industry Jobs <span className="section-count">{activeCorpJobs.length} active</span></h3>
        {data.corp_jobs.length === 0 ? (
          <div className="charpage-empty-section">No corporation jobs (or no industry role)</div>
        ) : activeCorpJobs.length === 0 ? (
          <div className="charpage-empty-section">No active corporation jobs</div>
        ) : (
          <div className="charpage-jobs-table-wrap">
            <table className="charpage-jobs-table">
              <thead>
                <tr>
                  <th className="col-blueprint">Blueprint</th>
                  <th className="col-activity">Activity</th>
                  <th className="col-status">Status</th>
                  <th className="col-progress">Progress</th>
                  <th className="col-remaining">Remaining</th>
                  <th className="col-location">Location</th>
                </tr>
              </thead>
              <tbody>
                {activeCorpJobs.map(job => {
                  const progress = job.progress || 0;
                  return (
                    <tr key={job.job_id}>
                      <td className="job-bp">
                        <img src={`https://images.evetech.net/types/${job.blueprint_type_id}/${job.runs === -1 ? 'bp' : 'bpc'}?size=32`} alt="" className="job-bp-icon" />
                        <span>{job.blueprint_name || `Type ${job.blueprint_type_id}`}</span>
                        <ExternalLinks type="item" typeId={job.blueprint_type_id} />
                      </td>
                      <td><span className={`activity-tag ${ACTIVITY_CATEGORIES[job.activity_id] || ''}`}>{ACTIVITY_LABELS[job.activity_id] || job.activity_id}</span></td>
                      <td><span className={`status-badge status-${job.status}`}>{job.status}</span></td>
                      <td>
                        <div className="progress-bar-mini">
                          <div className={`progress-fill ${progress >= 100 ? 'complete' : ''}`} style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                        <span className="progress-text">{Math.round(progress)}%</span>
                      </td>
                      <td className="job-time">{job.status === 'active' ? formatTimeRemaining(job.end_date) : '—'}</td>
                      <td className="job-location">{job.location_name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Planetary Industry */}
      <div className="charpage-section">
        <h3>Planetary Industry <span className="section-count">{data.planets.length} colon{data.planets.length !== 1 ? 'ies' : 'y'}</span></h3>
        {data.planets.length === 0 ? (
          <div className="charpage-empty-section">No planetary colonies</div>
        ) : (
          <div className="charpage-planets-grid">
            {data.planets.map(colony => {
              const pType = (colony.planet_type || '').replace('planet_type_', '').toLowerCase();
              const color = PLANET_COLORS[pType] || '#5a6a7a';
              const expiry = colony.extractor_expiry ? new Date(colony.extractor_expiry) : null;
              const expiryDiff = expiry ? expiry - now : null;
              const isExpired = expiryDiff !== null && expiryDiff <= 0;
              const storage = colony.storage;
              const storageCritical = storage && storage.pct >= 80;
              const storageWarning = storage && storage.pct >= 60 && storage.pct < 80;
              const needsAttention = isExpired || storageCritical;
              return (
                <div key={colony.planet_id} className={`charpage-planet-card ${needsAttention ? 'attention' : ''}`} style={{ borderLeftColor: color }}>
                  <div className="planet-header">
                    <span className="planet-type-dot" style={{ background: color }}>{pType.charAt(0).toUpperCase()}</span>
                    <div className="planet-info">
                      <span className="planet-name">{colony.planet_name || `Planet ${colony.planet_id}`}</span>
                      <span className="planet-system">{colony.system_name} <ExternalLinks type="system" name={colony.system_name} /></span>
                    </div>
                  </div>
                  {/* Extractor expiry */}
                  <div className="planet-expiry-row">
                    <span className="planet-expiry-label">Extractor:</span>
                    {expiry ? (
                      <span className={`planet-expiry-value ${isExpired ? 'expired' : expiryDiff < 7200000 ? 'urgent' : expiryDiff < 86400000 ? 'warning' : ''}`}>
                        {isExpired ? 'EXPIRED' : formatCountdown(expiryDiff)}
                      </span>
                    ) : (
                      <span className="planet-expiry-value idle">No extractors</span>
                    )}
                  </div>
                  {/* Storage fill bar */}
                  {storage && (
                    <div className="planet-storage-row">
                      <div className="planet-storage-header">
                        <span className="planet-storage-label">Storage:</span>
                        <span className={`planet-storage-pct ${storageCritical ? 'critical' : storageWarning ? 'warning' : ''}`}>{storage.pct}%</span>
                      </div>
                      <div className="planet-storage-bar">
                        <div
                          className={`planet-storage-fill ${storageCritical ? 'critical' : storageWarning ? 'warning' : ''}`}
                          style={{ width: `${storage.pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wealth History Chart */}
      <div className="charpage-section">
        <h3>Wealth History</h3>
        <WealthChart characterId={data.character_id} refreshKey={refreshKey} />
      </div>

      {/* Wallet Journal */}
      <div className="charpage-section">
        <h3>Wallet Journal</h3>
        <WalletJournal characterId={data.character_id} refreshKey={refreshKey} />
      </div>
    </div>
  );
}

export default CharacterPage;
