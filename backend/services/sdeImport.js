/**
 * SDE (Static Data Export) Import Service
 * Downloads EVE universe data from Fuzzwork SDE dumps and imports into SQLite
 *
 * Data sources:
 *   - invTypes.csv    → type names (~80K items, ships, modules)
 *   - staStations.csv → NPC station names + system IDs (~5K stations)
 *   - mapSolarSystems.csv → system names + security (~8K systems)
 *   - mapRegions.csv → region names (~100 regions)
 *   - mapConstellations.csv → constellation names (~1100 constellations)
 *
 * Runs on first startup if cache is empty. Data rarely changes (SDE updates ~quarterly).
 */

const axios = require('axios');
const db = require('../database/db');

const SDE_BASE = 'https://www.fuzzwork.co.uk/dump/latest';

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

// ===== MAIN IMPORT FUNCTION =====

async function importSDE() {
  // Check if SDE data already exists
  const stats = db.getCacheStats();
  const typeCount = stats.find(s => s.category === 'type')?.count || 0;

  // Check if types have volume data (extra_data) — if not, need re-import
  const sampleType = db.getCachedName(11, 'type'); // Planet (Temperate)
  const hasVolumes = sampleType && sampleType.extra_data;

  if (typeCount > 50000 && hasVolumes) {
    console.log(`[SDE] Already have ${typeCount} types cached with volumes, skipping SDE import`);
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
    constellations: await importConstellations()
  };

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[SDE] === Import complete in ${elapsed}s ===`);
  console.log(`[SDE]   Types: ${results.types}`);
  console.log(`[SDE]   Stations: ${results.stations}`);
  console.log(`[SDE]   Systems: ${results.systems}`);
  console.log(`[SDE]   Regions: ${results.regions}`);
  console.log(`[SDE]   Constellations: ${results.constellations}`);

  return results;
}

module.exports = {
  importSDE,
  importTypes,
  importStations,
  importSystems,
  importRegions,
  importConstellations
};
