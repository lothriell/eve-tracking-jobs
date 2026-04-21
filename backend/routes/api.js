const express = require('express');
const router = express.Router();
const characterController = require('../controllers/characterController');
const tradingController = require('../controllers/tradingController');
const adminController = require('../controllers/adminController');
const corpIndustryController = require('../controllers/corporationIndustryController');
const { requireFeature, requireAdmin, getEnabledFeatures } = require('../middleware/featureAccess');

// Version endpoint (for deployment verification)
router.get('/version', (req, res) => {
  res.json({
    version: '5.14.1',
    name: 'EVE Industry Tracker',
    buildDate: '2026-04-20'
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

// Corporation industry history (append-only archive + aggregated stats)
router.get('/corporation/industry/stats', requireAuth, corpIndustryController.getStats);
router.get('/corporation/industry/history', requireAuth, corpIndustryController.getHistory);
router.post('/corporation/industry/backfill', requireAuth, requireAdmin, corpIndustryController.runBackfill);

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

    // Save wealth snapshots (max once per hour, only with real data)
    try {
      const latest = db.getLatestSnapshotDate(req.session.userId);
      const hourAgo = new Date(Date.now() - 3600000).toISOString();
      if (!latest || latest < hourAgo) {
        for (const r of results) {
          // Only snapshot characters with actual asset data
          if (r.asset_value > 0) {
            db.saveWealthSnapshot(r.character_id, req.session.userId, r.wallet_balance || 0, r.asset_value);
          }
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
    const days = req.query.days === 'all' ? 99999 : Math.min(parseInt(req.query.days) || 30, 3650);
    // Clean up bad snapshots (0 asset value = no real data)
    try { db.db.prepare('DELETE FROM wealth_snapshots WHERE asset_value = 0 AND wallet_balance = 0').run(); } catch {}
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
  const { getWalletJournal, getWalletTransactions, getCharacterNames, getTypeNames } = require('../services/esiClient');

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

    // Check if cache is stale (>15 min since newest entry) or transactions missing
    const newest = db.getWalletJournalNewest(characterId);
    const newestTx = db.getWalletTransactionsNewest(characterId);
    const fifteenMinAgo = new Date(Date.now() - 900000).toISOString();
    if (!newest?.newest || newest.newest < fifteenMinAgo || !newestTx?.newest) {
      try {
        const accessToken = await getValidAccessToken(character);
        const [journalResult, txResult] = await Promise.all([
          getWalletJournal(characterId, accessToken),
          getWalletTransactions(characterId, accessToken)
        ]);
        if (journalResult.hasScope && journalResult.entries.length > 0) {
          db.saveWalletJournalEntries(characterId, journalResult.entries);
        }
        if (txResult.hasScope && txResult.transactions.length > 0) {
          db.saveWalletTransactions(characterId, txResult.transactions);
        }
        if (!journalResult.hasScope) {
          return res.json({ entries: [], needs_scope: true, ref_types: [] });
        }
      } catch (e) {
        console.error('Failed to fetch wallet data from ESI:', e.message);
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

    // Attach matching market transactions to journal entries by date+amount
    const marketEntries = entries.filter(e => e.ref_type === 'market_transaction');
    if (marketEntries.length > 0) {
      const dates = marketEntries.map(e => e.date);
      const transactions = db.getTransactionsByDates(characterId, dates);
      if (transactions.length > 0) {
        const txTypeIds = [...new Set(transactions.map(t => t.type_id).filter(Boolean))];
        const txTypeNames = txTypeIds.length > 0 ? await getTypeNames(txTypeIds) : {};
        transactions.forEach(t => { t.type_name = txTypeNames[t.type_id] || `Type ${t.type_id}`; });
        // Match by date and absolute amount
        const txByKey = {};
        transactions.forEach(t => {
          const total = t.quantity * t.unit_price;
          const key = `${t.date}|${Math.round(total)}`;
          txByKey[key] = t;
        });
        entries.forEach(e => {
          if (e.ref_type === 'market_transaction') {
            const key = `${e.date}|${Math.round(Math.abs(e.amount))}`;
            e.transaction = txByKey[key] || null;
          } else {
            e.transaction = null;
          }
        });
      } else {
        entries.forEach(e => { e.transaction = null; });
      }
    } else {
      entries.forEach(e => { e.transaction = null; });
    }

    res.json({ entries, ref_types: refTypes, total: entries.length });
  } catch (error) {
    console.error('Wallet journal error:', error);
    res.status(500).json({ error: 'Failed to get wallet journal' });
  }
});

// Wallet market transactions
router.get('/wallet/transactions', requireAuth, async (req, res) => {
  const db = require('../database/db');
  const { getValidAccessToken } = require('../services/tokenRefresh');
  const { getWalletTransactions, getTypeNames, getCharacterNames, getLocationName } = require('../services/esiClient');

  try {
    const characterId = parseInt(req.query.characterId);
    if (!characterId) return res.status(400).json({ error: 'characterId required' });

    const character = db.getCharacterById(characterId);
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    // Refresh cache if stale
    const newest = db.getWalletTransactionsNewest(characterId);
    const fifteenMinAgo = new Date(Date.now() - 900000).toISOString();
    if (!newest?.newest || newest.newest < fifteenMinAgo) {
      try {
        const accessToken = await getValidAccessToken(character);
        const result = await getWalletTransactions(characterId, accessToken);
        if (result.hasScope && result.transactions.length > 0) {
          db.saveWalletTransactions(characterId, result.transactions);
        }
        if (!result.hasScope) {
          return res.json({ transactions: [], needs_scope: true });
        }
      } catch (e) {
        console.error('Failed to fetch wallet transactions from ESI:', e.message);
      }
    }

    const transactions = db.getWalletTransactions(characterId, limit, offset);

    // Resolve names
    const typeIds = [...new Set(transactions.map(t => t.type_id).filter(Boolean))];
    const clientIds = [...new Set(transactions.map(t => t.client_id).filter(Boolean))];
    const [typeNames, clientNames] = await Promise.all([
      typeIds.length > 0 ? getTypeNames(typeIds) : {},
      clientIds.length > 0 ? getCharacterNames(clientIds) : {}
    ]);

    // Resolve locations (batch — reuse cache)
    const accessToken = await getValidAccessToken(character);
    const locationIds = [...new Set(transactions.map(t => t.location_id).filter(Boolean))];
    const locationNames = {};
    for (const locId of locationIds) {
      try { locationNames[locId] = await getLocationName(locId, accessToken); } catch {}
    }

    const enriched = transactions.map(t => ({
      ...t,
      type_name: typeNames[t.type_id] || `Type ${t.type_id}`,
      client_name: clientNames[t.client_id] || null,
      location_name: locationNames[t.location_id] || null,
      total: (t.quantity || 0) * (t.unit_price || 0),
    }));

    res.json({ transactions: enriched, total: enriched.length });
  } catch (error) {
    console.error('Wallet transactions error:', error);
    res.status(500).json({ error: 'Failed to get wallet transactions' });
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
  const axios = require('../services/httpClient');
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

// ===== USER FEATURES =====
router.get('/me/features', requireAuth, async (req, res) => {
  const db = require('../database/db');
  const features = await getEnabledFeatures(req.session.userId);
  const is_admin = db.isAdmin(req.session.userId);
  res.json({ features, is_admin });
});

// ===== ADMIN ENDPOINTS =====
const adminAuth = [requireAuth, requireAdmin];
router.get('/admin/users', ...adminAuth, adminController.getUsers);
router.get('/admin/features', ...adminAuth, adminController.getFeatures);
router.put('/admin/users/:userId/admin', ...adminAuth, adminController.toggleAdmin);
router.post('/admin/users/:userId/features', ...adminAuth, adminController.grantUserFeature);
router.delete('/admin/users/:userId/features/:featureName', ...adminAuth, adminController.revokeUserFeature);
router.get('/admin/corps', ...adminAuth, adminController.getCorpGrants);
router.post('/admin/corps', ...adminAuth, adminController.grantCorpFeature);
router.delete('/admin/corps/:corpId/features/:featureName', ...adminAuth, adminController.revokeCorpFeature);
router.post('/admin/sde/refresh', ...adminAuth, async (req, res) => {
  try {
    const { importBlueprintsFromHoboleaks } = require('../services/sdeImport');
    const db = require('../database/db');
    db.clearBlueprintData();
    const count = await importBlueprintsFromHoboleaks();
    const { getHoboleaksRevision } = require('../services/sdeImport');
    const revision = await getHoboleaksRevision();
    if (revision) db.setSdeMeta('hoboleaks_revision', revision);
    res.json({ success: true, entries: count, revision });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TRADING ENDPOINTS =====
const tradeAuth = [requireAuth, requireFeature('trading'), tradingController.ensureHubsSeeded];

router.get('/trading/hubs', ...tradeAuth, tradingController.getHubs);
router.post('/trading/hubs', ...tradeAuth, tradingController.addHub);
router.delete('/trading/hubs/:hubId', ...tradeAuth, tradingController.removeHub);
router.put('/trading/hubs/:hubId', ...tradeAuth, tradingController.toggleHub);
router.get('/trading/compare/:typeId', ...tradeAuth, tradingController.compareItem);
router.get('/trading/find', ...tradeAuth, tradingController.findTrades);
router.get('/trading/settings', ...tradeAuth, tradingController.getSettings);
router.put('/trading/settings', ...tradeAuth, tradingController.updateSettings);
router.get('/trading/settings/auto', ...tradeAuth, tradingController.autoDetectSkills);
router.get('/trading/build-vs-buy', ...tradeAuth, tradingController.buildVsBuy);
router.get('/trading/build-tree/:typeId', ...tradeAuth, tradingController.getBuildTree);
router.get('/trading/stock-analysis', ...tradeAuth, tradingController.stockAnalysis);
router.get('/trading/types/search', ...tradeAuth, tradingController.searchTypes);
router.get('/trading/stations/search', ...tradeAuth, tradingController.searchStations);
router.get('/trading/systems/search', ...tradeAuth, tradingController.searchSystems);

module.exports = router;
