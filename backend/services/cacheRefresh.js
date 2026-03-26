/**
 * Background Cache Refresh Service
 * Periodically refreshes semi-static ESI data into SQLite
 *
 * Refresh schedule:
 * - Market prices: every 6 hours (changes daily)
 * - System cost indices: every 6 hours (changes daily)
 * - Constellation/region names: once on startup (never change)
 */

const axios = require('axios');
const db = require('../database/db');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DS = 'tranquility';

let refreshTimer = null;
let isRefreshing = false;

// ===== MARKET PRICES =====
async function refreshMarketPrices() {
  try {
    console.log('[CACHE] Refreshing market prices...');
    const response = await axios.get(`${ESI_BASE}/markets/prices/`, {
      params: { datasource: DS },
      timeout: 30000
    });

    const prices = response.data || [];
    if (prices.length > 0) {
      const count = db.setMarketPrices(prices);
      console.log(`[CACHE] Market prices: ${count} types cached`);
    }
    return prices.length;
  } catch (error) {
    console.error('[CACHE] Failed to refresh market prices:', error.message);
    return 0;
  }
}

// ===== SYSTEM COST INDICES =====
async function refreshCostIndices() {
  try {
    console.log('[CACHE] Refreshing system cost indices...');
    const response = await axios.get(`${ESI_BASE}/industry/systems/`, {
      params: { datasource: DS },
      timeout: 30000
    });

    const systems = response.data || [];
    const indices = [];
    for (const sys of systems) {
      for (const ci of (sys.cost_indices || [])) {
        indices.push({
          system_id: sys.solar_system_id,
          activity: ci.activity,
          cost_index: ci.cost_index
        });
      }
    }

    if (indices.length > 0) {
      const count = db.setCostIndices(indices);
      console.log(`[CACHE] Cost indices: ${count} entries across ${systems.length} systems cached`);
    }
    return indices.length;
  } catch (error) {
    console.error('[CACHE] Failed to refresh cost indices:', error.message);
    return 0;
  }
}

// ===== CONSTELLATION & REGION NAMES =====
async function refreshConstellationNames() {
  try {
    // Check if we already have constellations cached
    const existing = db.getCachedNames([20000001], 'constellation');
    if (existing[20000001]) {
      console.log('[CACHE] Constellation names already cached, skipping');
      return 0;
    }

    console.log('[CACHE] Fetching constellation list...');
    const listResp = await axios.get(`${ESI_BASE}/universe/constellations/`, {
      params: { datasource: DS },
      timeout: 15000
    });
    const constellationIds = listResp.data || [];

    // Resolve names via POST /universe/names/ (batch 1000)
    const entries = [];
    for (let i = 0; i < constellationIds.length; i += 1000) {
      const batch = constellationIds.slice(i, i + 1000);
      try {
        const resp = await axios.post(`${ESI_BASE}/universe/names/`, batch, {
          headers: { 'Content-Type': 'application/json' },
          params: { datasource: DS },
          timeout: 15000
        });
        for (const item of resp.data) {
          entries.push({ id: item.id, category: 'constellation', name: item.name });
        }
      } catch (e) { /* batch failed, continue */ }
    }

    if (entries.length > 0) {
      db.setCachedNames(entries);
      console.log(`[CACHE] Constellation names: ${entries.length} cached`);
    }
    return entries.length;
  } catch (error) {
    console.error('[CACHE] Failed to refresh constellation names:', error.message);
    return 0;
  }
}

async function refreshRegionNames() {
  try {
    const existing = db.getCachedNames([10000001], 'region');
    if (existing[10000001]) {
      console.log('[CACHE] Region names already cached, skipping');
      return 0;
    }

    console.log('[CACHE] Fetching region list...');
    const listResp = await axios.get(`${ESI_BASE}/universe/regions/`, {
      params: { datasource: DS },
      timeout: 15000
    });
    const regionIds = listResp.data || [];

    const entries = [];
    const resp = await axios.post(`${ESI_BASE}/universe/names/`, regionIds, {
      headers: { 'Content-Type': 'application/json' },
      params: { datasource: DS },
      timeout: 15000
    });
    for (const item of resp.data) {
      entries.push({ id: item.id, category: 'region', name: item.name });
    }

    if (entries.length > 0) {
      db.setCachedNames(entries);
      console.log(`[CACHE] Region names: ${entries.length} cached`);
    }
    return entries.length;
  } catch (error) {
    console.error('[CACHE] Failed to refresh region names:', error.message);
    return 0;
  }
}

// ===== FULL REFRESH =====
async function runFullRefresh() {
  if (isRefreshing) {
    console.log('[CACHE] Refresh already in progress, skipping');
    return;
  }

  isRefreshing = true;
  const start = Date.now();
  console.log('[CACHE] === Starting cache refresh ===');

  try {
    // Static data (only fetched once)
    await refreshRegionNames();
    await refreshConstellationNames();

    // Semi-static data (refreshed every cycle)
    await refreshMarketPrices();
    await refreshCostIndices();

    const stats = db.getCacheStats();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[CACHE] === Refresh complete in ${elapsed}s ===`);
    stats.forEach(s => console.log(`[CACHE]   ${s.category}: ${s.count} entries`));
  } catch (error) {
    console.error('[CACHE] Refresh error:', error.message);
  } finally {
    isRefreshing = false;
  }
}

// ===== SCHEDULER =====
function startCacheRefresh() {
  // Run immediately on startup
  setTimeout(() => runFullRefresh(), 5000); // 5s delay to let DB initialize

  // Then every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  refreshTimer = setInterval(() => runFullRefresh(), SIX_HOURS);

  console.log('[CACHE] Background refresh scheduled (every 6 hours)');
}

function stopCacheRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = {
  startCacheRefresh,
  stopCacheRefresh,
  runFullRefresh,
  refreshMarketPrices,
  refreshCostIndices
};
