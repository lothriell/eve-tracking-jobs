const express = require('express');
const router = express.Router();
const characterController = require('../controllers/characterController');

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

// Dashboard endpoint
router.get('/dashboard/stats', requireAuth, characterController.getDashboardStats);

module.exports = router;
