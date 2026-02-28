import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://10.69.10.15:3001';

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

export default api;
