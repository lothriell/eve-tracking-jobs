const axios = require('axios');

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const ESI_DATASOURCE = 'tranquility';

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerSecond: 20,
  lastRequestTime: 0,
  minInterval: 1000 / 20 // 50ms between requests
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
async function makeESIRequest(url, accessToken, params = {}) {
  await waitForRateLimit();

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'EVE-ESI-App/1.0'
      },
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

// Get character's industry jobs
async function getCharacterIndustryJobs(characterId, accessToken) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/industry/jobs/`;
    const jobs = await makeESIRequest(url, accessToken, { include_completed: false });

    // Transform and sort jobs
    return jobs.map(job => ({
      job_id: job.job_id,
      activity: getActivityName(job.activity_id),
      status: job.status,
      runs: job.runs,
      start_date: job.start_date,
      end_date: job.end_date,
      installer_id: job.installer_id,
      facility_id: job.facility_id,
      station_id: job.station_id,
      blueprint_type_id: job.blueprint_type_id,
      product_type_id: job.product_type_id
    })).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  } catch (error) {
    console.error('Get industry jobs error:', error);
    throw error;
  }
}

// Activity ID to name mapping
function getActivityName(activityId) {
  const activities = {
    1: 'Manufacturing',
    3: 'TE Research',
    4: 'ME Research',
    5: 'Copying',
    7: 'Reverse Engineering',
    8: 'Invention',
    9: 'Reactions'
  };
  return activities[activityId] || `Activity ${activityId}`;
}

// Get character's public information
async function getCharacterPublicInfo(characterId) {
  try {
    const url = `${ESI_BASE_URL}/characters/${characterId}/`;
    return await makeESIRequest(url, null); // Public endpoint, no token needed
  } catch (error) {
    console.error('Get character info error:', error);
    throw error;
  }
}

module.exports = {
  makeESIRequest,
  getCharacterIndustryJobs,
  getCharacterPublicInfo
};
