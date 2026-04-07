/**
 * Feature Access Middleware
 * DB-driven permission checks replacing hardcoded character name gates.
 * Supports per-user grants, per-corporation grants, and admin bypass.
 */

const db = require('../database/db');
const { getCharacterCorporation } = require('../services/corporationService');
const { getValidAccessToken } = require('../services/tokenRefresh');

// Known premium features
const FEATURES = {
  'trading': 'Trading Tools',
  'production-planner': 'Production Planner',
};

// In-memory cache: userId -> { corpIds, ts }
const corpIdCache = new Map();
const CORP_CACHE_TTL = 600000; // 10 minutes

async function getUserCorpIds(userId) {
  const cached = corpIdCache.get(userId);
  if (cached && Date.now() - cached.ts < CORP_CACHE_TTL) return cached.ids;

  const characters = db.getAllCharactersByUserId(userId);
  const corpIds = new Set();

  for (const char of characters) {
    try {
      const token = await getValidAccessToken(char);
      const corpData = await getCharacterCorporation(char.character_id, token);
      if (corpData?.corporation_id) corpIds.add(corpData.corporation_id);
    } catch {
      // Skip characters with expired/invalid tokens
    }
  }

  const ids = [...corpIds];
  corpIdCache.set(userId, { ids, ts: Date.now() });
  return ids;
}

/**
 * Middleware factory: requireFeature('trading')
 * Checks admin bypass -> user grant -> corp grant -> 403
 */
function requireFeature(featureName) {
  return async (req, res, next) => {
    const userId = req.session.userId;

    // Admin bypass
    if (db.isAdmin(userId)) return next();

    // Direct user grant
    if (db.hasUserFeature(userId, featureName)) return next();

    // Corporation grant
    try {
      const corpIds = await getUserCorpIds(userId);
      for (const corpId of corpIds) {
        if (db.hasCorpFeature(corpId, featureName)) return next();
      }
    } catch {
      // Fall through to 403
    }

    return res.status(403).json({ error: `Feature '${featureName}' not available for your account` });
  };
}

/**
 * Admin-only middleware
 */
function requireAdmin(req, res, next) {
  if (!db.isAdmin(req.session.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Get all enabled features for a user (for frontend)
 */
async function getEnabledFeatures(userId) {
  if (db.isAdmin(userId)) {
    return Object.keys(FEATURES);
  }

  const enabled = new Set();

  // Direct grants
  const userFeatures = db.getUserFeatures(userId);
  for (const f of userFeatures) enabled.add(f.feature_name);

  // Corp grants
  try {
    const corpIds = await getUserCorpIds(userId);
    for (const corpId of corpIds) {
      const corpFeatures = db.getCorpFeatures(corpId);
      for (const f of corpFeatures) enabled.add(f.feature_name);
    }
  } catch {
    // Continue with user-level features only
  }

  return [...enabled];
}

module.exports = { requireFeature, requireAdmin, getEnabledFeatures, FEATURES };
