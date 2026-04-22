/**
 * Corporation Industry History Controller
 * Serves aggregated stats and raw history from corp_job_history.
 * Access scope: user can see stats for any corporation their characters belong to.
 */

const db = require('../database/db');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { getCharacterCorporation, getCorporationInfo } = require('../services/corporationService');
const corpJobArchive = require('../services/corpJobArchive');

async function resolveUserCorpIds(userId) {
  const characters = db.getAllCharactersByUserId(userId);
  const corpIds = new Set();
  for (const char of characters) {
    try {
      const token = await getValidAccessToken(char);
      const { corporation_id } = await getCharacterCorporation(char.character_id, token);
      if (corporation_id) corpIds.add(corporation_id);
    } catch (err) {
      console.warn(`[CORP-INDUSTRY] Skipping character ${char.character_id}: ${err.message}`);
    }
  }
  return [...corpIds];
}

// ESI exposes reactions as both legacy activity_id 9 and modern 11 — treat
// them as a single "Reactions" bucket in the UI so filtering matches reality.
const ACTIVITY_ALIASES = {
  11: [9, 11],
  9: [9, 11],
};

function parseFilters(req, corpIds) {
  const { from, to, activity, corporation_id } = req.query;
  let filtered = corpIds;
  if (corporation_id) {
    const c = parseInt(corporation_id);
    filtered = corpIds.includes(c) ? [c] : [];
  }

  let activityIds = null;
  let activityId = null;
  if (activity) {
    const a = parseInt(activity);
    if (ACTIVITY_ALIASES[a]) activityIds = ACTIVITY_ALIASES[a];
    else activityId = a;
  }

  return {
    corporationIds: filtered,
    from: from || null,
    to: to || null,
    activityId,
    activityIds,
  };
}

exports.getStats = async (req, res) => {
  try {
    const corpIds = await resolveUserCorpIds(req.session.userId);
    if (corpIds.length === 0) {
      return res.json({ corporations: [], summary: null, by_month: [], top_products: [], top_installers: [], by_group: [], by_activity: [] });
    }

    const filters = parseFilters(req, corpIds);
    if (filters.corporationIds.length === 0) {
      return res.status(403).json({ error: 'No access to that corporation' });
    }

    // Product list is inherently "one row per distinct product type" — can
    // legitimately reach thousands for an all-time / many-corp query.
    // Capped high enough to be effectively unlimited for realistic use.
    const topLimit = Math.min(parseInt(req.query.top_limit) || 500, 10000);

    const [summary, byMonth, byMonthCategory, topProducts, topInstallers, byGroup, byActivity, shipsBuilt] = [
      db.queryCorpJobSummary(filters),
      db.queryCorpJobsByMonth(filters),
      db.queryCorpJobsByMonthAndCategory(filters),
      db.queryCorpTopProducts(filters, topLimit),
      db.queryCorpTopInstallers(filters, topLimit),
      db.queryCorpJobsByGroup(filters),
      db.queryCorpJobsByActivity(filters),
      db.queryCorpShipsBuilt(filters),
    ];

    const corpInfos = await Promise.all(corpIds.map(id => getCorporationInfo(id).catch(() => null)));
    const corporations = corpInfos.filter(Boolean);

    res.json({
      corporations,
      filter: { from: filters.from, to: filters.to, activity: filters.activityId, corporation_id: filters.corporationIds.length === 1 ? filters.corporationIds[0] : null },
      summary,
      by_month: byMonth,
      by_month_category: byMonthCategory,
      top_products: topProducts,
      top_installers: topInstallers,
      by_group: byGroup,
      by_activity: byActivity,
      ships_built: shipsBuilt,
    });
  } catch (err) {
    console.error('[CORP-INDUSTRY] getStats failed:', err);
    res.status(500).json({ error: 'Failed to load corp industry stats' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const corpIds = await resolveUserCorpIds(req.session.userId);
    if (corpIds.length === 0) return res.json({ rows: [], total: 0 });

    const filters = parseFilters(req, corpIds);
    if (filters.corporationIds.length === 0) {
      return res.status(403).json({ error: 'No access to that corporation' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const rows = db.queryCorpJobHistory(filters, limit, offset);
    const total = db.countCorpJobHistory(filters);

    // Resolve corporation names once per unique corp_id in the page. We
    // already cache corp info in-memory in corporationService; this just
    // re-uses it so the export has a human-readable corp column.
    const uniqueCorpIds = [...new Set(rows.map(r => r.corporation_id).filter(Boolean))];
    const corpInfos = await Promise.all(uniqueCorpIds.map(id => getCorporationInfo(id).catch(() => null)));
    const corpNameById = new Map();
    for (const info of corpInfos) {
      if (info) corpNameById.set(info.corporation_id, info.name);
    }
    for (const row of rows) {
      row.corporation_name = corpNameById.get(row.corporation_id) || null;
    }

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[CORP-INDUSTRY] getHistory failed:', err);
    res.status(500).json({ error: 'Failed to load corp industry history' });
  }
};

// Admin-only on-demand archival trigger. Useful for the initial backfill and
// for verifying the pipeline without waiting for the 15-min timer.
exports.runBackfill = async (req, res) => {
  try {
    const summary = await corpJobArchive.runArchive();
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('[CORP-INDUSTRY] backfill failed:', err);
    res.status(500).json({ error: 'Backfill failed', message: err.message });
  }
};
