const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// EVE SSO OAuth2 (login + add alt)
router.get('/eve/authorize', authController.initiateEveAuth);
router.get('/eve/callback', authController.handleEveCallback);

// Handle callback at /auth/callback (matches EVE_REDIRECT_URI)
router.get('/callback', authController.handleEveCallback);

// Session management
router.post('/logout', authController.logout);
router.get('/check', authController.checkAuth);

module.exports = router;
