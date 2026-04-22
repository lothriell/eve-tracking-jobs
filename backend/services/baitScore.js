/**
 * Bait / scam risk scoring for cross-hub trade opportunities.
 *
 * Pure module — receives data, returns risk_level + reasons[].
 * Heuristics distilled from EVE community knowledge (EVE Uni wiki, Brave
 * Collective station-trading guide, official forum discussions). See the
 * project memory `reference_eve_bait_patterns` for the full rationale.
 *
 * Risk levels (highest wins):
 *   critical — hard alarm; trade is almost certainly unfillable or a trap
 *   high     — strong red flag; likely fillable for tiny quantity at best
 *   medium   — caveat worth surfacing; not necessarily bait
 *   low      — passes all checks (with current data)
 */

const LEVELS = ['low', 'medium', 'high', 'critical'];
function maxLevel(a, b) { return LEVELS.indexOf(a) > LEVELS.indexOf(b) ? a : b; }

/**
 * Score a single opportunity.
 *
 * @param {Object} opp - the opportunity record (must include sell_price,
 *   buy_price, source_sell_volume, dest_sell_volume, source_sell_order_count,
 *   source_buy_max, dest_station_id at minimum)
 * @param {Object} ctx - extra context:
 *   - sourceMedian30d: number|null (median sell_min over last 30 days at source)
 *   - destStationIsStructure: bool (station_id > 1T → player citadel)
 *   - intendedQty: number|null (quantity user plans to haul; default 100)
 * @returns {Object} { risk_level, reasons: [string] }
 */
function scoreOpportunity(opp, ctx = {}) {
  const reasons = [];
  let level = 'low';

  const intendedQty = ctx.intendedQty || 100;

  // CRITICAL: same-hub inverted spread (margin-trading scam tell)
  // If at the source station the buy_max meets-or-exceeds the sell_min, the
  // buy order is almost certainly funded by a margin-trading drain wallet.
  if (opp.source_buy_max && opp.buy_price && opp.source_buy_max >= opp.buy_price) {
    reasons.push('Source-hub inverted spread: buy_max ≥ sell_min (margin-trading scam signature)');
    level = maxLevel(level, 'critical');
  }

  // CRITICAL: decimal / zero-count anomaly vs 30-day median
  if (ctx.sourceMedian30d && opp.buy_price > 0) {
    const ratio = opp.buy_price / ctx.sourceMedian30d;
    const log10delta = Math.abs(Math.log10(ratio));
    if (log10delta >= 1.0) {
      reasons.push(`Sell price is ${ratio.toFixed(2)}× 30d median — possible decimal/zero-count outlier`);
      level = maxLevel(level, 'critical');
    } else if (log10delta >= 0.7) {
      reasons.push(`Sell price is ${ratio.toFixed(2)}× 30d median — anomalous`);
      level = maxLevel(level, 'high');
    } else if (ratio < 0.5) {
      reasons.push(`Sell price is ${(ratio * 100).toFixed(0)}% of 30d median — possible crash or manipulation`);
      level = maxLevel(level, 'medium');
    }
  }

  // HIGH: thin source-side order count (single seller can pump-and-dump)
  if (opp.source_sell_order_count != null && opp.source_sell_order_count < 2) {
    reasons.push(`Only ${opp.source_sell_order_count} sell order at source — single-seller pump risk`);
    level = maxLevel(level, 'high');
  } else if (opp.source_sell_order_count != null && opp.source_sell_order_count < 4) {
    reasons.push(`Only ${opp.source_sell_order_count} sell orders at source — thin depth`);
    level = maxLevel(level, 'medium');
  }

  // HIGH: source sell_volume can't fill intended haul
  if (opp.source_sell_volume != null) {
    if (opp.source_sell_volume < intendedQty) {
      reasons.push(`Source has ${opp.source_sell_volume} units — under intended haul of ${intendedQty}`);
      level = maxLevel(level, 'high');
    } else if (opp.source_sell_volume < intendedQty * 5) {
      reasons.push(`Source has ${opp.source_sell_volume} units — barely covers ${intendedQty}× haul`);
      level = maxLevel(level, 'medium');
    }
  }

  // HIGH: destination is a player structure (Upwell citadel)
  // The buy order is real, but ACL lockout means hauler may not be able to dock.
  if (ctx.destStationIsStructure) {
    reasons.push('Destination is a player structure — ACL lockout / structure-destruction risk');
    level = maxLevel(level, 'high');
  }

  // HIGH: thin destination demand (no real buyer for the volume hauled)
  if (opp.dest_sell_volume != null && opp.dest_sell_volume === 0) {
    reasons.push('Destination has zero sell volume — no listed market depth');
    level = maxLevel(level, 'medium');
  }

  return { risk_level: level, reasons };
}

/**
 * Identify whether a type name belongs to a category that's structurally
 * market junk regardless of order book signals. Returns null if not flagged.
 *
 * Used as a category tag (separate from the per-opp scoring).
 * - 'skin' — cosmetics (SKIN / SKINR / Paragon); thin market, stale orders
 * - 'expired' — legacy event items whose names literally start with
 *   "Expired" (AIR boosters, Cerebral Accelerators, filaments, etc).
 *   906 such types in SDE; no functional value; no legitimate trading.
 */
function categoryRiskTag(typeName) {
  if (!typeName) return null;
  const lc = typeName.toLowerCase();
  if (lc.startsWith('expired ')) return 'expired';
  if (lc.includes(' skin') || lc.endsWith(' skin')) return 'skin';
  if (lc.includes('skinr')) return 'skin';
  if (lc.includes('paragon')) return 'skin';
  return null;
}

module.exports = {
  scoreOpportunity,
  categoryRiskTag,
  LEVELS,
};
