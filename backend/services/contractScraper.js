/**
 * Public contract scraper — indexes BPC offers in The Forge.
 *
 * Two-pass scrape (see runScrape):
 *   1. List all public contracts in the region (paginated, cheap).
 *   2. For each *new* contract_id, fetch its items to find BPCs.
 *
 * Contract items are immutable per contract_id, so we only fetch items
 * for contracts we haven't seen before — after the first full scrape,
 * subsequent runs are ~O(new contracts), not O(all contracts).
 *
 * Filters applied during scrape:
 *   - type === 'item_exchange' (skip auction / courier)
 *   - price > 0 (skip private trades / zero-price listings)
 *   - date_expired > now
 *   - items.length === 1 (skip bundles — per-BP price ambiguous)
 *   - items[0].is_blueprint_copy === true
 *
 * Known limits:
 *   - Category filter (ships only) is applied at QUERY time, not scrape
 *     time, so we can later expand to non-ship BPCs without a reindex.
 *   - A contract modified on ESI's side (price change) won't be
 *     re-fetched until the contract_id rolls. In practice EVE contracts
 *     are immutable after creation.
 */

const axios = require('./httpClient');
const db = require('../database/db');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DS = 'tranquility';
const FORGE_REGION_ID = 10000002;

// ESI rate limit is ~20 req/s globally; we stay conservative here to
// co-exist with hub price refresh. 10 req/s → ~100ms between calls.
const ITEM_REQUEST_MIN_INTERVAL_MS = 100;
let lastItemRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = ITEM_REQUEST_MIN_INTERVAL_MS - (now - lastItemRequestAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastItemRequestAt = Date.now();
}

async function fetchAllPublicContracts(regionId) {
  const contracts = [];
  let page = 1;
  while (true) {
    await throttle();
    try {
      const resp = await axios.get(`${ESI_BASE}/contracts/public/${regionId}/`, {
        params: { datasource: DS, page },
        timeout: 30000,
      });
      const batch = resp.data || [];
      if (batch.length === 0) break;
      contracts.push(...batch);
      const totalPages = parseInt(resp.headers['x-pages'] || '1', 10);
      if (page >= totalPages) break;
      page++;
    } catch (err) {
      if (err.response?.status === 304) break;
      throw err;
    }
  }
  return contracts;
}

async function fetchContractItems(contractId) {
  await throttle();
  try {
    const resp = await axios.get(`${ESI_BASE}/contracts/public/items/${contractId}/`, {
      params: { datasource: DS },
      timeout: 20000,
    });
    return resp.data || [];
  } catch (err) {
    // 404 = contract no longer available. Treat as "gone" — caller skips.
    if (err.response?.status === 404) return null;
    throw err;
  }
}

async function runScrape() {
  const regionId = FORGE_REGION_ID;
  const startedAt = new Date().toISOString();
  console.log('[CONTRACTS] === Starting scrape for The Forge ===');

  try {
    db.setContractScraperState(regionId, { status: 'fetching_contracts' });

    const allContracts = await fetchAllPublicContracts(regionId);
    console.log(`[CONTRACTS] Fetched ${allContracts.length} public contracts`);

    // Apply quick scalar filters before the expensive per-contract items call.
    const now = Date.now();
    const candidate = allContracts.filter(c => {
      if (c.type !== 'item_exchange') return false;
      if (!c.price || c.price <= 0) return false;
      if (c.date_expired && new Date(c.date_expired).getTime() <= now) return false;
      return true;
    });
    console.log(`[CONTRACTS] ${candidate.length} item_exchange candidates after scalar filters`);

    // Skip contracts we've already indexed — contract items are immutable
    // per contract_id so there's no need to re-fetch.
    const known = db.getKnownContractIds();
    const live = new Set(candidate.map(c => c.contract_id));
    const newContracts = candidate.filter(c => !known.has(c.contract_id));
    console.log(`[CONTRACTS] ${newContracts.length} new contracts to fetch items for (${known.size} already known)`);

    db.setContractScraperState(regionId, {
      status: 'fetching_items',
      contracts_seen: candidate.length,
    });

    // Per-contract items fetch (the expensive loop).
    const offers = [];
    let fetched = 0, skipped = 0, errored = 0;

    for (const contract of newContracts) {
      try {
        const items = await fetchContractItems(contract.contract_id);
        if (items === null) { skipped++; continue; }

        // Bundle filter: single-item contracts only.
        if (items.length !== 1) { skipped++; continue; }
        const item = items[0];
        if (!item.is_blueprint_copy) { skipped++; continue; }
        if (!item.type_id) { skipped++; continue; }

        offers.push({
          contract_id: contract.contract_id,
          type_id: item.type_id,
          price: contract.price,
          // BPC runs/ME/TE live on the item, not the contract.
          runs: item.runs_remaining || item.runs || 1,
          material_efficiency: item.material_efficiency || 0,
          time_efficiency: item.time_efficiency || 0,
          issuer_id: contract.issuer_id,
          issuer_corp_id: contract.issuer_corporation_id,
          location_id: contract.end_location_id,
          start_location_id: contract.start_location_id,
          date_issued: contract.date_issued,
          date_expired: contract.date_expired,
        });
        fetched++;

        // Batch-insert every 100 offers to keep memory low + provide
        // progress visibility.
        if (offers.length >= 100) {
          db.batchUpsertContractBpcOffers(offers.splice(0));
        }
      } catch (err) {
        errored++;
        if (errored <= 5) {
          console.warn(`[CONTRACTS] Item fetch failed for contract ${contract.contract_id}: ${err.message}`);
        }
      }
    }

    // Flush remaining offers.
    if (offers.length > 0) db.batchUpsertContractBpcOffers(offers);

    // Prune contracts that have rolled off ESI's public feed (closed /
    // bought out / expired) plus any locally-expired rows.
    const prunedGone = db.pruneGoneContractOffers(live);
    const prunedExpired = db.pruneExpiredContractOffers();

    // Summary row count.
    const countRow = db.db.prepare('SELECT COUNT(*) as n FROM contract_bpc_offers').get();

    db.setContractScraperState(regionId, {
      last_full_scrape: known.size === 0 ? startedAt : null,
      last_incremental: known.size > 0 ? startedAt : null,
      contracts_seen: candidate.length,
      bpc_offers_stored: countRow.n,
      status: 'ok',
      error: null,
    });

    console.log(`[CONTRACTS] === Scrape complete ===`);
    console.log(`[CONTRACTS]   new BPC offers: ${fetched}, skipped: ${skipped}, errors: ${errored}`);
    console.log(`[CONTRACTS]   pruned gone: ${prunedGone}, pruned expired: ${prunedExpired}`);
    console.log(`[CONTRACTS]   total BPC offers in DB: ${countRow.n}`);

    return { fetched, skipped, errored, prunedGone, prunedExpired, total: countRow.n };
  } catch (err) {
    console.error('[CONTRACTS] Scrape failed:', err.message);
    db.setContractScraperState(regionId, { status: 'error', error: err.message });
    throw err;
  }
}

module.exports = {
  runScrape,
  FORGE_REGION_ID,
};
