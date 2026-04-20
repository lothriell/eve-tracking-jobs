/**
 * Type Metadata Resolver
 * Lazily resolves group_id / category_id for EVE type IDs via ESI,
 * caching results in the type_metadata table.
 *
 * Used by corp job archival to denormalize group/category onto job rows
 * so we can aggregate "30 heavy cruisers, 12 carriers" without repeat lookups.
 */

const axios = require('axios');
const db = require('../database/db');

const ESI_BASE = 'https://esi.evetech.net/latest';
const DS = 'tranquility';

// In-process promise dedup so concurrent archive runs don't hammer ESI
const inflightTypes = new Map();
const inflightGroups = new Map();

async function fetchType(typeId) {
  if (inflightTypes.has(typeId)) return inflightTypes.get(typeId);
  const p = (async () => {
    try {
      const res = await axios.get(`${ESI_BASE}/universe/types/${typeId}/`, {
        params: { datasource: DS }, timeout: 15000,
      });
      return res.data;
    } catch (err) {
      console.warn(`[TYPE-META] Failed to fetch type ${typeId}: ${err.message}`);
      return null;
    } finally {
      inflightTypes.delete(typeId);
    }
  })();
  inflightTypes.set(typeId, p);
  return p;
}

async function fetchGroup(groupId) {
  if (inflightGroups.has(groupId)) return inflightGroups.get(groupId);
  const p = (async () => {
    try {
      const res = await axios.get(`${ESI_BASE}/universe/groups/${groupId}/`, {
        params: { datasource: DS }, timeout: 15000,
      });
      return res.data;
    } catch (err) {
      console.warn(`[TYPE-META] Failed to fetch group ${groupId}: ${err.message}`);
      return null;
    } finally {
      inflightGroups.delete(groupId);
    }
  })();
  inflightGroups.set(groupId, p);
  return p;
}

async function fetchCategoryName(categoryId) {
  try {
    const res = await axios.get(`${ESI_BASE}/universe/categories/${categoryId}/`, {
      params: { datasource: DS }, timeout: 15000,
    });
    return res.data?.name || null;
  } catch (err) {
    console.warn(`[TYPE-META] Failed to fetch category ${categoryId}: ${err.message}`);
    return null;
  }
}

/**
 * Resolve metadata for a batch of type IDs. Reads from cache first; fetches
 * missing ones from ESI (with gentle pacing) and writes them back.
 *
 * @param {number[]} typeIds
 * @returns {Promise<Object<number, {type_id, group_id, category_id, group_name, category_name}>>}
 */
async function resolveTypeMetadata(typeIds) {
  if (!typeIds || typeIds.length === 0) return {};
  const unique = [...new Set(typeIds.filter(Boolean))];

  const cached = db.getTypeMetadataBatch(unique);
  const missing = unique.filter(id => !cached[id]);

  if (missing.length === 0) return cached;

  const categoryCache = new Map();
  const newEntries = [];

  for (const typeId of missing) {
    const type = await fetchType(typeId);
    if (!type) {
      newEntries.push({ type_id: typeId, group_id: null, category_id: null, group_name: null, category_name: null });
      continue;
    }
    const groupId = type.group_id;
    let categoryId = null;
    let groupName = null;
    let categoryName = null;

    if (groupId) {
      const group = await fetchGroup(groupId);
      if (group) {
        groupName = group.name;
        categoryId = group.category_id;
      }
    }
    if (categoryId) {
      if (categoryCache.has(categoryId)) {
        categoryName = categoryCache.get(categoryId);
      } else {
        categoryName = await fetchCategoryName(categoryId);
        categoryCache.set(categoryId, categoryName);
      }
    }

    newEntries.push({
      type_id: typeId,
      group_id: groupId || null,
      category_id: categoryId || null,
      group_name: groupName || null,
      category_name: categoryName || null,
    });
  }

  if (newEntries.length > 0) {
    db.setTypeMetadata(newEntries);
    for (const e of newEntries) cached[e.type_id] = e;
  }

  return cached;
}

module.exports = { resolveTypeMetadata };
