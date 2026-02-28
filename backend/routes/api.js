const express = require('express');
const router = express.Router();
const characterController = require('../controllers/characterController');

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Character endpoints
router.get('/character', requireAuth, characterController.getCharacter);
router.get('/character/portrait', requireAuth, characterController.getCharacterPortrait);
router.get('/industry/jobs', requireAuth, characterController.getIndustryJobs);

module.exports = router;
