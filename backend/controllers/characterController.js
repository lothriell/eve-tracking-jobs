const db = require('../database/db');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { 
  getCharacterIndustryJobs, 
  getJobSlotUsage, 
  getCharacterNames,
  getLocationName 
} = require('../services/esiClient');

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
        jobs_by_activity: {},
        jobs_by_character: [],
        slots: {
          manufacturing: { current: 0, max: 0 },
          science: { current: 0, max: 0 },
          reactions: { current: 0, max: 0 }
        }
      });
    }

    let totalActiveJobs = 0;
    const jobsByActivity = {};
    const jobsByCharacter = [];
    const totals = {
      manufacturing: { current: 0, max: 0 },
      science: { current: 0, max: 0 },
      reactions: { current: 0, max: 0 }
    };

    for (const character of characters) {
      try {
        const accessToken = await getValidAccessToken(character);
        const jobs = await getCharacterIndustryJobs(character.character_id, accessToken);
        const slots = await getJobSlotUsage(character.character_id, accessToken);
        
        const activeJobs = jobs.filter(j => j.status === 'active');
        totalActiveJobs += activeJobs.length;

        // Count by activity
        activeJobs.forEach(job => {
          jobsByActivity[job.activity] = (jobsByActivity[job.activity] || 0) + 1;
        });

        jobsByCharacter.push({
          character_id: character.character_id,
          character_name: character.character_name,
          portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`,
          active_jobs: activeJobs.length,
          slots
        });

        totals.manufacturing.current += slots.manufacturing.current;
        totals.manufacturing.max += slots.manufacturing.max;
        totals.science.current += slots.science.current;
        totals.science.max += slots.science.max;
        totals.reactions.current += slots.reactions.current;
        totals.reactions.max += slots.reactions.max;
      } catch (error) {
        console.error(`Failed to get stats for character ${character.character_id}:`, error.message);
        jobsByCharacter.push({
          character_id: character.character_id,
          character_name: character.character_name,
          portrait_url: `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`,
          active_jobs: 0,
          error: 'Failed to fetch data'
        });
      }
    }

    res.json({
      total_characters: characters.length,
      total_active_jobs: totalActiveJobs,
      jobs_by_activity: jobsByActivity,
      jobs_by_character: jobsByCharacter,
      slots: totals
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
};
