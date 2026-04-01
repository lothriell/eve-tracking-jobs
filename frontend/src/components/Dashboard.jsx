import React, { useEffect, useState, useCallback } from 'react';
import { getDashboardStats, getCorporationJobs, getCorporations, getWealth } from '../services/api';
import './Dashboard.css';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

function formatISK(value) {
  if (!value || value === 0) return '0';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function SkillTrainingLine({ training }) {
  if (!training) return null;

  if (training.status === 'not_training') {
    return <span className="skill-training-alert flashing">No Skill in Training</span>;
  }
  if (training.status === 'paused') {
    return <span className="skill-training-alert flashing">Training Paused</span>;
  }

  const now = new Date();
  const finish = new Date(training.finish_date);
  if (finish <= now) {
    return <span className="skill-training-alert flashing">No Skill in Training</span>;
  }

  return (
    <span className="skill-training-active">
      {training.skill_name} {ROMAN[training.finished_level]}
      {training.queue_length > 1 && <span className="skill-queue-count"> (+{training.queue_length - 1})</span>}
    </span>
  );
}

// Apply saved character order from localStorage (shared with Sidebar)
function applySavedOrder(chars) {
  const saved = localStorage.getItem('characterOrder');
  if (!saved) return chars;
  try {
    const order = JSON.parse(saved);
    const ordered = [];
    const remaining = [...chars];
    for (const id of order) {
      const idx = remaining.findIndex(c => c.character_id === id);
      if (idx >= 0) {
        ordered.push(remaining.splice(idx, 1)[0]);
      }
    }
    return [...ordered, ...remaining];
  } catch {
    return chars;
  }
}

function Dashboard({ onError, refreshKey }) {
  const [stats, setStats] = useState(null);
  const [corpStats, setCorpStats] = useState(null);
  const [wealthData, setWealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredJobType, setHoveredJobType] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [orderedCharacters, setOrderedCharacters] = useState([]);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch dashboard stats, corp info, and wealth ALL in parallel
      const [statsResp, corpsResult, wealthResult] = await Promise.all([
        getDashboardStats(),
        (async () => {
          try {
            const corpsResponse = await getCorporations();
            const corps = corpsResponse.data.corporations || [];
            const hasCorpAccess = corps.some(c => c.has_industry_access);
            if (!hasCorpAccess) return null;
            const corpJobsResponse = await getCorporationJobs();
            return {
              corporations: corps,
              total_jobs: corpJobsResponse.data.total_jobs || 0,
              active_jobs: corpJobsResponse.data.active_jobs || 0,
              corps_with_access: corps.filter(c => c.has_industry_access).length
            };
          } catch { return null; }
        })(),
        getWealth().catch(() => null)
      ]);

      setStats(statsResp.data);
      setCorpStats(corpsResult);
      setWealthData(wealthResult?.data || null);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      const status = error.response?.status;
      if (status === 502 || status === 503 || status === 504) {
        onError?.('EVE servers are in maintenance — data will refresh automatically when they come back online.');
      } else {
        onError?.('Failed to load dashboard statistics');
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadStats();
  }, [loadStats, refreshKey]);

  // Apply saved order when stats load
  useEffect(() => {
    if (stats?.jobs_by_character) {
      setOrderedCharacters(applySavedOrder(stats.jobs_by_character));
    }
  }, [stats]);

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    setDragOverIdx(null);
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return; }
    const updated = [...orderedCharacters];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(dropIdx, 0, moved);
    setOrderedCharacters(updated);
    setDragIdx(null);
    localStorage.setItem('characterOrder', JSON.stringify(updated.map(c => c.character_id)));
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };



  // Check if character has full slots for a given job type
  const isCharacterSlotFull = (character, jobType) => {
    if (!character || !jobType) return false;
    const slots = character.slots || {};
    switch(jobType) {
      case 'manufacturing':
        return slots.manufacturing?.current === slots.manufacturing?.max;
      case 'science':
        return slots.science?.current === slots.science?.max;
      case 'reactions':
        return slots.reactions?.current === slots.reactions?.max;
      default:
        return false;
    }
  };

  // Toggle job type highlight (for mobile tap support)
  const handleJobTypeClick = (jobType) => {
    if (hoveredJobType === jobType) {
      setHoveredJobType(null);
    } else {
      setHoveredJobType(jobType);
    }
  };

  // Group corporation characters by role for simplified display
  const groupCharactersByRole = (characters) => {
    const roleGroups = {};
    characters.filter(c => c.has_industry_role).forEach(c => {
      const role = c.industry_role_name || 'Unknown';
      if (!roleGroups[role]) {
        roleGroups[role] = 0;
      }
      roleGroups[role]++;
    });
    return roleGroups;
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-loading">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats || stats.total_characters === 0) {
    return (
      <div className="dashboard-container">
        <div className="empty-state">
          <h3>Welcome to EVE Industry Tracker</h3>
          <p>Link your EVE characters to view industry statistics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Scope Warning Banner */}
      {stats.jobs_by_character.some(char => char.slots?.needsReauthorization) && (
        <div className="scope-warning-banner">
          <span className="warning-icon">⚠️</span>
          <div className="warning-content">
            <strong>Missing Skills Scope</strong>
            <p>Some characters need re-authorization to show accurate job slot counts. Remove and re-add affected characters to grant the skills permission.</p>
          </div>
        </div>
      )}

      {/* Characters Overview Section */}
      <div className="characters-section">
        <div className="characters-section-header">
          <h3>Characters Overview</h3>
          <span className="characters-header-stats">
            👤 {stats.total_characters} characters &nbsp; 📊 {stats.total_active_jobs} active jobs ({stats.personal_active_jobs || 0} personal + {stats.corp_active_jobs || 0} corp)
          </span>
        </div>

        {/* Job Slot Summary — sticky inside characters section */}
        {stats.slots && (
          <div className="slot-cards-grid">
            <div
              className={`slot-card manufacturing ${hoveredJobType === 'manufacturing' ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredJobType('manufacturing')}
              onMouseLeave={() => setHoveredJobType(null)}
              onClick={() => handleJobTypeClick('manufacturing')}
              role="button"
              tabIndex={0}
            >
              <div className="slot-card-content">
                <span className="slot-card-value">
                  {stats.slots?.manufacturing?.current || 0}/{stats.slots?.manufacturing?.max || 0}
                </span>
                <span className="slot-card-breakdown">
                  ({stats.personal_jobs_by_activity?.manufacturing || 0} personal + {stats.corp_jobs_by_activity?.manufacturing || 0} corp)
                </span>
                <span className="slot-card-label">Manufacturing</span>
              </div>
            </div>
            <div
              className={`slot-card science ${hoveredJobType === 'science' ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredJobType('science')}
              onMouseLeave={() => setHoveredJobType(null)}
              onClick={() => handleJobTypeClick('science')}
              role="button"
              tabIndex={0}
            >
              <div className="slot-card-content">
                <span className="slot-card-value">
                  {stats.slots?.science?.current || 0}/{stats.slots?.science?.max || 0}
                </span>
                <span className="slot-card-breakdown">
                  ({stats.personal_jobs_by_activity?.science || 0} personal + {stats.corp_jobs_by_activity?.science || 0} corp)
                </span>
                <span className="slot-card-label">Science</span>
              </div>
            </div>
            <div
              className={`slot-card reactions ${hoveredJobType === 'reactions' ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredJobType('reactions')}
              onMouseLeave={() => setHoveredJobType(null)}
              onClick={() => handleJobTypeClick('reactions')}
              role="button"
              tabIndex={0}
            >
              <div className="slot-card-content">
                <span className="slot-card-value">
                  {stats.slots?.reactions?.current || 0}/{stats.slots?.reactions?.max || 0}
                </span>
                <span className="slot-card-breakdown">
                  ({stats.personal_jobs_by_activity?.reactions || 0} personal + {stats.corp_jobs_by_activity?.reactions || 0} corp)
                </span>
                <span className="slot-card-label">Reactions</span>
              </div>
            </div>
          </div>
        )}
        <div className="characters-grid">
          {orderedCharacters.map((char, idx) => (
            <div
              key={char.character_id}
              className={`character-card ${char.slots?.needsReauthorization ? 'needs-reauth' : ''} ${hoveredJobType && isCharacterSlotFull(char, hoveredJobType) ? 'dimmed' : ''} ${dragOverIdx === idx ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              <img 
                src={char.portrait_url} 
                alt={char.character_name}
                className="character-avatar"
              />
              <div className="character-details">
                <span className="character-name">{char.character_name}</span>
                {char.error ? (
                  <span className="character-error">{char.error}</span>
                ) : (
                  <>
                    {char.slots?.needsReauthorization && (
                      <span className="reauth-badge" title="Missing skills scope - please re-authorize">
                        ⚠️ Re-auth needed
                      </span>
                    )}
                    <span className="character-jobs">
                      {char.total_jobs || char.active_jobs} active job{(char.total_jobs || char.active_jobs) !== 1 ? 's' : ''}
                      {char.corp_jobs > 0 && (
                        <span className="job-breakdown"> ({char.active_jobs} personal + {char.corp_jobs} corp)</span>
                      )}
                    </span>
                    <div className="character-slots">
                      <span className="slot-mini slot-manufacturing">
                        M: {char.slots?.manufacturing?.current || 0}/{char.slots?.manufacturing?.max || 1}
                      </span>
                      <span className="slot-mini slot-science">
                        S: {char.slots?.science?.current || 0}/{char.slots?.science?.max || 1}
                      </span>
                      <span className="slot-mini slot-reactions">
                        R: {char.slots?.reactions?.current || 0}/{char.slots?.reactions?.max || 0}
                      </span>
                    </div>
                    <div className="character-wealth-row">
                      {(() => {
                        const cw = wealthData?.per_character?.find(w => w.character_id === char.character_id);
                        return (
                          <span className="wealth-box assets">
                            <span className="wealth-box-label">Assets</span>
                            <span className="wealth-box-value">{cw && cw.asset_value > 0 ? formatISK(cw.asset_value) : '—'}</span>
                          </span>
                        );
                      })()}
                      <span className="wealth-box wallet placeholder">
                        <span className="wealth-box-label">Wallet</span>
                        <span className="wealth-box-value">—</span>
                      </span>
                    </div>
                    <SkillTrainingLine training={char.skill_training} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Corporation Jobs Summary - Now positioned AFTER Characters Overview */}
      {corpStats && (
        <div className="corp-stats-section compact">
          <h3>🏢 Corporation Industry</h3>
          <div className="overview-stats-row">
            <div className="overview-stat-item">
              <span className="overview-stat-icon">🏢</span>
              <span className="overview-stat-value">{corpStats.corps_with_access}</span>
              <span className="overview-stat-label">Corps with Access</span>
            </div>
            <div className="overview-stat-item">
              <span className="overview-stat-icon">📋</span>
              <span className="overview-stat-value">{corpStats.active_jobs}</span>
              <span className="overview-stat-label">Corp Active Jobs</span>
            </div>
          </div>
          <div className="corp-list">
            {corpStats.corporations.filter(c => c.has_industry_access).map(corp => {
              const roleGroups = groupCharactersByRole(corp.characters);
              return (
                <div key={corp.corporation_id} className="corp-item">
                  <span className="corp-ticker">[{corp.ticker}]</span>
                  <span className="corp-name">{corp.name}</span>
                  <div className="corp-role-summary">
                    {Object.entries(roleGroups).map(([role, count]) => (
                      <span key={role} className="corp-role-badge">
                        {count} {count === 1 ? 'character' : 'characters'} - {role}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(stats.jobs_by_activity).length > 0 && (
        <div className="activity-section">
          <h3>Jobs by Activity</h3>
          <div className="activity-bars">
            {Object.entries(stats.jobs_by_activity).map(([activity, count]) => (
              <div key={activity} className="activity-bar-item">
                <div className="activity-bar-header">
                  <span className="activity-name">{activity}</span>
                  <span className="activity-count">{count}</span>
                </div>
                <div className="activity-bar-track">
                  <div 
                    className="activity-bar-fill"
                    style={{ width: `${(count / stats.total_active_jobs) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
