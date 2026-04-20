/**
 * Personal Industry Job Archiver
 * Mirrors corpJobArchive but scoped to individual characters. Fetches
 * `/characters/{id}/industry/jobs/?include_completed=true` paginated, filters
 * to completed statuses, denormalizes product metadata and installs rows
 * into character_job_history (PK job_id, idempotent).
 */

const axios = require('axios');
const db = require('../database/db');
const { getValidAccessToken } = require('./tokenRefresh');
const { getTypeNames } = require('./esiClient');
const { resolveTypeMetadata } = require('./typeMetadata');

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const ESI_DATASOURCE = 'tranquility';
const CHAR_JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
const ARCHIVE_STATUSES = new Set(['delivered', 'ready']);

let isArchiving = false;

function hasScope(character, scope) {
  return (character.scopes || '').split(' ').includes(scope);
}

async function fetchCharacterJobsPaged(characterId, accessToken) {
  const url = `${ESI_BASE_URL}/characters/${characterId}/industry/jobs/`;
  const firstResp = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'EVE-ESI-App/2.0' },
    params: { datasource: ESI_DATASOURCE, include_completed: true, page: 1 },
  });
  const jobs = [...(firstResp.data || [])];
  const totalPages = parseInt(firstResp.headers['x-pages'] || '1', 10);
  for (let page = 2; page <= totalPages; page++) {
    const resp = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'EVE-ESI-App/2.0' },
      params: { datasource: ESI_DATASOURCE, include_completed: true, page },
    });
    if (Array.isArray(resp.data)) jobs.push(...resp.data);
  }
  return jobs;
}

async function archiveJobsForCharacter(character) {
  const stats = { fetched: 0, completed: 0, inserted: 0 };
  try {
    const accessToken = await getValidAccessToken(character);
    const rawJobs = await fetchCharacterJobsPaged(character.character_id, accessToken);
    stats.fetched = rawJobs.length;

    const completed = rawJobs.filter(j => ARCHIVE_STATUSES.has(j.status));
    stats.completed = completed.length;
    if (completed.length === 0) return stats;

    const productTypeIds = [...new Set(completed.map(j => j.product_type_id).filter(Boolean))];
    const allTypeIds = [...new Set(completed.flatMap(j =>
      [j.blueprint_type_id, j.product_type_id].filter(Boolean)))];

    const [typeNames, typeMeta] = await Promise.all([
      getTypeNames(allTypeIds),
      resolveTypeMetadata(productTypeIds),
    ]);

    const rows = completed.map(j => {
      const meta = typeMeta[j.product_type_id] || {};
      return {
        job_id: j.job_id,
        character_id: character.character_id,
        character_name: character.character_name,
        activity_id: j.activity_id,
        blueprint_type_id: j.blueprint_type_id,
        product_type_id: j.product_type_id,
        product_name: j.product_type_id ? typeNames[j.product_type_id] : null,
        product_group_id: meta.group_id || null,
        product_category_id: meta.category_id || null,
        product_group_name: meta.group_name || null,
        product_category_name: meta.category_name || null,
        runs: j.runs,
        licensed_runs: j.licensed_runs,
        facility_id: j.facility_id,
        location_id: j.location_id || j.station_id || null,
        start_date: j.start_date,
        end_date: j.end_date,
        status: j.status,
        cost: j.cost,
      };
    });

    stats.inserted = db.insertCharacterJobHistory(rows);
    return stats;
  } catch (err) {
    console.error(`[CHAR-ARCHIVE] Failed for character ${character.character_id}: ${err.message}`);
    stats.error = err.message;
    return stats;
  }
}

async function runArchive() {
  if (isArchiving) {
    console.log('[CHAR-ARCHIVE] Already in progress, skipping');
    return { skipped: true };
  }
  isArchiving = true;
  const started = Date.now();
  const summary = { characters: 0, inserted: 0, completed: 0, fetched: 0, errors: 0 };

  try {
    const chars = db.db.prepare('SELECT * FROM characters WHERE scopes LIKE ?')
      .all(`%${CHAR_JOBS_SCOPE}%`);
    const scoped = chars.filter(c => hasScope(c, CHAR_JOBS_SCOPE));
    if (scoped.length === 0) {
      console.log('[CHAR-ARCHIVE] No characters with character-jobs scope');
      return summary;
    }

    for (const character of scoped) {
      summary.characters++;
      const result = await archiveJobsForCharacter(character);
      if (result.error) summary.errors++;
      summary.inserted += result.inserted;
      summary.completed += result.completed;
      summary.fetched += result.fetched;
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[CHAR-ARCHIVE] done in ${elapsed}s — ${summary.characters} char(s), ` +
      `${summary.completed} completed jobs seen, ${summary.inserted} new rows, ${summary.errors} errors`
    );
    return summary;
  } finally {
    isArchiving = false;
  }
}

module.exports = { runArchive, archiveJobsForCharacter };
