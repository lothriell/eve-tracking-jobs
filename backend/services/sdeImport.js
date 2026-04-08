/**
 * SDE (Static Data Export) Import Service
 * Downloads EVE universe data from Fuzzwork SDE dumps and imports into SQLite
 *
 * Data sources:
 *   - invTypes.csv    → type names (~80K items, ships, modules) [Fuzzwork]
 *   - staStations.csv → NPC station names + system IDs (~5K stations) [Fuzzwork]
 *   - mapSolarSystems.csv → system names + security (~8K systems) [Fuzzwork]
 *   - mapRegions.csv → region names (~100 regions) [Fuzzwork]
 *   - mapConstellations.csv → constellation names (~1100 constellations) [Fuzzwork]
 *   - blueprints.json → blueprint products/materials/times [Hoboleaks — auto-updated after TQ patches]
 *
 * Fuzzwork data imported on first startup (rarely changes).
 * Blueprint data from Hoboleaks is re-imported when a new game revision is detected.
 */

const axios = require('axios');
const db = require('../database/db');

const SDE_BASE = 'https://www.fuzzwork.co.uk/dump/latest';
const HOBOLEAKS_BASE = 'https://sde.hoboleaks.space/tq';

const ACTIVITY_NAME_TO_ID = {
  manufacturing: 1,
  research_time: 3,
  research_material: 4,
  copying: 5,
  invention: 8,
  reaction: 11,
};

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx]?.trim() || '';
    });
    rows.push(obj);
  }

  return rows;
}

// Download a CSV file from Fuzzwork
async function downloadCSV(filename) {
  const url = `${SDE_BASE}/${filename}`;
  console.log(`[SDE] Downloading ${filename}...`);

  const response = await axios.get(url, {
    timeout: 60000,
    maxContentLength: 50 * 1024 * 1024, // 50MB max
    responseType: 'text'
  });

  return response.data;
}

// ===== IMPORT FUNCTIONS =====

async function importTypes() {
  try {
    const csv = await downloadCSV('invTypes.csv');
    const rows = parseCSV(csv);

    const entries = [];
    for (const row of rows) {
      const typeId = parseInt(row.typeID);
      const name = row.typeName;
      const volume = row.volume;
      if (typeId && name && name !== 'None') {
        entries.push({ id: typeId, category: 'type', name, extra_data: volume || null });
      }
    }

    if (entries.length > 0) {
      // Batch in chunks of 5000 for SQLite transaction performance
      for (let i = 0; i < entries.length; i += 5000) {
        db.setCachedNames(entries.slice(i, i + 5000));
      }
      console.log(`[SDE] Types: ${entries.length} imported`);
    }
    return entries.length;
  } catch (error) {
    console.error('[SDE] Failed to import types:', error.message);
    return 0;
  }
}

async function importStations() {
  try {
    const csv = await downloadCSV('staStations.csv');
    const rows = parseCSV(csv);

    const entries = [];
    for (const row of rows) {
      const stationId = parseInt(row.stationID);
      const name = row.stationName;
      const systemId = row.solarSystemID;
      if (stationId && name) {
        entries.push({ id: stationId, category: 'station', name, extra_data: systemId || null });
      }
    }

    if (entries.length > 0) {
      db.setCachedNames(entries);
      console.log(`[SDE] Stations: ${entries.length} imported`);
    }
    return entries.length;
  } catch (error) {
    console.error('[SDE] Failed to import stations:', error.message);
    return 0;
  }
}

async function importSystems() {
  try {
    const csv = await downloadCSV('mapSolarSystems.csv');
    const rows = parseCSV(csv);

    const entries = [];
    for (const row of rows) {
      const systemId = parseInt(row.solarSystemID);
      const name = row.solarSystemName;
      const regionId = row.regionID;
      const constellationId = row.constellationID;
      const security = row.security;
      if (systemId && name) {
        // Store region + constellation + security as JSON extra_data
        const extra = JSON.stringify({
          regionId: parseInt(regionId) || null,
          constellationId: parseInt(constellationId) || null,
          security: parseFloat(security) || 0
        });
        entries.push({ id: systemId, category: 'system', name, extra_data: extra });
      }
    }

    if (entries.length > 0) {
      for (let i = 0; i < entries.length; i += 5000) {
        db.setCachedNames(entries.slice(i, i + 5000));
      }
      console.log(`[SDE] Systems: ${entries.length} imported`);
    }
    return entries.length;
  } catch (error) {
    console.error('[SDE] Failed to import systems:', error.message);
    return 0;
  }
}

async function importRegions() {
  try {
    const csv = await downloadCSV('mapRegions.csv');
    const rows = parseCSV(csv);

    const entries = [];
    for (const row of rows) {
      const regionId = parseInt(row.regionID);
      const name = row.regionName;
      if (regionId && name) {
        entries.push({ id: regionId, category: 'region', name });
      }
    }

    if (entries.length > 0) {
      db.setCachedNames(entries);
      console.log(`[SDE] Regions: ${entries.length} imported`);
    }
    return entries.length;
  } catch (error) {
    console.error('[SDE] Failed to import regions:', error.message);
    return 0;
  }
}

async function importConstellations() {
  try {
    const csv = await downloadCSV('mapConstellations.csv');
    const rows = parseCSV(csv);

    const entries = [];
    for (const row of rows) {
      const constId = parseInt(row.constellationID);
      const name = row.constellationName;
      if (constId && name) {
        entries.push({ id: constId, category: 'constellation', name });
      }
    }

    if (entries.length > 0) {
      db.setCachedNames(entries);
      console.log(`[SDE] Constellations: ${entries.length} imported`);
    }
    return entries.length;
  } catch (error) {
    console.error('[SDE] Failed to import constellations:', error.message);
    return 0;
  }
}

async function importPlanetSchematics() {
  try {
    // Import schematic type map (inputs/outputs)
    const csv = await downloadCSV('planetSchematicsTypeMap.csv');
    const rows = parseCSV(csv);

    const entries = [];
    for (const row of rows) {
      const schematicId = parseInt(row.schematicID);
      const typeId = parseInt(row.typeID);
      const quantity = parseInt(row.quantity) || 0;
      const isInput = parseInt(row.isInput) || 0;
      if (schematicId && typeId) {
        entries.push({ schematic_id: schematicId, type_id: typeId, quantity, is_input: isInput });
      }
    }

    if (entries.length > 0) {
      db.savePlanetSchematics(entries);
      console.log(`[SDE] Planet schematic type map: ${entries.length} entries imported`);
    }

    // Import schematic info (names + cycle times)
    const infoCsv = await downloadCSV('planetSchematics.csv');
    const infoRows = parseCSV(infoCsv);

    const infoEntries = [];
    for (const row of infoRows) {
      const schematicId = parseInt(row.schematicID);
      const schematicName = row.schematicName;
      const cycleTime = parseInt(row.cycleTime) || 0;
      if (schematicId && schematicName) {
        infoEntries.push({ schematic_id: schematicId, schematic_name: schematicName, cycle_time: cycleTime });
      }
    }

    if (infoEntries.length > 0) {
      db.savePlanetSchematicInfo(infoEntries);
      console.log(`[SDE] Planet schematic info: ${infoEntries.length} entries imported`);
    }

    return entries.length + infoEntries.length;
  } catch (error) {
    console.error('[SDE] Failed to import planet schematics:', error.message);
    return 0;
  }
}

// Check Hoboleaks for current game revision
async function getHoboleaksRevision() {
  try {
    const resp = await axios.get(`${HOBOLEAKS_BASE}/meta.json`, { timeout: 15000 });
    return String(resp.data?.revision || '');
  } catch {
    return null;
  }
}

// Import blueprint data from Hoboleaks (auto-updated after every TQ patch)
async function importBlueprintsFromHoboleaks() {
  console.log('[SDE] Downloading blueprints.json from Hoboleaks...');
  const resp = await axios.get(`${HOBOLEAKS_BASE}/blueprints.json`, {
    timeout: 60000,
    maxContentLength: 50 * 1024 * 1024,
  });
  const data = resp.data;

  const productEntries = [];
  const materialEntries = [];
  const activityEntries = [];

  for (const [bpIdStr, bp] of Object.entries(data)) {
    const blueprintId = parseInt(bpIdStr);
    if (!blueprintId) continue;

    for (const [actName, actData] of Object.entries(bp.activities || {})) {
      const activityId = ACTIVITY_NAME_TO_ID[actName];
      if (!activityId) continue;

      // Products
      for (const prod of actData.products || []) {
        if (prod.typeID && prod.quantity) {
          productEntries.push({
            blueprint_id: blueprintId,
            activity_id: activityId,
            product_type_id: prod.typeID,
            quantity: prod.quantity,
          });
        }
      }

      // Materials (only for manufacturing + reaction)
      if (activityId === 1 || activityId === 11) {
        for (const mat of actData.materials || []) {
          if (mat.typeID && mat.quantity > 0) {
            materialEntries.push({
              blueprint_id: blueprintId,
              activity_id: activityId,
              material_type_id: mat.typeID,
              quantity: mat.quantity,
            });
          }
        }
      }

      // Activity time
      if (actData.time > 0) {
        activityEntries.push({
          blueprint_id: blueprintId,
          activity_id: activityId,
          time: actData.time,
        });
      }
    }
  }

  // Clear old data and insert fresh
  db.clearBlueprintData();

  for (let i = 0; i < productEntries.length; i += 5000) {
    db.saveBlueprintProducts(productEntries.slice(i, i + 5000));
  }
  console.log(`[SDE] Blueprint products: ${productEntries.length} entries imported`);

  for (let i = 0; i < materialEntries.length; i += 5000) {
    db.saveBlueprintMaterials(materialEntries.slice(i, i + 5000));
  }
  console.log(`[SDE] Blueprint materials: ${materialEntries.length} entries imported`);

  for (let i = 0; i < activityEntries.length; i += 5000) {
    db.saveBlueprintActivities(activityEntries.slice(i, i + 5000));
  }
  console.log(`[SDE] Blueprint activities: ${activityEntries.length} entries imported`);

  return productEntries.length + materialEntries.length + activityEntries.length;
}

// Import blueprint products + materials (from Hoboleaks, with packaged volumes from Fuzzwork)
async function importBlueprints() {
  try {
    const count = await importBlueprintsFromHoboleaks();

    // Store the Hoboleaks revision
    const revision = await getHoboleaksRevision();
    if (revision) {
      db.setSdeMeta('hoboleaks_revision', revision);
    }

    // Packaged volumes: override SDE assembled volumes with packaged volumes for ships
    // (Still from Fuzzwork — Hoboleaks doesn't have this in CSV format)
    const volumesCsv = await downloadCSV('invVolumes.csv');
    const volumeRows = parseCSV(volumesCsv);

    const volumeUpdates = [];
    for (const row of volumeRows) {
      const typeId = parseInt(row.typeID);
      const volume = row.volume;
      if (typeId && volume) {
        volumeUpdates.push({ id: typeId, category: 'type', extra_data: volume });
      }
    }

    if (volumeUpdates.length > 0) {
      const stmt = db.db.prepare(
        'UPDATE name_cache SET extra_data = ? WHERE id = ? AND category = ?'
      );
      const batch = db.db.transaction((items) => {
        for (const item of items) {
          stmt.run(item.extra_data, item.id, item.category);
        }
      });
      batch(volumeUpdates);
      console.log(`[SDE] Packaged volumes: ${volumeUpdates.length} ship volumes updated`);
    }

    return count;
  } catch (error) {
    console.error('[SDE] Failed to import blueprints:', error.message);
    return 0;
  }
}

// Check if blueprint data needs refreshing (new Hoboleaks revision available)
async function refreshBlueprintsIfStale() {
  try {
    const currentRevision = await getHoboleaksRevision();
    if (!currentRevision) {
      console.log('[SDE] Could not reach Hoboleaks — skipping blueprint freshness check');
      return false;
    }
    const storedRevision = db.getSdeMeta('hoboleaks_revision');
    if (storedRevision === currentRevision) {
      console.log(`[SDE] Blueprints up to date (revision ${currentRevision})`);
      return false;
    }
    console.log(`[SDE] New blueprint data available: ${storedRevision || 'none'} → ${currentRevision}`);
    const count = await importBlueprints();
    console.log(`[SDE] Blueprint refresh complete: ${count} entries`);
    return true;
  } catch (error) {
    console.error('[SDE] Blueprint refresh failed:', error.message);
    return false;
  }
}

// ===== MAIN IMPORT FUNCTION =====

async function importSDE() {
  // Check if SDE data already exists
  const stats = db.getCacheStats();
  const typeCount = stats.find(s => s.category === 'type')?.count || 0;

  // Check if types have volume data (extra_data) — if not, need re-import
  const sampleType = db.getCachedName(11, 'type'); // Planet (Temperate)
  const hasVolumes = sampleType && sampleType.extra_data;

  // Check if planet schematics and blueprints need importing
  const schematicsCount = db.getPlanetSchematicsCount();
  const blueprintsCount = db.getBlueprintProductsCount();
  const activitiesCount = db.getBlueprintActivitiesCount();

  // Check if packaged volumes are imported (Procurer type 17480 should have volume)
  const procurerVol = db.getCachedName(17480, 'type');
  const hasPackagedVolumes = procurerVol && procurerVol.extra_data && parseFloat(procurerVol.extra_data) > 1;

  if (typeCount > 50000 && hasVolumes && schematicsCount > 0 && blueprintsCount > 0 && activitiesCount > 0 && hasPackagedVolumes) {
    console.log(`[SDE] Already have ${typeCount} types + ${schematicsCount} schematics + ${blueprintsCount} blueprints + ${activitiesCount} activities + packaged volumes`);
    // Check if blueprint data is stale (new Hoboleaks revision available)
    await refreshBlueprintsIfStale();
    return;
  }

  if (typeCount > 50000 && hasVolumes && schematicsCount > 0 && blueprintsCount > 0 && activitiesCount > 0 && !hasPackagedVolumes) {
    console.log(`[SDE] Missing packaged volumes — re-importing blueprints`);
    const count = await importBlueprints();
    console.log(`[SDE] Blueprints + volumes: ${count} entries imported`);
    return;
  }

  if (typeCount > 50000 && hasVolumes && schematicsCount > 0 && (blueprintsCount === 0 || activitiesCount === 0)) {
    console.log(`[SDE] Types + schematics exist but blueprints/activities missing — importing blueprints`);
    const count = await importBlueprints();
    console.log(`[SDE] Blueprints: ${count} entries imported`);
    return;
  }

  if (typeCount > 50000 && hasVolumes && schematicsCount === 0) {
    console.log(`[SDE] Types exist but planet schematics missing — importing schematics only`);
    const count = await importPlanetSchematics();
    console.log(`[SDE] Planet schematics: ${count} entries imported`);
    return;
  }

  if (typeCount > 50000 && !hasVolumes) {
    console.log(`[SDE] Types exist but missing volumes — re-importing with volume data`);
  }

  const start = Date.now();
  console.log('[SDE] === Starting SDE import (first run) ===');

  const results = {
    types: await importTypes(),
    stations: await importStations(),
    systems: await importSystems(),
    regions: await importRegions(),
    constellations: await importConstellations(),
    schematics: await importPlanetSchematics(),
    blueprints: await importBlueprints()
  };

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[SDE] === Import complete in ${elapsed}s ===`);
  console.log(`[SDE]   Types: ${results.types}`);
  console.log(`[SDE]   Stations: ${results.stations}`);
  console.log(`[SDE]   Systems: ${results.systems}`);
  console.log(`[SDE]   Regions: ${results.regions}`);
  console.log(`[SDE]   Constellations: ${results.constellations}`);
  console.log(`[SDE]   Planet schematics: ${results.schematics}`);
  console.log(`[SDE]   Blueprints: ${results.blueprints}`);

  return results;
}

module.exports = {
  importSDE,
  importTypes,
  importStations,
  importSystems,
  importRegions,
  importConstellations,
  importPlanetSchematics,
  importBlueprints,
  refreshBlueprintsIfStale,
  importBlueprintsFromHoboleaks,
  getHoboleaksRevision,
};
