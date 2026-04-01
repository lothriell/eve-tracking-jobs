const axios = require('axios');
const db = require('../database/db');

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const ESI_DATASOURCE = 'tranquility';

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerSecond: 20,
  lastRequestTime: 0,
  minInterval: 1000 / 20
};


// Wait to respect rate limits
function waitForRateLimit() {
  return new Promise((resolve) => {
    const now = Date.now();
    const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT.minInterval) {
      const delay = RATE_LIMIT.minInterval - timeSinceLastRequest;
      setTimeout(() => {
        RATE_LIMIT.lastRequestTime = Date.now();
        resolve();
      }, delay);
    } else {
      RATE_LIMIT.lastRequestTime = now;
      resolve();
    }
  });
}

// Generic ESI request function
async function makeESIRequest(url, accessToken = null, params = {}) {
  await waitForRateLimit();

  try {
    const headers = {
      'User-Agent': 'EVE-ESI-App/2.0'
    };
    
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await axios.get(url, {
      headers,
      params: {
        datasource: ESI_DATASOURCE,
        ...params
      }
    });

    return response.data;
  } catch (error) {
    console.error('ESI request error:', error.response?.data || error.message);
    throw error;
  }
}

// Activity ID to name mapping
const ACTIVITY_MAP = {
  1: { name: 'Manufacturing', category: 'manufacturing' },
  3: { name: 'TE Research', category: 'science' },
  4: { name: 'ME Research', category: 'science' },
  5: { name: 'Copying', category: 'science' },
  7: { name: 'Reverse Engineering', category: 'science' },
  8: { name: 'Invention', category: 'science' },
  9: { name: 'Reactions', category: 'reactions' }
};

function getActivityInfo(activityId) {
  return ACTIVITY_MAP[activityId] || { name: `Activity ${activityId}`, category: 'other' };
}

// Get type name — checks SQLite cache first, then ESI
async function getTypeName(typeId) {
  // Check SQLite cache
  const cached = db.getCachedName(typeId, 'type');
  if (cached) return cached.name;

  try {
    const url = `${ESI_BASE_URL}/universe/types/${typeId}/`;
    const data = await makeESIRequest(url);
    const name = data.name || `Type ${typeId}`;
    db.setCachedName(typeId, 'type', name);
    return name;
  } catch (error) {
    return `Type ${typeId}`;
  }
}

// Batch get type names — SQLite cache first, then ESI POST /universe/names/
async function getTypeNames(typeIds) {
  const uniqueIds = [...new Set(typeIds)].filter(Boolean);
  if (uniqueIds.length === 0) return {};

  const results = {};
  const idsToFetch = [];

  // Check SQLite cache first (single batch query)
  const cachedNames = db.getCachedNames(uniqueIds, 'type');
  for (const id of uniqueIds) {
    if (cachedNames[id]) {
      results[id] = cachedNames[id].name;
    } else {
      idsToFetch.push(id);
    }
  }

  // Fetch remaining from ESI using POST /universe/names/
  if (idsToFetch.length > 0) {
    // POST /universe/names/ accepts max 1000 IDs, batch if needed
    for (let i = 0; i < idsToFetch.length; i += 1000) {
      const batch = idsToFetch.slice(i, i + 1000);
      try {
        await waitForRateLimit();
        const response = await axios.post(
          `${ESI_BASE_URL}/universe/names/`,
          batch,
          {
            headers: { 'Content-Type': 'application/json' },
            params: { datasource: ESI_DATASOURCE }
          }
        );

        const cacheEntries = [];
        for (const item of response.data) {
          results[item.id] = item.name;
          cacheEntries.push({ id: item.id, category: 'type', name: item.name });
        }
        // Batch store in SQLite
        if (cacheEntries.length > 0) {
          db.setCachedNames(cacheEntries);
        }
      } catch (error) {
        // Fallback: individual lookups for remaining
        for (const id of batch) {
          if (!results[id]) {
            results[id] = await getTypeName(id);
          }
        }
      }
    }
  }

  return results;
}

// Get station/structure name
async function getLocationName(locationId, accessToken) {
  const info = await getLocationInfo(locationId, accessToken);
  return info.name;
}

// Identify location type from ID range
function classifyLocationId(locationId) {
  if (locationId === 2004) return 'asset_safety';
  if (locationId >= 30000000 && locationId < 33000000) return 'solar_system';
  if (locationId >= 60000000 && locationId < 64000000) return 'station';
  if (locationId >= 1000000000000) return 'structure';
  return 'unknown';
}

// Get location info including name and system_id
async function getLocationInfo(locationId, accessToken) {
  const locType = classifyLocationId(locationId);

  if (locType === 'asset_safety') {
    return { name: 'Asset Safety', system_id: null, location_class: locType };
  }

  // Check SQLite cache for structures
  if (locType === 'structure') {
    const cached = db.getCachedName(locationId, 'structure');
    if (cached) {
      return {
        name: cached.name,
        system_id: cached.extra_data ? parseInt(cached.extra_data) : null,
        location_class: locType
      };
    }
  }

  // Check SQLite cache for stations
  if (locType === 'station') {
    const cached = db.getCachedName(locationId, 'station');
    if (cached) {
      return {
        name: cached.name,
        system_id: cached.extra_data ? parseInt(cached.extra_data) : null,
        location_class: locType
      };
    }
  }

  let info = { name: `Location ${locationId}`, system_id: null, location_class: locType };

  try {
    switch (locType) {
      case 'solar_system':
        info = { name: await getSystemName(locationId), system_id: locationId, location_class: locType };
        break;

      case 'station': {
        const url = `${ESI_BASE_URL}/universe/stations/${locationId}/`;
        const data = await makeESIRequest(url);
        info = {
          name: data.name || `Station ${locationId}`,
          system_id: data.system_id || null,
          location_class: locType
        };
        db.setCachedName(locationId, 'station', info.name, String(info.system_id || ''));
        break;
      }

      case 'structure': {
        try {
          const url = `${ESI_BASE_URL}/universe/structures/${locationId}/`;
          const data = await makeESIRequest(url, accessToken);
          info = {
            name: data.name || `Structure ${locationId}`,
            system_id: data.solar_system_id || null,
            location_class: locType
          };
          db.setCachedName(locationId, 'structure', info.name, String(info.system_id || ''));
        } catch (structError) {
          return { name: null, system_id: null, location_class: locType, unresolved: true };
        }
        break;
      }

      default:
        info = { name: `Location ${locationId}`, system_id: null, location_class: locType };
    }
  } catch (error) {
    console.error(`Failed to get location info for ${locationId}:`, error.message);
  }

  return info;
}

// Get character's industry jobs with enhanced data
async function getCharacterIndustryJobs(characterId, accessToken, includeCompleted = false) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/industry/jobs/`;
    const jobs = await makeESIRequest(url, accessToken, { include_completed: includeCompleted });

    if (!jobs || jobs.length === 0) {
      return [];
    }

    // Collect all type IDs for batch fetching
    const typeIds = new Set();
    jobs.forEach(job => {
      if (job.blueprint_type_id) typeIds.add(job.blueprint_type_id);
      if (job.product_type_id) typeIds.add(job.product_type_id);
    });

    // Batch fetch type names
    const typeNames = await getTypeNames([...typeIds]);

    // Transform jobs
    const transformedJobs = jobs.map(job => {
      const activityInfo = getActivityInfo(job.activity_id);
      const now = new Date();
      const endDate = new Date(job.end_date);
      const startDate = new Date(job.start_date);
      const totalDuration = endDate - startDate;
      const elapsed = now - startDate;
      const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      const timeRemaining = Math.max(0, endDate - now);

      return {
        job_id: job.job_id,
        activity_id: job.activity_id,
        activity: activityInfo.name,
        activity_category: activityInfo.category,
        status: job.status,
        runs: job.runs,
        licensed_runs: job.licensed_runs,
        start_date: job.start_date,
        end_date: job.end_date,
        installer_id: job.installer_id,
        facility_id: job.facility_id,
        station_id: job.station_id,
        blueprint_type_id: job.blueprint_type_id,
        blueprint_name: typeNames[job.blueprint_type_id] || `Blueprint ${job.blueprint_type_id}`,
        product_type_id: job.product_type_id,
        product_name: job.product_type_id ? typeNames[job.product_type_id] : null,
        progress: progress,
        time_remaining_ms: timeRemaining,
        output_location_id: job.output_location_id,
        cost: job.cost,
        probability: job.probability
      };
    }).sort((a, b) => a.time_remaining_ms - b.time_remaining_ms);

    return transformedJobs;
  } catch (error) {
    console.error('Get industry jobs error:', error);
    throw error;
  }
}

// Get character skills for job slot calculation
async function getCharacterSkills(characterId, accessToken) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/skills/`;
    const data = await makeESIRequest(url, accessToken);
    return { skills: data.skills || [], hasScope: true };
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      // Token missing skills scope — needs re-auth, not an error
    } else {
      console.error(`Get character skills error (${characterId}):`, error.message);
    }
    return { skills: [], hasScope: false };
  }
}

// Get character skill queue
async function getCharacterSkillQueue(characterId, accessToken) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/skillqueue/`;
    const data = await makeESIRequest(url, accessToken);
    return { queue: data || [], hasScope: true };
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      // Token missing skillqueue scope — needs re-auth, not an error
    } else {
      console.error(`Get character skill queue error (${characterId}):`, error.message);
    }
    return { queue: [], hasScope: false };
  }
}

// Calculate job slots based on skills
function calculateJobSlots(skills) {
  // Skill IDs for industry slots
  // Manufacturing skills
  const MASS_PRODUCTION = 3387;        // +1 manufacturing slot per level (max 5)
  const ADV_MASS_PRODUCTION = 24625;   // +1 manufacturing slot per level (max 5)
  // Science skills
  const LABORATORY_OPERATION = 3406;   // +1 science slot per level (max 5)
  const ADV_LABORATORY_OP = 24624;     // +1 science slot per level (max 5)
  // Reaction skills (FIXED in v3.2.1: correct skill IDs)
  // 45746 = Reactions (base skill, reduces time, NOT for slots)
  // 45748 = Mass Reactions (adds +1 slot per level)
  // 45749 = Advanced Mass Reactions (adds +1 slot per level)
  const MASS_REACTIONS = 45748;        // +1 reaction slot per level (max 5)
  const ADV_MASS_REACTIONS = 45749;    // +1 reaction slot per level (max 5)

  const skillMap = {};
  skills.forEach(skill => {
    skillMap[skill.skill_id] = skill.trained_skill_level || 0;
  });

  // Base slots: 1 manufacturing, 1 science, 1 reaction
  // Maximum: 11 manufacturing, 11 science, 11 reactions (with all skills at V)
  const manufacturingSlots = 1 + 
    (skillMap[MASS_PRODUCTION] || 0) + 
    (skillMap[ADV_MASS_PRODUCTION] || 0);

  const scienceSlots = 1 + 
    (skillMap[LABORATORY_OPERATION] || 0) + 
    (skillMap[ADV_LABORATORY_OP] || 0);

  // Reactions: 1 base + Mass Reactions level + Advanced Mass Reactions level
  const reactionSlots = 1 + 
    (skillMap[MASS_REACTIONS] || 0) + 
    (skillMap[ADV_MASS_REACTIONS] || 0);

  return {
    manufacturing: { max: manufacturingSlots },
    science: { max: scienceSlots },
    reactions: { max: reactionSlots }
  };
}

// Get max slot counts from skills only (no jobs fetch — avoids duplicate ESI call)
async function getMaxSlots(characterId, accessToken) {
  try {
    const skillsResult = await getCharacterSkills(characterId, accessToken);
    const slots = calculateJobSlots(skillsResult.skills);
    return { ...slots, hasSkillsScope: skillsResult.hasScope, needsReauthorization: !skillsResult.hasScope };
  } catch (error) {
    return { manufacturing: { max: 1 }, science: { max: 1 }, reactions: { max: 1 }, hasSkillsScope: false, needsReauthorization: true };
  }
}

// Get job slot usage for a character (fetches jobs + skills)
async function getJobSlotUsage(characterId, accessToken) {
  try {
    // Get active jobs and skills in parallel
    const [jobs, skillsResult] = await Promise.all([
      getCharacterIndustryJobs(characterId, accessToken, false),
      getCharacterSkills(characterId, accessToken)
    ]);
    const slots = calculateJobSlots(skillsResult.skills);

    // Count active jobs by category
    let manufacturingActive = 0;
    let scienceActive = 0;
    let reactionsActive = 0;

    jobs.forEach(job => {
      if (job.status === 'active') {
        switch (job.activity_category) {
          case 'manufacturing':
            manufacturingActive++;
            break;
          case 'science':
            scienceActive++;
            break;
          case 'reactions':
            reactionsActive++;
            break;
        }
      }
    });

    return {
      manufacturing: { current: manufacturingActive, max: slots.manufacturing.max },
      science: { current: scienceActive, max: slots.science.max },
      reactions: { current: reactionsActive, max: slots.reactions.max },
      hasSkillsScope: skillsResult.hasScope,
      needsReauthorization: !skillsResult.hasScope
    };
  } catch (error) {
    console.error('Get job slot usage error:', error);
    // Return default values on error
    return {
      manufacturing: { current: 0, max: 1 },
      science: { current: 0, max: 1 },
      reactions: { current: 0, max: 0 },
      hasSkillsScope: false,
      needsReauthorization: true
    };
  }
}

// Get character's public information
async function getCharacterPublicInfo(characterId) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/`;
    return await makeESIRequest(url, null);
  } catch (error) {
    console.error('Get character info error:', error);
    throw error;
  }
}

// Get character/entity names — SQLite cache first, then ESI
async function getCharacterNames(characterIds) {
  const uniqueIds = [...new Set(characterIds)].filter(id => id);
  if (uniqueIds.length === 0) return {};

  const names = {};
  const idsToFetch = [];

  // Check SQLite cache
  const cached = db.getCachedNames(uniqueIds, 'character');
  for (const id of uniqueIds) {
    if (cached[id]) {
      names[id] = cached[id].name;
    } else {
      idsToFetch.push(id);
    }
  }

  // Fetch remaining from ESI
  if (idsToFetch.length > 0) {
    try {
      await waitForRateLimit();
      const response = await axios.post(
        `${ESI_BASE_URL}/universe/names/`,
        idsToFetch,
        {
          headers: { 'Content-Type': 'application/json' },
          params: { datasource: ESI_DATASOURCE }
        }
      );

      const cacheEntries = [];
      response.data.forEach(item => {
        names[item.id] = item.name;
        cacheEntries.push({ id: item.id, category: 'character', name: item.name });
      });
      if (cacheEntries.length > 0) {
        db.setCachedNames(cacheEntries);
      }
    } catch (error) {
      console.error('Failed to get character names:', error.message);
    }
  }

  return names;
}

/**
 * Transform corporation industry jobs with enhanced data
 */
async function transformCorporationJobs(jobs, corporationInfo) {
  if (!jobs || jobs.length === 0) {
    return [];
  }

  // Collect all type IDs for batch fetching
  const typeIds = new Set();
  jobs.forEach(job => {
    if (job.blueprint_type_id) typeIds.add(job.blueprint_type_id);
    if (job.product_type_id) typeIds.add(job.product_type_id);
  });

  // Batch fetch type names
  const typeNames = await getTypeNames([...typeIds]);

  // Transform jobs
  const transformedJobs = jobs.map(job => {
    const activityInfo = getActivityInfo(job.activity_id);
    const now = new Date();
    const endDate = new Date(job.end_date);
    const startDate = new Date(job.start_date);
    const totalDuration = endDate - startDate;
    const elapsed = now - startDate;
    const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    const timeRemaining = Math.max(0, endDate - now);

    return {
      job_id: job.job_id,
      activity_id: job.activity_id,
      activity: activityInfo.name,
      activity_category: activityInfo.category,
      status: job.status,
      runs: job.runs,
      licensed_runs: job.licensed_runs,
      start_date: job.start_date,
      end_date: job.end_date,
      installer_id: job.installer_id,
      facility_id: job.facility_id,
      location_id: job.location_id,
      blueprint_type_id: job.blueprint_type_id,
      blueprint_name: typeNames[job.blueprint_type_id] || `Blueprint ${job.blueprint_type_id}`,
      product_type_id: job.product_type_id,
      product_name: job.product_type_id ? typeNames[job.product_type_id] : null,
      progress: progress,
      time_remaining_ms: timeRemaining,
      output_location_id: job.output_location_id,
      cost: job.cost,
      probability: job.probability,
      // Corporation-specific fields
      corporation_id: corporationInfo?.corporation_id,
      corporation_name: corporationInfo?.name,
      corporation_ticker: corporationInfo?.ticker,
      is_corporation_job: true
    };
  }).sort((a, b) => a.time_remaining_ms - b.time_remaining_ms);

  return transformedJobs;
}

// Get solar system name (public, no auth needed)
async function getSystemName(systemId) {
  // Check SQLite cache
  const cached = db.getCachedName(systemId, 'system');
  if (cached) return cached.name;

  try {
    const url = `${ESI_BASE_URL}/universe/systems/${systemId}/`;
    const data = await makeESIRequest(url);
    const name = data.name || `System ${systemId}`;
    db.setCachedName(systemId, 'system', name);
    return name;
  } catch (error) {
    return `System ${systemId}`;
  }
}

// Batch get system names
async function getSystemNames(systemIds) {
  const uniqueIds = [...new Set(systemIds)].filter(Boolean);
  if (uniqueIds.length === 0) return {};

  const results = {};
  const idsToFetch = [];

  // Check SQLite cache first
  const cachedNames = db.getCachedNames(uniqueIds, 'system');
  for (const id of uniqueIds) {
    if (cachedNames[id]) {
      results[id] = cachedNames[id].name;
    } else {
      idsToFetch.push(id);
    }
  }

  // Fetch remaining from ESI
  for (const id of idsToFetch) {
    results[id] = await getSystemName(id);
  }

  return results;
}

// Get asset location names via character asset locations endpoint
// This can resolve structure names that the /universe/structures/ endpoint can't
async function getAssetLocationNames(characterId, itemIds, accessToken) {
  if (!itemIds || itemIds.length === 0) return {};

  const results = {};
  const batchSize = 1000;

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    try {
      await waitForRateLimit();
      const response = await axios.post(
        `${ESI_BASE_URL}/characters/${characterId}/assets/locations/`,
        batch,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          params: { datasource: ESI_DATASOURCE }
        }
      );
      for (const item of response.data) {
        if (item.position) {
          results[item.item_id] = item.position;
        }
      }
    } catch (error) {
      // Silently fail — this is a best-effort resolution
    }
  }
  return results;
}

// Get asset names (structure/station names) via character asset names endpoint
async function getAssetNames(characterId, itemIds, accessToken) {
  if (!itemIds || itemIds.length === 0) return {};

  const results = {};
  const batchSize = 1000;

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    try {
      await waitForRateLimit();
      const response = await axios.post(
        `${ESI_BASE_URL}/characters/${characterId}/assets/names/`,
        batch,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          params: { datasource: ESI_DATASOURCE }
        }
      );
      for (const item of response.data) {
        if (item.name && item.name !== 'None' && item.name !== '') {
          results[item.item_id] = item.name;
        }
      }
    } catch (error) {
      // Silently fail
    }
  }
  return results;
}

// Fetch ALL corporation structures and cache their names
// Uses esi-structures.read_corporation.v1 scope
async function fetchCorporationStructures(corporationId, accessToken) {
  try {
    console.log(`[STRUCTURE] Fetching corp ${corporationId} structures with token: ${accessToken ? accessToken.substring(0, 12) + '...' : 'NONE'}`);
    const allStructures = [];
    let page = 1;

    while (true) {
      await waitForRateLimit();
      try {
        const url = `${ESI_BASE_URL}/corporations/${corporationId}/structures/`;
        const data = await makeESIRequest(url, accessToken, { page });
        if (!data || data.length === 0) break;
        allStructures.push(...data);
        if (data.length < 250) break;
        page++;
      } catch (e) {
        if (e.response?.status === 304) break;
        throw e;
      }
    }

    // Cache all structure names
    if (allStructures.length > 0) {
      const entries = [];
      for (const struct of allStructures) {
        if (struct.structure_id && struct.name) {
          entries.push({
            id: struct.structure_id,
            category: 'structure',
            name: struct.name,
            extra_data: String(struct.solar_system_id || '')
          });
        }
      }
      if (entries.length > 0) {
        db.setCachedNames(entries);
        console.log(`[STRUCTURE] Cached ${entries.length} corporation structures for corp ${corporationId}`);
      }
    }

    return allStructures;
  } catch (error) {
    const errBody = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.warn(`[STRUCTURE] Failed to fetch corp structures for ${corporationId}: HTTP ${error.response?.status} - ${errBody}`);
    return [];
  }
}

// Get planet name (public, no auth)
async function getPlanetName(planetId) {
  const cached = db.getCachedName(planetId, 'planet');
  if (cached) return cached.name;

  try {
    const url = `${ESI_BASE_URL}/universe/planets/${planetId}/`;
    const data = await makeESIRequest(url);
    const name = data.name || `Planet ${planetId}`;
    db.setCachedName(planetId, 'planet', name, String(data.type_id || ''));
    return name;
  } catch (error) {
    return `Planet ${planetId}`;
  }
}

// Get character assets (paginated)
async function getCharacterAssets(characterId, accessToken) {
  const allAssets = [];
  let page = 1;

  while (true) {
    await waitForRateLimit();
    try {
      const url = `${ESI_BASE_URL}/characters/${characterId}/assets/`;
      const data = await makeESIRequest(url, accessToken, { page });
      if (!data || data.length === 0) break;
      allAssets.push(...data);
      if (data.length < 1000) break;
      page++;
    } catch (error) {
      if (error.response?.status === 304) break; // Not modified
      throw error;
    }
  }

  return allAssets;
}

// Get corporation assets (paginated)
async function getCorporationAssets(corporationId, accessToken) {
  const allAssets = [];
  let page = 1;

  while (true) {
    await waitForRateLimit();
    try {
      const url = `${ESI_BASE_URL}/corporations/${corporationId}/assets/`;
      const data = await makeESIRequest(url, accessToken, { page });
      if (!data || data.length === 0) break;
      allAssets.push(...data);
      if (data.length < 1000) break;
      page++;
    } catch (error) {
      if (error.response?.status === 304) break;
      throw error;
    }
  }

  return allAssets;
}

// Get character planet colonies
async function getCharacterColonies(characterId, accessToken) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/planets/`;
    return await makeESIRequest(url, accessToken);
  } catch (error) {
    console.error(`Get colonies error for character ${characterId}:`, error.message);
    throw error;
  }
}

// Get colony layout (pins, links, routes)
async function getColonyLayout(characterId, planetId, accessToken) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/planets/${planetId}/`;
    return await makeESIRequest(url, accessToken);
  } catch (error) {
    console.error(`Get colony layout error for planet ${planetId}:`, error.message);
    throw error;
  }
}

// Get character wallet balance
async function getCharacterWallet(characterId, accessToken) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/wallet/`;
    const balance = await makeESIRequest(url, accessToken);
    return { balance: balance || 0, hasScope: true };
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      return { balance: null, hasScope: false };
    }
    console.error(`Get character wallet error (${characterId}):`, error.message);
    return { balance: null, hasScope: false };
  }
}

// Get wallet journal (paginated)
async function getWalletJournal(characterId, accessToken) {
  try {
    const allEntries = [];
    let page = 1;
    while (true) {
      const url = `${ESI_BASE_URL}/characters/${characterId}/wallet/journal/?page=${page}`;
      const data = await makeESIRequest(url, accessToken);
      if (!data || data.length === 0) break;
      allEntries.push(...data);
      if (data.length < 1000) break;
      page++;
    }
    return { entries: allEntries, hasScope: true };
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      return { entries: [], hasScope: false };
    }
    console.error(`Get wallet journal error (${characterId}):`, error.message);
    return { entries: [], hasScope: false };
  }
}

module.exports = {
  makeESIRequest,
  getCharacterIndustryJobs,
  getCharacterPublicInfo,
  getJobSlotUsage,
  getMaxSlots,
  getCharacterSkills,
  getCharacterSkillQueue,
  getTypeName,
  getTypeNames,
  getLocationName,
  getLocationInfo,
  getCharacterNames,
  getActivityInfo,
  transformCorporationJobs,
  getPlanetName,
  getCharacterAssets,
  getCorporationAssets,
  getAssetNames,
  fetchCorporationStructures,
  getCharacterColonies,
  getColonyLayout,
  getSystemName,
  getSystemNames,
  ACTIVITY_MAP,
  getCharacterWallet,
  getWalletJournal
};
