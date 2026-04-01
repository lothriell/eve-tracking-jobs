const express = require('express');
const router = express.Router();
const characterController = require('../controllers/characterController');

// Version endpoint (for deployment verification)
router.get('/version', (req, res) => {
  res.json({ 
    version: '5.4.0',
    name: 'EVE Industry Tracker',
    buildDate: '2026-04-01'
  });
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// Character endpoints
router.get('/character', requireAuth, characterController.getCharacter);
router.get('/character/portrait', requireAuth, characterController.getCharacterPortrait);
router.get('/character/portrait/:characterId', requireAuth, characterController.getCharacterPortrait);

// Multiple character endpoints
router.get('/characters', requireAuth, characterController.getAllCharacters);
router.get('/characters/:characterId', requireAuth, characterController.getCharacterById);
router.delete('/characters/:characterId', requireAuth, characterController.deleteCharacter);

// Industry endpoints
router.get('/industry/jobs', requireAuth, characterController.getIndustryJobs);
router.get('/industry/slots', requireAuth, characterController.getJobSlots);

// Corporation endpoints
router.get('/corporations', requireAuth, characterController.getCorporations);
router.get('/corporation/jobs', requireAuth, characterController.getAllCorporationJobs);
router.get('/corporation/jobs/:characterId', requireAuth, characterController.getCorporationJobs);
router.get('/corporation/roles/:characterId', requireAuth, characterController.getCorporationRoles);

// Dashboard endpoint
router.get('/dashboard/stats', requireAuth, characterController.getDashboardStats);

// Character summary page
router.get('/character/:characterId/summary', requireAuth, characterController.getCharacterSummary);

// Total asset value + wallet balance
const wealthCache = new Map();
const WEALTH_CACHE_TTL = 120000; // 2 minutes

router.get('/wealth', requireAuth, async (req, res) => {
  const db = require('../database/db');
  const { getValidAccessToken } = require('../services/tokenRefresh');
  const { getCharacterAssets, getCharacterWallet } = require('../services/esiClient');

  try {
    const targetCharId = req.query.characterId ? parseInt(req.query.characterId) : null;
    const cacheKey = `wealth_${req.session.userId}_${targetCharId || 'all'}`;
    const cached = wealthCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WEALTH_CACHE_TTL) {
      return res.json(cached.data);
    }

    const allCharacters = db.getAllCharactersByUserId(req.session.userId);
    const characters = targetCharId
      ? allCharacters.filter(c => c.character_id === targetCharId)
      : allCharacters;

    // Fetch assets + wallet for all characters in parallel
    const results = await Promise.all(characters.map(async (character) => {
      let charValue = 0;
      let charItems = 0;
      let walletBalance = null;
      let needsWalletScope = false;
      try {
        const accessToken = await getValidAccessToken(character);
        const [assets, walletResult] = await Promise.all([
          getCharacterAssets(character.character_id, accessToken),
          getCharacterWallet(character.character_id, accessToken)
        ]);

        // Calculate asset value
        const typeIds = [...new Set(assets.map(a => a.type_id).filter(Boolean))];
        const prices = typeIds.length > 0 ? db.getMarketPrices(typeIds) : {};
        for (const a of assets) {
          const p = prices[a.type_id];
          if (p) charValue += (p.average_price || p.adjusted_price || 0) * (a.quantity || 1);
        }
        charItems = assets.length;

        // Wallet balance
        if (walletResult.hasScope) {
          walletBalance = walletResult.balance;
        } else {
          needsWalletScope = true;
        }
      } catch (e) {
        // Skip character
      }
      return {
        character_id: character.character_id,
        character_name: character.character_name,
        asset_value: charValue,
        item_count: charItems,
        wallet_balance: walletBalance,
        needs_wallet_scope: needsWalletScope,
      };
    }));

    const totalValue = results.reduce((s, r) => s + r.asset_value, 0);
    const totalItems = results.reduce((s, r) => s + r.item_count, 0);
    const totalWallet = results.reduce((s, r) => s + (r.wallet_balance || 0), 0);
    const data = {
      total_value: totalValue,
      total_items: totalItems,
      total_wallet_balance: totalWallet,
      per_character: results
    };

    // Save wealth snapshots (max once per hour)
    try {
      const latest = db.getLatestSnapshotDate(req.session.userId);
      const hourAgo = new Date(Date.now() - 3600000).toISOString();
      if (!latest || latest < hourAgo) {
        for (const r of results) {
          db.saveWealthSnapshot(r.character_id, req.session.userId, r.wallet_balance || 0, r.asset_value);
        }
      }
    } catch (snapErr) {
      console.error('Failed to save wealth snapshot:', snapErr.message);
    }

    wealthCache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate wealth' });
  }
});

// Wealth history for chart
router.get('/wealth/history', requireAuth, (req, res) => {
  const db = require('../database/db');
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const snapshots = db.getWealthHistory(req.session.userId, days);
    res.json({ snapshots });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get wealth history' });
  }
});

// Wallet journal
router.get('/wallet/journal', requireAuth, async (req, res) => {
  const db = require('../database/db');
  const { getValidAccessToken } = require('../services/tokenRefresh');
  const { getWalletJournal, getCharacterNames } = require('../services/esiClient');

  try {
    const characterId = parseInt(req.query.characterId);
    if (!characterId) return res.status(400).json({ error: 'characterId required' });

    const character = db.getCharacterById(characterId);
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const refType = req.query.refType || null;

    // Check if cache is stale (>15 min since newest entry)
    const newest = db.getWalletJournalNewest(characterId);
    const fifteenMinAgo = new Date(Date.now() - 900000).toISOString();
    if (!newest?.newest || newest.newest < fifteenMinAgo) {
      try {
        const accessToken = await getValidAccessToken(character);
        const result = await getWalletJournal(characterId, accessToken);
        if (result.hasScope && result.entries.length > 0) {
          db.saveWalletJournalEntries(characterId, result.entries);
        }
        if (!result.hasScope) {
          return res.json({ entries: [], needs_scope: true, ref_types: [] });
        }
      } catch (e) {
        console.error('Failed to fetch wallet journal from ESI:', e.message);
      }
    }

    const entries = db.getWalletJournal(characterId, limit, offset, refType);
    const refTypes = db.getWalletJournalRefTypes(characterId);

    // Resolve party names
    const partyIds = new Set();
    entries.forEach(e => {
      if (e.first_party_id) partyIds.add(e.first_party_id);
      if (e.second_party_id) partyIds.add(e.second_party_id);
    });
    const partyNames = partyIds.size > 0 ? await getCharacterNames([...partyIds]) : {};
    entries.forEach(e => {
      e.first_party_name = partyNames[e.first_party_id] || null;
      e.second_party_name = partyNames[e.second_party_id] || null;
    });

    res.json({ entries, ref_types: refTypes, total: entries.length });
  } catch (error) {
    console.error('Wallet journal error:', error);
    res.status(500).json({ error: 'Failed to get wallet journal' });
  }
});

// Manual structure naming endpoint
router.post('/structures/name', requireAuth, (req, res) => {
  const db = require('../database/db');
  const { structureId, name, systemId } = req.body;
  if (!structureId || !name) {
    return res.status(400).json({ error: 'structureId and name are required' });
  }
  db.setCachedName(parseInt(structureId), 'structure', name, systemId ? String(systemId) : null);
  res.json({ success: true, structureId, name });
});

// EVE server + ESI status endpoint
router.get('/eve/status', async (req, res) => {
  const axios = require('axios');
  const result = { tranquility: { online: false }, esi: { online: false } };

  // Check Tranquility server status
  try {
    const tqResp = await axios.get('https://esi.evetech.net/latest/status/?datasource=tranquility', { timeout: 5000 });
    result.tranquility = {
      online: true,
      players: tqResp.data.players || 0,
      server_version: tqResp.data.server_version || null,
      start_time: tqResp.data.start_time || null,
    };
    result.esi = { online: true }; // If we got a TQ response, ESI is working
  } catch (error) {
    const status = error.response?.status;
    if (status === 502 || status === 503) {
      // ESI is up but TQ is down (maintenance)
      result.esi = { online: true };
      result.tranquility = { online: false, maintenance: true };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || !error.response) {
      // ESI is completely unreachable
      result.esi = { online: false };
      result.tranquility = { online: false };
    } else {
      // ESI responded with some error but is reachable
      result.esi = { online: true };
      result.tranquility = { online: false };
    }
  }

  res.json(result);
});

// Cache status endpoint
router.get('/cache/status', requireAuth, (req, res) => {
  const db = require('../database/db');
  const stats = db.getCacheStats();
  const marketAge = db.getMarketPriceAge();
  const costAge = db.getCostIndexAge();
  res.json({ name_cache: stats, market_prices: marketAge, cost_indices: costAge });
});

// Asset endpoints
router.get('/assets', requireAuth, characterController.getCharacterAssets);
router.get('/assets/corp', requireAuth, characterController.getCorporationAssets);

// Planetary industry endpoints (specific routes before parameterized)
router.get('/planets', requireAuth, characterController.getCharacterPlanets);
router.get('/planets/customs', requireAuth, characterController.getCustomsOffices);
router.get('/planets/layout', requireAuth, characterController.getColonyLayout);

module.exports = router;
