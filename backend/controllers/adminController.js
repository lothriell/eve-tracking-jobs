/**
 * Admin Controller
 * Manages users, feature grants, and corporation access.
 */

const db = require('../database/db');
const { FEATURES } = require('../middleware/featureAccess');
const { getCharacterCorporation } = require('../services/corporationService');
const { getCharacterNames } = require('../services/esiClient');
const { getValidAccessToken } = require('../services/tokenRefresh');

// GET /api/admin/users — list all users with their features + corporation
exports.getUsers = async (req, res) => {
  try {
    const users = db.getAllUsers();

    // Resolve corporation for each user's primary character
    const corpIds = new Set();
    const userCorpMap = {};

    for (const user of users) {
      if (!user.primary_character_id) continue;
      const char = db.getCharacterById(user.primary_character_id);
      if (!char) continue;
      try {
        const token = await getValidAccessToken(char);
        const corpData = await getCharacterCorporation(char.character_id, token);
        if (corpData?.corporation_id) {
          userCorpMap[user.id] = corpData.corporation_id;
          corpIds.add(corpData.corporation_id);
        }
      } catch {
        // Skip if token expired
      }
    }

    // Batch resolve corp names
    const corpNames = corpIds.size > 0 ? await getCharacterNames([...corpIds]) : {};

    const result = users.map(u => ({
      ...u,
      features: db.getUserFeatures(u.id),
      corporation_id: userCorpMap[u.id] || null,
      corporation_name: corpNames[userCorpMap[u.id]] || null,
    }));

    res.json({ users: result });
  } catch (error) {
    console.error('Admin getUsers error:', error.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
};

// GET /api/admin/features — list available feature definitions
exports.getFeatures = (req, res) => {
  res.json({ features: FEATURES });
};

// PUT /api/admin/users/:userId/admin — toggle admin flag
exports.toggleAdmin = (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  const { is_admin } = req.body;

  if (targetUserId === req.session.userId && !is_admin) {
    return res.status(400).json({ error: 'Cannot remove your own admin access' });
  }

  db.setAdmin(targetUserId, is_admin);
  res.json({ success: true });
};

// POST /api/admin/users/:userId/features — grant feature to user
exports.grantUserFeature = (req, res) => {
  const userId = parseInt(req.params.userId);
  const { feature_name } = req.body;
  if (!feature_name) return res.status(400).json({ error: 'feature_name required' });
  db.grantUserFeature(userId, feature_name, req.session.userId);
  res.json({ success: true });
};

// DELETE /api/admin/users/:userId/features/:featureName — revoke feature
exports.revokeUserFeature = (req, res) => {
  const userId = parseInt(req.params.userId);
  db.revokeUserFeature(userId, req.params.featureName);
  res.json({ success: true });
};

// GET /api/admin/corps — list all corp grants
exports.getCorpGrants = (req, res) => {
  const grants = db.getAllCorpFeatures();
  res.json({ grants });
};

// POST /api/admin/corps — grant feature to corporation
exports.grantCorpFeature = (req, res) => {
  const { corporation_id, corporation_name, feature_name } = req.body;
  if (!corporation_id || !feature_name) {
    return res.status(400).json({ error: 'corporation_id and feature_name required' });
  }
  db.grantCorpFeature(corporation_id, corporation_name || `Corp ${corporation_id}`, feature_name, req.session.userId);
  res.json({ success: true });
};

// DELETE /api/admin/corps/:corpId/features/:featureName — revoke corp feature
exports.revokeCorpFeature = (req, res) => {
  db.revokeCorpFeature(parseInt(req.params.corpId), req.params.featureName);
  res.json({ success: true });
};
