const axios = require('axios');

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const ESI_DATASOURCE = 'tranquility';

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerSecond: 20,
  lastRequestTime: 0,
  minInterval: 1000 / 20
};

// Cache for type names
const typeNameCache = new Map();
const CACHE_DURATION = 3600000; // 1 hour

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

// Get type name from ESI
async function getTypeName(typeId) {
  const cacheKey = `type_${typeId}`;
  const cached = typeNameCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.name;
  }

  try {
    const url = `${ESI_BASE_URL}/universe/types/${typeId}/`;
    const data = await makeESIRequest(url);
    const name = data.name || `Type ${typeId}`;
    typeNameCache.set(cacheKey, { name, timestamp: Date.now() });
    return name;
  } catch (error) {
    console.error(`Failed to get type name for ${typeId}:`, error.message);
    return `Type ${typeId}`;
  }
}

// Batch get type names
async function getTypeNames(typeIds) {
  const uniqueIds = [...new Set(typeIds)];
  const results = {};
  const idsToFetch = [];

  // Check cache first
  for (const id of uniqueIds) {
    const cacheKey = `type_${id}`;
    const cached = typeNameCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      results[id] = cached.name;
    } else {
      idsToFetch.push(id);
    }
  }

  // Fetch remaining from ESI using POST endpoint
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

      for (const item of response.data) {
        results[item.id] = item.name;
        typeNameCache.set(`type_${item.id}`, { name: item.name, timestamp: Date.now() });
      }
    } catch (error) {
      console.error('Failed to batch fetch type names:', error.message);
      // Fallback to individual requests
      for (const id of idsToFetch) {
        if (!results[id]) {
          results[id] = await getTypeName(id);
        }
      }
    }
  }

  return results;
}

// Get station/structure name
async function getLocationName(locationId, accessToken) {
  const cacheKey = `location_${locationId}`;
  const cached = typeNameCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.name;
  }

  try {
    // Try station first (NPC stations)
    if (locationId < 1000000000000) {
      const url = `${ESI_BASE_URL}/universe/stations/${locationId}/`;
      const data = await makeESIRequest(url);
      const name = data.name || `Station ${locationId}`;
      typeNameCache.set(cacheKey, { name, timestamp: Date.now() });
      return name;
    } else {
      // Player structure
      const url = `${ESI_BASE_URL}/universe/structures/${locationId}/`;
      const data = await makeESIRequest(url, accessToken);
      const name = data.name || `Structure ${locationId}`;
      typeNameCache.set(cacheKey, { name, timestamp: Date.now() });
      return name;
    }
  } catch (error) {
    console.error(`Failed to get location name for ${locationId}:`, error.message);
    return `Location ${locationId}`;
  }
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
    // Check if it's a 403 forbidden (missing scope)
    const isForbidden = error.response?.status === 403;
    if (isForbidden) {
      console.warn(`Missing skills scope for character ${characterId} - returning defaults`);
    } else {
      console.error('Get character skills error:', error);
    }
    return { skills: [], hasScope: false };
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

// Get job slot usage for a character
async function getJobSlotUsage(characterId, accessToken) {
  try {
    // Get active jobs
    const jobs = await getCharacterIndustryJobs(characterId, accessToken, false);
    
    // Get character skills
    const skillsResult = await getCharacterSkills(characterId, accessToken);
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

// Get installer names
async function getCharacterNames(characterIds) {
  const uniqueIds = [...new Set(characterIds)].filter(id => id);
  if (uniqueIds.length === 0) return {};

  try {
    await waitForRateLimit();
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
    console.error('Failed to get character names:', error.message);
    return {};
  }
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

module.exports = {
  makeESIRequest,
  getCharacterIndustryJobs,
  getCharacterPublicInfo,
  getJobSlotUsage,
  getCharacterSkills,
  getTypeName,
  getTypeNames,
  getLocationName,
  getCharacterNames,
  getActivityInfo,
  transformCorporationJobs,
  ACTIVITY_MAP
};
