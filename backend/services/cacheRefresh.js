/**
 * Background Cache Refresh Service
 * Periodically refreshes semi-static ESI data into SQLite
 *
 * Refresh schedule:
 * - Market prices: every 6 hours (changes daily)
 * - Jita prices: every 6 hours (min sell / max buy from The Forge)
 * - System cost indices: every 6 hours (changes daily)
 * - SDE data: once on startup (never change)
 */

const axios = require('axios');
const db = require('../database/db');
const { importSDE } = require('./sdeImport');

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

// ===== JITA PRICES (min sell / max buy) =====
const JITA_STATION_ID = 60003760;
const FORGE_REGION_ID = 10000002;

async function refreshJitaPrices() {
  try {
    console.log('[CACHE] Refreshing Jita prices...');

    // Fetch ALL orders in The Forge region (paginated)
    const allOrders = [];
    let page = 1;
    while (true) {
      const response = await axios.get(`${ESI_BASE}/markets/${FORGE_REGION_ID}/orders/`, {
        params: { datasource: DS, order_type: 'all', page },
        timeout: 30000
      });
      const orders = response.data || [];
      if (orders.length === 0) break;
      // Filter to Jita station only
      const jitaOrders = orders.filter(o => o.location_id === JITA_STATION_ID);
      allOrders.push(...jitaOrders);
      if (orders.length < 1000) break;
      page++;
    }

    console.log(`[CACHE] Fetched ${page} pages, ${allOrders.length} Jita orders`);

    // Compute min sell and max buy per type
    const priceMap = {};
    for (const order of allOrders) {
      if (!priceMap[order.type_id]) {
        priceMap[order.type_id] = { sell_min: Infinity, buy_max: 0, sell_volume: 0, buy_volume: 0 };
      }
      const entry = priceMap[order.type_id];
      if (order.is_buy_order) {
        if (order.price > entry.buy_max) entry.buy_max = order.price;
        entry.buy_volume += order.volume_remain;
      } else {
        if (order.price < entry.sell_min) entry.sell_min = order.price;
        entry.sell_volume += order.volume_remain;
      }
    }

    // Convert to array and fix Infinity
    const prices = Object.entries(priceMap).map(([typeId, p]) => ({
      type_id: parseInt(typeId),
      sell_min: p.sell_min === Infinity ? 0 : p.sell_min,
      buy_max: p.buy_max,
      sell_volume: p.sell_volume,
      buy_volume: p.buy_volume,
    }));

    if (prices.length > 0) {
      const count = db.setJitaPrices(prices);
      console.log(`[CACHE] Jita prices: ${count} types cached`);
    }
    return prices.length;
  } catch (error) {
    console.error('[CACHE] Failed to refresh Jita prices:', error.message);
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
    // SDE import — downloads full EVE universe data on first run
    await importSDE();

    // Semi-static data (refreshed every cycle)
    await refreshMarketPrices();
    await refreshJitaPrices();
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
