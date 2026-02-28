const db = require('../database/db');
const { getValidAccessToken } = require('../services/tokenRefresh');
const { getCharacterIndustryJobs } = require('../services/esiClient');

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

exports.getCharacterPortrait = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const character = await db.getCharacterByUserId(req.session.userId);
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

exports.getIndustryJobs = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const character = await db.getCharacterByUserId(req.session.userId);
    if (!character) {
      return res.status(404).json({ error: 'No character linked' });
    }

    // Get valid access token (will refresh if needed)
    const accessToken = await getValidAccessToken(character);

    // Fetch industry jobs from ESI
    const jobs = await getCharacterIndustryJobs(character.character_id, accessToken);

    res.json({ jobs });
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
