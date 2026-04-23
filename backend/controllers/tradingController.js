/**
 * Trading Controller
 * Access controlled via requireFeature('trading') middleware in api.js
 */

const db = require('../database/db');
const { getTypeNames, getCharacterSkills, getCharacterBlueprints } = require('../services/esiClient');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { calculateBrokerFee, calculateSalesTax, findTradeOpportunities } = require('../services/tradeCalculator');
const { scoreOpportunity, categoryRiskTag } = require('../services/baitScore');
const inventoryService = require('../services/inventoryService');

// Ensure default hubs exist for this user (lazy init)
function ensureHubsSeeded(req, res, next) {
  const hubs = db.getTradeHubs(req.session.userId);
  if (hubs.length === 0) {
    db.seedDefaultHubsForUser(req.session.userId);
  }
  next();
}

// ===== HUB MANAGEMENT =====

async function getHubs(req, res) {
  try {
    const hubs = db.getTradeHubs(req.session.userId);
    const stationIds = hubs.map(h => h.station_id);
    const refreshStatuses = stationIds.length > 0 ? db.getHubRefreshStatuses(stationIds) : {};

    const result = hubs.map(h => ({
      ...h,
      refresh: refreshStatuses[h.station_id] || { status: 'pending', last_refresh_at: null }
    }));

    res.json({ hubs: result });
  } catch (error) {
    console.error('Get hubs error:', error.message);
    res.status(500).json({ error: 'Failed to get trade hubs' });
  }
}

async function addHub(req, res) {
  try {
    const { name, stationId, regionId } = req.body;
    if (!name || !stationId || !regionId) {
      return res.status(400).json({ error: 'name, stationId, and regionId are required' });
    }

    const isStructure = stationId > 1000000000000 ? 1 : 0;

    try {
      const id = db.addTradeHub(req.session.userId, name, parseInt(stationId), parseInt(regionId), isStructure);
      res.json({ success: true, id });
    } catch (e) {
      if (e.message.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'This station is already in your hub list' });
      }
      throw e;
    }
  } catch (error) {
    console.error('Add hub error:', error.message);
    res.status(500).json({ error: 'Failed to add trade hub' });
  }
}

async function removeHub(req, res) {
  try {
    const hubId = parseInt(req.params.hubId);
    const changes = db.removeTradeHub(hubId, req.session.userId);
    if (changes === 0) {
      return res.status(404).json({ error: 'Hub not found or not owned by you' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Remove hub error:', error.message);
    res.status(500).json({ error: 'Failed to remove trade hub' });
  }
}

async function toggleHub(req, res) {
  try {
    const hubId = parseInt(req.params.hubId);
    const { enabled } = req.body;
    if (enabled === undefined) {
      return res.status(400).json({ error: 'enabled field is required' });
    }
    const changes = db.setHubEnabled(hubId, req.session.userId, enabled);
    if (changes === 0) {
      return res.status(404).json({ error: 'Hub not found or not owned by you' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle hub error:', error.message);
    res.status(500).json({ error: 'Failed to toggle trade hub' });
  }
}

// ===== PRICE COMPARISON =====

async function compareItem(req, res) {
  try {
    const typeId = parseInt(req.params.typeId);
    if (!typeId) return res.status(400).json({ error: 'typeId is required' });

    const hubs = db.getEnabledTradeHubs(req.session.userId);
    const stationIds = hubs.map(h => h.station_id);

    const prices = stationIds.length > 0 ? db.getHubPricesForType(typeId, stationIds) : {};
    const refreshStatuses = stationIds.length > 0 ? db.getHubRefreshStatuses(stationIds) : {};

    // Resolve type name
    const typeNames = await getTypeNames([typeId]);

    const comparison = hubs.map(h => ({
      hub_id: h.id,
      hub_name: h.name,
      station_id: h.station_id,
      ...(prices[h.station_id] || { sell_min: 0, buy_max: 0, sell_volume: 0, buy_volume: 0 }),
      refresh: refreshStatuses[h.station_id] || { status: 'pending' }
    }));

    res.json({
      type_id: typeId,
      type_name: typeNames[typeId] || `Type ${typeId}`,
      hubs: comparison
    });
  } catch (error) {
    console.error('Compare item error:', error.message);
    res.status(500).json({ error: 'Failed to compare item' });
  }
}

async function inventoryContexts(req, res) {
  try {
    const data = await inventoryService.getContexts(req.session.userId);
    res.json(data);
  } catch (error) {
    console.error('Inventory contexts error:', error.message);
    res.status(500).json({ error: 'Failed to load inventory contexts' });
  }
}

async function inventoryLocations(req, res) {
  try {
    const mode = req.query.mode === 'corp' ? 'corp' : 'personal';
    const sourceId = parseInt(req.query.sourceId);
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });

    const data = await inventoryService.getLocations({
      userId: req.session.userId,
      mode,
      sourceId,
    });
    if (data.error) return res.status(403).json({ error: data.error });
    res.json(data);
  } catch (error) {
    console.error('Inventory locations error:', error.message);
    res.status(500).json({ error: 'Failed to load inventory locations' });
  }
}

async function bpContracts(req, res) {
  try {
    const typeId = parseInt(req.params.typeId || req.query.type_id);
    if (!typeId) return res.status(400).json({ error: 'type_id is required' });

    const summary = db.queryContractBpcSummary(typeId);
    const offers = db.queryContractBpcOffers(typeId, 50);
    const state = db.getContractScraperState(10000002);

    res.json({
      type_id: typeId,
      summary: summary || null,
      offers,
      scraper: state || null,
    });
  } catch (error) {
    console.error('BP contracts error:', error.message);
    res.status(500).json({ error: 'Failed to load BP contracts' });
  }
}

async function priceHistory(req, res) {
  try {
    const typeId = parseInt(req.query.type_id);
    const stationId = parseInt(req.query.station_id);
    const days = Math.min(Math.max(parseInt(req.query.days) || 90, 1), 365);
    if (!typeId || !stationId) return res.status(400).json({ error: 'type_id and station_id are required' });

    // Confirm the station is actually one of the user's enabled hubs — we
    // don't want to leak arbitrary station history through this endpoint.
    const userHubs = db.getEnabledTradeHubs(req.session.userId);
    if (!userHubs.some(h => h.station_id === stationId)) {
      return res.status(403).json({ error: 'Not a hub you have access to' });
    }

    const rows = db.queryHubPriceHistory(typeId, stationId, days);
    res.json({ type_id: typeId, station_id: stationId, days, rows });
  } catch (error) {
    console.error('Price history error:', error.message);
    res.status(500).json({ error: 'Failed to load price history' });
  }
}

// ===== TRADE FINDER =====

async function findTrades(req, res) {
  try {
    const sourceHubId = parseInt(req.query.source);
    const destHubId = req.query.dest === 'all' ? 'all' : parseInt(req.query.dest);
    const tradeType = req.query.type === 'A' ? 'A' : 'B';

    if (!sourceHubId) return res.status(400).json({ error: 'source hub is required' });
    if (!destHubId) return res.status(400).json({ error: 'dest hub is required' });

    // Verify hub ownership
    const sourceHub = db.getTradeHub(sourceHubId, req.session.userId);
    if (!sourceHub) return res.status(404).json({ error: 'Source hub not found' });

    const filters = {
      minROI: parseFloat(req.query.minROI) || 0,
      maxROI: parseFloat(req.query.maxROI) || 0,
      minProfit: parseFloat(req.query.minProfit) || 0,
      maxPrice: parseFloat(req.query.maxPrice) || 0,
      minVolume: parseInt(req.query.minVolume) || 0,
      limit: Math.min(parseInt(req.query.limit) || 100, 500),
    };

    // Get trade settings for fee calculation — support separate buyer/seller characters
    const buyerCharId = parseInt(req.query.buyerCharId) || parseInt(req.query.characterId) || null;
    const sellerCharId = parseInt(req.query.sellerCharId) || buyerCharId;

    const buyerSettings = buyerCharId ? db.getTradeSettings(buyerCharId) : null;
    const sellerSettings = sellerCharId ? db.getTradeSettings(sellerCharId) : null;

    const buyBrokerFee = buyerSettings
      ? calculateBrokerFee(buyerSettings.broker_relations_level, buyerSettings.advanced_broker_level, buyerSettings.faction_standing, buyerSettings.corp_standing)
      : 3.0;
    const sellBrokerFee = sellerSettings
      ? calculateBrokerFee(sellerSettings.broker_relations_level, sellerSettings.advanced_broker_level, sellerSettings.faction_standing, sellerSettings.corp_standing)
      : 3.0;
    const sellSalesTax = sellerSettings ? calculateSalesTax(sellerSettings.accounting_level) : 3.6;

    // Load source hub prices (all types)
    const sourcePricesRaw = db.getHubPrices(sourceHub.station_id, null);
    // getHubPrices with null typeIds won't work — need a method to get all prices for a station
    // Use a direct query instead
    const allSourcePrices = db.db.prepare(
      // 6-hour freshness filter — hub_prices refreshes every 30 min; anything
      // older than 12 refresh cycles is broken and shouldn't produce a trade
      // recommendation (defense in depth on top of the prune in cacheRefresh).
      "SELECT type_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count FROM hub_prices WHERE station_id = ? AND updated_at >= datetime('now', '-6 hours')"
    ).all(sourceHub.station_id);
    const sourcePrices = {};
    for (const row of allSourcePrices) {
      sourcePrices[row.type_id] = row;
    }

    // Determine destination hubs
    let destHubs;
    if (destHubId === 'all') {
      destHubs = db.getEnabledTradeHubs(req.session.userId).filter(h => h.id !== sourceHubId);
    } else {
      const dHub = db.getTradeHub(destHubId, req.session.userId);
      if (!dHub) return res.status(404).json({ error: 'Destination hub not found' });
      destHubs = [dHub];
    }

    // Find opportunities for each destination
    let allOpportunities = [];
    for (const dHub of destHubs) {
      const allDestPrices = db.db.prepare(
        // 6-hour freshness filter — hub_prices refreshes every 30 min; anything
      // older than 12 refresh cycles is broken and shouldn't produce a trade
      // recommendation (defense in depth on top of the prune in cacheRefresh).
      "SELECT type_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count FROM hub_prices WHERE station_id = ? AND updated_at >= datetime('now', '-6 hours')"
      ).all(dHub.station_id);
      const destPrices = {};
      for (const row of allDestPrices) {
        destPrices[row.type_id] = row;
      }

      const opps = findTradeOpportunities(sourcePrices, destPrices, { buyBrokerFee, sellBrokerFee, sellSalesTax }, tradeType, filters);
      // Tag with destination hub info
      for (const opp of opps) {
        opp.dest_hub_id = dHub.id;
        opp.dest_hub_name = dHub.name;
      }
      allOpportunities.push(...opps);
    }

    // Re-sort combined results and over-fetch (we may filter skins, etc.)
    allOpportunities.sort((a, b) => b.roi - a.roi);
    const overFetchLimit = Math.min(filters.limit * 4, 2000);
    allOpportunities = allOpportunities.slice(0, overFetchLimit);

    // Resolve type names + volumes (m³ packaged) in batch from name_cache.
    // Volume lives in extra_data for category 'type'; default 0.01 for unknowns.
    const typeIds = [...new Set(allOpportunities.map(o => o.type_id))];
    const typeNames = typeIds.length > 0 ? await getTypeNames(typeIds) : {};
    const volumeRows = typeIds.length > 0 ? db.db.prepare(
      `SELECT id, extra_data FROM name_cache WHERE category = 'type' AND id IN (${typeIds.map(() => '?').join(',')})`
    ).all(...typeIds) : [];
    const volumes = {};
    for (const row of volumeRows) {
      volumes[row.id] = row.extra_data ? parseFloat(row.extra_data) : 0.01;
    }

    // 30-day average sell_min at source — used for decimal/anomaly detection.
    // AVG instead of MEDIAN keeps it to a single SQL aggregate; for a 10×
    // outlier check the difference is immaterial. Empty until enough days
    // accrue (hub_price_history started 2026-04-20).
    const histRows = typeIds.length > 0 ? db.db.prepare(
      `SELECT type_id, AVG(sell_min) as avg30 FROM hub_price_history
       WHERE station_id = ? AND capture_date >= date('now', '-30 days') AND sell_min > 0
       AND type_id IN (${typeIds.map(() => '?').join(',')})
       GROUP BY type_id`
    ).all(sourceHub.station_id, ...typeIds) : [];
    const sourceMedianMap = {};
    for (const row of histRows) sourceMedianMap[row.type_id] = row.avg30;

    // Pre-compute per-dest-hub structure status for the ACL-lockout flag.
    const destStructureMap = new Map();
    for (const dHub of destHubs) {
      destStructureMap.set(dHub.id, dHub.station_id > 1_000_000_000_000);
    }

    const includeJunk = String(req.query.includeSkins || req.query.includeJunk || '').toLowerCase() === 'true';
    const intendedQty = parseInt(req.query.intendedQty) || 100;

    const enriched = [];
    for (const o of allOpportunities) {
      o.type_name = typeNames[o.type_id] || `Type ${o.type_id}`;
      o.volume_m3 = volumes[o.type_id] || 0.01;
      o.profit_per_m3 = o.volume_m3 > 0 ? Math.round(o.net_profit / o.volume_m3) : 0;
      o.category_risk_tag = categoryRiskTag(o.type_name);

      // Junk filter — drop SKINs and "Expired …" event leftovers by default
      if (!includeJunk && (o.category_risk_tag === 'skin' || o.category_risk_tag === 'expired')) continue;

      const { risk_level, reasons } = scoreOpportunity(o, {
        sourceMedian30d: sourceMedianMap[o.type_id] || null,
        destStationIsStructure: destStructureMap.get(o.dest_hub_id) || false,
        intendedQty,
      });
      o.risk_level = risk_level;
      o.risk_reasons = reasons;

      enriched.push(o);
      if (enriched.length >= filters.limit) break;
    }

    res.json({
      source_hub: { id: sourceHub.id, name: sourceHub.name },
      trade_type: tradeType,
      buy_broker_fee_pct: buyBrokerFee,
      sell_broker_fee_pct: sellBrokerFee,
      sales_tax_pct: sellSalesTax,
      filters: { ...filters, includeJunk, intendedQty },
      total: enriched.length,
      opportunities: enriched
    });
  } catch (error) {
    console.error('Find trades error:', error.message);
    res.status(500).json({ error: 'Failed to find trade opportunities' });
  }
}

// ===== TRADE SETTINGS =====

async function getSettings(req, res) {
  try {
    const characterId = parseInt(req.query.characterId);
    if (!characterId) return res.status(400).json({ error: 'characterId required' });

    const character = db.getCharacterById(characterId);
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const settings = db.getTradeSettings(characterId) || {
      accounting_level: 0,
      broker_relations_level: 0,
      advanced_broker_level: 0,
      faction_standing: 0,
      corp_standing: 0,
    };

    const brokerFee = calculateBrokerFee(settings.broker_relations_level, settings.advanced_broker_level, settings.faction_standing, settings.corp_standing);
    const salesTax = calculateSalesTax(settings.accounting_level);

    res.json({
      ...settings,
      effective_broker_fee: brokerFee,
      effective_sales_tax: salesTax,
    });
  } catch (error) {
    console.error('Get settings error:', error.message);
    res.status(500).json({ error: 'Failed to get trade settings' });
  }
}

async function updateSettings(req, res) {
  try {
    const characterId = parseInt(req.body.characterId);
    if (!characterId) return res.status(400).json({ error: 'characterId required' });

    const character = db.getCharacterById(characterId);
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    db.setTradeSettings(characterId, {
      accounting_level: parseInt(req.body.accounting_level) || 0,
      broker_relations_level: parseInt(req.body.broker_relations_level) || 0,
      advanced_broker_level: parseInt(req.body.advanced_broker_level) || 0,
      faction_standing: parseFloat(req.body.faction_standing) || 0,
      corp_standing: parseFloat(req.body.corp_standing) || 0,
      preferred_source_hub: parseInt(req.body.preferred_source_hub) || null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error.message);
    res.status(500).json({ error: 'Failed to update trade settings' });
  }
}

// Skill IDs for trade skills
const SKILL_IDS = {
  ACCOUNTING: 16622,
  BROKER_RELATIONS: 3446,
  ADVANCED_BROKER_RELATIONS: 3449,
};

async function autoDetectSkills(req, res) {
  try {
    const characterId = parseInt(req.query.characterId);
    if (!characterId) return res.status(400).json({ error: 'characterId required' });

    const character = db.getCharacterById(characterId);
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);
    const skillsResult = await getCharacterSkills(characterId, accessToken);

    if (!skillsResult || !skillsResult.skills) {
      return res.status(502).json({ error: 'Could not fetch skills from ESI' });
    }

    const skillMap = {};
    for (const skill of skillsResult.skills) {
      skillMap[skill.skill_id] = skill.trained_skill_level || 0;
    }

    const detected = {
      accounting_level: skillMap[SKILL_IDS.ACCOUNTING] || 0,
      broker_relations_level: skillMap[SKILL_IDS.BROKER_RELATIONS] || 0,
      advanced_broker_level: skillMap[SKILL_IDS.ADVANCED_BROKER_RELATIONS] || 0,
    };

    const brokerFee = calculateBrokerFee(detected.broker_relations_level, detected.advanced_broker_level);
    const salesTax = calculateSalesTax(detected.accounting_level);

    // Auto-save to trade_settings
    const existing = db.getTradeSettings(characterId);
    db.setTradeSettings(characterId, {
      ...detected,
      faction_standing: existing?.faction_standing || 0,
      corp_standing: existing?.corp_standing || 0,
      preferred_source_hub: existing?.preferred_source_hub || null,
    });

    res.json({
      ...detected,
      effective_broker_fee: brokerFee,
      effective_sales_tax: salesTax,
      auto_detected: true,
    });
  } catch (error) {
    console.error('Auto-detect skills error:', error.message);
    res.status(500).json({ error: 'Failed to auto-detect trade skills' });
  }
}

async function searchTypes(req, res) {
  try {
    const query = (req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    const includeJunk = String(req.query.includeJunk || '').toLowerCase() === 'true';
    const rows = db.searchTypes(query, 50, includeJunk);
    res.json({ results: rows.map(r => ({ type_id: r.id, name: r.name })) });
  } catch (error) {
    console.error('Type search error:', error.message);
    res.status(500).json({ error: 'Failed to search types' });
  }
}

async function searchStations(req, res) {
  try {
    const query = (req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });

    const rows = db.searchStations(query, 20);

    // Resolve system_id → region_id for each result
    const results = rows.map(row => {
      const systemId = row.extra_data ? parseInt(row.extra_data) : null;
      const regionId = systemId ? db.getSystemRegion(systemId) : null;
      return {
        station_id: row.id,
        name: row.name,
        type: row.category, // 'station' or 'structure'
        system_id: systemId,
        region_id: regionId,
      };
    }).filter(r => r.region_id); // Only return results we can resolve a region for

    res.json({ results });
  } catch (error) {
    console.error('Station search error:', error.message);
    res.status(500).json({ error: 'Failed to search stations' });
  }
}

// ===== BUILD TREE =====

// Known mineral names (SDE has corrupted names for some)
const MINERAL_FIXES = {
  34: { name: 'Tritanium', volume: 0.01 },
  35: { name: 'Pyerite', volume: 0.01 },
  36: { name: 'Mexallon', volume: 0.01 },
  37: { name: 'Isogen', volume: 0.01 },
  38: { name: 'Nocxium', volume: 0.01 },
  39: { name: 'Zydrine', volume: 0.01 },
  40: { name: 'Megacyte', volume: 0.01 },
  11399: { name: 'Morphite', volume: 0.01 },
};

// Default volume for items with no SDE data (small components, tags, etc.)
const DEFAULT_VOLUME = 0.01;

async function buildVsBuy(req, res) {
  try {
    const productTypeId = parseInt(req.query.typeId);
    const quantity = parseInt(req.query.quantity) || 1;
    const meLevel = parseInt(req.query.me) || 0; // Material Efficiency 0-10
    const shippingMinFee = parseFloat(req.query.shippingFee) || parseFloat(req.query.shippingMinFee) || 25000000;
    const shippingPerM3 = parseFloat(req.query.shippingPerM3) || 600;
    const collateralPct = parseFloat(req.query.collateralPct) || 0;
    const maxVolPerContract = parseFloat(req.query.jfCapacity) || parseFloat(req.query.maxVolume) || 375000;
    const destSellPrice = parseFloat(req.query.destPrice) || 0;
    const bpcCost = parseFloat(req.query.bpcCost) || 0;

    if (!productTypeId) return res.status(400).json({ error: 'typeId required' });

    // Find the blueprint that makes this product
    const bp = db.getBlueprintForProduct(productTypeId);
    if (!bp) return res.status(404).json({ error: 'No manufacturing blueprint found for this item' });

    // Get materials needed
    const materials = db.getBlueprintMaterials(bp.blueprint_id);
    if (!materials || materials.length === 0) {
      return res.status(404).json({ error: 'No material requirements found' });
    }

    // Detect item type: T1 (BPO on market), T2 (has ship hull in materials), Faction (BPC only)
    const bpPrice = db.getHubPrices(60003760, [bp.blueprint_id]);
    const hasBPO = bpPrice[bp.blueprint_id] && bpPrice[bp.blueprint_id].sell_min > 0;
    const hasShipHullMaterial = materials.some(m => {
      const vol = db.db.prepare('SELECT extra_data FROM name_cache WHERE id = ? AND category = ?').get(m.material_type_id, 'type');
      return vol && vol.extra_data && parseFloat(vol.extra_data) >= 2500; // ship hulls are 2500+ m³
    });
    const itemType = hasBPO ? 'T1' : hasShipHullMaterial ? 'T2' : 'FACTION';

    // Get all type IDs we need prices and names for
    const allTypeIds = [productTypeId, bp.blueprint_id, ...materials.map(m => m.material_type_id)];
    const typeNames = await getTypeNames(allTypeIds);

    // Apply mineral name fixes
    for (const [id, fix] of Object.entries(MINERAL_FIXES)) {
      typeNames[parseInt(id)] = fix.name;
    }

    // Get Jita prices for product + all materials
    const jitaPrices = {};
    for (const typeId of allTypeIds) {
      const p = db.getHubPrices(60003760, [typeId]);
      jitaPrices[typeId] = p[typeId] || null;
    }

    // Get volumes from SDE with fixes
    const volumes = {};
    const volRows = db.db.prepare(
      `SELECT id, extra_data FROM name_cache WHERE category = 'type' AND id IN (${allTypeIds.map(() => '?').join(',')})`
    ).all(...allTypeIds);
    for (const row of volRows) {
      const fix = MINERAL_FIXES[row.id];
      if (fix) {
        volumes[row.id] = fix.volume;
      } else {
        volumes[row.id] = row.extra_data ? parseFloat(row.extra_data) : DEFAULT_VOLUME;
      }
    }

    const productJitaPrice = jitaPrices[productTypeId]?.sell_min || 0;
    const productVolume = volumes[productTypeId] || 0;
    const bpoPrice = hasBPO ? bpPrice[bp.blueprint_id].sell_min : 0;

    // === PATH A: Import finished product ===
    const importTotalM3 = productVolume * quantity;
    const importContracts = Math.ceil(importTotalM3 / maxVolPerContract) || 1;
    const importShipping = Math.max(shippingMinFee * importContracts, importTotalM3 * shippingPerM3);
    const importCollateral = productJitaPrice * quantity * collateralPct / 100;
    const importBuyCost = productJitaPrice * quantity;
    const importTotalCost = importBuyCost + importShipping + importCollateral;

    // === PATH B: Import components, build locally ===
    // Apply Material Efficiency: ME reduces materials by 1% per level (max 10%)
    // EVE formula: max(runs, ceil(runs × baseQty × (1 - ME/100)))
    const meFactor = 1 - meLevel / 100;

    const materialDetails = materials.map(m => {
      const baseQty = m.quantity;
      const qtyNeeded = Math.max(quantity, Math.ceil(quantity * baseQty * meFactor));
      const meQty = Math.max(1, Math.ceil(baseQty * meFactor));
      const price = jitaPrices[m.material_type_id]?.sell_min || 0;
      const vol = volumes[m.material_type_id] || DEFAULT_VOLUME;
      return {
        type_id: m.material_type_id,
        type_name: typeNames[m.material_type_id] || `Type ${m.material_type_id}`,
        quantity_base: baseQty,
        quantity_me: meQty,
        quantity_total: qtyNeeded,
        unit_price: price,
        total_price: price * qtyNeeded,
        volume_per_unit: vol,
        total_volume: vol * qtyNeeded,
      };
    });

    const buildMaterialCost = materialDetails.reduce((s, m) => s + m.total_price, 0);
    const buildTotalM3 = materialDetails.reduce((s, m) => s + m.total_volume, 0);
    const buildContracts = Math.ceil(buildTotalM3 / maxVolPerContract) || 1;
    const buildShipping = Math.max(shippingMinFee * buildContracts, buildTotalM3 * shippingPerM3);
    const buildCollateral = buildMaterialCost * collateralPct / 100;
    const buildBpcCost = bpcCost * quantity;
    const buildTotalCost = buildMaterialCost + buildShipping + buildCollateral + buildBpcCost;

    // === COMPARISON ===
    const savings = importTotalCost - buildTotalCost;
    const sellRevenue = destSellPrice > 0 ? destSellPrice * quantity : 0;
    const importProfit = sellRevenue > 0 ? sellRevenue - importTotalCost : null;
    const buildProfit = sellRevenue > 0 ? sellRevenue - buildTotalCost : null;

    res.json({
      product: {
        type_id: productTypeId,
        type_name: typeNames[productTypeId] || `Type ${productTypeId}`,
        quantity,
        jita_price: productJitaPrice,
        volume_m3: productVolume,
        dest_sell_price: destSellPrice || null,
        item_type: itemType,
        blueprint_name: typeNames[bp.blueprint_id] || `BP ${bp.blueprint_id}`,
        bpo_price: bpoPrice || null,
      },
      import_finished: {
        buy_cost: importBuyCost,
        total_m3: importTotalM3,
        jf_loads: importContracts,
        shipping: importShipping,
        collateral: importCollateral,
        total_cost: importTotalCost,
        cost_per_unit: importTotalCost / quantity,
        profit: importProfit,
        profit_per_unit: importProfit !== null ? importProfit / quantity : null,
      },
      build_locally: {
        material_cost: buildMaterialCost,
        bpc_cost: buildBpcCost,
        me_level: meLevel,
        total_m3: buildTotalM3,
        jf_loads: buildContracts,
        shipping: buildShipping,
        collateral: buildCollateral,
        total_cost: buildTotalCost,
        cost_per_unit: buildTotalCost / quantity,
        profit: buildProfit,
        profit_per_unit: buildProfit !== null ? buildProfit / quantity : null,
        materials: materialDetails,
      },
      comparison: {
        savings_from_building: savings,
        savings_per_unit: savings / quantity,
        m3_saved: importTotalM3 - buildTotalM3,
        jf_loads_saved: importContracts - buildContracts,
        recommendation: savings > 0 ? 'BUILD' : 'IMPORT',
      },
      config: { shippingMinFee, shippingPerM3, collateralPct, maxVolPerContract, bpcCost, meLevel },
    });
  } catch (error) {
    console.error('Build vs Buy error:', error.message);
    res.status(500).json({ error: 'Failed to calculate build vs buy' });
  }
}

// Resolve a build tree recursively
function resolveBuildNode(typeId, quantity, meLevel, depth, maxDepth, nameCache, priceCache, volumeCache, facilityMeFactor = 1, jobCostParams = null, teFactor = 1) {
  const name = MINERAL_FIXES[typeId]?.name || nameCache[typeId] || `Type ${typeId}`;
  const price = priceCache[typeId]?.sell_min || 0;
  const volume = MINERAL_FIXES[typeId]?.volume || volumeCache[typeId] || DEFAULT_VOLUME;
  const buyCost = price * quantity;

  // Base case: max depth
  if (depth >= maxDepth) {
    const bp = db.getBlueprintForProduct(typeId);
    return {
      type_id: typeId, name, quantity, unit_price: price, buy_cost: buyCost,
      build_cost: null, volume, decision: 'buy', is_buildable: !!bp,
      depth, children: [], job_time: 0, job_cost: 0, category: 'raw',
    };
  }

  // Check manufacturing blueprint first, then reaction formula
  let bp = db.getBlueprintForProduct(typeId, 1); // activityID 1 = manufacturing
  let activityId = 1;
  let category = 'manufacturing';

  if (!bp) {
    bp = db.getBlueprintForProduct(typeId, 11); // activityID 11 = reaction
    if (bp) {
      activityId = 11;
      category = 'reaction';
    }
  }

  if (!bp) {
    return {
      type_id: typeId, name, quantity, unit_price: price, buy_cost: buyCost,
      build_cost: null, volume, decision: 'buy', is_buildable: false,
      depth, children: [], job_time: 0, job_cost: 0, category: 'raw',
    };
  }

  const materials = db.getBlueprintMaterials(bp.blueprint_id, activityId);
  if (!materials || materials.length === 0) {
    return {
      type_id: typeId, name, quantity, unit_price: price, buy_cost: buyCost,
      build_cost: null, volume, decision: 'buy', is_buildable: false,
      depth, children: [], job_time: 0, job_cost: 0, category: 'raw',
    };
  }

  const jobTime = db.getBlueprintActivityTime(bp.blueprint_id, activityId);
  // ME only applies to manufacturing, not reactions
  // EVE uses multiplicative bonuses: (1 - ME/100) × (1 - struct/100) × (1 - rig/100)
  const meFactor = activityId === 1 ? (1 - meLevel / 100) * facilityMeFactor : 1;
  // Reactions produce in batches (e.g., 200 per run) — adjust quantity
  const batchSize = bp.quantity || 1;
  const runsNeeded = Math.ceil(quantity / batchSize);

  // Ensure prices/names/volumes are cached for all materials
  const matIds = materials.map(m => m.material_type_id);
  const uncachedIds = matIds.filter(id => !priceCache[id]);
  if (uncachedIds.length > 0) {
    for (const id of uncachedIds) {
      const p = db.getHubPrices(60003760, [id]);
      priceCache[id] = p[id] || { sell_min: 0 };
    }
  }
  const uncachedNames = matIds.filter(id => !nameCache[id] && !MINERAL_FIXES[id]);
  if (uncachedNames.length > 0) {
    const cached = db.getCachedNames(uncachedNames, 'type');
    for (const id of uncachedNames) {
      nameCache[id] = cached[id]?.name || `Type ${id}`;
    }
  }
  const uncachedVols = matIds.filter(id => !volumeCache[id] && !MINERAL_FIXES[id]);
  if (uncachedVols.length > 0) {
    const placeholders = uncachedVols.map(() => '?').join(',');
    const rows = db.db.prepare(
      `SELECT id, extra_data FROM name_cache WHERE category = 'type' AND id IN (${placeholders})`
    ).all(...uncachedVols);
    for (const row of rows) {
      volumeCache[row.id] = row.extra_data ? parseFloat(row.extra_data) : DEFAULT_VOLUME;
    }
  }

  // Recurse into children
  // For reactions: materials are per run, multiply by runsNeeded
  // For manufacturing: EVE formula = max(runs, ceil(runs × baseQty × meFactor))
  const children = materials.map(m => {
    const baseQty = m.quantity;
    let totalQty;
    if (activityId === 11) {
      // Reaction: materials per run × runs needed
      totalQty = baseQty * runsNeeded;
    } else {
      // Manufacturing: EVE's actual formula — ceiling applied to total, not per-unit
      totalQty = Math.max(runsNeeded, Math.ceil(runsNeeded * baseQty * meFactor));
    }
    return resolveBuildNode(m.material_type_id, totalQty, meLevel, depth + 1, maxDepth, nameCache, priceCache, volumeCache, facilityMeFactor, jobCostParams, teFactor);
  });

  // Calculate job installation cost using EVE's actual formula:
  // Job Gross = EIV × system_cost_index × (1 - structure_job_cost_bonus)
  // Taxes = EIV × (facility_tax% + SCC_surcharge%)
  // Total = Job Gross + Taxes
  let jobCost = 0;
  if (jobCostParams) {
    const { adjustedPrices, costIndices, taxRate, structureJobCostBonus, sccSurcharge } = jobCostParams;
    const activity = activityId === 1 ? 'manufacturing' : 'reaction';
    const costIndex = costIndices[activity] || 0;
    // Lazy-load adjusted prices for materials we haven't seen yet
    const needAdj = materials.map(m => m.material_type_id).filter(id => !(id in adjustedPrices));
    if (needAdj.length > 0) {
      const fetched = db.getMarketPrices(needAdj);
      for (const id of needAdj) {
        adjustedPrices[id] = fetched[id]?.adjusted_price || 0;
      }
    }
    // EIV per run = sum of (adjusted_price × base_quantity) for each material
    let eivPerRun = 0;
    for (const m of materials) {
      const adjPrice = adjustedPrices[m.material_type_id] || 0;
      eivPerRun += adjPrice * m.quantity;
    }
    const eivTotal = eivPerRun * runsNeeded;
    const jobGross = eivTotal * costIndex * (1 - (structureJobCostBonus || 0));
    const taxes = eivTotal * ((taxRate / 100) + (sccSurcharge || 0));
    jobCost = Math.round((jobGross + taxes) * 100) / 100;
  }

  const childBuildCost = children.reduce((sum, c) => sum + (c.decision === 'build' && c.build_cost !== null ? c.build_cost : c.buy_cost), 0);
  const buildCost = childBuildCost + jobCost;
  const decision = (price > 0 && buyCost < buildCost) ? 'buy' : 'build';

  return {
    type_id: typeId, name, quantity, unit_price: price, buy_cost: buyCost,
    build_cost: Math.round(buildCost * 100) / 100,
    volume, decision, is_buildable: true,
    depth, children, job_time: Math.round(jobTime * teFactor),
    job_cost: jobCost,
    blueprint_id: bp.blueprint_id,
    me_level: activityId === 1 ? meLevel : 0,
    category,
    activity_id: activityId,
    runs_needed: runsNeeded,
    batch_size: batchSize,
  };
}

// Flatten tree to get shopping list (all leaf 'buy' nodes aggregated)
function flattenShoppingList(node, list = {}) {
  if (node.decision === 'buy' || node.children.length === 0) {
    if (!list[node.type_id]) {
      list[node.type_id] = { type_id: node.type_id, name: node.name, quantity: 0, unit_price: node.unit_price, volume: node.volume };
    }
    list[node.type_id].quantity += node.quantity;
  } else {
    for (const child of node.children) {
      flattenShoppingList(child, list);
    }
  }
  return list;
}

// Count total jobs in tree
function countJobs(node) {
  let count = 0;
  if (node.decision === 'build' && node.is_buildable && node.children.length > 0) {
    count = 1;
    for (const child of node.children) {
      count += countJobs(child);
    }
  }
  return count;
}

// Sum job installation costs for all BUILD nodes in tree
function sumJobCosts(node) {
  let total = 0;
  if (node.decision === 'build' && node.is_buildable && node.children.length > 0) {
    total = node.job_cost || 0;
    for (const child of node.children) {
      total += sumJobCosts(child);
    }
  }
  return total;
}

async function getBuildTree(req, res) {
  try {
    const productTypeId = parseInt(req.params.typeId || req.query.typeId);
    const quantity = parseInt(req.query.quantity) || 1;
    const meLevel = parseInt(req.query.me) || 0;
    const teLevel = parseInt(req.query.te) || 0;
    const maxDepth = Math.min(parseInt(req.query.maxDepth) || 4, 6);
    const shippingMinFee = parseFloat(req.query.shippingMinFee) || 25000000;
    const shippingPerM3Rate = parseFloat(req.query.shippingPerM3) || 600;
    const collateralPct = parseFloat(req.query.collateralPct) || 0;
    const maxVolumePerContract = parseFloat(req.query.maxVolume) || 375000;
    const contractPrice = parseFloat(req.query.contractPrice) || 0;

    // Facility config — structure rig bonuses reduce materials
    const structure = req.query.structure || 'raitaru';
    const rig = req.query.rig || 'none';
    const sec = req.query.sec || 'nullsec';
    const taxRate = parseFloat(req.query.taxRate) || 0; // facility tax %
    const systemId = parseInt(req.query.systemId) || 0; // for cost index lookup

    // Structure ME bonus (applied on top of blueprint ME)
    const structureMeBonus = {
      npc: 0, raitaru: 1, azbel: 1, sotiyo: 1, tatara: 1, athanor: 1
    }[structure] || 0;

    // Rig ME bonus × security multiplier
    const rigMeBase = { none: 0, t1: 2.0, t2: 2.4 }[rig] || 0;
    const secMultiplier = { high: 1.0, low: 1.9, nullsec: 2.1 }[sec] || 2.1;
    const rigMeBonus = rigMeBase * secMultiplier;

    // Facility ME factor (multiplicative, matching EVE's actual formula)
    const facilityMeFactor = (1 - structureMeBonus / 100) * (1 - rigMeBonus / 100);

    // Structure TE bonus (time reduction %)
    const structureTeBonus = {
      npc: 0, raitaru: 0.15, azbel: 0.20, sotiyo: 0.30, tatara: 0.25, athanor: 0.20
    }[structure] || 0;

    // Rig TE bonus × security multiplier
    const rigTeBase = { none: 0, t1: 0.20, t2: 0.24 }[rig] || 0;
    const rigTeBonus = rigTeBase * secMultiplier;

    // TE factor: base_time × (1 - TE/100) × (1 - structure_te) × (1 - rig_te)
    const teFactor = (1 - teLevel / 100) * (1 - structureTeBonus) * (1 - rigTeBonus);

    // Structure job cost bonus (reduces gross cost)
    const structureJobCostBonus = {
      npc: 0, raitaru: 0.03, azbel: 0.04, sotiyo: 0.05, tatara: 0.04, athanor: 0.03
    }[structure] || 0;

    // SCC surcharge — fixed 4% since 2022 industry update
    const sccSurcharge = 0.04;

    // Cost indices for job cost calculation
    const costIndices = systemId ? db.getCostIndices(systemId) : {};

    // Adjusted prices cache for EIV calculation
    const adjustedPriceCache = {};
    const jobCostParams = systemId ? { adjustedPrices: adjustedPriceCache, costIndices, taxRate, structureJobCostBonus, sccSurcharge } : null;

    if (!productTypeId) return res.status(400).json({ error: 'typeId required' });

    // Warm caches
    const nameCache = {};
    const priceCache = {};
    const volumeCache = {};

    // Pre-cache the product
    const productNames = await getTypeNames([productTypeId]);
    nameCache[productTypeId] = productNames[productTypeId] || `Type ${productTypeId}`;
    const pp = db.getHubPrices(60003760, [productTypeId]);
    priceCache[productTypeId] = pp[productTypeId] || { sell_min: 0 };
    const pv = db.db.prepare('SELECT extra_data FROM name_cache WHERE id = ? AND category = ?').get(productTypeId, 'type');
    volumeCache[productTypeId] = pv?.extra_data ? parseFloat(pv.extra_data) : DEFAULT_VOLUME;

    // Build the tree
    const tree = resolveBuildNode(productTypeId, quantity, meLevel, 0, maxDepth, nameCache, priceCache, volumeCache, facilityMeFactor, jobCostParams, teFactor);

    // Fetch owned blueprints and annotate tree nodes
    let ownedBlueprints = {};
    try {
      const allChars = db.getAllCharactersByUserId(req.session.userId);
      for (const char of allChars) {
        const token = await getValidAccessToken(char);
        const result = await getCharacterBlueprints(char.character_id, token);
        if (result.hasScope) {
          for (const bp of result.blueprints) {
            const productBp = db.db.prepare(
              // activity 1 = manufacturing, 9 + 11 = reactions (legacy/modern). Reaction
// formulas weren't being matched to their product, so owned formulas showed
// as "missing" and reacted components never got `location_blueprint` set.
'SELECT product_type_id, activity_id FROM blueprint_products WHERE blueprint_id = ? AND activity_id IN (1, 9, 11) LIMIT 1'
            ).get(bp.type_id);
            if (!productBp) continue; // Skip BPs with no product mapping in SDE
            const productTypeForBp = productBp.product_type_id;
            const existing = ownedBlueprints[productTypeForBp];
            // Keep the best ME BPO, or any BPC if no BPO
            if (!existing || (bp.runs === -1 && (!existing.is_bpo || bp.material_efficiency > existing.me))) {
              ownedBlueprints[productTypeForBp] = {
                owner: char.character_name,
                is_bpo: bp.runs === -1,
                me: bp.material_efficiency,
                te: bp.time_efficiency,
                runs: bp.runs,
                type_id: bp.type_id,
              };
            } else if (!existing.is_bpo && bp.runs > 0 && bp.runs > (existing.runs || 0)) {
              ownedBlueprints[productTypeForBp] = {
                owner: char.character_name,
                is_bpo: false,
                me: bp.material_efficiency,
                te: bp.time_efficiency,
                runs: bp.runs,
                type_id: bp.type_id,
              };
            }
          }
        }
      }
    } catch (e) {
      console.error('Blueprint fetch error:', e.message);
    }

    // Annotate tree nodes with ownership
    function annotateOwnership(node) {
      const owned = ownedBlueprints[node.type_id];
      if (owned) {
        node.owned_blueprint = owned;
      }
      if (node.children) {
        for (const child of node.children) {
          annotateOwnership(child);
        }
      }
    }
    annotateOwnership(tree);

    // === Optional inventory annotation ===
    // When the client passes (invMode, invSourceId, invLocationId) we
    // fetch what's physically at that location (personal character or
    // corporation hangars) and mark each tree node with `have` and
    // `missing`. The shopping list below is then shrunk to reflect what
    // actually needs to be purchased.
    const invMode = req.query.invMode === 'corp' ? 'corp' : (req.query.invMode === 'personal' ? 'personal' : null);
    const invSourceId = parseInt(req.query.invSourceId) || null;
    const invLocationId = parseInt(req.query.invLocationId) || null;
    let inventoryContext = null;
    let stockByType = {};
    if (invMode && invSourceId && invLocationId) {
      const invResult = await inventoryService.getStockAtLocation({
        userId: req.session.userId,
        mode: invMode,
        sourceId: invSourceId,
        locationId: invLocationId,
      });
      if (invResult.error) {
        inventoryContext = { mode: invMode, error: invResult.error };
      } else {
        stockByType = invResult.stock_by_type_id || {};
        inventoryContext = {
          mode: invMode,
          source_id: invSourceId,
          location_id: invLocationId,
          total_assets: invResult.total_assets,
          hasBpScope: invResult.hasBpScope,
        };

        // Override owned_blueprint to only trust BPs physically at the
        // build location — matches "can I start this job right now here"
        // semantics. Map by the product the BP produces.
        const locationBPs = {};
        for (const bp of invResult.blueprints) {
          const productBp = db.db.prepare(
            // activity 1 = manufacturing, 9 + 11 = reactions (legacy/modern). Reaction
// formulas weren't being matched to their product, so owned formulas showed
// as "missing" and reacted components never got `location_blueprint` set.
'SELECT product_type_id, activity_id FROM blueprint_products WHERE blueprint_id = ? AND activity_id IN (1, 9, 11) LIMIT 1'
          ).get(bp.type_id);
          if (!productBp) continue;
          const productTypeForBp = productBp.product_type_id;
          const prev = locationBPs[productTypeForBp];
          if (!prev || (bp.runs === -1 && !prev.is_bpo) || (!prev.is_bpo && bp.runs > (prev.runs || 0))) {
            locationBPs[productTypeForBp] = {
              is_bpo: bp.runs === -1,
              me: bp.material_efficiency,
              te: bp.time_efficiency,
              runs: bp.runs,
              type_id: bp.type_id,
            };
          }
        }

        function annotateStock(node) {
          const have = stockByType[node.type_id] || 0;
          node.have = have;
          node.missing = Math.max(0, node.quantity - have);

          // Re-annotate BP availability scoped to the build location
          const bpAtLoc = locationBPs[node.type_id];
          if (bpAtLoc) {
            node.location_blueprint = bpAtLoc;
          } else {
            node.location_blueprint = null;
          }

          if (node.children) for (const c of node.children) annotateStock(c);
        }
        // Skip the ROOT product — the user wants to build one, so any
        // existing copies at the location aren't relevant. Otherwise
        // having 1 Charon already would zero out the plan for the
        // one they're trying to make.
        if (tree.children) for (const c of tree.children) annotateStock(c);
      }
    }

    // Shopping list — raw items (unmodified by inventory)
    const shoppingMap = flattenShoppingList(tree);
    const shoppingList = Object.values(shoppingMap).map(item => ({
      ...item,
      have: stockByType[item.type_id] || 0,
      missing: Math.max(0, item.quantity - (stockByType[item.type_id] || 0)),
      total_cost: item.unit_price * item.quantity,
      total_volume: item.volume * item.quantity,
    })).sort((a, b) => b.total_cost - a.total_cost);

    // When stock-check mode is active, summary-level cost / volume / shipping
    // / collateral reflect only the materials the user actually needs to
    // *buy* — stuff already at the build location is free to use and costs
    // nothing to ship.
    const stockActive = !!inventoryContext && !inventoryContext.error;
    const effQty = (i) => stockActive && i.have !== undefined
      ? Math.max(0, i.quantity - i.have)
      : i.quantity;
    const totalMaterialCost = shoppingList.reduce((s, i) => s + (i.unit_price || 0) * effQty(i), 0);
    const totalVolume = shoppingList.reduce((s, i) => s + (i.volume || 0) * effQty(i), 0);
    // Halo Logistics formula: max(minFee, volume × perM3) per contract, split by max volume
    const contracts = Math.ceil(totalVolume / maxVolumePerContract) || 1;
    const volumeShippingCost = totalVolume * shippingPerM3Rate;
    // 25M min fee only meaningful when there IS volume to ship. With the
    // missing-quantity filter the user might already have everything —
    // in which case zero shipping (not 25M floor).
    const shippingCost = totalVolume > 0
      ? Math.max(shippingMinFee * contracts, volumeShippingCost)
      : 0;
    const collateralCost = totalMaterialCost * collateralPct / 100;
    const totalJobs = countJobs(tree);
    const totalJobCost = Math.round(sumJobCosts(tree) * 100) / 100;

    // Detect item type
    const bpCheck = db.getBlueprintForProduct(productTypeId);
    const bpPrice = bpCheck ? db.getHubPrices(60003760, [bpCheck.blueprint_id]) : {};
    const hasBPO = bpCheck && bpPrice[bpCheck.blueprint_id]?.sell_min > 0;
    const hasCapitalComponent = tree.children.some(c => c.name && c.name.startsWith('Capital '));
    const hasShipHull = tree.children.some(c => c.volume >= 2500);
    const itemType = hasCapitalComponent ? 'CAPITAL' : hasBPO ? 'T1' : hasShipHull ? 'T2' : 'FACTION';

    // Count owned blueprints and find missing ones
    function countOwned(node) {
      let c = node.owned_blueprint ? 1 : 0;
      if (node.children) for (const ch of node.children) c += countOwned(ch);
      return c;
    }
    const ownedCount = countOwned(tree);

    // Find missing BPs (BUILD nodes without owned blueprint)
    function findMissingBPs(node, missing) {
      if (node.decision === 'build' && node.is_buildable && !node.owned_blueprint) {
        if (!missing[node.type_id]) {
          const bpId = node.blueprint_id;
          const bpMarketPrice = bpId ? (db.getHubPrices(60003760, [bpId])?.[bpId]?.sell_min || 0) : 0;
          missing[node.type_id] = {
            type_id: node.type_id,
            name: node.name,
            blueprint_id: bpId,
            bp_name: bpId ? (nameCache[bpId] || `BP ${bpId}`) : null,
            bpo_market_price: bpMarketPrice,
            category: node.category || 'manufacturing',
            quantity_needed: node.quantity,
          };
        }
      }
      if (node.children) {
        for (const ch of node.children) findMissingBPs(ch, missing);
      }
    }
    const missingBPs = {};
    findMissingBPs(tree, missingBPs);
    const missingBPList = Object.values(missingBPs).sort((a, b) => b.bpo_market_price - a.bpo_market_price);

    // Use contract price as buy price when market price is 0
    const effectiveBuyPrice = tree.unit_price > 0 ? tree.unit_price : contractPrice;
    const effectiveBuyCost = effectiveBuyPrice * quantity;

    // Import shipping: cost to ship the finished product from Jita
    const isCapital = itemType === 'CAPITAL';
    const importVolume = (tree.volume || 0) * quantity;
    const importContracts = Math.ceil(importVolume / maxVolumePerContract) || 1;
    const importShipping = isCapital ? 0 : Math.max(shippingMinFee * importContracts, importVolume * shippingPerM3Rate);
    const importCollateral = isCapital ? 0 : effectiveBuyCost * collateralPct / 100;
    const importTotalCost = effectiveBuyCost + importShipping + importCollateral;

    const totalBuildCost = totalMaterialCost + totalJobCost + shippingCost + collateralCost;

    // Sell price: Jita sell_min for the finished product
    const sellPrice = tree.unit_price || 0;
    const sellTotal = sellPrice * quantity;
    const buildProfit = sellTotal > 0 ? sellTotal - totalBuildCost : null;
    const importProfit = sellTotal > 0 && !isCapital ? sellTotal - importTotalCost : null;

    res.json({
      product: {
        type_id: productTypeId,
        name: tree.name,
        quantity,
        jita_price: tree.unit_price,
        contract_price: contractPrice > 0 ? contractPrice : null,
        effective_buy_price: effectiveBuyPrice,
        item_type: itemType,
        owned_blueprint: tree.owned_blueprint || null,
      },
      tree,
      summary: {
        buy_finished_cost: effectiveBuyCost,
        buy_source: tree.unit_price > 0 ? 'market' : contractPrice > 0 ? 'contract' : 'unavailable',
        import_shipping: importShipping,
        import_collateral: importCollateral,
        import_total_cost: importTotalCost,
        import_volume_m3: importVolume,
        import_contracts: importContracts,
        is_capital: isCapital,
        sell_price: sellPrice,
        sell_total: sellTotal,
        build_profit: buildProfit,
        import_profit: importProfit,
        build_cost: tree.build_cost,
        material_cost: totalMaterialCost,
        job_cost: totalJobCost,
        shipping_cost: shippingCost,
        collateral_cost: collateralCost,
        total_build_cost: totalBuildCost,
        savings: importTotalCost - totalBuildCost,
        total_volume_m3: totalVolume,
        shipping_contracts: contracts,
        total_jobs: totalJobs,
        owned_blueprints: ownedCount,
        recommendation: effectiveBuyCost === 0 ? 'BUILD' : importTotalCost > totalBuildCost ? 'BUILD' : 'IMPORT',
      },
      shopping_list: shoppingList,
      missing_blueprints: missingBPList,
      inventory_context: inventoryContext,
      config: { meLevel, teLevel, maxDepth, shippingMinFee, shippingPerM3Rate, collateralPct, maxVolumePerContract, structure, rig, sec, taxRate, systemId, facilityMeFactor: Math.round(facilityMeFactor * 10000) / 10000, teFactor: Math.round(teFactor * 10000) / 10000 },
    });
  } catch (error) {
    console.error('Build tree error:', error.message);
    res.status(500).json({ error: 'Failed to build production tree' });
  }
}

async function stockAnalysis(req, res) {
  try {
    const sourceHubId = parseInt(req.query.source);
    const destHubId = parseInt(req.query.dest);
    const markup = parseFloat(req.query.markup) || 20;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const minJitaVolume = parseInt(req.query.minVolume) || 10;
    const maxPrice = parseFloat(req.query.maxPrice) || 0;
    const nameFilter = (req.query.name || '').trim().toLowerCase();
    const iskPerM3 = parseFloat(req.query.iskPerM3) || 0;
    const collateralPct = parseFloat(req.query.collateralPct) || 0;

    if (!sourceHubId || !destHubId) return res.status(400).json({ error: 'source and dest required' });

    const sourceHub = db.getTradeHub(sourceHubId, req.session.userId);
    const destHub = db.getTradeHub(destHubId, req.session.userId);
    if (!sourceHub || !destHub) return res.status(404).json({ error: 'Hub not found' });

    // Get all source prices
    const allSourcePrices = db.db.prepare(
      "SELECT type_id, sell_min, buy_max, sell_volume, buy_volume FROM hub_prices WHERE station_id = ? AND sell_min > 0 AND updated_at >= datetime('now', '-6 hours')"
    ).all(sourceHub.station_id);

    // Get all dest prices (what already exists at nullsec)
    const allDestPrices = db.db.prepare(
      "SELECT type_id, sell_min, buy_max, sell_volume, buy_volume FROM hub_prices WHERE station_id = ? AND updated_at >= datetime('now', '-6 hours')"
    ).all(destHub.station_id);
    const destPriceMap = {};
    for (const row of allDestPrices) {
      destPriceMap[row.type_id] = row;
    }

    // Get item volumes from SDE (extra_data on type entries in name_cache)
    const volumeMap = {};
    if (iskPerM3 > 0) {
      const typeIds = allSourcePrices.map(p => p.type_id);
      for (let i = 0; i < typeIds.length; i += 999) {
        const batch = typeIds.slice(i, i + 999);
        const placeholders = batch.map(() => '?').join(',');
        const rows = db.db.prepare(
          `SELECT id, extra_data FROM name_cache WHERE category = 'type' AND id IN (${placeholders})`
        ).all(...batch);
        for (const row of rows) {
          if (row.extra_data) volumeMap[row.id] = parseFloat(row.extra_data) || 0;
        }
      }
    }

    // Find items to stock: high volume at source, missing or overpriced at dest
    const opportunities = [];
    for (const src of allSourcePrices) {
      if (src.sell_volume < minJitaVolume) continue;
      if (maxPrice && src.sell_min > maxPrice) continue;

      const dst = destPriceMap[src.type_id];
      const suggestedSell = src.sell_min * (1 + markup / 100);
      let status, currentDestPrice, grossProfit;

      if (!dst || (dst.sell_min === 0 && dst.buy_max === 0)) {
        status = 'missing';
        currentDestPrice = 0;
        grossProfit = suggestedSell - src.sell_min;
      } else if (dst.sell_min > suggestedSell) {
        status = 'overpriced';
        currentDestPrice = dst.sell_min;
        grossProfit = dst.sell_min * 0.95 - src.sell_min;
      } else {
        continue;
      }

      // Calculate shipping cost per unit
      const itemVolume = volumeMap[src.type_id] || 0;
      const shippingPerUnit = (itemVolume * iskPerM3) + (src.sell_min * collateralPct / 100);
      const profitPerUnit = grossProfit - shippingPerUnit;

      if (profitPerUnit <= 0 && (iskPerM3 > 0 || collateralPct > 0)) continue; // skip unprofitable after shipping

      // ISK/m³ density (value density — higher = better for hauling)
      const iskPerM3Density = itemVolume > 0 ? src.sell_min / itemVolume : 0;

      // Hauling grade based on shipping % of item value
      let haulGrade = 'GREAT';
      if (shippingPerUnit > 0 && src.sell_min > 0) {
        const shipPct = (shippingPerUnit / src.sell_min) * 100;
        if (shipPct > 50) haulGrade = 'NEVER';
        else if (shipPct > 10) haulGrade = 'MARGINAL';
        else if (shipPct > 2) haulGrade = 'GOOD';
      }

      opportunities.push({
        type_id: src.type_id,
        jita_sell: src.sell_min,
        jita_volume: src.sell_volume,
        dest_sell: currentDestPrice,
        suggested_sell: Math.round(suggestedSell * 100) / 100,
        volume_m3: itemVolume,
        isk_per_m3: Math.round(iskPerM3Density),
        shipping_cost: Math.round(shippingPerUnit * 100) / 100,
        profit_per_unit: Math.round(profitPerUnit * 100) / 100,
        roi: Math.round((profitPerUnit / (src.sell_min + shippingPerUnit)) * 10000) / 100,
        haul_grade: haulGrade,
        status,
      });
    }

    // Sort: missing first, then by Jita volume descending (most in-demand)
    opportunities.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'missing' ? -1 : 1;
      return b.jita_volume - a.jita_volume;
    });

    // Resolve type names
    const limited = opportunities.slice(0, limit * 2); // fetch more names for filtering
    const typeIds = [...new Set(limited.map(o => o.type_id))];
    const typeNames = typeIds.length > 0 ? await getTypeNames(typeIds) : {};

    // Apply name filter and limit
    let result = limited.map(o => ({ ...o, type_name: typeNames[o.type_id] || `Type ${o.type_id}` }));
    if (nameFilter) {
      result = result.filter(o => o.type_name.toLowerCase().includes(nameFilter));
    }
    result = result.slice(0, limit);

    res.json({
      source_hub: { id: sourceHub.id, name: sourceHub.name },
      dest_hub: { id: destHub.id, name: destHub.name },
      markup_pct: markup,
      isk_per_m3: iskPerM3,
      collateral_pct: collateralPct,
      total: result.length,
      opportunities: result,
    });
  } catch (error) {
    console.error('Stock analysis error:', error.message);
    res.status(500).json({ error: 'Failed to analyze stocking opportunities' });
  }
}

async function searchSystems(req, res) {
  const query = (req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  try {
    const rows = db.searchSystems(query, 15);
    const results = rows.map(r => {
      const extra = r.extra_data ? JSON.parse(r.extra_data) : {};
      return { id: r.id, name: r.name, security: extra.security || 0 };
    });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
}

module.exports = {
  ensureHubsSeeded,
  searchTypes,
  searchStations,
  searchSystems,
  buildVsBuy,
  getBuildTree,
  stockAnalysis,
  getHubs,
  addHub,
  removeHub,
  toggleHub,
  compareItem,
  bpContracts,
  priceHistory,
  inventoryContexts,
  inventoryLocations,
  findTrades,
  getSettings,
  updateSettings,
  autoDetectSkills,
};
