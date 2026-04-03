import axios from 'axios';

// Use relative URLs - nginx will proxy to backend
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Auth endpoints
export const logout = () => {
  return api.post('/auth/logout');
};

export const checkAuth = () => {
  return api.get('/auth/check');
};

export const initiateEveAuth = () => {
  return api.get('/auth/eve/authorize');
};

// Character endpoints
export const getCharacter = () => {
  return api.get('/api/character');
};

export const getCharacterPortrait = (characterId = null) => {
  if (characterId) {
    return api.get(`/api/character/portrait/${characterId}`);
  }
  return api.get('/api/character/portrait');
};

// Multiple character endpoints
export const getAllCharacters = () => {
  return api.get('/api/characters');
};

export const getCharacterById = (characterId) => {
  return api.get(`/api/characters/${characterId}`);
};

export const deleteCharacter = (characterId) => {
  return api.delete(`/api/characters/${characterId}`);
};

// Industry endpoints
export const getIndustryJobs = (characterId = null, all = false) => {
  const params = new URLSearchParams();
  if (all) {
    params.append('all', 'true');
  } else if (characterId) {
    params.append('characterId', characterId);
  }
  return api.get(`/api/industry/jobs?${params.toString()}`);
};

export const getJobSlots = (characterId = null, all = false) => {
  const params = new URLSearchParams();
  if (all) {
    params.append('all', 'true');
  } else if (characterId) {
    params.append('characterId', characterId);
  }
  return api.get(`/api/industry/slots?${params.toString()}`);
};

// Dashboard endpoint
export const getDashboardStats = () => {
  return api.get('/api/dashboard/stats');
};

// Character summary page
export const getCharacterSummary = (characterId) => {
  return api.get(`/api/character/${characterId}/summary`);
};

// Corporation endpoints
export const getCorporations = () => {
  return api.get('/api/corporations');
};

export const getCorporationJobs = (characterId = null) => {
  if (characterId) {
    return api.get(`/api/corporation/jobs/${characterId}`);
  }
  return api.get('/api/corporation/jobs');
};

export const getCorporationRoles = (characterId) => {
  return api.get(`/api/corporation/roles/${characterId}`);
};

// Asset endpoints
export const getCharacterAssets = (characterId = null, all = false, priceMode = 'average') => {
  const params = new URLSearchParams();
  if (all) {
    params.append('all', 'true');
  } else if (characterId) {
    params.append('characterId', characterId);
  }
  if (priceMode !== 'average') {
    params.append('priceMode', priceMode);
  }
  return api.get(`/api/assets?${params.toString()}`);
};

export const getCorporationAssets = (characterId, priceMode = 'average') => {
  const params = new URLSearchParams({ characterId });
  if (priceMode !== 'average') params.append('priceMode', priceMode);
  return api.get(`/api/assets/corp?${params.toString()}`);
};

// Planetary industry endpoints
export const getCharacterPlanets = (characterId = null, all = false) => {
  const params = new URLSearchParams();
  if (all) {
    params.append('all', 'true');
  } else if (characterId) {
    params.append('characterId', characterId);
  }
  return api.get(`/api/planets?${params.toString()}`);
};

export const getColonyLayout = (characterId, planetId) => {
  return api.get(`/api/planets/layout?characterId=${characterId}&planetId=${planetId}`);
};

// Wealth summary
export const getWealth = (characterId = null) => {
  const params = characterId ? `?characterId=${characterId}` : '';
  return api.get(`/api/wealth${params}`);
};

// Wealth history for chart
export const getWealthHistory = (days = 30) => {
  return api.get(`/api/wealth/history?days=${days}`);
};

// Wallet journal
export const getWalletJournal = (characterId, limit = 100, offset = 0, refType = null) => {
  const params = new URLSearchParams({ characterId, limit, offset });
  if (refType) params.append('refType', refType);
  return api.get(`/api/wallet/journal?${params.toString()}`);
};

// Wallet market transactions
export const getWalletTransactions = (characterId, limit = 100, offset = 0) => {
  const params = new URLSearchParams({ characterId, limit, offset });
  return api.get(`/api/wallet/transactions?${params.toString()}`);
};

// EVE server status
export const getEveStatus = () => {
  return api.get('/api/eve/status');
};

// Structure naming (manual)
export const nameStructure = (structureId, name, systemId = null) => {
  return api.post('/api/structures/name', { structureId, name, systemId });
};

export const getCustomsOffices = (characterId) => {
  return api.get(`/api/planets/customs?characterId=${characterId}`);
};

// ===== TRADING ENDPOINTS =====

export const getTradeHubs = () => {
  return api.get('/api/trading/hubs');
};

export const addTradeHub = (name, stationId, regionId) => {
  return api.post('/api/trading/hubs', { name, stationId, regionId });
};

export const removeTradeHub = (hubId) => {
  return api.delete(`/api/trading/hubs/${hubId}`);
};

export const toggleTradeHub = (hubId, enabled) => {
  return api.put(`/api/trading/hubs/${hubId}`, { enabled });
};

export const getHubComparison = (typeId) => {
  return api.get(`/api/trading/compare/${typeId}`);
};

export const findTrades = (params) => {
  return api.get('/api/trading/find', { params });
};

export const getTradeSettings = (characterId) => {
  return api.get(`/api/trading/settings?characterId=${characterId}`);
};

export const updateTradeSettings = (settings) => {
  return api.put('/api/trading/settings', settings);
};

export const autoDetectTradeSkills = (characterId) => {
  return api.get(`/api/trading/settings/auto?characterId=${characterId}`);
};

export const searchTypes = (query) => {
  return api.get(`/api/trading/types/search?q=${encodeURIComponent(query)}`);
};

export const searchStations = (query) => {
  return api.get(`/api/trading/stations/search?q=${encodeURIComponent(query)}`);
};

export default api;
