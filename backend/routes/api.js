const express = require('express');
const router = express.Router();
const characterController = require('../controllers/characterController');

// Version endpoint (for deployment verification)
router.get('/version', (req, res) => {
  res.json({ 
    version: '4.2.0',
    name: 'EVE Industry Tracker',
    buildDate: '2026-03-25'
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
