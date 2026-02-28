const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Simple username/password authentication
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/check', authController.checkAuth);

// EVE SSO OAuth2
router.get('/eve/authorize', authController.initiateEveAuth);
router.get('/eve/callback', authController.handleEveCallback);

module.exports = router;
