/**
 * Inventory service — unified "what does source X have at location L"
 * abstraction for the Production Planner.
 *
 * Source modes:
 *   - personal: a single character's assets + blueprints
 *   - corp:     a corporation's assets + blueprints (requires a linked
 *               character with Director / Accountant / Station_Manager role)
 *
 * Fetches are cached in-memory for 15 minutes so the planner can re-compute
 * the tree many times without thrashing ESI (~5-10k rows per call).
 */

const db = require('../database/db');
const { getValidAccessToken } = require('./tokenRefresh');
const {
  getCharacterAssets,
  getCorporationAssets,
  getCharacterBlueprints,
  getCorporationBlueprints,
} = require('./esiClient');
const {
  getCharacterCorporation,
  getCorporationInfo,
  getCharacterRoles,
  hasCorporationAssetRole,
} = require('./corporationService');

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map(); // key → { expires, data }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { cache.delete(key); return null; }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve an inventory source description into a concrete
 * { tokenCharacterId, tokenAccessToken, corpId|null } tuple.
 *
 * mode=personal: sourceId is character_id (must be linked to user_id)
 * mode=corp:     sourceId is corporation_id. We pick whichever linked
 *                character in that corp has an asset-reading role.
 */
async function resolveSourceToken({ userId, mode, sourceId }) {
  const chars = db.getAllCharactersByUserId(userId);

  if (mode === 'personal') {
    const ch = chars.find(c => c.character_id === Number(sourceId));
    if (!ch) return { error: 'Character not linked to your account' };
    const token = await getValidAccessToken(ch);
    return { character: ch, token, corpId: null };
  }

  if (mode === 'corp') {
    const corpId = Number(sourceId);
    // Cached per-character corp lookups save ESI calls on repeat requests
    for (const ch of chars) {
      try {
        const token = await getValidAccessToken(ch);
        const corpKey = `char-corp:${ch.character_id}`;
        let corp = cacheGet(corpKey);
        if (!corp) {
          corp = await getCharacterCorporation(ch.character_id, token);
          cacheSet(corpKey, corp);
        }
        if (corp?.corporation_id !== corpId) continue;
        const rolesKey = `char-roles:${ch.character_id}`;
        let roles = cacheGet(rolesKey);
        if (!roles) {
          roles = await getCharacterRoles(ch.character_id, token);
          cacheSet(rolesKey, roles);
        }
        if (!hasCorporationAssetRole(roles)) continue;
        return { character: ch, token, corpId };
      } catch (err) {
        continue; // try the next character
      }
    }
    return { error: 'No linked character has asset-read role in this corp' };
  }

  return { error: 'Unknown mode' };
}

/**
 * Build a list of all inventory "contexts" (dropdown options) for a user.
 *
 * Returns:
 *   {
 *     personal: [ { character_id, character_name } ],
 *     corps:    [ { corporation_id, name, role_holder_character_id | null, ticker } ]
 *   }
 */
async function getContexts(userId) {
  const chars = db.getAllCharactersByUserId(userId);
  const personal = chars.map(c => ({
    character_id: c.character_id,
    character_name: c.character_name,
  }));

  // Map corpId → { corp info, role_holder_character_id }
  const corps = new Map();

  for (const ch of chars) {
    try {
      const token = await getValidAccessToken(ch);
      const corpKey = `char-corp:${ch.character_id}`;
      let corp = cacheGet(corpKey);
      if (!corp) {
        corp = await getCharacterCorporation(ch.character_id, token);
        cacheSet(corpKey, corp);
      }
      if (!corp?.corporation_id) continue;

      const corpId = corp.corporation_id;
      let entry = corps.get(corpId);
      if (!entry) {
        const infoKey = `corp-info:${corpId}`;
        let info = cacheGet(infoKey);
        if (!info) {
          info = await getCorporationInfo(corpId, token);
          cacheSet(infoKey, info);
        }
        entry = {
          corporation_id: corpId,
          name: info?.name || `Corporation ${corpId}`,
          ticker: info?.ticker || null,
          role_holder_character_id: null,
        };
        corps.set(corpId, entry);
      }

      if (entry.role_holder_character_id) continue; // already resolved

      const rolesKey = `char-roles:${ch.character_id}`;
      let roles = cacheGet(rolesKey);
      if (!roles) {
        roles = await getCharacterRoles(ch.character_id, token);
        cacheSet(rolesKey, roles);
      }
      if (hasCorporationAssetRole(roles)) {
        entry.role_holder_character_id = ch.character_id;
      }
    } catch (err) {
      console.warn(`[INVENTORY] getContexts: skipping character ${ch.character_id}: ${err.message}`);
    }
  }

  return {
    personal,
    corps: [...corps.values()],
  };
}

/**
 * Fetch raw assets + blueprints for the source.
 *
 * Returns `{ assets, blueprints }`. Cached 15 min per source key.
 */
async function fetchRawInventory({ userId, mode, sourceId }) {
  const key = `inv:${mode}:${sourceId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const src = await resolveSourceToken({ userId, mode, sourceId });
  if (src.error) return { error: src.error };

  let assets, bpRes;
  if (mode === 'personal') {
    [assets, bpRes] = await Promise.all([
      getCharacterAssets(src.character.character_id, src.token),
      getCharacterBlueprints(src.character.character_id, src.token),
    ]);
  } else {
    [assets, bpRes] = await Promise.all([
      getCorporationAssets(src.corpId, src.token),
      getCorporationBlueprints(src.corpId, src.token),
    ]);
  }

  const out = {
    assets: assets || [],
    blueprints: bpRes?.blueprints || [],
    hasBpScope: bpRes?.hasScope !== false,
  };
  cacheSet(key, out);
  return out;
}

/**
 * Walk an asset's parent chain (container → hangar → station/structure)
 * up to the root location_id. Handles `location_type: "item"` chains
 * where an asset's location_id is another asset's item_id (containers).
 */
function buildRootLocator(assets) {
  const byId = new Map();
  for (const a of assets) byId.set(a.item_id, a);
  return (locationId, locationType) => {
    let cur = { location_id: locationId, location_type: locationType };
    let hops = 0;
    while (cur && cur.location_type === 'item' && hops < 10) {
      const parent = byId.get(cur.location_id);
      if (!parent) return cur.location_id;
      cur = parent;
      hops++;
    }
    return cur.location_id;
  };
}

/**
 * Distinct root locations (station/structure) where the source has
 * assets, with asset counts. For the location dropdown.
 */
async function getLocations({ userId, mode, sourceId }) {
  const inv = await fetchRawInventory({ userId, mode, sourceId });
  if (inv.error) return { error: inv.error };

  const rootOf = buildRootLocator(inv.assets);
  const counts = new Map();
  for (const a of inv.assets) {
    const root = rootOf(a.location_id, a.location_type);
    counts.set(root, (counts.get(root) || 0) + 1);
  }

  // Resolve names from name_cache (station + structure)
  const ids = [...counts.keys()];
  if (ids.length === 0) return { locations: [] };
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.db.prepare(
    `SELECT id, name, category FROM name_cache
     WHERE id IN (${placeholders}) AND category IN ('station','structure','system','planet')`
  ).all(...ids);
  const nameById = new Map();
  for (const r of rows) nameById.set(r.id, { name: r.name, category: r.category });

  const locations = ids.map(id => ({
    location_id: id,
    name: nameById.get(id)?.name || `Location ${id}`,
    kind: nameById.get(id)?.category || 'unknown',
    asset_count: counts.get(id),
  })).sort((a, b) => b.asset_count - a.asset_count);

  return { locations };
}

/**
 * Count of each type_id currently held at `locationId`.
 *
 * Also returns the blueprint list filtered to that location (for BPC
 * coverage checks — we only count BPs physically sitting in the chosen
 * build location).
 */
async function getStockAtLocation({ userId, mode, sourceId, locationId }) {
  const inv = await fetchRawInventory({ userId, mode, sourceId });
  if (inv.error) return { error: inv.error };

  const rootOf = buildRootLocator(inv.assets);
  const byId = new Map();
  for (const a of inv.assets) byId.set(a.item_id, a);

  // Assets at this location
  const assetsHere = inv.assets.filter(a => rootOf(a.location_id, a.location_type) === Number(locationId));
  const typeCounts = {};
  for (const a of assetsHere) {
    typeCounts[a.type_id] = (typeCounts[a.type_id] || 0) + (a.quantity || 1);
  }

  // BPs at this location — item_id may appear in the asset list or directly
  // on the blueprint's location_id if it's not inside a container.
  const bpsHere = inv.blueprints.filter(bp => {
    const asAsset = byId.get(bp.item_id);
    if (asAsset) return rootOf(asAsset.location_id, asAsset.location_type) === Number(locationId);
    return bp.location_id === Number(locationId);
  });

  return {
    stock_by_type_id: typeCounts,
    blueprints: bpsHere,
    total_assets: assetsHere.length,
    hasBpScope: inv.hasBpScope,
  };
}

module.exports = {
  getContexts,
  getLocations,
  getStockAtLocation,
  buildRootLocator,
  // Exposed for admin/debugging
  _clearCache: () => cache.clear(),
};
