import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getCharacterSummary } from '../services/api';
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

function CharacterPage({ characterId, onError }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCharacterSummary(characterId);
      setData(response.data);
    } catch (error) {
      console.error('Failed to load character summary:', error);
      onError?.('Failed to load character data');
    } finally {
      setLoading(false);
    }
  }, [characterId, onError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          <h2>{data.character_name}</h2>
          {data.corporation && (
            <span className="charpage-corp">[{data.corporation.ticker}] {data.corporation.name}</span>
          )}
        </div>
        <button className="refresh-btn" onClick={loadData}>&#x21bb; Refresh</button>
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
            {queueExpanded && (
              <div className="charpage-queue-table-wrap">
                <table className="charpage-queue-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Skill</th>
                      <th>Level</th>
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
                          <td className="queue-pos">{i + 1}</td>
                          <td className="queue-name">{s.skill_name}</td>
                          <td className="queue-level">{ROMAN[s.finished_level]}</td>
                          <td className="queue-date">{formatDate(s.finish_date)}</td>
                          <td className="queue-time">{finish > now ? formatTimeRemaining(s.finish_date) : 'Done'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                  <th>Blueprint</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Remaining</th>
                  <th>Location</th>
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
                      <td className="job-location">{job.station_name || job.location_name || '—'}</td>
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
                  <th>Blueprint</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Remaining</th>
                  <th>Location</th>
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
                      <td className="job-location">{job.station_name || job.location_name || '—'}</td>
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
              const lastUpdate = colony.last_update ? new Date(colony.last_update) : null;
              const age = lastUpdate ? now - lastUpdate : null;
              const needsAttention = age && age > 86400000; // >24h since update
              return (
                <div key={colony.planet_id} className={`charpage-planet-card ${needsAttention ? 'attention' : ''}`} style={{ borderLeftColor: color }}>
                  <div className="planet-header">
                    <span className="planet-type-dot" style={{ background: color }}>{pType.charAt(0).toUpperCase()}</span>
                    <div className="planet-info">
                      <span className="planet-name">{colony.planet_name || `Planet ${colony.planet_id}`}</span>
                      <span className="planet-system">{colony.system_name}</span>
                    </div>
                  </div>
                  <div className="planet-meta">
                    <span className="planet-type-label">{pType}</span>
                    {colony.num_pins > 0 && <span className="planet-pins">{colony.num_pins} pins</span>}
                    {lastUpdate && (
                      <span className={`planet-updated ${needsAttention ? 'stale' : ''}`}>
                        Updated: {formatCountdown(age)} ago
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default CharacterPage;
