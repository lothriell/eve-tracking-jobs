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
export const login = (username, password) => {
  return api.post('/auth/login', { username, password });
};

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
export const getCharacterAssets = (characterId = null, all = false) => {
  const params = new URLSearchParams();
  if (all) {
    params.append('all', 'true');
  } else if (characterId) {
    params.append('characterId', characterId);
  }
  return api.get(`/api/assets?${params.toString()}`);
};

export const getCorporationAssets = (characterId) => {
  return api.get(`/api/assets/corp?characterId=${characterId}`);
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

export default api;
