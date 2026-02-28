import React, { useEffect, useState, useCallback } from 'react';
import { getDashboardStats } from '../services/api';
import JobSlotSummary from './JobSlotSummary';
import './Dashboard.css';

function Dashboard({ onError }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getDashboardStats();
      setStats(response.data);
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
          <div className="stat-icon">🏭</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_active_jobs}</span>
            <span className="stat-label">Active Jobs</span>
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

      <div className="characters-section">
        <h3>Characters Overview</h3>
        <div className="characters-grid">
          {stats.jobs_by_character.map((char) => (
            <div key={char.character_id} className="character-card">
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
                    <span className="character-jobs">
                      {char.active_jobs} active job{char.active_jobs !== 1 ? 's' : ''}
                    </span>
                    <div className="character-slots">
                      <span className="slot-mini">
                        M: {char.slots?.manufacturing?.current || 0}/{char.slots?.manufacturing?.max || 0}
                      </span>
                      <span className="slot-mini">
                        S: {char.slots?.science?.current || 0}/{char.slots?.science?.max || 0}
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
