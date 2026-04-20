/**
 * Corporation Industry Job Archiver
 * Periodically fetches completed corp jobs from ESI and persists them to
 * corp_job_history. Append-only; dedupes via job_id PK.
 *
 * ESI only retains ~30 days of completed jobs, so history is forward-only
 * from ship date (plus a one-time backfill of whatever ESI still has).
 */

const db = require('../database/db');
const { getValidAccessToken } = require('./tokenRefresh');
const {
  getCharacterCorporation,
  getCharacterRoles,
  getCorporationJobs,
  getCorporationMemberNames,
  hasIndustryRole,
} = require('./corporationService');
const { getTypeNames } = require('./esiClient');
const { resolveTypeMetadata } = require('./typeMetadata');

const CORP_JOBS_SCOPE = 'esi-industry.read_corporation_jobs.v1';
const ARCHIVE_STATUSES = new Set(['delivered', 'ready']);

let isArchiving = false;

function hasScope(character, scope) {
  return (character.scopes || '').split(' ').includes(scope);
}

async function archiveJobsForCharacter(character) {
  const stats = { fetched: 0, completed: 0, inserted: 0, corporation_id: null };
  try {
    const accessToken = await getValidAccessToken(character);
    const { corporation_id } = await getCharacterCorporation(character.character_id, accessToken);
    stats.corporation_id = corporation_id;

    const roles = await getCharacterRoles(character.character_id, accessToken);
    if (!hasIndustryRole(roles)) return stats;

    const rawJobs = await getCorporationJobs(corporation_id, accessToken, true);
    if (!Array.isArray(rawJobs)) return stats;
    stats.fetched = rawJobs.length;

    const completed = rawJobs.filter(j => ARCHIVE_STATUSES.has(j.status));
    stats.completed = completed.length;
    if (completed.length === 0) return stats;

    const productTypeIds = [...new Set(completed.map(j => j.product_type_id).filter(Boolean))];
    const allTypeIds = [...new Set(completed.flatMap(j =>
      [j.blueprint_type_id, j.product_type_id].filter(Boolean)))];
    const installerIds = [...new Set(completed.map(j => j.installer_id).filter(Boolean))];

    const [typeNames, typeMeta, installerNames] = await Promise.all([
      getTypeNames(allTypeIds),
      resolveTypeMetadata(productTypeIds),
      getCorporationMemberNames(installerIds),
    ]);

    const rows = completed.map(j => {
      const meta = typeMeta[j.product_type_id] || {};
      return {
        job_id: j.job_id,
        corporation_id,
        installer_id: j.installer_id,
        installer_name: installerNames[j.installer_id] || null,
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
        location_id: j.location_id,
        start_date: j.start_date,
        end_date: j.end_date,
        status: j.status,
        cost: j.cost,
      };
    });

    stats.inserted = db.insertCorpJobHistory(rows);
    return stats;
  } catch (err) {
    console.error(`[CORP-ARCHIVE] Failed for character ${character.character_id}: ${err.message}`);
    stats.error = err.message;
    return stats;
  }
}

/**
 * Archive completed corp jobs across all characters that have the required
 * scope. Dedupes per-corporation to avoid hitting ESI twice for the same corp
 * (two alts in one corp → only one fetch).
 */
async function runArchive() {
  if (isArchiving) {
    console.log('[CORP-ARCHIVE] Already in progress, skipping');
    return { skipped: true };
  }
  isArchiving = true;
  const started = Date.now();
  const summary = { characters: 0, corporations: 0, inserted: 0, completed: 0, fetched: 0, errors: 0 };

  try {
    const allChars = db.db.prepare('SELECT * FROM characters WHERE scopes LIKE ?')
      .all(`%${CORP_JOBS_SCOPE}%`);
    const scoped = allChars.filter(c => hasScope(c, CORP_JOBS_SCOPE));
    if (scoped.length === 0) {
      console.log('[CORP-ARCHIVE] No characters with corp-jobs scope');
      return summary;
    }

    // First pass: group characters by corp so we archive once per corp (two
    // alts in the same corp would otherwise fetch the same ESI endpoint twice).
    const charByCorp = new Map();
    for (const char of scoped) {
      try {
        const token = await getValidAccessToken(char);
        const { corporation_id } = await getCharacterCorporation(char.character_id, token);
        if (corporation_id && !charByCorp.has(corporation_id)) {
          charByCorp.set(corporation_id, char);
        }
      } catch (err) {
        console.warn(`[CORP-ARCHIVE] Could not resolve corp for ${char.character_id}: ${err.message}`);
        summary.errors++;
      }
    }

    for (const [, character] of charByCorp) {
      summary.characters++;
      const result = await archiveJobsForCharacter(character);
      if (result.error) summary.errors++;
      if (result.corporation_id) summary.corporations++;
      summary.inserted += result.inserted;
      summary.completed += result.completed;
      summary.fetched += result.fetched;
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[CORP-ARCHIVE] done in ${elapsed}s — ${summary.corporations} corp(s), ` +
      `${summary.completed} completed jobs seen, ${summary.inserted} new rows, ${summary.errors} errors`
    );
    return summary;
  } finally {
    isArchiving = false;
  }
}

module.exports = { runArchive, archiveJobsForCharacter };
