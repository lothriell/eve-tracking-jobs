const db = require('../database/db');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { 
  getCharacterIndustryJobs, 
  getJobSlotUsage, 
  getCharacterNames,
  getLocationName,
  transformCorporationJobs
} = require('../services/esiClient');
const {
  getCharacterCorporation,
  getCharacterRoles,
  hasIndustryRole,
  getIndustryRoleName,
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
      characters: characters.map(char => ({
        id: char.id,
        character_id: char.character_id,
        name: char.character_name,
        portrait_url: `https://images.evetech.net/characters/${char.character_id}/portrait?size=64`
      }))
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
                } else if ([3, 4, 5, 7, 8].includes(activityId)) {
                  corpByCategory.science++;
                  jobsByActivity.science++;
                } else if (activityId === 9) {
                  corpByCategory.reactions++;
                  jobsByActivity.reactions++;
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
