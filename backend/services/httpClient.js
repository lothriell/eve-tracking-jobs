/**
 * Shared HTTP client for all outbound ESI / EVE SSO calls.
 *
 * Node 19+ flipped http.Agent default to keepAlive:true. Combined with axios's
 * internal wrappers attaching error listeners per request, reusing a TLSSocket
 * leaks listeners and triggers MaxListenersExceededWarning under a tight
 * token-refresh cycle across ~25 characters.
 *
 * Force keepAlive:false so every request gets a fresh socket — no accumulation.
 */
const axios = require('axios');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

const client = axios.create({ httpAgent, httpsAgent });

module.exports = client;
