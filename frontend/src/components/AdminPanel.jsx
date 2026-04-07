import React, { useEffect, useState, useCallback } from 'react';
import {
  getAdminUsers, getAdminFeatures, toggleUserAdmin,
  grantUserFeature, revokeUserFeature,
  getCorpGrants, grantCorpFeature, revokeCorpFeature
} from '../services/api';
import './AdminPanel.css';

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [features, setFeatures] = useState({});
  const [corpGrants, setCorpGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Corp grant form
  const [corpId, setCorpId] = useState('');
  const [corpName, setCorpName] = useState('');
  const [corpFeature, setCorpFeature] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [usersResp, featResp, corpsResp] = await Promise.all([
        getAdminUsers(),
        getAdminFeatures(),
        getCorpGrants(),
      ]);
      setUsers(usersResp.data.users || []);
      setFeatures(featResp.data.features || {});
      setCorpGrants(corpsResp.data.grants || []);
      setError(null);
    } catch (err) {
      setError(err.response?.status === 403 ? 'Admin access required' : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleAdmin = async (userId, currentValue) => {
    try {
      await toggleUserAdmin(userId, !currentValue);
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to toggle admin');
    }
  };

  const handleToggleFeature = async (userId, featureName, hasFeature) => {
    try {
      if (hasFeature) {
        await revokeUserFeature(userId, featureName);
      } else {
        await grantUserFeature(userId, featureName);
      }
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update feature');
    }
  };

  const handleGrantCorpFeature = async (e) => {
    e.preventDefault();
    if (!corpId || !corpFeature) return;
    try {
      await grantCorpFeature(parseInt(corpId), corpName || `Corp ${corpId}`, corpFeature);
      setCorpId('');
      setCorpName('');
      setCorpFeature('');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant corp feature');
    }
  };

  const handleRevokeCorpFeature = async (corpId, featureName) => {
    try {
      await revokeCorpFeature(corpId, featureName);
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke corp feature');
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <p>Loading admin panel...</p>
      </div>
    );
  }

  const featureKeys = Object.keys(features);

  return (
    <div className="admin-container">
      <div className="admin-toolbar">
        <h2>Admin Console</h2>
      </div>

      {error && (
        <div className="admin-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">x</button>
        </div>
      )}

      {/* Users & Features */}
      <div className="admin-section">
        <h3>User Feature Access</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Characters</th>
                <th>Admin</th>
                {featureKeys.map(key => (
                  <th key={key}>{features[key]}</th>
                ))}
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const userFeatureNames = user.features.map(f => f.feature_name);
                return (
                  <tr key={user.id}>
                    <td className="user-name">{user.primary_character_name || `User #${user.id}`}</td>
                    <td className="center">{user.character_count}</td>
                    <td className="center">
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={!!user.is_admin}
                          onChange={() => handleToggleAdmin(user.id, user.is_admin)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    {featureKeys.map(key => (
                      <td key={key} className="center">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={userFeatureNames.includes(key)}
                            onChange={() => handleToggleFeature(user.id, key, userFeatureNames.includes(key))}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </td>
                    ))}
                    <td className="date-cell">
                      {user.created_at ? new Date(user.created_at + 'Z').toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Corporation Grants */}
      <div className="admin-section">
        <h3>Corporation Feature Access</h3>
        <p className="admin-hint">Grant features to all members of a corporation.</p>

        <form className="corp-grant-form" onSubmit={handleGrantCorpFeature}>
          <input
            type="number"
            placeholder="Corporation ID"
            value={corpId}
            onChange={e => setCorpId(e.target.value)}
            className="admin-input"
          />
          <input
            type="text"
            placeholder="Corporation Name (optional)"
            value={corpName}
            onChange={e => setCorpName(e.target.value)}
            className="admin-input corp-name-input"
          />
          <select
            value={corpFeature}
            onChange={e => setCorpFeature(e.target.value)}
            className="admin-select"
          >
            <option value="">Select feature...</option>
            {featureKeys.map(key => (
              <option key={key} value={key}>{features[key]}</option>
            ))}
          </select>
          <button type="submit" className="admin-grant-btn" disabled={!corpId || !corpFeature}>
            Grant
          </button>
        </form>

        {corpGrants.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Corporation</th>
                  <th>Corp ID</th>
                  <th>Feature</th>
                  <th>Granted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {corpGrants.map(grant => (
                  <tr key={`${grant.corporation_id}-${grant.feature_name}`}>
                    <td>{grant.corporation_name || `Corp ${grant.corporation_id}`}</td>
                    <td className="center">{grant.corporation_id}</td>
                    <td>{features[grant.feature_name] || grant.feature_name}</td>
                    <td className="date-cell">
                      {grant.granted_at ? new Date(grant.granted_at + 'Z').toLocaleDateString() : '—'}
                    </td>
                    <td className="center">
                      <button
                        className="admin-revoke-btn"
                        onClick={() => handleRevokeCorpFeature(grant.corporation_id, grant.feature_name)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-empty">No corporation grants configured.</p>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
