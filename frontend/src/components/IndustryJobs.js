import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getIndustryJobs, getJobSlots, getAllCharacters } from '../services/api';
import JobSlotSummary from './JobSlotSummary';
import './IndustryJobs.css';

function IndustryJobs({ selectedCharacter, onError }) {
  const [jobs, setJobs] = useState([]);
  const [slots, setSlots] = useState({ manufacturing: { current: 0, max: 0 }, science: { current: 0, max: 0 }, reactions: { current: 0, max: 0 } });
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [hasCharacters, setHasCharacters] = useState(false);
  const [scopeError, setScopeError] = useState(false);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef(null);

  // Filters
  const [activityFilter, setActivityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setSlotsLoading(true);

      // Check if any characters exist
      const charResponse = await getAllCharacters();
      const characters = charResponse.data.characters || [];
      
      if (characters.length === 0) {
        setHasCharacters(false);
        setLoading(false);
        setSlotsLoading(false);
        return;
      }

      setHasCharacters(true);

      const isAll = !selectedCharacter;
      const characterId = selectedCharacter?.character_id;

      // Load jobs and slots in parallel
      const [jobsResponse, slotsResponse] = await Promise.all([
        getIndustryJobs(characterId, isAll),
        getJobSlots(characterId, isAll)
      ]);

      setJobs(jobsResponse.data.jobs || []);
      setSlots(slotsResponse.data.slots || { manufacturing: { current: 0, max: 0 }, science: { current: 0, max: 0 }, reactions: { current: 0, max: 0 } });
      setScopeError(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      if (error.response?.status === 403) {
        setScopeError(true);
        onError?.(error.response.data.message || 'Missing required ESI scopes');
      } else if (error.response?.status !== 404) {
        onError?.('Failed to load industry jobs');
      }
    } finally {
      setLoading(false);
      setSlotsLoading(false);
    }
  }, [selectedCharacter, onError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Timer for real-time countdown
  useEffect(() => {
    timerRef.current = setInterval(() => {
      forceUpdate(n => n + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatTimeRemaining = (endDateStr) => {
    const now = new Date();
    const endDate = new Date(endDateStr);
    const remaining = endDate - now;

    if (remaining <= 0) return 'Completed';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}D ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      active: 'status-active',
      ready: 'status-ready',
      delivered: 'status-delivered',
      paused: 'status-paused',
      cancelled: 'status-cancelled'
    };
    const statusLabels = {
      active: 'Active',
      ready: 'Ready',
      delivered: 'Delivered',
      paused: 'Paused',
      cancelled: 'Cancelled'
    };
    return (
      <span className={`status-badge ${statusClasses[status] || ''}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const getProgressBar = (progress, status) => {
    const progressClass = progress >= 100 ? 'complete' : status === 'active' ? 'active' : 'paused';
    return (
      <div className="progress-bar-container">
        <div 
          className={`progress-bar-fill ${progressClass}`} 
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    );
  };

  const getBlueprintIcon = (typeId) => {
    return `https://i.ytimg.com/vi/iPQOqm5BorI/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLCOuCOkGqE7V4YL1A8JunMhaoQdnw`;
  };

  // Filter jobs
  const filteredJobs = jobs.filter(job => {
    // Activity filter
    if (activityFilter !== 'all') {
      if (activityFilter === 'manufacturing' && job.activity_category !== 'manufacturing') return false;
      if (activityFilter === 'science' && job.activity_category !== 'science') return false;
      if (activityFilter === 'reactions' && job.activity_category !== 'reactions') return false;
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && job.status !== 'active') return false;
      if (statusFilter === 'ready' && job.status !== 'ready') return false;
      if (statusFilter === 'delivered' && job.status !== 'delivered') return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="industry-jobs-container">
        <div className="jobs-loading">
          <div className="spinner"></div>
          <p>Loading industry jobs...</p>
        </div>
      </div>
    );
  }

  if (!hasCharacters) {
    return (
      <div className="industry-jobs-container">
        <div className="empty-state">
          <p>Link your EVE character to view industry jobs</p>
        </div>
      </div>
    );
  }

  if (scopeError) {
    return (
      <div className="industry-jobs-container">
        <div className="error-state">
          <p><strong>Missing Required Scopes</strong></p>
          <p>Your character doesn't have the required ESI scopes to view industry jobs.</p>
          <p>Please re-link your character to grant the necessary permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="industry-jobs-container">
      <JobSlotSummary slots={slots} loading={slotsLoading} />

      <div className="jobs-toolbar">
        <div className="toolbar-filters">
          <div className="filter-group">
            <label>Activity</label>
            <select 
              value={activityFilter} 
              onChange={(e) => setActivityFilter(e.target.value)}
            >
              <option value="all">All activities</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="science">Science</option>
              <option value="reactions">Reactions</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Status</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All jobs</option>
              <option value="active">Active</option>
              <option value="ready">Ready</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
        </div>

        <div className="toolbar-actions">
          <button className="refresh-btn" onClick={loadData}>
            ↻ Refresh
          </button>
          <span className="jobs-count-badge">
            {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="empty-state">
          <p>No industry jobs found matching your filters</p>
        </div>
      ) : (
        <div className="jobs-table-wrapper">
          <table className="jobs-table">
            <thead>
              <tr>
                <th className="col-status">Status</th>
                <th className="col-runs">Runs</th>
                <th className="col-activity">Activity</th>
                <th className="col-blueprint">Blueprint</th>
                <th className="col-progress">Progress</th>
                {!selectedCharacter && <th className="col-installer">Installer</th>}
                <th className="col-date">Install date</th>
                <th className="col-date">End date</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.job_id} className={`job-row ${job.status}`}>
                  <td className="col-status">
                    <div className="status-cell">
                      <span className="time-remaining">{formatTimeRemaining(job.end_date)}</span>
                      {getProgressBar(job.progress, job.status)}
                    </div>
                  </td>
                  <td className="col-runs">
                    <span className="runs-badge">x {job.runs}</span>
                  </td>
                  <td className="col-activity">
                    <span className={`activity-badge ${job.activity_category}`}>{job.activity}</span>
                  </td>
                  <td className="col-blueprint">
                    <div className="blueprint-cell">
                      <img 
                        src={getBlueprintIcon(job.blueprint_type_id)} 
                        alt="" 
                        className="blueprint-icon"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                      <span className="blueprint-name">{job.blueprint_name}</span>
                    </div>
                  </td>
                  <td className="col-progress">
                    {getStatusBadge(job.status)}
                  </td>
                  {!selectedCharacter && (
                    <td className="col-installer">
                      <span className="installer-name">{job.installer_name || job.character_name}</span>
                    </td>
                  )}
                  <td className="col-date">{formatDate(job.start_date)}</td>
                  <td className="col-date">{formatDate(job.end_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default IndustryJobs;
