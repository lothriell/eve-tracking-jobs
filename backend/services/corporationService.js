/**
 * Corporation Service - Handles corporation-related ESI operations
 * Phase 3A-1: Corporation Industry Jobs
 */

const axios = require('axios');

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const ESI_DATASOURCE = 'tranquility';

// Cache for corporation data
const corpCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour

// Industry-related corporation roles
const INDUSTRY_ROLES = ['Director', 'Factory_Manager'];

// Asset-related corporation roles
const CORP_ASSET_ROLES = ['Director', 'Accountant', 'Station_Manager'];

/**
 * Get character's corporation ID from ESI
 */
async function getCharacterCorporation(characterId, accessToken) {
  const cacheKey = `char_corp_${characterId}`;
  const cached = corpCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `${ESI_BASE_URL}/characters/${characterId}/`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { datasource: ESI_DATASOURCE }
      }
    );

    const data = {
      corporation_id: response.data.corporation_id,
      alliance_id: response.data.alliance_id || null
    };

    corpCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`Failed to get corporation for character ${characterId}:`, error.message);
    throw error;
  }
}

/**
 * Get character's corporation roles from ESI
 * Requires: esi-characters.read_corporation_roles.v1 scope
 */
async function getCharacterRoles(characterId, accessToken) {
  try {
    const response = await axios.get(
      `${ESI_BASE_URL}/characters/${characterId}/roles/`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { datasource: ESI_DATASOURCE }
      }
    );

    const result = {
      roles: response.data.roles || [],
      roles_at_hq: response.data.roles_at_hq || [],
      roles_at_base: response.data.roles_at_base || [],
      roles_at_other: response.data.roles_at_other || []
    };
    
    // Log found roles for debugging
    if (result.roles.length > 0) {
      console.log(`Character ${characterId} has roles:`, result.roles);
    }
    
    return result;
  } catch (error) {
    // 403 means missing scope - character needs re-authorization
    if (error.response?.status === 403) {
      console.log(`Character ${characterId} needs re-authorization for corporation roles scope`);
      return { roles: [], hasScope: false, needsReauthorization: true };
    }
    console.error(`Failed to get roles for character ${characterId}:`, error.message);
    return { roles: [], hasScope: false };
  }
}

/**
 * Check if character has industry-related corporation roles
 * Checks for: Director or Factory_Manager
 */
function hasIndustryRole(roles) {
  if (!roles || !roles.roles) return false;
  return roles.roles.some(role => INDUSTRY_ROLES.includes(role));
}

/**
 * Get which specific industry role the character has
 */
function getIndustryRoleName(roles) {
  if (!roles || !roles.roles) return null;
  
  if (roles.roles.includes('Director')) return 'Director';
  if (roles.roles.includes('Factory_Manager')) return 'Factory Manager';
  return null;
}

/**
 * Check if character has asset-related corporation roles
 * Checks for: Director, Accountant, or Station_Manager
 */
function hasCorporationAssetRole(roles) {
  if (!roles || !roles.roles) return false;
  return roles.roles.some(role => CORP_ASSET_ROLES.includes(role));
}

/**
 * Get corporation customs offices from ESI
 * Requires: esi-planets.manage_planets.v1 scope + Director role
 */
async function getCustomsOffices(corporationId, accessToken) {
  try {
    const response = await axios.get(
      `${ESI_BASE_URL}/corporations/${corporationId}/customs_offices/`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { datasource: ESI_DATASOURCE }
      }
    );
    return response.data || [];
  } catch (error) {
    if (error.response?.status === 403) {
      console.log(`No customs office access for corp ${corporationId} - missing scope or role`);
      return [];
    }
    console.error(`Failed to get customs offices for ${corporationId}:`, error.message);
    return [];
  }
}

/**
 * Get corporation public information
 */
async function getCorporationInfo(corporationId) {
  const cacheKey = `corp_info_${corporationId}`;
  const cached = corpCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `${ESI_BASE_URL}/corporations/${corporationId}/`,
      { params: { datasource: ESI_DATASOURCE } }
    );

    const data = {
      corporation_id: corporationId,
      name: response.data.name,
      ticker: response.data.ticker,
      member_count: response.data.member_count,
      ceo_id: response.data.ceo_id,
      alliance_id: response.data.alliance_id || null
    };

    corpCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`Failed to get corporation info for ${corporationId}:`, error.message);
    return {
      corporation_id: corporationId,
      name: `Corporation ${corporationId}`,
      ticker: '???'
    };
  }
}

/**
 * Get corporation industry jobs from ESI
 * Requires: esi-industry.read_corporation_jobs.v1 scope
 * Requires: Director or Factory_Manager role
 */
async function getCorporationJobs(corporationId, accessToken, includeCompleted = false) {
  try {
    const response = await axios.get(
      `${ESI_BASE_URL}/corporations/${corporationId}/industry/jobs/`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { 
          datasource: ESI_DATASOURCE,
          include_completed: includeCompleted
        }
      }
    );

    return response.data || [];
  } catch (error) {
    // Handle specific error cases
    if (error.response?.status === 403) {
      const message = error.response?.data?.error || '';
      if (message.includes('scope')) {
        return { error: 'missing_scope', message: 'Missing required ESI scope for corporation jobs' };
      }
      if (message.includes('role')) {
        return { error: 'missing_role', message: 'Character lacks Director or Factory Manager role' };
      }
      return { error: 'forbidden', message: 'Access denied to corporation jobs' };
    }
    console.error(`Failed to get corporation jobs for ${corporationId}:`, error.message);
    throw error;
  }
}

/**
 * Get member names for corporation jobs (installer names)
 */
async function getCorporationMemberNames(characterIds) {
  if (!characterIds || characterIds.length === 0) return {};

  const uniqueIds = [...new Set(characterIds)].filter(id => id);
  
  try {
    const response = await axios.post(
      `${ESI_BASE_URL}/universe/names/`,
      uniqueIds,
      {
        headers: { 'Content-Type': 'application/json' },
        params: { datasource: ESI_DATASOURCE }
      }
    );

    const names = {};
    response.data.forEach(item => {
      names[item.id] = item.name;
    });
    return names;
  } catch (error) {
    console.error('Failed to get member names:', error.message);
    return {};
  }
}

module.exports = {
  getCharacterCorporation,
  getCharacterRoles,
  hasIndustryRole,
  getIndustryRoleName,
  hasCorporationAssetRole,
  getCustomsOffices,
  getCorporationInfo,
  getCorporationJobs,
  getCorporationMemberNames,
  INDUSTRY_ROLES,
  CORP_ASSET_ROLES
};
