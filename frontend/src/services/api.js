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

export const getCharacterPortrait = () => {
  return api.get('/api/character/portrait');
};

export const getIndustryJobs = () => {
  return api.get('/api/industry/jobs');
};

export default api;
