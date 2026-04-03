/**
 * Trading Controller
 * All endpoints locked to Lothriell via requireTradeAccess middleware
 */

const db = require('../database/db');
const { getTypeNames, getCharacterSkills } = require('../services/esiClient');
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

module.exports = {
  requireTradeAccess,
  ensureHubsSeeded,
  searchTypes,
  searchStations,
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
