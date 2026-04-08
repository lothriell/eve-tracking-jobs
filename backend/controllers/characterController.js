const db = require('../database/db');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { REQUIRED_SCOPES } = require('./authController');

// PI commodity type IDs (P0 through P4) — used to detect Customs Office / Skyhook locations
const PI_COMMODITY_TYPE_IDS = new Set([
  // P0 - Raw resources
  2267, 2268, 2270, 2272, 2286, 2287, 2288, 2305, 2306, 2307, 2308, 2309, 2310, 2311, 2073,
  // P1 - Basic processed
  2389, 2390, 2392, 2393, 2395, 2396, 2397, 2398, 2399, 2400, 2401, 3645, 3683, 3779, 9828,
  // P2 - Refined
  44, 2312, 2317, 2319, 2321, 2327, 2328, 2329, 2463, 3689, 3691, 3693, 3695, 3697, 3725,
  3775, 9830, 9832, 9834, 9836, 9838, 9840, 9842, 15317,
  // P3 - Specialized
  2344, 2345, 2346, 2348, 2349, 2351, 2352, 2354, 2358, 2360, 2361, 2366, 2367, 12836,
  17136, 17392, 17898, 28444,
  // P4 - Advanced
  2867, 2868, 2869, 2870, 2871, 2872, 2875, 2876,
]);
const {
  getCharacterIndustryJobs,
  getJobSlotUsage,
  getCharacterNames,
  getLocationName,
  getLocationInfo,
  transformCorporationJobs,
  getTypeName,
  getTypeNames,
  getCharacterAssets,
  getCorporationAssets,
  getAssetNames,
  fetchCorporationStructures,
  getCharacterColonies,
  getPlanetName,
  getColonyLayout,
  getSystemNames,
  getCharacterSkillQueue,
  getMaxSlots
} = require('../services/esiClient');
const {
  getCharacterCorporation,
  getCharacterRoles,
  hasIndustryRole,
  getIndustryRoleName,
  hasCorporationAssetRole,
  getCustomsOffices,
  getCorporationInfo,
  getCorporationJobs,
  getCorporationMemberNames
} = require('../services/corporationService');

// Get first character (backward compatibility)
exports.getCharacter = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const character = await db.getCharacterByUserId(req.session.userId);
    if (!character) {
      return res.json({ linked: false });
    }

    res.json({
      linked: true,
      character: {
        id: character.character_id,
        name: character.character_name
      }
    });
  } catch (error) {
    console.error('Get character error:', error);
    res.status(500).json({ error: 'Failed to get character info' });
  }
};

// Get all characters for the current user
exports.getAllCharacters = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const characters = await db.getAllCharactersByUserId(req.session.userId);

    res.json({
      characters: characters.map(char => {
        const charScopes = (char.scopes || '').split(/[\s,]+/).filter(Boolean);
        const missingScopes = REQUIRED_SCOPES.filter(s => !charScopes.includes(s));
        return {
          id: char.id,
          character_id: char.character_id,
          name: char.character_name,
          portrait_url: `https://images.evetech.net/characters/${char.character_id}/portrait?size=64`,
          scopes_complete: missingScopes.length === 0,
          missing_scopes: missingScopes
        };
      })
    });
  } catch (error) {
    console.error('Get all characters error:', error);
    res.status(500).json({ error: 'Failed to get characters' });
  }
};

// Get character by ID
exports.getCharacterById = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId } = req.params;
    const character = await db.getCharacterById(parseInt(characterId));
    
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({
      id: character.id,
      character_id: character.character_id,
      name: character.character_name,
      portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=256`
    });
  } catch (error) {
    console.error('Get character by ID error:', error);
    res.status(500).json({ error: 'Failed to get character' });
  }
};

// Delete a character
exports.deleteCharacter = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId } = req.params;
    const changes = await db.deleteCharacter(parseInt(characterId), req.session.userId);
    
    if (changes === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete character error:', error);
    res.status(500).json({ error: 'Failed to delete character' });
  }
};

exports.getCharacterPortrait = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const characterId = req.params.characterId || req.query.characterId;
    let character;
    
    if (characterId) {
      character = await db.getCharacterById(parseInt(characterId));
      if (character && character.user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      character = await db.getCharacterByUserId(req.session.userId);
    }
    
    if (!character) {
      return res.status(404).json({ error: 'No character linked' });
    }

    const portraitUrl = `https://images.evetech.net/characters/${character.character_id}/portrait?size=256`;
    res.json({ portraitUrl });
  } catch (error) {
    console.error('Get portrait error:', error);
    res.status(500).json({ error: 'Failed to get character portrait' });
  }
};

// Get industry jobs for a specific character or all characters
exports.getIndustryJobs = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId, all } = req.query;
    let characters = [];

    if (all === 'true') {
      characters = await db.getAllCharactersByUserId(req.session.userId);
    } else if (characterId) {
      const character = await db.getCharacterById(parseInt(characterId));
      if (character && character.user_id === req.session.userId) {
        characters = [character];
      }
    } else {
      const character = await db.getCharacterByUserId(req.session.userId);
      if (character) {
        characters = [character];
      }
    }

    if (characters.length === 0) {
      return res.status(404).json({ error: 'No character linked' });
    }

    const allJobs = [];
    const installerIds = new Set();

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const jobs = await getCharacterIndustryJobs(character.character_id, accessToken);
        
        jobs.forEach(job => {
          job.character_id = character.character_id;
          job.character_name = character.character_name;
          if (job.installer_id) installerIds.add(job.installer_id);
          allJobs.push(job);
        });
      } catch (error) {
        console.error(`Failed to get jobs for character ${character.character_id}:`, error.message);
      }
    }

    // Get installer names
    const installerNames = await getCharacterNames([...installerIds]);
    allJobs.forEach(job => {
      job.installer_name = installerNames[job.installer_id] || `Character ${job.installer_id}`;
    });

    // Sort by time remaining
    allJobs.sort((a, b) => a.time_remaining_ms - b.time_remaining_ms);

    res.json({ jobs: allJobs });
  } catch (error) {
    console.error('Get industry jobs error:', error);
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        error: 'Missing required scopes',
        message: 'Please re-link your character with the required ESI scopes'
      });
    }
    res.status(500).json({ error: 'Failed to get industry jobs' });
  }
};

// Get job slot usage for a character or all characters
exports.getJobSlots = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId, all } = req.query;
    let characters = [];

    if (all === 'true') {
      characters = await db.getAllCharactersByUserId(req.session.userId);
    } else if (characterId) {
      const character = await db.getCharacterById(parseInt(characterId));
      if (character && character.user_id === req.session.userId) {
        characters = [character];
      }
    } else {
      const character = await db.getCharacterByUserId(req.session.userId);
      if (character) {
        characters = [character];
      }
    }

    if (characters.length === 0) {
      return res.json({ 
        slots: {
          manufacturing: { current: 0, max: 0 },
          science: { current: 0, max: 0 },
          reactions: { current: 0, max: 0 }
        },
        by_character: []
      });
    }

    const byCharacter = [];
    const totals = {
      manufacturing: { current: 0, max: 0 },
      science: { current: 0, max: 0 },
      reactions: { current: 0, max: 0 }
    };

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const slots = await getJobSlotUsage(character.character_id, accessToken);
        
        byCharacter.push({
          character_id: character.character_id,
          character_name: character.character_name,
          slots
        });

        totals.manufacturing.current += slots.manufacturing.current;
        totals.manufacturing.max += slots.manufacturing.max;
        totals.science.current += slots.science.current;
        totals.science.max += slots.science.max;
        totals.reactions.current += slots.reactions.current;
        totals.reactions.max += slots.reactions.max;
      } catch (error) {
        console.error(`Failed to get slots for character ${character.character_id}:`, error.message);
      }
    }

    res.json({ 
      slots: totals,
      by_character: byCharacter
    });
  } catch (error) {
    console.error('Get job slots error:', error);
    res.status(500).json({ error: 'Failed to get job slots' });
  }
};

// Get dashboard statistics
// In-memory dashboard stats cache (2-minute TTL)
const dashboardCache = new Map();
const DASHBOARD_CACHE_TTL = 120000;

exports.getDashboardStats = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check cache
    const cacheKey = `dashboard_${req.session.userId}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < DASHBOARD_CACHE_TTL) {
      return res.json(cached.data);
    }

    const characters = await db.getAllCharactersByUserId(req.session.userId);

    if (characters.length === 0) {
      return res.json({
        total_characters: 0,
        total_active_jobs: 0,
        personal_active_jobs: 0,
        corp_active_jobs: 0,
        jobs_by_activity: {},
        jobs_by_character: [],
        slots: {
          manufacturing: { current: 0, max: 0 },
          science: { current: 0, max: 0 },
          reactions: { current: 0, max: 0 }
        }
      });
    }

    let totalPersonalJobs = 0;
    let totalCorpJobs = 0;
    const jobsByActivity = { manufacturing: 0, science: 0, reactions: 0 };
    const personalJobsByActivity = { manufacturing: 0, science: 0, reactions: 0 };
    const corpJobsByActivity = { manufacturing: 0, science: 0, reactions: 0 };
    const jobsByCharacter = [];
    const totals = {
      manufacturing: { current: 0, max: 0 },
      science: { current: 0, max: 0 },
      reactions: { current: 0, max: 0 }
    };

    // Fetch corp jobs once per corporation (sequential — need role check per corp)
    const processedCorps = new Map();
    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const corpData = await getCharacterCorporation(character.character_id, accessToken);
        if (processedCorps.has(corpData.corporation_id)) continue;
        processedCorps.set(corpData.corporation_id, null); // mark as attempted
        const roles = await getCharacterRoles(character.character_id, accessToken);
        if (hasIndustryRole(roles) && !roles.needsReauthorization) {
          const rawCorpJobs = await getCorporationJobs(corpData.corporation_id, accessToken);
          if (!rawCorpJobs.error && Array.isArray(rawCorpJobs)) {
            processedCorps.set(corpData.corporation_id, {
              activeJobs: rawCorpJobs.filter(j => j.status === 'active')
            });
          }
        }
      } catch {}
    }

    // Process all characters in parallel — fetch jobs, skills, skillqueue concurrently
    const charResults = await Promise.all(characters.map(async (character) => {
      try {
        const accessToken = await getValidAccessToken(character);

        // Fetch jobs, max slots, and skill queue in parallel (no duplicate calls)
        const [jobs, maxSlots, sqResult, corpData] = await Promise.all([
          getCharacterIndustryJobs(character.character_id, accessToken).catch(() => []),
          getMaxSlots(character.character_id, accessToken),
          getCharacterSkillQueue(character.character_id, accessToken).catch(() => ({ queue: [], hasScope: false })),
          getCharacterCorporation(character.character_id, accessToken).catch(() => null)
        ]);

        // Skill training status
        let skillTraining = null;
        if (sqResult.hasScope && sqResult.queue.length > 0) {
          const now = new Date();
          const active = sqResult.queue.find(s =>
            s.finish_date && new Date(s.finish_date) > now &&
            s.start_date && new Date(s.start_date) <= now
          );
          if (active) {
            const skillName = await getTypeName(active.skill_id);
            skillTraining = {
              skill_name: skillName,
              finished_level: active.finished_level,
              finish_date: active.finish_date,
              queue_length: sqResult.queue.filter(s => s.finish_date && new Date(s.finish_date) > now).length
            };
          } else {
            const future = sqResult.queue.find(s => s.finish_date && new Date(s.finish_date) > now);
            skillTraining = future ? { status: 'paused' } : { status: 'not_training' };
          }
        } else if (sqResult.hasScope) {
          skillTraining = { status: 'not_training' };
        }

        const activeJobs = jobs.filter(j => j.status === 'active');
        const personalByCategory = { manufacturing: 0, science: 0, reactions: 0 };
        activeJobs.forEach(job => {
          const cat = job.activity_category || 'other';
          if (cat in personalByCategory) personalByCategory[cat]++;
        });

        // Corp jobs for this character
        let corpJobsCount = 0;
        const corpByCategory = { manufacturing: 0, science: 0, reactions: 0 };
        if (corpData) {
          const corpJobsData = processedCorps.get(corpData.corporation_id);
          if (corpJobsData) {
            corpJobsData.activeJobs.forEach(job => {
              if (job.installer_id === character.character_id) {
                corpJobsCount++;
                const aid = job.activity_id;
                if (aid === 1) corpByCategory.manufacturing++;
                else if ([3, 4, 5, 7, 8].includes(aid)) corpByCategory.science++;
                else if (aid === 9) corpByCategory.reactions++;
              }
            });
          }
        }

        return {
          character_id: character.character_id,
          character_name: character.character_name,
          portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`,
          active_jobs: activeJobs.length,
          corp_jobs: corpJobsCount,
          total_jobs: activeJobs.length + corpJobsCount,
          slots: {
            manufacturing: { current: personalByCategory.manufacturing + corpByCategory.manufacturing, max: maxSlots.manufacturing.max },
            science: { current: personalByCategory.science + corpByCategory.science, max: maxSlots.science.max },
            reactions: { current: personalByCategory.reactions + corpByCategory.reactions, max: maxSlots.reactions.max },
            needsReauthorization: maxSlots.needsReauthorization
          },
          skill_training: skillTraining,
          activity_breakdown: {
            manufacturing: personalByCategory.manufacturing + corpByCategory.manufacturing,
            science: personalByCategory.science + corpByCategory.science,
            reactions: personalByCategory.reactions + corpByCategory.reactions
          },
          personalByCategory,
          corpByCategory
        };
      } catch (error) {
        return {
          character_id: character.character_id,
          character_name: character.character_name,
          portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`,
          active_jobs: 0, corp_jobs: 0, total_jobs: 0,
          error: 'Failed to fetch data'
        };
      }
    }));

    // Aggregate totals from parallel results
    for (const char of charResults) {
      if (char.error) { jobsByCharacter.push(char); continue; }
      totalPersonalJobs += char.active_jobs;
      totalCorpJobs += char.corp_jobs;
      for (const cat of ['manufacturing', 'science', 'reactions']) {
        if (char.personalByCategory) { personalJobsByActivity[cat] += char.personalByCategory[cat]; jobsByActivity[cat] += char.personalByCategory[cat]; }
        if (char.corpByCategory) { corpJobsByActivity[cat] += char.corpByCategory[cat]; jobsByActivity[cat] += char.corpByCategory[cat]; }
        totals[cat].current += char.slots[cat].current;
        totals[cat].max += char.slots[cat].max;
      }
      // Remove internal fields before sending to client
      const { personalByCategory, corpByCategory, ...clientData } = char;
      jobsByCharacter.push(clientData);
    }

    const result = {
      total_characters: characters.length,
      total_active_jobs: totalPersonalJobs + totalCorpJobs,
      personal_active_jobs: totalPersonalJobs,
      corp_active_jobs: totalCorpJobs,
      jobs_by_activity: jobsByActivity,
      personal_jobs_by_activity: personalJobsByActivity,
      corp_jobs_by_activity: corpJobsByActivity,
      jobs_by_character: jobsByCharacter,
      slots: totals
    };

    // Cache result
    dashboardCache.set(cacheKey, { data: result, timestamp: Date.now() });

    res.json(result);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
};



// ============== CORPORATION ENDPOINTS ==============

// Get corporation roles for a specific character
exports.getCorporationRoles = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId } = req.params;
    const character = await db.getCharacterById(parseInt(characterId));
    
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);
    
    // Get corporation info
    const corpData = await getCharacterCorporation(character.character_id, accessToken);
    const corpInfo = await getCorporationInfo(corpData.corporation_id);
    
    // Get character roles
    const roles = await getCharacterRoles(character.character_id, accessToken);
    
    if (roles.needsReauthorization) {
      return res.json({
        character_id: character.character_id,
        character_name: character.character_name,
        corporation: corpInfo,
        roles: [],
        has_industry_role: false,
        industry_role_name: null,
        needs_reauthorization: true,
        message: 'Character needs to be re-authorized with corporation role scopes'
      });
    }

    res.json({
      character_id: character.character_id,
      character_name: character.character_name,
      corporation: corpInfo,
      roles: roles.roles,
      has_industry_role: hasIndustryRole(roles),
      industry_role_name: getIndustryRoleName(roles),
      needs_reauthorization: false
    });
  } catch (error) {
    console.error('Get corporation roles error:', error);
    res.status(500).json({ error: 'Failed to get corporation roles' });
  }
};

// Get corporation industry jobs for a specific character
exports.getCorporationJobs = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId } = req.params;
    const character = await db.getCharacterById(parseInt(characterId));
    
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);
    
    // Get corporation info
    const corpData = await getCharacterCorporation(character.character_id, accessToken);
    const corpInfo = await getCorporationInfo(corpData.corporation_id);
    
    // Check character roles
    const roles = await getCharacterRoles(character.character_id, accessToken);
    
    if (roles.needsReauthorization) {
      return res.json({
        jobs: [],
        corporation: corpInfo,
        has_access: false,
        error: 'needs_reauthorization',
        message: 'Character needs to be re-authorized with corporation role scopes'
      });
    }

    if (!hasIndustryRole(roles)) {
      return res.json({
        jobs: [],
        corporation: corpInfo,
        has_access: false,
        error: 'missing_role',
        message: `Character lacks Director or Factory Manager role in ${corpInfo.name}`
      });
    }

    // Fetch corporation jobs
    const rawJobs = await getCorporationJobs(corpData.corporation_id, accessToken);
    
    // Handle error responses from getCorporationJobs
    if (rawJobs.error) {
      return res.json({
        jobs: [],
        corporation: corpInfo,
        has_access: false,
        error: rawJobs.error,
        message: rawJobs.message
      });
    }

    // Transform jobs with additional data
    const jobs = await transformCorporationJobs(rawJobs, corpInfo);
    
    // Get installer names
    const installerIds = [...new Set(jobs.map(j => j.installer_id).filter(id => id))];
    const installerNames = await getCorporationMemberNames(installerIds);
    
    jobs.forEach(job => {
      job.installer_name = installerNames[job.installer_id] || `Character ${job.installer_id}`;
    });

    res.json({
      jobs,
      corporation: corpInfo,
      has_access: true,
      role: getIndustryRoleName(roles),
      total_jobs: jobs.length,
      active_jobs: jobs.filter(j => j.status === 'active').length
    });
  } catch (error) {
    console.error('Get corporation jobs error:', error);
    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Missing required ESI scopes for corporation jobs'
      });
    }
    res.status(500).json({ error: 'Failed to get corporation jobs' });
  }
};

// Get all corporations from user's characters
exports.getCorporations = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const characters = await db.getAllCharactersByUserId(req.session.userId);
    
    if (characters.length === 0) {
      return res.json({ corporations: [] });
    }

    const corporationsMap = new Map();
    const charactersByCorpMap = new Map();

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const corpData = await getCharacterCorporation(character.character_id, accessToken);
        const corpInfo = await getCorporationInfo(corpData.corporation_id);
        const roles = await getCharacterRoles(character.character_id, accessToken);
        
        if (!corporationsMap.has(corpData.corporation_id)) {
          corporationsMap.set(corpData.corporation_id, corpInfo);
          charactersByCorpMap.set(corpData.corporation_id, []);
        }
        
        charactersByCorpMap.get(corpData.corporation_id).push({
          character_id: character.character_id,
          character_name: character.character_name,
          db_id: character.id,
          has_industry_role: hasIndustryRole(roles),
          industry_role_name: getIndustryRoleName(roles),
          needs_reauthorization: roles.needsReauthorization || false
        });
      } catch (error) {
        console.error(`Failed to get corp for character ${character.character_id}:`, error.message);
      }
    }

    const corporations = [];
    for (const [corpId, corpInfo] of corporationsMap) {
      const chars = charactersByCorpMap.get(corpId) || [];
      corporations.push({
        ...corpInfo,
        characters: chars,
        has_industry_access: chars.some(c => c.has_industry_role)
      });
    }

    res.json({ corporations });
  } catch (error) {
    console.error('Get corporations error:', error);
    res.status(500).json({ error: 'Failed to get corporations' });
  }
};

// Get all corporation jobs across all characters
exports.getAllCorporationJobs = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const characters = await db.getAllCharactersByUserId(req.session.userId);
    
    if (characters.length === 0) {
      return res.json({ jobs: [], corporations: [] });
    }

    const allJobs = [];
    const corporationsWithAccess = [];
    const processedCorps = new Set();

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const corpData = await getCharacterCorporation(character.character_id, accessToken);
        
        // Skip if we already processed this corporation
        if (processedCorps.has(corpData.corporation_id)) {
          continue;
        }

        const corpInfo = await getCorporationInfo(corpData.corporation_id);
        const roles = await getCharacterRoles(character.character_id, accessToken);

        if (!hasIndustryRole(roles) || roles.needsReauthorization) {
          continue;
        }

        // Mark as processed
        processedCorps.add(corpData.corporation_id);

        // Fetch corporation jobs
        const rawJobs = await getCorporationJobs(corpData.corporation_id, accessToken);
        
        if (rawJobs.error) {
          continue;
        }

        // Transform and add jobs
        const jobs = await transformCorporationJobs(rawJobs, corpInfo);
        
        // Get installer names
        const installerIds = [...new Set(jobs.map(j => j.installer_id).filter(id => id))];
        const installerNames = await getCorporationMemberNames(installerIds);
        
        jobs.forEach(job => {
          job.installer_name = installerNames[job.installer_id] || `Character ${job.installer_id}`;
          job.accessing_character_id = character.character_id;
          job.accessing_character_name = character.character_name;
        });

        allJobs.push(...jobs);
        corporationsWithAccess.push({
          ...corpInfo,
          role: getIndustryRoleName(roles),
          accessing_character: character.character_name,
          job_count: jobs.length,
          active_jobs: jobs.filter(j => j.status === 'active').length
        });
      } catch (error) {
        console.error(`Failed to get corp jobs for character ${character.character_id}:`, error.message);
      }
    }

    // Sort all jobs by time remaining
    allJobs.sort((a, b) => a.time_remaining_ms - b.time_remaining_ms);

    res.json({
      jobs: allJobs,
      corporations: corporationsWithAccess,
      total_jobs: allJobs.length,
      active_jobs: allJobs.filter(j => j.status === 'active').length
    });
  } catch (error) {
    console.error('Get all corporation jobs error:', error);
    res.status(500).json({ error: 'Failed to get corporation jobs' });
  }
};


// ============== ASSET ENDPOINTS ==============

// Get personal character assets
exports.getCharacterAssets = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId, all } = req.query;
    let characters = [];

    if (all === 'true') {
      characters = await db.getAllCharactersByUserId(req.session.userId);
    } else if (characterId) {
      const character = await db.getCharacterById(parseInt(characterId));
      if (character && character.user_id === req.session.userId) {
        characters = [character];
      }
    } else {
      const character = await db.getCharacterByUserId(req.session.userId);
      if (character) characters = [character];
    }

    if (characters.length === 0) {
      return res.status(404).json({ error: 'No character found' });
    }

    // ===== PASS 1: Collect ALL character tokens + assets =====
    const allAssets = [];
    const charTokens = []; // ALL characters with valid tokens (for structure resolution)
    const perCharAssets = []; // Only characters with loaded assets

    // First: get valid tokens for ALL characters (even if they can't load assets)
    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        charTokens.push({ character, accessToken });
      } catch (e) {
        // Token refresh failed — skip this character
      }
    }

    // Then: load assets for characters that have the scope
    for (const { character, accessToken } of charTokens) {
      try {
        const assets = await getCharacterAssets(character.character_id, accessToken);
        perCharAssets.push({ character, assets, accessToken });
      } catch (error) {
        continue; // Missing asset scope or other error — skip character
      }
    }

    // ===== PASS 2: Process each character's assets =====
    // Shared location cache across all characters
    const resolvedLocations = {};

    for (const { character, assets, accessToken } of perCharAssets) {
      // Resolve type names
      const typeIds = [...new Set(assets.map(a => a.type_id).filter(Boolean))];
      const typeNames = typeIds.length > 0 ? await getTypeNames(typeIds) : {};

      // Build item_id → asset lookup for container chain
      const itemMap = {};
      assets.forEach(a => { if (a.item_id) itemMap[a.item_id] = a; });

      function resolveRootLocation(asset) {
        let current = asset;
        const visited = new Set();
        while (current && current.location_type === 'item' && !visited.has(current.location_id)) {
          visited.add(current.location_id);
          const parent = itemMap[current.location_id];
          if (parent) { current = parent; } else { break; }
        }
        return { rootLocationId: current ? current.location_id : asset.location_id, rootLocationType: current ? current.location_type : asset.location_type };
      }

      // Collect location IDs needing resolution
      const locIdsToResolve = new Set();
      assets.forEach(a => {
        if (a.location_type !== 'item' && a.location_type !== 'other' && a.location_id) {
          locIdsToResolve.add(a.location_id);
        } else if (a.location_type === 'item') {
          const { rootLocationId, rootLocationType } = resolveRootLocation(a);
          if (rootLocationType !== 'item' && rootLocationType !== 'other') {
            locIdsToResolve.add(rootLocationId);
          } else if (rootLocationId >= 1000000000000) {
            // Dead-end chain: parent not in assets — but ID is in structure range
            // Player structures are "items" in EVE's data model and won't be in character assets
            locIdsToResolve.add(rootLocationId);
          } else if (rootLocationId >= 60000000 && rootLocationId < 64000000) {
            // Dead-end chain but ID is in station range
            locIdsToResolve.add(rootLocationId);
          } else if (rootLocationId >= 30000000 && rootLocationId < 33000000) {
            // Dead-end chain but ID is in solar system range
            locIdsToResolve.add(rootLocationId);
          }
        }
      });


      // Resolve locations (stations and systems only — structures endpoint is broken)
      for (const locId of locIdsToResolve) {
        if (resolvedLocations[locId]) continue;

        try {
          const info = await getLocationInfo(locId, accessToken);
          if (info.unresolved) {
            // Check if all items at this location are PI commodities → Customs Office / Skyhook
            const itemsAtLocation = assets.filter(a => {
              if (a.location_id === locId) return true;
              // Also check items inside containers at this location
              const root = resolveRootLocation(a);
              return root.rootLocationId === locId;
            });
            const isPICommodities = itemsAtLocation.length > 0 && itemsAtLocation.every(a => PI_COMMODITY_TYPE_IDS.has(a.type_id));
            const label = isPICommodities ? 'Customs Office / Skyhook' : `Player Structure #${String(locId).slice(-6)}`;
            resolvedLocations[locId] = { name: label, system_id: null, location_class: isPICommodities ? 'customs_office' : 'structure' };
          } else {
            resolvedLocations[locId] = info;
          }
        } catch (locErr) {
          resolvedLocations[locId] = { name: `Location ${locId}`, system_id: null, location_class: 'unknown' };
        }
      }

      // Resolve system names
      const systemIds = [...new Set(Object.values(resolvedLocations).map(i => i.system_id).filter(Boolean))];
      const systemNames = systemIds.length > 0 ? await getSystemNames(systemIds) : {};

      // Get custom names ONLY for containers (items that have children), not all 5000+ items
      const containerItemIds = [...new Set(
        assets.filter(a => a.location_type === 'item' && itemMap[a.location_id])
          .map(a => a.location_id)
      )];
      let customNames = {};
      if (containerItemIds.length > 0) {
        try {
          customNames = await getAssetNames(character.character_id, containerItemIds, accessToken);
        } catch (e) { /* not critical */ }
      }

      // Enrich assets
      assets.forEach(a => {
        let typeName = typeNames[a.type_id] || `Type ${a.type_id}`;
        // Mark blueprints as BPO/BPC in the name for searchability
        if (a.is_blueprint_copy === true) {
          a.is_bpc = true;
          if (!typeName.includes('Blueprint')) typeName += ' Blueprint';
          typeName += ' (Copy)';
        } else if (typeName.includes('Blueprint') && !a.is_blueprint_copy) {
          a.is_bpo = true;
          typeName += ' (Original)';
        }
        a.type_name = typeName;

        let rootLocId;
        if (a.location_type === 'item') {
          const { rootLocationId } = resolveRootLocation(a);
          rootLocId = rootLocationId;
          // Only set container_name if the direct parent is a real container (not the structure itself)
          const directParent = itemMap[a.location_id];
          if (directParent) {
            const customName = customNames[directParent.item_id];
            const typeName = typeNames[directParent.type_id] || `Type ${directParent.type_id}`;
            a.container_name = customName ? `${typeName} (${customName})` : typeName;
            a.container_id = directParent.item_id;
          }
          // If direct parent not found but location_id is a structure, item is directly in structure hangar
          // Don't set container_name — it's a direct hangar item
        } else {
          rootLocId = a.location_id;
        }

        const locInfo = resolvedLocations[rootLocId] || { name: `Unknown Location`, system_id: null };
        a.location_name = locInfo.name;
        a.root_location_id = rootLocId; // Full structure/station ID for rename feature
        a.system_id = locInfo.system_id;
        a.system_name = locInfo.system_id ? (systemNames[locInfo.system_id] || null) : null;

        a.character_id = character.character_id;
        a.character_name = character.character_name;
        allAssets.push(a);
      });
    }

    // Enrich with ISK values — supports multiple price modes
    const priceMode = req.query.priceMode || 'average';
    const assetTypeIds = [...new Set(allAssets.map(a => a.type_id).filter(Boolean))];
    const marketPrices = assetTypeIds.length > 0 ? db.getMarketPrices(assetTypeIds) : {};
    const jitaPrices = (priceMode === 'jita_sell' || priceMode === 'jita_buy') && assetTypeIds.length > 0
      ? db.getJitaPrices(assetTypeIds) : {};

    let grandTotal = 0;
    allAssets.forEach(a => {
      let unitPrice = 0;
      if (priceMode === 'jita_sell') {
        const jp = jitaPrices[a.type_id];
        unitPrice = jp?.sell_min || 0;
      } else if (priceMode === 'jita_buy') {
        const jp = jitaPrices[a.type_id];
        unitPrice = jp?.buy_max || 0;
      } else {
        const mp = marketPrices[a.type_id];
        unitPrice = mp ? (mp.average_price || mp.adjusted_price || 0) : 0;
      }
      a.unit_price = unitPrice;
      a.total_price = unitPrice * (a.quantity || 1);
      grandTotal += a.total_price;
    });

    res.json({ assets: allAssets, total: allAssets.length, total_value: grandTotal, price_mode: priceMode });
  } catch (error) {
    console.error('Get character assets error:', error);
    res.status(500).json({ error: 'Failed to get character assets' });
  }
};

// Get corporation assets
exports.getCorporationAssets = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId } = req.query;
    if (!characterId) {
      return res.status(400).json({ error: 'characterId query parameter required' });
    }

    const character = await db.getCharacterById(parseInt(characterId));
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);

    // Check corporation roles
    const roles = await getCharacterRoles(character.character_id, accessToken);

    if (roles.needsReauthorization) {
      return res.json({
        assets: [],
        has_access: false,
        error: 'needs_reauthorization',
        message: 'Character needs to be re-authorized with corporation role scopes'
      });
    }

    if (!hasCorporationAssetRole(roles)) {
      return res.json({
        assets: [],
        has_access: false,
        error: 'missing_role',
        message: 'Character requires Director, Accountant, or Station Manager role to view corporation assets'
      });
    }

    const corpData = await getCharacterCorporation(character.character_id, accessToken);

    try {
      const assets = await getCorporationAssets(corpData.corporation_id, accessToken);

      const typeIds = [...new Set(assets.map(a => a.type_id).filter(Boolean))];
      const typeNames = typeIds.length > 0 ? await getTypeNames(typeIds) : {};

      // Build item_id → asset lookup for container chain resolution
      const itemMap = {};
      assets.forEach(a => { if (a.item_id) itemMap[a.item_id] = a; });

      function resolveRootLocation(asset) {
        let current = asset;
        const visited = new Set();
        while (current && current.location_type === 'item' && !visited.has(current.location_id)) {
          visited.add(current.location_id);
          const parent = itemMap[current.location_id];
          if (parent) { current = parent; } else { break; }
        }
        return { rootLocationId: current ? current.location_id : asset.location_id, rootLocationType: current ? current.location_type : asset.location_type };
      }

      const stationLocIds = new Set();
      assets.forEach(a => {
        if (a.location_type !== 'item' && a.location_type !== 'other' && a.location_id) {
          stationLocIds.add(a.location_id);
        } else if (a.location_type === 'item') {
          const { rootLocationId, rootLocationType } = resolveRootLocation(a);
          if (rootLocationType !== 'item' && rootLocationType !== 'other') {
            stationLocIds.add(rootLocationId);
          } else if (rootLocationId >= 1000000000000) {
            // Player structure — ESI reports as location_type "item"
            stationLocIds.add(rootLocationId);
          } else if (rootLocationId >= 60000000 && rootLocationId < 64000000) {
            stationLocIds.add(rootLocationId);
          } else if (rootLocationId >= 30000000 && rootLocationId < 33000000) {
            stationLocIds.add(rootLocationId);
          }
        }
      });

      const locationInfo = {};
      for (const locId of stationLocIds) {
        try {
          const info = await getLocationInfo(locId, accessToken);
          if (info.unresolved) {
            const itemsAtLoc = assets.filter(a => {
              if (a.location_id === locId) return true;
              const root = resolveRootLocation(a);
              return root.rootLocationId === locId;
            });
            const isPI = itemsAtLoc.length > 0 && itemsAtLoc.every(a => PI_COMMODITY_TYPE_IDS.has(a.type_id));
            locationInfo[locId] = { name: isPI ? 'Customs Office / Skyhook' : `Player Structure #${String(locId).slice(-6)}`, system_id: null };
          } else {
            locationInfo[locId] = info;
          }
        } catch (e) {
          locationInfo[locId] = { name: `Location ${locId}`, system_id: null };
        }
      }

      const systemIds = [...new Set(Object.values(locationInfo).map(i => i.system_id).filter(Boolean))];
      const systemNames = systemIds.length > 0 ? await getSystemNames(systemIds) : {};

      assets.forEach(a => {
        a.type_name = typeNames[a.type_id] || `Type ${a.type_id}`;
        let rootLocId;
        if (a.location_type === 'item') {
          const { rootLocationId } = resolveRootLocation(a);
          rootLocId = rootLocationId;
          const directParent = itemMap[a.location_id];
          if (directParent) {
            a.container_name = typeNames[directParent.type_id] || `Type ${directParent.type_id}`;
            a.container_id = directParent.item_id;
          }
        } else {
          rootLocId = a.location_id;
        }
        const locInfo = locationInfo[rootLocId] || { name: `Unknown Location`, system_id: null };
        a.location_name = locInfo.name;
        a.root_location_id = rootLocId;
        a.system_id = locInfo.system_id;
        a.system_name = locInfo.system_id ? (systemNames[locInfo.system_id] || null) : null;
      });

      // Enrich with ISK values — supports price modes
      const corpPriceMode = req.query.priceMode || 'average';
      const corpTypeIds = [...new Set(assets.map(a => a.type_id).filter(Boolean))];
      const corpMarketPrices = corpTypeIds.length > 0 ? db.getMarketPrices(corpTypeIds) : {};
      const corpJitaPrices = (corpPriceMode === 'jita_sell' || corpPriceMode === 'jita_buy') && corpTypeIds.length > 0
        ? db.getJitaPrices(corpTypeIds) : {};
      let corpGrandTotal = 0;
      assets.forEach(a => {
        let unitPrice = 0;
        if (corpPriceMode === 'jita_sell') {
          unitPrice = corpJitaPrices[a.type_id]?.sell_min || 0;
        } else if (corpPriceMode === 'jita_buy') {
          unitPrice = corpJitaPrices[a.type_id]?.buy_max || 0;
        } else {
          const mp = corpMarketPrices[a.type_id];
          unitPrice = mp ? (mp.average_price || mp.adjusted_price || 0) : 0;
        }
        a.unit_price = unitPrice;
        a.total_price = unitPrice * (a.quantity || 1);
        corpGrandTotal += a.total_price;
      });

      res.json({ assets, total: assets.length, has_access: true, total_value: corpGrandTotal, price_mode: corpPriceMode });
    } catch (error) {
      if (error.response?.status === 403) {
        return res.json({
          assets: [],
          has_access: false,
          error: 'missing_scope',
          message: 'Character needs to be re-authorized with corporation asset read scopes'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Get corporation assets error:', error);
    res.status(500).json({ error: 'Failed to get corporation assets' });
  }
};


// ============== PLANETARY INDUSTRY ENDPOINTS ==============

// Get character planet colonies
exports.getCharacterPlanets = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId, all } = req.query;
    let characters = [];

    if (all === 'true') {
      characters = await db.getAllCharactersByUserId(req.session.userId);
    } else if (characterId) {
      const character = await db.getCharacterById(parseInt(characterId));
      if (character && character.user_id === req.session.userId) {
        characters = [character];
      }
    } else {
      const character = await db.getCharacterByUserId(req.session.userId);
      if (character) characters = [character];
    }

    if (characters.length === 0) {
      return res.status(404).json({ error: 'No character found' });
    }

    const result = [];

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const colonies = await getCharacterColonies(character.character_id, accessToken);

        // Resolve system names and planet names
        const colonyList = colonies || [];
        const systemIds = colonyList.map(c => c.solar_system_id).filter(Boolean);
        const systemNames = systemIds.length > 0 ? await getSystemNames(systemIds) : {};

        for (const colony of colonyList) {
          if (colony.solar_system_id) {
            colony.system_name = systemNames[colony.solar_system_id] || `System ${colony.solar_system_id}`;
          }
          if (colony.planet_id) {
            colony.planet_name = await getPlanetName(colony.planet_id);
          }
        }

        result.push({
          character_id: character.character_id,
          character_name: character.character_name,
          colonies: colonyList
        });
      } catch (error) {
        if (error.response?.status === 403) {
          result.push({
            character_id: character.character_id,
            character_name: character.character_name,
            colonies: [],
            error: 'missing_scope',
            message: 'Character needs to be re-authorized with planets scope'
          });
          continue;
        }
        console.error(`Failed to get colonies for character ${character.character_id}:`, error.message);
      }
    }

    res.json({ characters: result });
  } catch (error) {
    console.error('Get character planets error:', error);
    res.status(500).json({ error: 'Failed to get planet colonies' });
  }
};

// Get colony layout (pins, links, routes)
exports.getColonyLayout = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId, planetId } = req.query;
    if (!characterId || !planetId) {
      return res.status(400).json({ error: 'characterId and planetId query parameters required' });
    }

    const character = await db.getCharacterById(parseInt(characterId));
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);
    const layout = await getColonyLayout(character.character_id, parseInt(planetId), accessToken);

    // Resolve type names for pins and contents
    const typeIds = new Set();
    const pins = layout.pins || [];
    pins.forEach(pin => {
      if (pin.type_id) typeIds.add(pin.type_id);
      if (pin.contents) {
        pin.contents.forEach(item => {
          if (item.type_id) typeIds.add(item.type_id);
        });
      }
      // Also resolve extractor product type
      if (pin.extractor_details?.product_type_id) {
        typeIds.add(pin.extractor_details.product_type_id);
      }
      // Resolve factory schematic output type + cycle time
      // ESI puts schematic_id at pin top level (not in factory_details)
      if (pin.schematic_id) {
        if (!pin.factory_details) pin.factory_details = { schematic_id: pin.schematic_id };
        const output = db.getSchematicOutput(pin.schematic_id);
        if (output) {
          pin.factory_details.output_type_id = output.type_id;
          pin.factory_details.output_quantity = output.quantity;
          typeIds.add(output.type_id);
        }
        const info = db.getSchematicInfo(pin.schematic_id);
        if (info) {
          pin.factory_details.cycle_time = info.cycle_time;
          pin.factory_details.schematic_name = info.schematic_name;
        }
        // Also collect schematic input type IDs for simulation name resolution
        const inputs = db.getSchematicInputs(pin.schematic_id);
        if (inputs) {
          for (const inp of inputs) typeIds.add(inp.type_id);
        }
      }
    });

    const typeNames = typeIds.size > 0 ? await getTypeNames([...typeIds]) : {};

    // Get volumes from SDE cache (stored in extra_data of type entries)
    const typeVolumes = {};
    if (typeIds.size > 0) {
      const cachedTypes = db.getCachedNames([...typeIds], 'type');
      for (const [id, data] of Object.entries(cachedTypes)) {
        if (data.extra_data) {
          typeVolumes[id] = parseFloat(data.extra_data) || 0;
        }
      }
    }

    // Enrich pins with resolved names and volumes
    pins.forEach(pin => {
      pin.type_name = typeNames[pin.type_id] || `Type ${pin.type_id}`;
      pin.volume = typeVolumes[pin.type_id] || 0;
      if (pin.contents) {
        pin.contents.forEach(item => {
          item.type_name = typeNames[item.type_id] || `Type ${item.type_id}`;
          item.volume = typeVolumes[item.type_id] || 0;
        });
      }
      if (pin.extractor_details?.product_type_id) {
        pin.extractor_details.product_name = typeNames[pin.extractor_details.product_type_id] || null;
      }
      if (pin.factory_details?.output_type_id) {
        pin.factory_details.output_name = typeNames[pin.factory_details.output_type_id] || `Type ${pin.factory_details.output_type_id}`;
      }
    });

    // Simulate colony forward to current time
    const { simulateColony } = require('../services/piSimulator');
    const schematicIds = [...new Set(pins.filter(p => p.schematic_id).map(p => p.schematic_id))];
    const schematicInputs = db.getSchematicInputsBatch(schematicIds);
    simulateColony(layout, typeVolumes, schematicInputs);

    // Resolve names/volumes for any new type IDs introduced by simulation
    const postSimTypeIds = new Set();
    pins.forEach(pin => {
      if (pin.contents) {
        pin.contents.forEach(item => {
          if (!item.type_name) postSimTypeIds.add(item.type_id);
        });
      }
    });
    if (postSimTypeIds.size > 0) {
      const newNames = await getTypeNames([...postSimTypeIds]);
      const cachedNew = db.getCachedNames([...postSimTypeIds], 'type');
      pins.forEach(pin => {
        if (pin.contents) {
          pin.contents.forEach(item => {
            if (!item.type_name) {
              item.type_name = newNames[item.type_id] || `Type ${item.type_id}`;
              item.volume = (cachedNew[item.type_id]?.extra_data ? parseFloat(cachedNew[item.type_id].extra_data) : 0) || 0;
            }
          });
        }
      });
    }

    // Attach Jita prices for all content types (for storage value calculation)
    const contentTypeIds = new Set();
    pins.forEach(pin => {
      if (pin.contents) pin.contents.forEach(item => contentTypeIds.add(item.type_id));
    });
    if (contentTypeIds.size > 0) {
      layout.jita_prices = db.getJitaPrices([...contentTypeIds]);
    }

    res.json(layout);
  } catch (error) {
    console.error('Get colony layout error:', error);
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Missing required scopes for planet layout' });
    }
    res.status(500).json({ error: 'Failed to get colony layout' });
  }
};

// Get character summary page data (skill queue, jobs, planets)
exports.getCharacterSummary = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const characterId = parseInt(req.params.characterId);
    const character = await db.getCharacterById(characterId);
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);

    // Fetch all data in parallel
    const [jobsResult, slotsResult, sqResult, coloniesResult, corpResult] = await Promise.all([
      getCharacterIndustryJobs(character.character_id, accessToken).catch(() => []),
      getJobSlotUsage(character.character_id, accessToken).catch(() => ({ manufacturing: { current: 0, max: 0 }, science: { current: 0, max: 0 }, reactions: { current: 0, max: 0 } })),
      getCharacterSkillQueue(character.character_id, accessToken).catch(() => ({ queue: [], hasScope: false })),
      getCharacterColonies(character.character_id, accessToken).catch(() => []),
      getCharacterCorporation(character.character_id, accessToken).catch(() => null)
    ]);

    // --- Skill Queue ---
    let skillQueue = [];
    let skillStatus = 'unknown';
    if (sqResult.hasScope && sqResult.queue.length > 0) {
      const now = new Date();
      const futureQueue = sqResult.queue.filter(s => s.finish_date && new Date(s.finish_date) > now);
      const skillIds = futureQueue.map(s => s.skill_id);
      const skillNames = await getTypeNames(skillIds);
      const active = sqResult.queue.find(s =>
        s.finish_date && new Date(s.finish_date) > now &&
        s.start_date && new Date(s.start_date) <= now
      );
      skillQueue = futureQueue.map(s => ({
        skill_name: skillNames[s.skill_id] || `Unknown (${s.skill_id})`,
        finished_level: s.finished_level,
        start_date: s.start_date,
        finish_date: s.finish_date,
        queue_position: s.queue_position
      }));
      skillStatus = active ? 'training' : (futureQueue.length > 0 ? 'paused' : 'not_training');
    } else if (sqResult.hasScope) {
      skillStatus = 'not_training';
    }

    // --- Personal Jobs ---
    const personalJobs = jobsResult || [];
    const activePersonalJobs = personalJobs.filter(j => j.status === 'active');
    // Resolve installer names
    const installerIds = new Set(personalJobs.map(j => j.installer_id).filter(Boolean));
    const installerNames = installerIds.size > 0 ? await getCharacterNames([...installerIds]) : {};
    // Resolve location names for jobs
    const locationIds = new Set();
    personalJobs.forEach(job => {
      if (job.facility_id) locationIds.add(job.facility_id);
      if (job.station_id) locationIds.add(job.station_id);
    });
    const locationNames = {};
    for (const locId of locationIds) {
      try {
        locationNames[locId] = await getLocationName(locId, accessToken);
      } catch {
        // Skip unresolvable locations
      }
    }
    personalJobs.forEach(job => {
      job.installer_name = installerNames[job.installer_id] || `Character ${job.installer_id}`;
      job.location_name = locationNames[job.facility_id] || locationNames[job.station_id] || null;
    });
    personalJobs.sort((a, b) => (a.time_remaining_ms || 0) - (b.time_remaining_ms || 0));

    // --- Corp Info + Alliance ---
    let corpInfo = null;
    let allianceInfo = null;
    if (corpResult) {
      corpInfo = await getCorporationInfo(corpResult.corporation_id, accessToken);
      if (corpResult.alliance_id) {
        try {
          const allianceResp = await require('axios').get(
            `https://esi.evetech.net/latest/alliances/${corpResult.alliance_id}/`,
            { params: { datasource: 'tranquility' } }
          );
          allianceInfo = {
            id: corpResult.alliance_id,
            name: allianceResp.data.name,
            ticker: allianceResp.data.ticker
          };
        } catch { /* no alliance info */ }
      }
    }

    // --- Corp Jobs (where this character is installer) ---
    let corpJobs = [];
    if (corpResult) {
      try {
        const roles = await getCharacterRoles(character.character_id, accessToken);
        if (hasIndustryRole(roles) && !roles.needsReauthorization) {
          const rawCorpJobs = await getCorporationJobs(corpResult.corporation_id, accessToken);
          if (Array.isArray(rawCorpJobs)) {
            corpJobs = rawCorpJobs.filter(j => j.installer_id === character.character_id);
            // Resolve type names for corp jobs
            const corpTypeIds = [...new Set(corpJobs.map(j => j.blueprint_type_id || j.product_type_id).filter(Boolean))];
            const corpTypeNames = corpTypeIds.length > 0 ? await getTypeNames(corpTypeIds) : {};
            const corpInstallerIds = new Set(corpJobs.map(j => j.installer_id).filter(Boolean));
            const corpInstallerNames = corpInstallerIds.size > 0 ? await getCharacterNames([...corpInstallerIds]) : {};
            corpJobs = await transformCorporationJobs(corpJobs);
            // Resolve corp job locations
            const corpLocIds = new Set();
            corpJobs.forEach(j => { if (j.facility_id) corpLocIds.add(j.facility_id); if (j.station_id) corpLocIds.add(j.station_id); });
            for (const locId of corpLocIds) {
              if (!locationNames[locId]) {
                try { locationNames[locId] = await getLocationName(locId, accessToken); } catch {}
              }
            }
            corpJobs.forEach(job => {
              job.installer_name = corpInstallerNames[job.installer_id] || character.character_name;
              job.location_name = locationNames[job.facility_id] || locationNames[job.station_id] || null;
            });
            corpJobs.sort((a, b) => (a.time_remaining_ms || 0) - (b.time_remaining_ms || 0));
          }
        }
      } catch (e) {
        // No corp access
      }
    }

    // --- Planets (with layout details for expiry + storage) ---
    const colonies = coloniesResult || [];
    const systemIds = colonies.map(c => c.solar_system_id).filter(Boolean);
    const systemNames = systemIds.length > 0 ? await getSystemNames(systemIds) : {};
    for (const colony of colonies) {
      if (colony.solar_system_id) {
        colony.system_name = systemNames[colony.solar_system_id] || `System ${colony.solar_system_id}`;
      }
      if (colony.planet_id) {
        colony.planet_name = await getPlanetName(colony.planet_id);
      }
      // Fetch layout to get extractor expiry and storage fill
      try {
        const layout = await getColonyLayout(character.character_id, colony.planet_id, accessToken);
        const pins = layout.pins || [];

        // Resolve type names and volumes for storage calculation
        const pTypeIds = new Set();
        pins.forEach(p => {
          if (p.type_id) pTypeIds.add(p.type_id);
          if (p.contents) p.contents.forEach(i => { if (i.type_id) pTypeIds.add(i.type_id); });
        });
        const pTypeNames = pTypeIds.size > 0 ? await getTypeNames([...pTypeIds]) : {};
        const pTypeVolumes = {};
        if (pTypeIds.size > 0) {
          const cached = db.getCachedNames([...pTypeIds], 'type');
          for (const [id, data] of Object.entries(cached)) {
            if (data.extra_data) pTypeVolumes[id] = parseFloat(data.extra_data) || 0;
          }
        }
        pins.forEach(p => { p.type_name = pTypeNames[p.type_id] || ''; });

        // Find earliest extractor expiry
        let earliestExpiry = null;
        pins.forEach(p => {
          if (p.expiry_time) {
            const exp = new Date(p.expiry_time);
            if (!earliestExpiry || exp < earliestExpiry) earliestExpiry = exp;
          }
        });
        colony.extractor_expiry = earliestExpiry ? earliestExpiry.toISOString() : null;

        // Calculate launchpad storage fill
        let storageUsed = 0;
        let storageCapacity = 0;
        pins.forEach(p => {
          const name = (p.type_name || '').toLowerCase();
          let cap = 0;
          if (name.includes('launchpad')) cap = 10000;
          else if (name.includes('storage')) cap = 12000;
          if (cap > 0) {
            storageCapacity += cap;
            if (p.contents) {
              p.contents.forEach(item => {
                const vol = pTypeVolumes[item.type_id] || 0.01;
                storageUsed += vol * item.amount;
              });
            }
          }
        });
        colony.storage = storageCapacity > 0 ? {
          used: Math.round(storageUsed),
          capacity: storageCapacity,
          pct: Math.min(100, Math.round((storageUsed / storageCapacity) * 100))
        } : null;
      } catch (layoutErr) {
        // Layout fetch failed — skip details
        colony.extractor_expiry = null;
        colony.storage = null;
      }
    }

    res.json({
      character_id: character.character_id,
      character_name: character.character_name,
      portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=128`,
      corporation: corpInfo ? { name: corpInfo.name, ticker: corpInfo.ticker, id: corpResult.corporation_id } : null,
      alliance: allianceInfo,
      skill_queue: {
        status: skillStatus,
        queue: skillQueue
      },
      slots: slotsResult,
      personal_jobs: personalJobs,
      corp_jobs: corpJobs,
      planets: colonies
    });
  } catch (error) {
    console.error('Get character summary error:', error);
    res.status(500).json({ error: 'Failed to get character summary' });
  }
};

// Get corporation customs offices
exports.getCustomsOffices = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { characterId } = req.query;
    if (!characterId) {
      return res.status(400).json({ error: 'characterId query parameter required' });
    }

    const character = await db.getCharacterById(parseInt(characterId));
    if (!character || character.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const accessToken = await getValidAccessToken(character);
    const corpData = await getCharacterCorporation(character.character_id, accessToken);
    const offices = await getCustomsOffices(corpData.corporation_id, accessToken);

    res.json({ offices: offices || [] });
  } catch (error) {
    console.error('Get customs offices error:', error);
    res.status(500).json({ error: 'Failed to get customs offices' });
  }
};
