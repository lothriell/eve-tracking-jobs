/**
 * Trading Controller
 * All endpoints locked to Lothriell via requireTradeAccess middleware
 */

const db = require('../database/db');
const { getTypeNames, getCharacterSkills, getCharacterBlueprints } = require('../services/esiClient');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { calculateBrokerFee, calculateSalesTax, findTradeOpportunities } = require('../services/tradeCalculator');

// ===== ACCESS CONTROL =====

function requireTradeAccess(req, res, next) {
  if (req.session.characterName !== 'Lothriell') {
    return res.status(403).json({ error: 'Trading feature not available' });
  }
  next();
}

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
      'SELECT type_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count FROM hub_prices WHERE station_id = ?'
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
        'SELECT type_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count FROM hub_prices WHERE station_id = ?'
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

    // Re-sort combined results and apply limit
    allOpportunities.sort((a, b) => b.roi - a.roi);
    allOpportunities = allOpportunities.slice(0, filters.limit);

    // Resolve type names
    const typeIds = [...new Set(allOpportunities.map(o => o.type_id))];
    const typeNames = typeIds.length > 0 ? await getTypeNames(typeIds) : {};

    allOpportunities.forEach(o => {
      o.type_name = typeNames[o.type_id] || `Type ${o.type_id}`;
    });

    res.json({
      source_hub: { id: sourceHub.id, name: sourceHub.name },
      trade_type: tradeType,
      buy_broker_fee_pct: buyBrokerFee,
      sell_broker_fee_pct: sellBrokerFee,
      sales_tax_pct: sellSalesTax,
      filters,
      total: allOpportunities.length,
      opportunities: allOpportunities
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
    const rows = db.searchTypes(query, 20);
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
    // Formula: actual_qty = max(1, ceil(base_qty * (1 - ME/100)))
    const meFactor = 1 - meLevel / 100;

    const materialDetails = materials.map(m => {
      const baseQty = m.quantity;
      const meQty = Math.max(1, Math.ceil(baseQty * meFactor));
      const qtyNeeded = meQty * quantity;
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
function resolveBuildNode(typeId, quantity, meLevel, depth, maxDepth, nameCache, priceCache, volumeCache, facilityMeReduction = 0, jobCostParams = null) {
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
  // Total ME = blueprint ME + facility ME (structure + rig)
  const totalMe = activityId === 1 ? meLevel + facilityMeReduction : 0;
  const meFactor = activityId === 1 ? Math.max(0, 1 - totalMe / 100) : 1;
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
  // For manufacturing: materials are per unit, apply ME, multiply by quantity
  const children = materials.map(m => {
    const baseQty = m.quantity;
    let totalQty;
    if (activityId === 11) {
      // Reaction: materials per run × runs needed
      totalQty = baseQty * runsNeeded;
    } else {
      // Manufacturing: apply ME, multiply by quantity
      const meQty = Math.max(1, Math.ceil(baseQty * meFactor));
      totalQty = meQty * quantity;
    }
    return resolveBuildNode(m.material_type_id, totalQty, meLevel, depth + 1, maxDepth, nameCache, priceCache, volumeCache, facilityMeReduction, jobCostParams);
  });

  // Calculate job installation cost: EIV × cost_index × (1 + tax_rate) × runs
  // EIV = sum of (adjusted_price × quantity) for all input materials (per single run)
  let jobCost = 0;
  if (jobCostParams) {
    const { adjustedPrices, costIndices, taxRate } = jobCostParams;
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
    jobCost = eivPerRun * runsNeeded * costIndex * (1 + taxRate / 100);
    jobCost = Math.round(jobCost * 100) / 100;
  }

  const childBuildCost = children.reduce((sum, c) => sum + (c.decision === 'build' && c.build_cost !== null ? c.build_cost : c.buy_cost), 0);
  const buildCost = childBuildCost + jobCost;
  const decision = (price > 0 && buyCost < buildCost) ? 'buy' : 'build';

  return {
    type_id: typeId, name, quantity, unit_price: price, buy_cost: buyCost,
    build_cost: Math.round(buildCost * 100) / 100,
    volume, decision, is_buildable: true,
    depth, children, job_time: jobTime,
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

    // Total facility ME reduction (%)
    const facilityMeReduction = structureMeBonus + rigMeBonus;

    // Cost indices for job cost calculation
    const costIndices = systemId ? db.getCostIndices(systemId) : {};

    // Adjusted prices cache for EIV calculation
    const adjustedPriceCache = {};
    const jobCostParams = systemId ? { adjustedPrices: adjustedPriceCache, costIndices, taxRate } : null;

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
    const tree = resolveBuildNode(productTypeId, quantity, meLevel, 0, maxDepth, nameCache, priceCache, volumeCache, facilityMeReduction, jobCostParams);

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
              'SELECT product_type_id FROM blueprint_products WHERE blueprint_id = ? AND activity_id = 1'
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

    // Shopping list
    const shoppingMap = flattenShoppingList(tree);
    const shoppingList = Object.values(shoppingMap).map(item => ({
      ...item,
      total_cost: item.unit_price * item.quantity,
      total_volume: item.volume * item.quantity,
    })).sort((a, b) => b.total_cost - a.total_cost);

    const totalMaterialCost = shoppingList.reduce((s, i) => s + i.total_cost, 0);
    const totalVolume = shoppingList.reduce((s, i) => s + i.total_volume, 0);
    // Halo Logistics formula: max(minFee, volume × perM3) per contract, split by max volume
    const contracts = Math.ceil(totalVolume / maxVolumePerContract) || 1;
    const volumeShippingCost = totalVolume * shippingPerM3Rate;
    const shippingCost = Math.max(shippingMinFee * contracts, volumeShippingCost);
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
        build_cost: tree.build_cost,
        material_cost: totalMaterialCost,
        job_cost: totalJobCost,
        shipping_cost: shippingCost,
        collateral_cost: collateralCost,
        total_build_cost: totalMaterialCost + totalJobCost + shippingCost + collateralCost,
        savings: effectiveBuyCost - (totalMaterialCost + totalJobCost + shippingCost + collateralCost),
        total_volume_m3: totalVolume,
        shipping_contracts: contracts,
        total_jobs: totalJobs,
        owned_blueprints: ownedCount,
        recommendation: effectiveBuyCost === 0 ? 'BUILD' : effectiveBuyCost > (totalMaterialCost + totalJobCost + shippingCost + collateralCost) ? 'BUILD' : 'IMPORT',
      },
      shopping_list: shoppingList,
      missing_blueprints: missingBPList,
      config: { meLevel, maxDepth, shippingMinFee, shippingPerM3Rate, collateralPct, maxVolumePerContract, structure, rig, sec, taxRate, systemId, facilityMeReduction: Math.round(facilityMeReduction * 100) / 100 },
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
      'SELECT type_id, sell_min, buy_max, sell_volume, buy_volume FROM hub_prices WHERE station_id = ? AND sell_min > 0'
    ).all(sourceHub.station_id);

    // Get all dest prices (what already exists at nullsec)
    const allDestPrices = db.db.prepare(
      'SELECT type_id, sell_min, buy_max, sell_volume, buy_volume FROM hub_prices WHERE station_id = ?'
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
  requireTradeAccess,
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
  findTrades,
  getSettings,
  updateSettings,
  autoDetectSkills,
};
