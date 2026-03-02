import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getIndustryJobs, getJobSlots, getAllCharacters, getCorporationJobs } from '../services/api';
import './IndustryJobs.css';

function IndustryJobs({ selectedCharacter, onError }) {
  const [jobs, setJobs] = useState([]);
  const [corpJobs, setCorpJobs] = useState([]);
  const [slots, setSlots] = useState({ manufacturing: { current: 0, max: 0 }, science: { current: 0, max: 0 }, reactions: { current: 0, max: 0 } });
  const [slotBreakdown, setSlotBreakdown] = useState({
    manufacturing: { personal: 0, corp: 0 },
    science: { personal: 0, corp: 0 },
    reactions: { personal: 0, corp: 0 }
  });
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

      // Load jobs, slots, and corp jobs in parallel
      const [jobsResponse, slotsResponse] = await Promise.all([
        getIndustryJobs(characterId, isAll),
        getJobSlots(characterId, isAll)
      ]);

      const personalJobs = jobsResponse.data.jobs || [];
      setJobs(personalJobs);
      setSlots(slotsResponse.data.slots || { manufacturing: { current: 0, max: 0 }, science: { current: 0, max: 0 }, reactions: { current: 0, max: 0 } });
      
      // Load corporation jobs and calculate breakdown
      let corpJobsList = [];
      try {
        const corpJobsResponse = await getCorporationJobs(characterId);
        corpJobsList = corpJobsResponse.data.jobs || [];
        
        // Get all authorized character IDs from the user's linked characters
        const authorizedCharacterIds = characters.map(char => char.character_id);
        
        // Filter corp jobs to show only those where the installer is one of user's authorized characters
        if (selectedCharacter) {
          // If a specific character is selected, show only their jobs
          corpJobsList = corpJobsList.filter(job => job.installer_id === selectedCharacter.character_id);
        } else {
          // If "All Characters" is selected, show jobs from all authorized characters
          corpJobsList = corpJobsList.filter(job => authorizedCharacterIds.includes(job.installer_id));
        }
        setCorpJobs(corpJobsList);
      } catch (corpError) {
        console.log('No corporation job access:', corpError.message);
        setCorpJobs([]);
      }
      
      // Calculate slot breakdown (personal vs corp) for active jobs only
      const breakdown = {
        manufacturing: { personal: 0, corp: 0 },
        science: { personal: 0, corp: 0 },
        reactions: { personal: 0, corp: 0 }
      };
      
      // Count active personal jobs by category
      personalJobs.filter(j => j.status === 'active').forEach(job => {
        const cat = job.activity_category;
        if (breakdown[cat]) breakdown[cat].personal++;
      });
      
      // Count active corp jobs by category
      corpJobsList.filter(j => j.status === 'active').forEach(job => {
        const cat = job.activity_category;
        if (breakdown[cat]) breakdown[cat].corp++;
      });
      
      setSlotBreakdown(breakdown);
      
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

  // Get blueprint image URL - use 'bpc' for copies (runs > 0), 'bp' for originals
  const getBlueprintIcon = (typeId, runs = 1) => {
    if (!typeId) return 'https://images.evetech.net/types/2/icon?size=32';
    const imageType = runs === -1 ? 'bp' : 'bpc';
    return `https://images.evetech.net/types/${typeId}/${imageType}?size=32`;
  };

  // Filter jobs
  const filterJobs = (jobsList) => {
    return jobsList.filter(job => {
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
  };

  const filteredJobs = filterJobs(jobs);
  const filteredCorpJobs = filterJobs(corpJobs);

  const renderJobsTable = (jobsList, showInstaller = false, sectionTitle = null) => {
    if (jobsList.length === 0) {
      return (
        <div className="empty-state">
          <p>No {sectionTitle?.toLowerCase() || 'jobs'} found matching your filters</p>
        </div>
      );
    }

    return (
      <div className="jobs-table-wrapper">
        <table className="jobs-table">
          <thead>
            <tr>
              <th className="col-status">Status</th>
              <th className="col-runs">Runs</th>
              <th className="col-activity">Activity</th>
              <th className="col-blueprint">Blueprint</th>
              <th className="col-progress">Progress</th>
              {showInstaller && <th className="col-installer">Installer</th>}
              <th className="col-date">Install date</th>
              <th className="col-date">End date</th>
            </tr>
          </thead>
          <tbody>
            {jobsList.map((job) => (
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
                      src={getBlueprintIcon(job.blueprint_type_id, job.licensed_runs || job.runs)} 
                      alt="" 
                      className="blueprint-icon"
                      onError={(e) => { e.target.src = `https://images.evetech.net/types/${job.blueprint_type_id}/icon?size=32`; }}
                    />
                    <span className="blueprint-name">{job.blueprint_name}</span>
                  </div>
                </td>
                <td className="col-progress">
                  {getStatusBadge(job.status)}
                </td>
                {showInstaller && (
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
    );
  };

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
      {/* Job Slot Summary as Grid Cards with EVE Colors */}
      {!slotsLoading && (
        <div className="slot-cards-grid">
          <div className="slot-card manufacturing">
            <div className="slot-card-icon">⚙️</div>
            <div className="slot-card-content">
              <span className="slot-card-value">
                {slots.manufacturing?.current || 0}/{slots.manufacturing?.max || 0}
              </span>
              <span className="slot-card-breakdown">
                ({slotBreakdown.manufacturing.personal} personal + {slotBreakdown.manufacturing.corp} corp)
              </span>
              <span className="slot-card-label">Manufacturing jobs</span>
            </div>
          </div>

          <div className="slot-card science">
            <div className="slot-card-icon">🔬</div>
            <div className="slot-card-content">
              <span className="slot-card-value">
                {slots.science?.current || 0}/{slots.science?.max || 0}
              </span>
              <span className="slot-card-breakdown">
                ({slotBreakdown.science.personal} personal + {slotBreakdown.science.corp} corp)
              </span>
              <span className="slot-card-label">Science jobs</span>
            </div>
          </div>

          <div className="slot-card reactions">
            <div className="slot-card-icon">⚗️</div>
            <div className="slot-card-content">
              <span className="slot-card-value">
                {slots.reactions?.current || 0}/{slots.reactions?.max || 0}
              </span>
              <span className="slot-card-breakdown">
                ({slotBreakdown.reactions.personal} personal + {slotBreakdown.reactions.corp} corp)
              </span>
              <span className="slot-card-label">Reactions</span>
            </div>
          </div>
        </div>
      )}

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
            {filteredJobs.length + filteredCorpJobs.length} job{(filteredJobs.length + filteredCorpJobs.length) !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Personal Jobs Section */}
      <div className="jobs-section">
        <div className="jobs-section-header">
          <h3>👤 Personal Jobs</h3>
          <span className="section-count">{filteredJobs.length}</span>
        </div>
        {renderJobsTable(filteredJobs, !selectedCharacter, 'Personal Jobs')}
      </div>

      {/* Corporation Jobs Section */}
      {filteredCorpJobs.length > 0 && (
        <div className="jobs-section corp-jobs-section">
          <div className="jobs-section-header">
            <h3>🏢 Corporation Jobs</h3>
            <span className="section-count">{filteredCorpJobs.length}</span>
          </div>
          {renderJobsTable(filteredCorpJobs, true, 'Corporation Jobs')}
        </div>
      )}
    </div>
  );
}

export default IndustryJobs;