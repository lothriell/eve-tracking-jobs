const db = require('../database/db');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { REQUIRED_SCOPES } = require('./authController');
const {
  getCharacterIndustryJobs,
  getJobSlotUsage,
  getCharacterNames,
  getLocationName,
  getLocationInfo,
  transformCorporationJobs,
  getTypeNames,
  getCharacterAssets,
  getCorporationAssets,
  getAssetNames,
  getCharacterColonies,
  getColonyLayout,
  getSystemNames
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
exports.getDashboardStats = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
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
    // Use activity categories: manufacturing, science, reactions
    const jobsByActivity = { manufacturing: 0, science: 0, reactions: 0 };
    // Track personal vs corp breakdown separately
    const personalJobsByActivity = { manufacturing: 0, science: 0, reactions: 0 };
    const corpJobsByActivity = { manufacturing: 0, science: 0, reactions: 0 };
    const jobsByCharacter = [];
    const totals = {
      manufacturing: { current: 0, max: 0 },
      science: { current: 0, max: 0 },
      reactions: { current: 0, max: 0 }
    };
    
    // Track processed corps to avoid counting same corp jobs multiple times
    const processedCorps = new Map(); // corp_id -> { jobs: [], activeJobs: [] }
    
    // First pass: fetch all corp jobs
    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const corpData = await getCharacterCorporation(character.character_id, accessToken);
        
        if (!processedCorps.has(corpData.corporation_id)) {
          const roles = await getCharacterRoles(character.character_id, accessToken);
          
          if (hasIndustryRole(roles) && !roles.needsReauthorization) {
            const rawCorpJobs = await getCorporationJobs(corpData.corporation_id, accessToken);
            
            if (!rawCorpJobs.error && Array.isArray(rawCorpJobs)) {
              const activeCorpJobs = rawCorpJobs.filter(j => j.status === 'active');
              processedCorps.set(corpData.corporation_id, {
                allJobs: rawCorpJobs,
                activeJobs: activeCorpJobs
              });
            }
          }
        }
      } catch (error) {
        // Silently fail - character might not have access
      }
    }

    // Second pass: calculate stats per character
    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const jobs = await getCharacterIndustryJobs(character.character_id, accessToken);
        const slots = await getJobSlotUsage(character.character_id, accessToken);
        
        const activeJobs = jobs.filter(j => j.status === 'active');
        totalPersonalJobs += activeJobs.length;
        
        // Count personal jobs by activity category
        let personalByCategory = { manufacturing: 0, science: 0, reactions: 0 };
        activeJobs.forEach(job => {
          const category = job.activity_category || 'other';
          if (category in personalByCategory) {
            personalByCategory[category]++;
            jobsByActivity[category]++;
            personalJobsByActivity[category]++;
          }
        });

        // Find corp jobs for this character (by installer_id)
        let corpJobsCount = 0;
        let corpByCategory = { manufacturing: 0, science: 0, reactions: 0 };
        
        try {
          const corpData = await getCharacterCorporation(character.character_id, accessToken);
          const corpJobsData = processedCorps.get(corpData.corporation_id);
          
          if (corpJobsData) {
            // Count corp jobs where this character is the installer
            corpJobsData.activeJobs.forEach(job => {
              if (job.installer_id === character.character_id) {
                corpJobsCount++;
                const activityId = job.activity_id;
                // Manufacturing: 1, Science: 3,4,5,7,8, Reactions: 9
                if (activityId === 1) {
                  corpByCategory.manufacturing++;
                  jobsByActivity.manufacturing++;
                  corpJobsByActivity.manufacturing++;
                } else if ([3, 4, 5, 7, 8].includes(activityId)) {
                  corpByCategory.science++;
                  jobsByActivity.science++;
                  corpJobsByActivity.science++;
                } else if (activityId === 9) {
                  corpByCategory.reactions++;
                  jobsByActivity.reactions++;
                  corpJobsByActivity.reactions++;
                }
              }
            });
          }
        } catch (corpError) {
          // Silently fail
        }
        
        totalCorpJobs += corpJobsCount;

        // Calculate combined slot usage (personal + corp jobs for this character)
        // Slots are SHARED between personal and corp jobs
        const combinedSlots = {
          manufacturing: {
            current: personalByCategory.manufacturing + corpByCategory.manufacturing,
            max: slots.manufacturing.max
          },
          science: {
            current: personalByCategory.science + corpByCategory.science,
            max: slots.science.max
          },
          reactions: {
            current: personalByCategory.reactions + corpByCategory.reactions,
            max: slots.reactions.max
          }
        };

        jobsByCharacter.push({
          character_id: character.character_id,
          character_name: character.character_name,
          portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`,
          active_jobs: activeJobs.length,
          corp_jobs: corpJobsCount,
          total_jobs: activeJobs.length + corpJobsCount,
          slots: combinedSlots,
          // Activity breakdown for this character
          activity_breakdown: {
            manufacturing: personalByCategory.manufacturing + corpByCategory.manufacturing,
            science: personalByCategory.science + corpByCategory.science,
            reactions: personalByCategory.reactions + corpByCategory.reactions
          }
        });

        totals.manufacturing.current += combinedSlots.manufacturing.current;
        totals.manufacturing.max += slots.manufacturing.max;
        totals.science.current += combinedSlots.science.current;
        totals.science.max += slots.science.max;
        totals.reactions.current += combinedSlots.reactions.current;
        totals.reactions.max += slots.reactions.max;
      } catch (error) {
        console.error(`Failed to get stats for character ${character.character_id}:`, error.message);
        jobsByCharacter.push({
          character_id: character.character_id,
          character_name: character.character_name,
          portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`,
          active_jobs: 0,
          corp_jobs: 0,
          total_jobs: 0,
          error: 'Failed to fetch data'
        });
      }
    }

    res.json({
      total_characters: characters.length,
      total_active_jobs: totalPersonalJobs + totalCorpJobs,
      personal_active_jobs: totalPersonalJobs,
      corp_active_jobs: totalCorpJobs,
      jobs_by_activity: jobsByActivity,
      personal_jobs_by_activity: personalJobsByActivity,
      corp_jobs_by_activity: corpJobsByActivity,
      jobs_by_character: jobsByCharacter,
      slots: totals
    });
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

    console.log(`[ASSETS] === Starting asset resolution for ${characters.length} characters ===`);

    // ===== PASS 1: Collect all assets and tokens =====
    const allAssets = [];
    const charTokens = []; // { character, accessToken }
    const perCharAssets = []; // { character, assets, accessToken }

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const assets = await getCharacterAssets(character.character_id, accessToken);
        charTokens.push({ character, accessToken });
        perCharAssets.push({ character, assets, accessToken });
      } catch (error) {
        if (error.response?.status === 403) {
          return res.json({ assets: [], total: 0, error: 'missing_scope', message: 'Character needs to be re-authorized with asset read scopes' });
        }
        console.error(`Failed to get assets for character ${character.character_id}:`, error.message);
        continue;
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
          if (rootLocationType !== 'item' && rootLocationType !== 'other') locIdsToResolve.add(rootLocationId);
        }
      });

      console.log(`[ASSETS] ${character.character_name}: ${assets.length} assets, ${locIdsToResolve.size} locations to resolve: ${[...locIdsToResolve].join(', ')}`);

      // Resolve locations — try multiple methods for structures
      for (const locId of locIdsToResolve) {
        if (resolvedLocations[locId] && !resolvedLocations[locId].unresolved) continue;

        try {
          // Refresh token before structure resolution (tokens may have expired during type name resolution)
          const freshToken = await getValidAccessToken(character);

          let info = await getLocationInfo(locId, freshToken);

          // If structure unresolved, try ALL other characters with fresh tokens
          if (info.unresolved) {
            console.log(`[ASSETS] Structure ${locId} unresolved with ${character.character_name}, trying other characters...`);
            for (const { character: otherChar } of charTokens) {
              if (otherChar.character_id === character.character_id) continue;
              try {
                const otherFreshToken = await getValidAccessToken(otherChar);
                console.log(`[ASSETS] Trying ${otherChar.character_name} for structure ${locId}`);
                const retry = await getLocationInfo(locId, otherFreshToken);
                if (!retry.unresolved) {
                  console.log(`[ASSETS] SUCCESS: ${otherChar.character_name} resolved structure ${locId} = "${retry.name}"`);
                  info = retry;
                  break;
                }
              } catch (e) {
                console.log(`[ASSETS] ${otherChar.character_name} failed for ${locId}: ${e.message}`);
              }
            }
          }

          // If STILL unresolved, try POST /characters/{id}/assets/names/ with the structure ID
          if (info.unresolved) {
            console.log(`[ASSETS] Trying assets/names fallback for structure ${locId}`);
            for (const { character: ch } of charTokens) {
              try {
                const tok = await getValidAccessToken(ch);
                const nameResult = await getAssetNames(ch.character_id, [locId], tok);
                if (nameResult[locId] && nameResult[locId] !== 'None' && nameResult[locId] !== '') {
                  console.log(`[ASSETS] assets/names resolved ${locId} = "${nameResult[locId]}" via ${ch.character_name}`);
                  info = { name: nameResult[locId], system_id: null, location_class: 'structure' };
                  break;
                }
              } catch (e) { /* next character */ }
            }
          }

          // Final fallback
          if (info.unresolved || !info.name) {
            console.log(`[ASSETS] Could not resolve structure ${locId} with any method`);
            info = { name: `Player Structure #${String(locId).slice(-6)}`, system_id: null, location_class: 'structure' };
          }

          resolvedLocations[locId] = info;
        } catch (locErr) {
          console.error(`[ASSETS] Error resolving location ${locId}:`, locErr.message);
          resolvedLocations[locId] = { name: `Location ${locId}`, system_id: null, location_class: 'unknown' };
        }
      }

      // Resolve system names for newly resolved locations
      const systemIds = [...new Set(Object.values(resolvedLocations).map(i => i.system_id).filter(Boolean))];
      const systemNames = systemIds.length > 0 ? await getSystemNames(systemIds) : {};

      // Get custom names for containers (named ships, etc.)
      const allItemIds = assets.map(a => a.item_id).filter(Boolean);
      let customNames = {};
      try {
        customNames = await getAssetNames(character.character_id, allItemIds, accessToken);
      } catch (e) { /* not critical */ }

      // Enrich assets
      assets.forEach(a => {
        a.type_name = typeNames[a.type_id] || `Type ${a.type_id}`;

        let rootLocId;
        if (a.location_type === 'item') {
          const { rootLocationId } = resolveRootLocation(a);
          rootLocId = rootLocationId;
          const directParent = itemMap[a.location_id];
          if (directParent) {
            const customName = customNames[directParent.item_id];
            const typeName = typeNames[directParent.type_id] || `Type ${directParent.type_id}`;
            a.container_name = customName ? `${typeName} (${customName})` : typeName;
            a.container_id = directParent.item_id;
          }
        } else {
          rootLocId = a.location_id;
        }

        const locInfo = resolvedLocations[rootLocId] || { name: `Unknown Location`, system_id: null };
        a.location_name = locInfo.name;
        a.system_id = locInfo.system_id;
        a.system_name = locInfo.system_id ? (systemNames[locInfo.system_id] || null) : null;

        a.character_id = character.character_id;
        a.character_name = character.character_name;
        allAssets.push(a);
      });
    }

    res.json({ assets: allAssets, total: allAssets.length });
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
          if (rootLocationType !== 'item' && rootLocationType !== 'other') stationLocIds.add(rootLocationId);
        }
      });

      const locationInfo = {};
      for (const locId of stationLocIds) {
        try { locationInfo[locId] = await getLocationInfo(locId, accessToken); }
        catch (e) { locationInfo[locId] = { name: `Location ${locId}`, system_id: null }; }
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
        const locInfo = locationInfo[rootLocId] || { name: `Location ${rootLocId}`, system_id: null };
        a.location_name = locInfo.name;
        a.system_id = locInfo.system_id;
        a.system_name = locInfo.system_id ? (systemNames[locInfo.system_id] || `System ${locInfo.system_id}`) : null;
      });

      res.json({ assets, total: assets.length, has_access: true });
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

        // Resolve system names
        const colonyList = colonies || [];
        const systemIds = colonyList.map(c => c.solar_system_id).filter(Boolean);
        const systemNames = systemIds.length > 0 ? await getSystemNames(systemIds) : {};

        colonyList.forEach(colony => {
          if (colony.solar_system_id) {
            colony.system_name = systemNames[colony.solar_system_id] || `System ${colony.solar_system_id}`;
          }
        });

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
      // Also resolve factory schematic output
      if (pin.factory_details?.schematic_id) {
        // schematic_id is not a type_id, skip
      }
    });

    const typeNames = typeIds.size > 0 ? await getTypeNames([...typeIds]) : {};

    // Enrich pins with resolved names
    pins.forEach(pin => {
      pin.type_name = typeNames[pin.type_id] || `Type ${pin.type_id}`;
      if (pin.contents) {
        pin.contents.forEach(item => {
          item.type_name = typeNames[item.type_id] || `Type ${item.type_id}`;
        });
      }
      if (pin.extractor_details?.product_type_id) {
        pin.extractor_details.product_name = typeNames[pin.extractor_details.product_type_id] || null;
      }
    });

    res.json(layout);
  } catch (error) {
    console.error('Get colony layout error:', error);
    if (error.response?.status === 403) {
      return res.status(403).json({ error: 'Missing required scopes for planet layout' });
    }
    res.status(500).json({ error: 'Failed to get colony layout' });
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
