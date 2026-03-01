const axios = require('axios');
const db = require('../database/db');

const EVE_SSO_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

// Check if token is expired or about to expire (within 5 minutes)
function isTokenExpired(tokenExpiry) {
  const expiryDate = new Date(tokenExpiry);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  return expiryDate <= fiveMinutesFromNow;
}

async function refreshAccessToken(character) {
  try {
    console.log(`Refreshing token for character ${character.character_name}`);

    // Note: Client credentials are sent ONLY in the Authorization header (Basic Auth)
    // Do NOT include client_id in the body - EVE SSO rejects duplicate credentials
    const response = await axios.post(
      EVE_SSO_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: character.refresh_token
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.EVE_CLIENT_ID}:${process.env.EVE_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Update tokens in database
    await db.updateCharacterTokens(
      character.character_id,
      access_token,
      refresh_token || character.refresh_token, // Use new refresh token if provided
      tokenExpiry
    );

    console.log(`Token refreshed successfully for character ${character.character_name}`);
    return access_token;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

async function getValidAccessToken(character) {
  if (isTokenExpired(character.token_expiry)) {
    return await refreshAccessToken(character);
  }
  return character.access_token;
}

module.exports = {
  isTokenExpired,
  refreshAccessToken,
  getValidAccessToken
};
