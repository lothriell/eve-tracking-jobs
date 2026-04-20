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
const corpJobArchive = require('./corpJobArchive');
const characterJobArchive = require('./characterJobArchive');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DS = 'tranquility';

let refreshTimer = null;
let hubRefreshTimer = null;
let corpArchiveTimer = null;
let characterArchiveTimer = null;
let isRefreshing = false;
let isHubRefreshing = false;

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

// ===== HUB PRICES (multi-hub, configurable) =====

async function refreshHubPrices() {
  try {
    const hubs = db.getAllEnabledHubs();
    if (hubs.length === 0) {
      console.log('[CACHE] No trade hubs configured, skipping hub price refresh');
      return 0;
    }

    console.log(`[CACHE] Refreshing hub prices for ${hubs.length} stations...`);

    // Group hubs by region to avoid fetching the same region twice
    const regionMap = {};
    for (const hub of hubs) {
      if (!regionMap[hub.region_id]) regionMap[hub.region_id] = [];
      regionMap[hub.region_id].push(hub);
    }

    let totalTypes = 0;
    const regionIds = Object.keys(regionMap);

    for (let r = 0; r < regionIds.length; r++) {
      const regionId = regionIds[r];
      const hubsInRegion = regionMap[regionId];
      const stationIds = new Set(hubsInRegion.map(h => h.station_id));
      const hubNames = hubsInRegion.map(h => h.name).join(', ');

      try {
        console.log(`[CACHE]   Region ${regionId} (${hubNames}): fetching orders...`);

        // Fetch all orders in region (paginated)
        const allOrders = [];
        let page = 1;
        while (true) {
          const response = await axios.get(`${ESI_BASE}/markets/${regionId}/orders/`, {
            params: { datasource: DS, order_type: 'all', page },
            timeout: 30000
          });
          const orders = response.data || [];
          if (orders.length === 0) break;

          // Filter to only our hub stations
          const hubOrders = orders.filter(o => stationIds.has(o.location_id));
          allOrders.push(...hubOrders);

          if (orders.length < 1000) break;
          page++;
        }

        console.log(`[CACHE]   Region ${regionId}: ${page} pages, ${allOrders.length} hub orders`);

        // Aggregate per station per type
        const stationPrices = {}; // station_id -> type_id -> { sell_min, buy_max, ... }
        for (const sid of stationIds) {
          stationPrices[sid] = {};
        }

        for (const order of allOrders) {
          const sid = order.location_id;
          if (!stationPrices[sid]) continue;

          if (!stationPrices[sid][order.type_id]) {
            stationPrices[sid][order.type_id] = {
              sell_min: Infinity, buy_max: 0,
              sell_volume: 0, buy_volume: 0,
              sell_order_count: 0, buy_order_count: 0
            };
          }

          const entry = stationPrices[sid][order.type_id];
          if (order.is_buy_order) {
            if (order.price > entry.buy_max) entry.buy_max = order.price;
            entry.buy_volume += order.volume_remain;
            entry.buy_order_count++;
          } else {
            if (order.price < entry.sell_min) entry.sell_min = order.price;
            entry.sell_volume += order.volume_remain;
            entry.sell_order_count++;
          }
        }

        // Store per station
        for (const hub of hubsInRegion) {
          const priceMap = stationPrices[hub.station_id] || {};
          const prices = Object.entries(priceMap).map(([typeId, p]) => ({
            type_id: parseInt(typeId),
            sell_min: p.sell_min === Infinity ? 0 : p.sell_min,
            buy_max: p.buy_max,
            sell_volume: p.sell_volume,
            buy_volume: p.buy_volume,
            sell_order_count: p.sell_order_count,
            buy_order_count: p.buy_order_count,
          }));

          if (prices.length > 0) {
            const count = db.setHubPrices(hub.station_id, prices);
            // One-per-day history snapshot for price-trend charts. INSERT
            // OR IGNORE keeps day-1 and no-ops subsequent same-day refreshes.
            const snapshotted = db.snapshotHubPrices(hub.station_id);
            if (snapshotted > 0) {
              console.log(`[CACHE]   ${hub.name}: ${count} types cached, ${snapshotted} daily history rows`);
            } else {
              console.log(`[CACHE]   ${hub.name}: ${count} types cached`);
            }
            totalTypes += count;
          }

          db.setHubRefreshStatus(hub.station_id, hub.region_id, {
            pageCount: page, orderCount: allOrders.length, status: 'ok'
          });
        }
      } catch (error) {
        console.error(`[CACHE]   Region ${regionId} failed: ${error.message}`);
        for (const hub of hubsInRegion) {
          db.setHubRefreshStatus(hub.station_id, hub.region_id, {
            status: 'error', error: error.message
          });
        }
      }

      // Stagger 2s between regions to be kind to ESI
      if (r < regionIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[CACHE] Hub prices complete: ${totalTypes} total types across ${hubs.length} stations`);
    return totalTypes;
  } catch (error) {
    console.error('[CACHE] Failed to refresh hub prices:', error.message);
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

    // Multi-hub prices (also refreshed on separate 30-min timer)
    await refreshHubPrices();

    // Prune old hub price history (keep 180 days by default)
    try {
      const pruned = db.pruneHubPriceHistory(180);
      if (pruned > 0) console.log(`[CACHE] Pruned ${pruned} hub price history rows older than 180 days`);
    } catch (err) {
      console.error('[CACHE] Prune hub price history failed:', err.message);
    }

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

// ===== HUB PRICE REFRESH (30-min cycle) =====
async function runHubRefresh() {
  if (isHubRefreshing || isRefreshing) {
    console.log('[CACHE] Hub refresh skipped (another refresh in progress)');
    return;
  }
  isHubRefreshing = true;
  try {
    const start = Date.now();
    await refreshHubPrices();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[CACHE] Hub price refresh complete in ${elapsed}s`);
  } catch (error) {
    console.error('[CACHE] Hub refresh error:', error.message);
  } finally {
    isHubRefreshing = false;
  }
}

// ===== CORP JOB ARCHIVE (15-min cycle) =====
async function runCorpArchive() {
  try {
    await corpJobArchive.runArchive();
  } catch (error) {
    console.error('[CACHE] Corp archive error:', error.message);
  }
}

async function runCharacterArchive() {
  try {
    await characterJobArchive.runArchive();
  } catch (error) {
    console.error('[CACHE] Character archive error:', error.message);
  }
}

// ===== SCHEDULER =====
function startCacheRefresh() {
  // Run immediately on startup
  setTimeout(() => runFullRefresh(), 5000); // 5s delay to let DB initialize
  setTimeout(() => runCorpArchive(), 20000); // first corp archive 20s in
  setTimeout(() => runCharacterArchive(), 40000); // personal archive 40s in

  // Full refresh every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  refreshTimer = setInterval(() => runFullRefresh(), SIX_HOURS);

  // Hub prices refresh every 30 minutes (market data is time-sensitive for trading)
  const THIRTY_MIN = 30 * 60 * 1000;
  hubRefreshTimer = setInterval(() => runHubRefresh(), THIRTY_MIN);

  // Corp and character job archives every 15 minutes. ESI retains completed
  // jobs ~30 days, so polling often keeps us well inside the window.
  const FIFTEEN_MIN = 15 * 60 * 1000;
  corpArchiveTimer = setInterval(() => runCorpArchive(), FIFTEEN_MIN);
  characterArchiveTimer = setInterval(() => runCharacterArchive(), FIFTEEN_MIN);

  console.log('[CACHE] Background refresh scheduled (full: 6h, hub prices: 30m, corp + char archives: 15m)');
}

function stopCacheRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (hubRefreshTimer) {
    clearInterval(hubRefreshTimer);
    hubRefreshTimer = null;
  }
  if (corpArchiveTimer) {
    clearInterval(corpArchiveTimer);
    corpArchiveTimer = null;
  }
  if (characterArchiveTimer) {
    clearInterval(characterArchiveTimer);
    characterArchiveTimer = null;
  }
}

module.exports = {
  startCacheRefresh,
  stopCacheRefresh,
  runFullRefresh,
  refreshMarketPrices,
  refreshCostIndices,
  refreshHubPrices,
  runHubRefresh,
  runCorpArchive,
  runCharacterArchive,
};
