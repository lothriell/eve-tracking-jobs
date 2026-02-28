import React, { useEffect, useState } from 'react';
import { getIndustryJobs, getCharacter } from '../services/api';
import './IndustryJobs.css';

function IndustryJobs({ onError }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasCharacter, setHasCharacter] = useState(false);
  const [scopeError, setScopeError] = useState(false);

  useEffect(() => {
    checkCharacterAndLoadJobs();
  }, []);

  const checkCharacterAndLoadJobs = async () => {
    try {
      // Check if character is linked
      const charResponse = await getCharacter();
      if (!charResponse.data.linked) {
        setHasCharacter(false);
        setLoading(false);
        return;
      }
      
      setHasCharacter(true);
      await loadJobs();
    } catch (error) {
      console.error('Failed to check character:', error);
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      const response = await getIndustryJobs();
      setJobs(response.data.jobs || []);
      setScopeError(false);
    } catch (error) {
      console.error('Failed to load industry jobs:', error);
      if (error.response?.status === 403) {
        setScopeError(true);
        onError(error.response.data.message || 'Missing required ESI scopes');
      } else {
        onError('Failed to load industry jobs');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      active: 'status-active',
      ready: 'status-ready',
      delivered: 'status-delivered',
      paused: 'status-paused',
      cancelled: 'status-cancelled'
    };
    return (
      <span className={`status-badge ${statusClasses[status] || ''}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="card">
        <h2>Industry Jobs</h2>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading jobs...</p>
        </div>
      </div>
    );
  }

  if (!hasCharacter) {
    return (
      <div className="card">
        <h2>Industry Jobs</h2>
        <div className="empty-state">
          <p>Link your EVE character to view industry jobs</p>
        </div>
      </div>
    );
  }

  if (scopeError) {
    return (
      <div className="card">
        <h2>Industry Jobs</h2>
        <div className="error-message">
          <p><strong>Missing Required Scopes</strong></p>
          <p>Your character doesn't have the required ESI scopes to view industry jobs.</p>
          <p>Please re-link your character to grant the necessary permissions.</p>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="card">
        <h2>Industry Jobs</h2>
        <div className="empty-state">
          <p>No active industry jobs found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="jobs-header">
        <h2>Industry Jobs</h2>
        <span className="jobs-count">{jobs.length} active job{jobs.length !== 1 ? 's' : ''}</span>
      </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Activity</th>
              <th>Status</th>
              <th>Runs</th>
              <th>Start Date</th>
              <th>End Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.job_id}>
                <td>{job.job_id}</td>
                <td>{job.activity}</td>
                <td>{getStatusBadge(job.status)}</td>
                <td>{job.runs}</td>
                <td>{formatDate(job.start_date)}</td>
                <td>{formatDate(job.end_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IndustryJobs;
