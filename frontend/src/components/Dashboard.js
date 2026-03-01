import React, { useEffect, useState, useCallback } from 'react';
import { getDashboardStats, getCorporationJobs, getCorporations } from '../services/api';
import JobSlotSummary from './JobSlotSummary';
import './Dashboard.css';

function Dashboard({ onError }) {
  const [stats, setStats] = useState(null);
  const [corpStats, setCorpStats] = useState(null);
  const [loading, setLoading] = useState(true);

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
      onError?.('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

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
          <h3>Welcome to EVE ESI Dashboard</h3>
          <p>Link your EVE characters to view industry statistics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Dashboard Overview</h2>
        <button className="refresh-btn" onClick={loadStats}>
          ↻ Refresh
        </button>
      </div>

      <JobSlotSummary slots={stats.slots} loading={false} />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_characters}</span>
            <span className="stat-label">Linked Characters</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_active_jobs}</span>
            <span className="stat-label">Total Active Jobs</span>
            <span className="stat-breakdown">
              {stats.personal_active_jobs || 0} personal + {stats.corp_active_jobs || 0} corp
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⚙️</div>
          <div className="stat-content">
            <span className="stat-value">{stats.jobs_by_activity?.Manufacturing || 0}</span>
            <span className="stat-label">Manufacturing</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔬</div>
          <div className="stat-content">
            <span className="stat-value">
              {(stats.jobs_by_activity?.['ME Research'] || 0) + 
               (stats.jobs_by_activity?.['TE Research'] || 0) + 
               (stats.jobs_by_activity?.Copying || 0) + 
               (stats.jobs_by_activity?.Invention || 0)}
            </span>
            <span className="stat-label">Science Jobs</span>
          </div>
        </div>
      </div>

      {/* Corporation Jobs Summary */}
      {corpStats && (
        <div className="corp-stats-section">
          <h3>🏢 Corporation Industry</h3>
          <div className="corp-stats-grid">
            <div className="stat-card corp-card">
              <div className="stat-icon">🏢</div>
              <div className="stat-content">
                <span className="stat-value">{corpStats.corps_with_access}</span>
                <span className="stat-label">Corps with Access</span>
              </div>
            </div>
            <div className="stat-card corp-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <span className="stat-value">{corpStats.active_jobs}</span>
                <span className="stat-label">Corp Active Jobs</span>
              </div>
            </div>
          </div>
          <div className="corp-list">
            {corpStats.corporations.filter(c => c.has_industry_access).map(corp => (
              <div key={corp.corporation_id} className="corp-item">
                <span className="corp-ticker">[{corp.ticker}]</span>
                <span className="corp-name">{corp.name}</span>
                <span className="corp-access-badge">
                  {corp.characters.filter(c => c.has_industry_role).map(c => c.industry_role_name).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <div className="characters-section">
        <h3>Characters Overview</h3>
        <div className="characters-grid">
          {stats.jobs_by_character.map((char) => (
            <div key={char.character_id} className={`character-card ${char.slots?.needsReauthorization ? 'needs-reauth' : ''}`}>
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
                      <span className="slot-mini">
                        M: {char.slots?.manufacturing?.current || 0}/{char.slots?.manufacturing?.max || 1}
                      </span>
                      <span className="slot-mini">
                        S: {char.slots?.science?.current || 0}/{char.slots?.science?.max || 1}
                      </span>
                      <span className="slot-mini">
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
