const crypto = require('crypto');
const axios = require('axios');
const db = require('../database/db');

// EVE SSO Configuration
const EVE_SSO_AUTH_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const EVE_SSO_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const EVE_SSO_VERIFY_URL = 'https://login.eveonline.com/oauth/verify';

// Required scopes for industry tracking
const REQUIRED_SCOPES = [
  'esi-industry.read_character_jobs.v1',      // Required for viewing personal industry jobs
  'esi-skills.read_skills.v1',                // Required for calculating max job slots
  'esi-skills.read_skillqueue.v1',            // Required for skill training queue
  'esi-industry.read_corporation_jobs.v1',    // Required for corporation industry jobs
  'esi-corporations.read_corporation_membership.v1',  // Required for corp membership
  'esi-characters.read_corporation_roles.v1', // Required for reading character corp roles (Director/Factory_Manager check)
  'esi-assets.read_assets.v1',               // Required for personal asset inventory
  'esi-assets.read_corporation_assets.v1',   // Required for corporation asset inventory
  'esi-planets.manage_planets.v1',           // Required for planetary industry (colonies, layouts)
  'esi-universe.read_structures.v1',          // Required for resolving player structure names
  'esi-wallet.read_character_wallet.v1'      // Required for wallet balance and journal
];

// PKCE helper functions
function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64URLEncode(sha256(verifier));
}

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
};

exports.checkAuth = (req, res) => {
  if (req.session.userId) {
    res.json({ authenticated: true, characterName: req.session.characterName });
  } else {
    res.json({ authenticated: false });
  }
};

// EVE SSO OAuth2 with PKCE — works both as login and add-alt flow
exports.initiateEveAuth = (req, res) => {
  try {
    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = base64URLEncode(crypto.randomBytes(16));

    // Store in session for later verification
    req.session.pkce = {
      codeVerifier,
      state
    };

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: process.env.EVE_REDIRECT_URI,
      client_id: process.env.EVE_CLIENT_ID,
      scope: REQUIRED_SCOPES.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state
    });

    const authUrl = `${EVE_SSO_AUTH_URL}?${params.toString()}`;

    // Force session save before responding (critical for new sessions with saveUninitialized: false)
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to initiate EVE authentication' });
      }
      res.json({ authUrl });
    });
  } catch (error) {
    console.error('EVE auth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate EVE authentication' });
  }
};

exports.handleEveCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect('/?error=missing_parameters');
    }

    // Verify state
    if (!req.session.pkce || state !== req.session.pkce.state) {
      return res.redirect('/?error=invalid_state');
    }

    const codeVerifier = req.session.pkce.codeVerifier;

    // Exchange code for tokens
    const tokenResponse = await axios.post(
      EVE_SSO_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        code_verifier: codeVerifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.EVE_CLIENT_ID}:${process.env.EVE_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Verify token and get character info
    const verifyResponse = await axios.get(EVE_SSO_VERIFY_URL, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const { CharacterID, CharacterName, Scopes } = verifyResponse.data;
    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Clean up PKCE session data
    delete req.session.pkce;

    if (req.session.userId) {
      // Already logged in — linking an alt character
      console.log(`[AUTH] Linking alt ${CharacterName} (${CharacterID}) to user ${req.session.userId}`);
      await db.saveCharacter(
        req.session.userId,
        CharacterID,
        CharacterName,
        access_token,
        refresh_token,
        tokenExpiry,
        Scopes || REQUIRED_SCOPES.join(' ')
      );
    } else {
      // Not logged in — this is a login via EVE SSO
      const existingUser = db.getUserByCharacterId(CharacterID);

      let userId;
      if (existingUser) {
        userId = existingUser.user_id;
        console.log(`[AUTH] ${CharacterName} logged in (user ${userId})`);
      } else {
        userId = db.createUserFromCharacter(CharacterID, CharacterName);
        console.log(`[AUTH] Created new user ${userId} for ${CharacterName} (${CharacterID})`);
      }

      // Save/update character tokens
      await db.saveCharacter(
        userId,
        CharacterID,
        CharacterName,
        access_token,
        refresh_token,
        tokenExpiry,
        Scopes || REQUIRED_SCOPES.join(' ')
      );

      // Set session
      req.session.userId = userId;
      req.session.characterName = CharacterName;
    }

    // Force session save before redirect to ensure cookie is set
    req.session.save((err) => {
      if (err) console.error('Session save error on callback:', err);
      res.redirect('/');
    });
  } catch (error) {
    console.error('EVE callback error:', error.response?.data || error.message);
    res.redirect('/?error=eve_auth_failed');
  }
};

// Export REQUIRED_SCOPES for use by other modules
exports.REQUIRED_SCOPES = REQUIRED_SCOPES;
