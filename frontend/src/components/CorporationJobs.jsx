import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCorporationJobs, getCorporations, initiateEveAuth, getAllCharacters } from '../services/api';
import './CorporationJobs.css';

function CorporationJobs({ onError }) {
  const [jobs, setJobs] = useState([]);
  const [corporations, setCorporations] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCorp, setSelectedCorp] = useState('all');
  const [characterFilter, setCharacterFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [hasAccess, setHasAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [stats, setStats] = useState({ total: 0, active: 0, ready: 0 });
  const [expandedCorps, setExpandedCorps] = useState({});
  const timerRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load all characters for the filter dropdown
      let charsList = [];
      try {
        const charsResponse = await getAllCharacters();
        charsList = charsResponse.data.characters || [];
        setCharacters(charsList);
      } catch (charError) {
        console.log('Failed to load characters:', charError.message);
      }

      // Load corporations first
      const corpsResponse = await getCorporations();
      const corps = corpsResponse.data.corporations || [];
      setCorporations(corps);

      // Check if any character has industry access
      const hasAnyAccess = corps.some(c => c.has_industry_access);
      setHasAccess(hasAnyAccess);

      if (!hasAnyAccess) {
        setAccessMessage('None of your characters have Director or Factory Manager roles to view corporation jobs.');
        setJobs([]);
        setLoading(false);
        return;
      }

      // Always fetch all corporation jobs — filter client-side
      const response = await getCorporationJobs();
      const allJobs = response.data.jobs || [];
      setJobs(allJobs);
      setStats({
        total: allJobs.length,
        active: allJobs.filter(j => j.status === 'active').length,
        ready: allJobs.filter(j => j.status === 'ready').length
      });
    } catch (error) {
      console.error('Failed to load corporation jobs:', error);
      if (error.response?.status === 403) {
        setAccessMessage('Missing required ESI scopes. Please re-authorize your characters.');
      } else {
        const status = error.response?.status;
        if (status === 502 || status === 503 || status === 504) {
          onError?.('EVE servers are in maintenance — data will refresh automatically when they come back online.');
        } else {
          onError?.('Failed to load corporation jobs');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadData]);

  // Real-time countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setJobs(prevJobs => prevJobs.map(job => ({
        ...job,
        time_remaining_ms: Math.max(0, new Date(job.end_date) - new Date())
      })));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleRefresh = () => {
    loadData();
  };

  const handleReauthorize = async () => {
    try {
      const response = await initiateEveAuth();
      if (response.data.authUrl) {
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate re-authorization:', error);
    }
  };

  const toggleCorpExpanded = (corpId) => {
    setExpandedCorps(prev => ({
      ...prev,
      [corpId]: !prev[corpId]
    }));
  };

  const formatTimeRemaining = (ms) => {
    if (ms <= 0) return 'Ready';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}D ${String(hours % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredJobs = jobs.filter(job => {
    // Character filter - filter by installer_id (who started the job)
    if (characterFilter !== 'all') {
      const selectedChar = characters.find(c => c.id === parseInt(characterFilter));
      if (selectedChar && job.installer_id !== selectedChar.character_id) {
        return false;
      }
    }
    // Corporation filter
    if (selectedCorp !== 'all' && job.corporation_id !== parseInt(selectedCorp)) {
      return false;
    }
    // Activity filter
    if (activityFilter !== 'all' && job.activity_category !== activityFilter) {
      return false;
    }
    // Status filter - each status is distinct (no overlap)
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
          <p>Loading corporation jobs...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="industry-jobs-container">
        <div className="corp-jobs-header">
          <h2>🏢 Corporation Industry Jobs</h2>
        </div>
        <div className="no-access-message">
          <div className="no-access-icon">🔒</div>
          <h3>No Corporation Access</h3>
          <p>{accessMessage}</p>
          <p className="requirements">Required roles: <strong>Director</strong> or <strong>Factory Manager</strong></p>
          <button className="reauth-btn" onClick={handleReauthorize}>
            Re-authorize Characters
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="industry-jobs-container">
      <div className="corp-jobs-header">
        <h2>🏢 Corporation Industry Jobs</h2>
        <div className="corp-stats">
          <span className="stat-badge total">{stats.total} Total</span>
          <span className="stat-badge active">{stats.active} Active</span>
          <span className="stat-badge ready">{stats.ready} Ready</span>
        </div>
      </div>

      {/* Corporation Summary Cards - Collapsible */}
      {corporations.filter(c => c.has_industry_access).length > 0 && (
        <div className="corp-summary-cards">
          {corporations.filter(c => c.has_industry_access).map(corp => {
            const charsWithRole = corp.characters.filter(c => c.has_industry_role);
            const isExpanded = expandedCorps[corp.corporation_id];
            // Get unique roles
            const roles = [...new Set(charsWithRole.map(c => c.industry_role_name))].join(', ');
            
            return (
              <div key={corp.corporation_id} className={`corp-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
                <div 
                  className="corp-card-header clickable"
                  onClick={() => toggleCorpExpanded(corp.corporation_id)}
                >
                  <div className="corp-card-title">
                    <span className="corp-ticker">[{corp.ticker}]</span>
                    <span className="corp-name">{corp.name}</span>
                  </div>
                  <div className="corp-card-summary">
                    <span className="char-count">{charsWithRole.length} character{charsWithRole.length !== 1 ? 's' : ''}</span>
                    <span className="role-summary">- {roles}</span>
                    <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="corp-card-details">
                    {charsWithRole.map(char => (
                      <div key={char.character_id} className="corp-char-role">
                        <span className="char-name">{char.character_name}</span>
                        <span className={`role-badge ${char.industry_role_name?.toLowerCase().replace(' ', '-')}`}>
                          {char.industry_role_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Filters Toolbar — uses shared IndustryJobs styles */}
      <div className="jobs-toolbar">
        <div className="toolbar-filters">
          <div className="filter-group">
            <label>Character</label>
            <select value={characterFilter} onChange={e => setCharacterFilter(e.target.value)}>
              <option value="all">All Characters</option>
              {characters.map(char => (
                <option key={char.id} value={char.id}>{char.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Corporation</label>
            <select value={selectedCorp} onChange={e => setSelectedCorp(e.target.value)}>
              <option value="all">All Corporations</option>
              {corporations.filter(c => c.has_industry_access).map(corp => (
                <option key={corp.corporation_id} value={corp.corporation_id}>
                  [{corp.ticker}] {corp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Activity</label>
            <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)}>
              <option value="all">All activities</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="science">Science</option>
              <option value="reactions">Reactions</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All jobs</option>
              <option value="active">Active</option>
              <option value="ready">Ready</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="refresh-btn" onClick={handleRefresh}>
            ↻ Refresh
          </button>
          <span className="jobs-count-badge">{filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Jobs Table — uses shared IndustryJobs table styles */}
      {filteredJobs.length === 0 ? (
        <div className="empty-state">
          <p>No corporation industry jobs found matching your filters</p>
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
                <th>Corporation</th>
                <th className="col-installer">Installer</th>
                <th className="col-progress">Progress</th>
                <th className="col-date">End Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => (
                <tr key={job.job_id} className={`job-row ${job.status}`}>
                  <td className="col-status">
                    <div className="status-cell">
                      <span className="time-remaining">{formatTimeRemaining(job.time_remaining_ms)}</span>
                      <div className="progress-bar-container">
                        <div
                          className={`progress-bar-fill ${job.progress >= 100 ? 'complete' : job.status === 'active' ? 'active' : 'paused'}`}
                          style={{ width: `${Math.min(100, job.progress)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="col-runs">
                    <span className="runs-badge">x {job.runs}</span>
                  </td>
                  <td className="col-activity">
                    <span className={`activity-badge ${job.activity_category}`}>
                      {job.activity}
                    </span>
                  </td>
                  <td className="col-blueprint">
                    <div className="blueprint-cell">
                      <img
                        src={`https://images.evetech.net/types/${job.blueprint_type_id}/bp?size=32`}
                        alt=""
                        className="blueprint-icon"
                        onError={(e) => { e.target.src = `https://images.evetech.net/types/${job.blueprint_type_id}/icon?size=32`; }}
                      />
                      <span className="blueprint-name">{job.blueprint_name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="corp-ticker-badge">[{job.corporation_ticker}]</span>
                    <span className="corp-name-text">{job.corporation_name}</span>
                  </td>
                  <td className="col-installer">
                    <span className="installer-name">{job.installer_name}</span>
                  </td>
                  <td className="col-progress">
                    <span className={`status-badge status-${job.status}`}>
                      {job.status}
                    </span>
                  </td>
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

export default CorporationJobs;
