const bcrypt = require('bcrypt');
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
  'esi-industry.read_corporation_jobs.v1',    // Required for corporation industry jobs
  'esi-corporations.read_corporation_membership.v1', // Required for corp membership/roles
  'esi-characters.read_corporation_roles.v1'  // Required for character's corporation roles
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

// Simple username/password login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ success: true, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

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
    res.json({ authenticated: true, username: req.session.username });
  } else {
    res.json({ authenticated: false });
  }
};

// EVE SSO OAuth2 with PKCE
exports.initiateEveAuth = (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

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
      redirect_uri: process.env.EVE_REDIRECT_URI || 'http://10.69.10.15:9000/auth/callback',
      client_id: process.env.EVE_CLIENT_ID,
      scope: REQUIRED_SCOPES.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state
    });

    const authUrl = `${EVE_SSO_AUTH_URL}?${params.toString()}`;
    res.json({ authUrl });
  } catch (error) {
    console.error('EVE auth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate EVE authentication' });
  }
};

exports.handleEveCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!req.session.userId) {
      return res.redirect('/?error=not_authenticated');
    }

    if (!code || !state) {
      return res.redirect('/?error=missing_parameters');
    }

    // Verify state
    if (!req.session.pkce || state !== req.session.pkce.state) {
      return res.redirect('/?error=invalid_state');
    }

    const codeVerifier = req.session.pkce.codeVerifier;

    // Exchange code for tokens
    // Note: Client credentials are sent ONLY in the Authorization header (Basic Auth)
    // Do NOT include client_id/client_secret in the body - EVE SSO rejects duplicate credentials
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

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Save character to database
    await db.saveCharacter(
      req.session.userId,
      CharacterID,
      CharacterName,
      access_token,
      refresh_token,
      tokenExpiry,
      Scopes || REQUIRED_SCOPES.join(' ')
    );

    // Clean up PKCE session data
    delete req.session.pkce;

    // Redirect to main page
    res.redirect('/');
  } catch (error) {
    console.error('EVE callback error:', error.response?.data || error.message);
    res.redirect('/?error=eve_auth_failed');
  }
};
