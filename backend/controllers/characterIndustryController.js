/**
 * Character Industry History Controller
 * Serves aggregated stats and raw history from character_job_history.
 * Access scope: a user sees stats for characters linked to their account.
 */

const db = require('../database/db');
const characterJobArchive = require('../services/characterJobArchive');

// ESI exposes reactions as both legacy activity_id 9 and modern 11 — treat
// them as a single "Reactions" bucket in the UI so filtering matches reality.
const ACTIVITY_ALIASES = {
  11: [9, 11],
  9: [9, 11],
};

function resolveUserCharacterIds(userId) {
  const characters = db.getAllCharactersByUserId(userId);
  return characters.map(c => c.character_id);
}

function parseFilters(req, characterIds) {
  const { from, to, activity, character_id } = req.query;
  let filtered = characterIds;
  if (character_id) {
    const c = parseInt(character_id);
    filtered = characterIds.includes(c) ? [c] : [];
  }

  let activityIds = null;
  let activityId = null;
  if (activity) {
    const a = parseInt(activity);
    if (ACTIVITY_ALIASES[a]) activityIds = ACTIVITY_ALIASES[a];
    else activityId = a;
  }

  return {
    characterIds: filtered,
    from: from || null,
    to: to || null,
    activityId,
    activityIds,
  };
}

exports.getStats = async (req, res) => {
  try {
    const characterIds = resolveUserCharacterIds(req.session.userId);
    if (characterIds.length === 0) {
      return res.json({ characters: [], summary: null, by_month: [], by_month_category: [], top_products: [], by_character: [], by_group: [], by_activity: [] });
    }

    const filters = parseFilters(req, characterIds);
    if (filters.characterIds.length === 0) {
      return res.status(403).json({ error: 'No access to that character' });
    }

    // Effectively unlimited for realistic use — see corp controller note.
    const topLimit = Math.min(parseInt(req.query.top_limit) || 500, 10000);

    const summary = db.queryCharacterJobSummary(filters);
    const byMonth = db.queryCharacterJobsByMonth(filters);
    const byMonthCategory = db.queryCharacterJobsByMonthAndCategory(filters);
    const topProducts = db.queryCharacterTopProducts(filters, topLimit);
    const byCharacter = db.queryCharacterBreakdown(filters, topLimit);
    const byGroup = db.queryCharacterJobsByGroup(filters);
    const byActivity = db.queryCharacterJobsByActivity(filters);
    const shipsBuilt = db.queryCharacterShipsBuilt(filters);

    // Merge real wallet-sales data for the same characters/window. Sales
    // aren't linked to specific build jobs, so this answers "how much did I
    // sell of these types in this window" rather than "what did this job
    // earn." Useful alongside the isk_produced_est Jita-price estimate.
    const salesFilters = { characterIds: filters.characterIds, from: filters.from, to: filters.to };
    const salesSummary = db.queryCharacterSalesSummary(salesFilters);
    const salesByType = db.queryCharacterSalesByType(salesFilters);
    const salesMap = new Map();
    for (const row of salesByType) {
      salesMap.set(row.type_id, { isk_sold: row.isk_sold || 0, units_sold: row.units_sold || 0 });
    }
    if (summary) {
      summary.isk_sold_real = salesSummary?.isk_sold || 0;
      summary.units_sold_total = salesSummary?.units_sold || 0;
      summary.unique_types_sold = salesSummary?.unique_types_sold || 0;
    }
    for (const p of topProducts) {
      const s = salesMap.get(p.product_type_id);
      p.isk_sold = s?.isk_sold || 0;
      p.units_sold = s?.units_sold || 0;
    }

    // Characters list for the selector — only those the user owns and that
    // appear in the archive (so the dropdown doesn't list alts with zero jobs).
    const allOwned = db.getAllCharactersByUserId(req.session.userId);
    const characters = allOwned
      .filter(c => characterIds.includes(c.character_id))
      .map(c => ({ character_id: c.character_id, character_name: c.character_name }));

    res.json({
      characters,
      filter: { from: filters.from, to: filters.to, activity: filters.activityId, character_id: filters.characterIds.length === 1 ? filters.characterIds[0] : null },
      summary,
      by_month: byMonth,
      by_month_category: byMonthCategory,
      top_products: topProducts,
      by_character: byCharacter,
      by_group: byGroup,
      by_activity: byActivity,
      ships_built: shipsBuilt,
    });
  } catch (err) {
    console.error('[CHAR-INDUSTRY] getStats failed:', err);
    res.status(500).json({ error: 'Failed to load character industry stats' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const characterIds = resolveUserCharacterIds(req.session.userId);
    if (characterIds.length === 0) return res.json({ rows: [], total: 0 });

    const filters = parseFilters(req, characterIds);
    if (filters.characterIds.length === 0) {
      return res.status(403).json({ error: 'No access to that character' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const rows = db.queryCharacterJobHistory(filters, limit, offset);
    const total = db.countCharacterJobHistory(filters);

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[CHAR-INDUSTRY] getHistory failed:', err);
    res.status(500).json({ error: 'Failed to load character industry history' });
  }
};

// Admin-only on-demand archival trigger. Mirrors the corp backfill route.
exports.runBackfill = async (req, res) => {
  try {
    const summary = await characterJobArchive.runArchive();
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('[CHAR-INDUSTRY] backfill failed:', err);
    res.status(500).json({ error: 'Backfill failed', message: err.message });
  }
};
