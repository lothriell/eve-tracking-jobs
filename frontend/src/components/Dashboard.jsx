import React, { useEffect, useState, useCallback } from 'react';
import { getDashboardStats, getCorporationJobs, getCorporations } from '../services/api';
import './Dashboard.css';

function Dashboard({ onError }) {
  const [stats, setStats] = useState(null);
  const [corpStats, setCorpStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(null);
  const [autoRefreshDropdown, setAutoRefreshDropdown] = useState(false);
  const [hoveredJobType, setHoveredJobType] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load personal stats
      const response = await getDashboardStats();
      setStats(response.data);
      
      // Load corporation stats
      try {
        const corpsResponse = await getCorporations();
        const hasCorpAccess = corpsResponse.data.corporations?.some(c => c.has_industry_access);
        
        if (hasCorpAccess) {
          const corpJobsResponse = await getCorporationJobs();
          setCorpStats({
            corporations: corpsResponse.data.corporations,
            total_jobs: corpJobsResponse.data.total_jobs || 0,
            active_jobs: corpJobsResponse.data.active_jobs || 0,
            corps_with_access: corpsResponse.data.corporations.filter(c => c.has_industry_access).length
          });
        } else {
          setCorpStats(null);
        }
      } catch (corpError) {
        console.log('No corporation access:', corpError.message);
        setCorpStats(null);
      }
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
  }, [loadStats]);

  // Load auto-refresh setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('autoRefreshInterval');
    if (saved && saved !== 'null') {
      setAutoRefreshInterval(parseInt(saved));
    }
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefreshInterval) return;
    
    const interval = setInterval(() => {
      loadStats();
    }, autoRefreshInterval * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [autoRefreshInterval, loadStats]);

  const handleAutoRefreshChange = (minutes) => {
    setAutoRefreshInterval(minutes);
    if (minutes) {
      localStorage.setItem('autoRefreshInterval', minutes.toString());
    } else {
      localStorage.removeItem('autoRefreshInterval');
    }
    setAutoRefreshDropdown(false);
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
      <div className="dashboard-header">
        <h2>Dashboard Overview</h2>
        <div className="header-actions">
          <div className="auto-refresh-container">
            <button 
              className={`auto-refresh-btn ${autoRefreshInterval ? 'active' : ''}`}
              onClick={() => setAutoRefreshDropdown(!autoRefreshDropdown)}
            >
              <span className={`refresh-icon ${autoRefreshInterval ? 'spinning' : ''}`}>⟳</span>
              Auto: {autoRefreshInterval ? `${autoRefreshInterval}m` : 'Off'}
            </button>
            {autoRefreshDropdown && (
              <div className="auto-refresh-dropdown">
                <div 
                  className={`dropdown-item ${!autoRefreshInterval ? 'active' : ''}`}
                  onClick={() => handleAutoRefreshChange(null)}
                >
                  Off
                </div>
                <div 
                  className={`dropdown-item ${autoRefreshInterval === 5 ? 'active' : ''}`}
                  onClick={() => handleAutoRefreshChange(5)}
                >
                  5 minutes
                </div>
                <div 
                  className={`dropdown-item ${autoRefreshInterval === 10 ? 'active' : ''}`}
                  onClick={() => handleAutoRefreshChange(10)}
                >
                  10 minutes
                </div>
                <div 
                  className={`dropdown-item ${autoRefreshInterval === 15 ? 'active' : ''}`}
                  onClick={() => handleAutoRefreshChange(15)}
                >
                  15 minutes
                </div>
              </div>
            )}
          </div>
          <button className="refresh-btn" onClick={loadStats}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Job Slot Summary as Grid Cards with EVE Colors */}
      <div className="slot-cards-grid">
        <div 
          className={`slot-card manufacturing ${hoveredJobType === 'manufacturing' ? 'hovered' : ''}`}
          onMouseEnter={() => setHoveredJobType('manufacturing')}
          onMouseLeave={() => setHoveredJobType(null)}
          onClick={() => handleJobTypeClick('manufacturing')}
          role="button"
          tabIndex={0}
          aria-label="Highlight characters with available manufacturing slots"
        >
          <div className="slot-card-icon">⚙️</div>
          <div className="slot-card-content">
            <span className="slot-card-value">
              {stats.slots?.manufacturing?.current || 0}/{stats.slots?.manufacturing?.max || 0}
            </span>
            <span className="slot-card-breakdown">
              ({stats.personal_jobs_by_activity?.manufacturing || 0} personal + {stats.corp_jobs_by_activity?.manufacturing || 0} corp)
            </span>
            <span className="slot-card-label">Manufacturing jobs</span>
          </div>
        </div>

        <div 
          className={`slot-card science ${hoveredJobType === 'science' ? 'hovered' : ''}`}
          onMouseEnter={() => setHoveredJobType('science')}
          onMouseLeave={() => setHoveredJobType(null)}
          onClick={() => handleJobTypeClick('science')}
          role="button"
          tabIndex={0}
          aria-label="Highlight characters with available science slots"
        >
          <div className="slot-card-icon">🔬</div>
          <div className="slot-card-content">
            <span className="slot-card-value">
              {stats.slots?.science?.current || 0}/{stats.slots?.science?.max || 0}
            </span>
            <span className="slot-card-breakdown">
              ({stats.personal_jobs_by_activity?.science || 0} personal + {stats.corp_jobs_by_activity?.science || 0} corp)
            </span>
            <span className="slot-card-label">Science jobs</span>
          </div>
        </div>

        <div 
          className={`slot-card reactions ${hoveredJobType === 'reactions' ? 'hovered' : ''}`}
          onMouseEnter={() => setHoveredJobType('reactions')}
          onMouseLeave={() => setHoveredJobType(null)}
          onClick={() => handleJobTypeClick('reactions')}
          role="button"
          tabIndex={0}
          aria-label="Highlight characters with available reaction slots"
        >
          <div className="slot-card-icon">⚗️</div>
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
        <h3>Characters Overview</h3>
        <div className="overview-stats-row">
          <div className="overview-stat-item">
            <span className="overview-stat-icon">👤</span>
            <span className="overview-stat-value">{stats.total_characters}</span>
            <span className="overview-stat-label">Linked Characters</span>
          </div>
          <div className="overview-stat-item">
            <span className="overview-stat-icon">📊</span>
            <span className="overview-stat-value">{stats.total_active_jobs}</span>
            <span className="overview-stat-label">Total Active Jobs</span>
            <span className="overview-stat-breakdown">
              ({stats.personal_active_jobs || 0} personal + {stats.corp_active_jobs || 0} corp)
            </span>
          </div>
        </div>
        <div className="characters-grid">
          {stats.jobs_by_character.map((char) => (
            <div 
              key={char.character_id} 
              className={`character-card ${char.slots?.needsReauthorization ? 'needs-reauth' : ''} ${hoveredJobType && isCharacterSlotFull(char, hoveredJobType) ? 'dimmed' : ''}`}
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
