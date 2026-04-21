const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'eve_esi.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

class DB {
  constructor() {
    this.db = null;
  }

  async init() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    console.log('Connected to SQLite database');

    this.initializeSchema();
  }

  initializeSchema() {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    this.db.exec(schema);
    console.log('Database schema initialized');

    // Migration: add is_admin column to users
    try {
      this.db.prepare('SELECT is_admin FROM users LIMIT 1').get();
    } catch {
      this.db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
      console.log('Migration: added is_admin column to users');
    }

    // Migration: seed initial admin if none exists
    const adminCount = this.db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get();
    if (adminCount.c === 0) {
      const lothriell = this.db.prepare("SELECT id FROM users WHERE primary_character_name = 'Lothriell'").get();
      if (lothriell) {
        this.db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(lothriell.id);
        this.db.prepare("INSERT OR IGNORE INTO user_features (user_id, feature_name, granted_by) VALUES (?, 'trading', ?)").run(lothriell.id, lothriell.id);
        console.log('Migration: seeded initial admin (Lothriell)');
      }
    }
  }

  // User operations
  getUserByCharacterId(characterId) {
    return this.db.prepare(
      'SELECT user_id FROM characters WHERE character_id = ?'
    ).get(characterId);
  }

  createUserFromCharacter(characterId, characterName) {
    const insertUser = this.db.prepare(
      'INSERT INTO users (primary_character_id, primary_character_name) VALUES (?, ?)'
    );
    const result = insertUser.run(characterId, characterName);
    return result.lastInsertRowid;
  }

  // Character operations - Multiple character support
  getCharacterByUserId(userId) {
    return this.db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId);
  }

  getAllCharactersByUserId(userId) {
    return this.db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC').all(userId);
  }

  getCharacterById(characterId) {
    return this.db.prepare('SELECT * FROM characters WHERE character_id = ?').get(characterId);
  }

  getCharacterByDbId(id) {
    return this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  }

  saveCharacter(userId, characterId, characterName, accessToken, refreshToken, tokenExpiry, scopes) {
    const existing = this.db.prepare('SELECT id, user_id FROM characters WHERE character_id = ?').get(characterId);

    if (existing) {
      this.db.prepare(
        `UPDATE characters
         SET user_id = ?, character_name = ?, access_token = ?, refresh_token = ?, token_expiry = ?, scopes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE character_id = ?`
      ).run(userId, characterName, accessToken, refreshToken, tokenExpiry, scopes, characterId);
      return existing.id;
    } else {
      const result = this.db.prepare(
        `INSERT INTO characters (user_id, character_id, character_name, access_token, refresh_token, token_expiry, scopes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).run(userId, characterId, characterName, accessToken, refreshToken, tokenExpiry, scopes);
      return result.lastInsertRowid;
    }
  }

  updateCharacterTokens(characterId, accessToken, refreshToken, tokenExpiry) {
    const result = this.db.prepare(
      `UPDATE characters
       SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP
       WHERE character_id = ?`
    ).run(accessToken, refreshToken, tokenExpiry, characterId);
    return result.changes;
  }

  deleteCharacter(characterId, userId) {
    const result = this.db.prepare(
      'DELETE FROM characters WHERE character_id = ? AND user_id = ?'
    ).run(characterId, userId);
    return result.changes;
  }

  // ===== NAME CACHE =====

  // Get a cached name by id and category
  getCachedName(id, category) {
    return this.db.prepare('SELECT name, extra_data FROM name_cache WHERE id = ? AND category = ?').get(id, category);
  }

  // Get multiple cached names
  getCachedNames(ids, category) {
    if (!ids || ids.length === 0) return {};
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT id, name, extra_data FROM name_cache WHERE category = ? AND id IN (${placeholders})`
    ).all(category, ...ids);
    const result = {};
    for (const row of rows) {
      result[row.id] = { name: row.name, extra_data: row.extra_data };
    }
    return result;
  }

  // Store a name in cache
  setCachedName(id, category, name, extraData = null) {
    this.db.prepare(
      `INSERT OR REPLACE INTO name_cache (id, category, name, extra_data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(id, category, name, extraData);
  }

  // Store multiple names in cache (batch)
  setCachedNames(entries) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO name_cache (id, category, name, extra_data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.id, item.category, item.name, item.extra_data || null);
      }
    });
    batch(entries);
  }

  // Get count of cached names by category
  getCacheStats() {
    return this.db.prepare(
      'SELECT category, COUNT(*) as count, MIN(updated_at) as oldest, MAX(updated_at) as newest FROM name_cache GROUP BY category'
    ).all();
  }

  // Delete stale cache entries (older than given hours)
  purgeStaleCache(olderThanHours = 24) {
    const result = this.db.prepare(
      `DELETE FROM name_cache WHERE updated_at < datetime('now', '-' || ? || ' hours')`
    ).run(olderThanHours);
    return result.changes;
  }

  // ===== MARKET PRICES =====

  getMarketPrice(typeId) {
    return this.db.prepare('SELECT adjusted_price, average_price FROM market_prices WHERE type_id = ?').get(typeId);
  }

  getMarketPrices(typeIds) {
    if (!typeIds || typeIds.length === 0) return {};
    const placeholders = typeIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT type_id, adjusted_price, average_price FROM market_prices WHERE type_id IN (${placeholders})`
    ).all(...typeIds);
    const result = {};
    for (const row of rows) {
      result[row.type_id] = { adjusted_price: row.adjusted_price, average_price: row.average_price };
    }
    return result;
  }

  setMarketPrices(prices) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO market_prices (type_id, adjusted_price, average_price, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.type_id, item.adjusted_price || 0, item.average_price || 0);
      }
    });
    batch(prices);
    return prices.length;
  }

  getMarketPriceAge() {
    return this.db.prepare('SELECT MIN(updated_at) as oldest, MAX(updated_at) as newest, COUNT(*) as count FROM market_prices').get();
  }

  // ===== JITA PRICES =====

  getJitaPrices(typeIds) {
    if (!typeIds || typeIds.length === 0) return {};
    const placeholders = typeIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT type_id, sell_min, buy_max FROM jita_prices WHERE type_id IN (${placeholders})`
    ).all(...typeIds);
    const result = {};
    for (const row of rows) {
      result[row.type_id] = { sell_min: row.sell_min, buy_max: row.buy_max };
    }
    return result;
  }

  setJitaPrices(prices) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO jita_prices (type_id, sell_min, buy_max, sell_volume, buy_volume, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.type_id, item.sell_min || 0, item.buy_max || 0, item.sell_volume || 0, item.buy_volume || 0);
      }
    });
    batch(prices);
    return prices.length;
  }

  getJitaPriceAge() {
    return this.db.prepare('SELECT MIN(updated_at) as oldest, MAX(updated_at) as newest, COUNT(*) as count FROM jita_prices').get();
  }

  // ===== COST INDICES =====

  getCostIndex(systemId, activity) {
    return this.db.prepare('SELECT cost_index FROM cost_indices WHERE system_id = ? AND activity = ?').get(systemId, activity);
  }

  getCostIndices(systemId) {
    const rows = this.db.prepare('SELECT activity, cost_index FROM cost_indices WHERE system_id = ?').all(systemId);
    const result = {};
    for (const row of rows) {
      result[row.activity] = row.cost_index;
    }
    return result;
  }

  setCostIndices(indices) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO cost_indices (system_id, activity, cost_index, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.system_id, item.activity, item.cost_index);
      }
    });
    batch(indices);
    return indices.length;
  }

  getCostIndexAge() {
    return this.db.prepare('SELECT MIN(updated_at) as oldest, MAX(updated_at) as newest, COUNT(*) as count FROM cost_indices').get();
  }

  // ===== PLANET SCHEMATICS =====

  savePlanetSchematics(entries) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO planet_schematics (schematic_id, type_id, quantity, is_input) VALUES (?, ?, ?, ?)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.schematic_id, item.type_id, item.quantity, item.is_input);
      }
    });
    batch(entries);
    return entries.length;
  }

  getSchematicOutput(schematicId) {
    return this.db.prepare(
      'SELECT type_id, quantity FROM planet_schematics WHERE schematic_id = ? AND is_input = 0'
    ).get(schematicId);
  }

  getSchematicOutputs(schematicIds) {
    if (!schematicIds || schematicIds.length === 0) return {};
    const placeholders = schematicIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT schematic_id, type_id, quantity FROM planet_schematics WHERE is_input = 0 AND schematic_id IN (${placeholders})`
    ).all(...schematicIds);
    const result = {};
    for (const row of rows) {
      result[row.schematic_id] = { type_id: row.type_id, quantity: row.quantity };
    }
    return result;
  }

  getSchematicInputs(schematicId) {
    return this.db.prepare(
      'SELECT type_id, quantity FROM planet_schematics WHERE schematic_id = ? AND is_input = 1'
    ).all(schematicId);
  }

  getSchematicInputsBatch(schematicIds) {
    if (!schematicIds || schematicIds.length === 0) return {};
    const placeholders = schematicIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT schematic_id, type_id, quantity FROM planet_schematics WHERE is_input = 1 AND schematic_id IN (${placeholders})`
    ).all(...schematicIds);
    const result = {};
    for (const row of rows) {
      if (!result[row.schematic_id]) result[row.schematic_id] = [];
      result[row.schematic_id].push({ type_id: row.type_id, quantity: row.quantity });
    }
    return result;
  }

  getPlanetSchematicsCount() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM planet_schematics').get();
    return row?.count || 0;
  }

  savePlanetSchematicInfo(entries) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO planet_schematic_info (schematic_id, schematic_name, cycle_time) VALUES (?, ?, ?)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.schematic_id, item.schematic_name, item.cycle_time);
      }
    });
    batch(entries);
    return entries.length;
  }

  getSchematicInfo(schematicId) {
    return this.db.prepare(
      'SELECT schematic_name, cycle_time FROM planet_schematic_info WHERE schematic_id = ?'
    ).get(schematicId);
  }

  getSchematicInfoBatch(schematicIds) {
    if (!schematicIds || schematicIds.length === 0) return {};
    const placeholders = schematicIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT schematic_id, schematic_name, cycle_time FROM planet_schematic_info WHERE schematic_id IN (${placeholders})`
    ).all(...schematicIds);
    const result = {};
    for (const row of rows) {
      result[row.schematic_id] = { schematic_name: row.schematic_name, cycle_time: row.cycle_time };
    }
    return result;
  }

  // Wealth snapshots
  saveWealthSnapshot(characterId, userId, walletBalance, assetValue) {
    // Only save one snapshot per character per hour
    const existing = this.db.prepare(
      `SELECT id FROM wealth_snapshots WHERE character_id = ? AND snapshot_date > datetime('now', '-1 hour')`
    ).get(characterId);
    if (existing) return;
    const totalWealth = (walletBalance || 0) + (assetValue || 0);
    this.db.prepare(
      'INSERT INTO wealth_snapshots (character_id, user_id, wallet_balance, asset_value, total_wealth) VALUES (?, ?, ?, ?, ?)'
    ).run(characterId, userId, walletBalance || 0, assetValue || 0, totalWealth);
  }

  getLatestSnapshotDate(userId) {
    const row = this.db.prepare('SELECT MAX(snapshot_date) as latest FROM wealth_snapshots WHERE user_id = ?').get(userId);
    return row?.latest || null;
  }

  getWealthHistory(userId, days = 30) {
    return this.db.prepare(
      `SELECT character_id, wallet_balance, asset_value, total_wealth, snapshot_date
       FROM wealth_snapshots WHERE user_id = ? AND snapshot_date > datetime('now', '-' || ? || ' days')
       ORDER BY snapshot_date ASC`
    ).all(userId, days);
  }

  // Wallet journal
  saveWalletJournalEntries(characterId, entries) {
    if (!entries || entries.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO wallet_journal (character_id, entry_id, amount, balance, date, description, first_party_id, second_party_id, ref_type, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const batch = this.db.transaction((items) => {
      for (const e of items) {
        stmt.run(characterId, e.id, e.amount || 0, e.balance || 0, e.date, e.description || null, e.first_party_id || null, e.second_party_id || null, e.ref_type || null, e.reason || null);
      }
    });
    batch(entries);
    return entries.length;
  }

  getWalletJournal(characterId, limit = 100, offset = 0, refType = null) {
    if (refType) {
      return this.db.prepare(
        'SELECT * FROM wallet_journal WHERE character_id = ? AND ref_type = ? ORDER BY date DESC LIMIT ? OFFSET ?'
      ).all(characterId, refType, limit, offset);
    }
    return this.db.prepare(
      'SELECT * FROM wallet_journal WHERE character_id = ? ORDER BY date DESC LIMIT ? OFFSET ?'
    ).all(characterId, limit, offset);
  }

  getWalletJournalNewest(characterId) {
    return this.db.prepare('SELECT MAX(date) as newest FROM wallet_journal WHERE character_id = ?').get(characterId);
  }

  getWalletJournalRefTypes(characterId) {
    return this.db.prepare('SELECT DISTINCT ref_type FROM wallet_journal WHERE character_id = ? ORDER BY ref_type').all(characterId).map(r => r.ref_type);
  }

  // Wallet transactions
  saveWalletTransactions(characterId, transactions) {
    if (!transactions || transactions.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO wallet_transactions (character_id, transaction_id, journal_ref_id, type_id, quantity, unit_price, is_buy, client_id, location_id, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const batch = this.db.transaction((items) => {
      for (const t of items) {
        stmt.run(characterId, t.transaction_id, t.journal_ref_id || null, t.type_id, t.quantity || 0, t.unit_price || 0, t.is_buy ? 1 : 0, t.client_id || null, t.location_id || null, t.date);
      }
    });
    batch(transactions);
    return transactions.length;
  }

  getWalletTransactions(characterId, limit = 100, offset = 0) {
    return this.db.prepare(
      'SELECT * FROM wallet_transactions WHERE character_id = ? ORDER BY date DESC LIMIT ? OFFSET ?'
    ).all(characterId, limit, offset);
  }

  getWalletTransactionsNewest(characterId) {
    return this.db.prepare('SELECT MAX(date) as newest FROM wallet_transactions WHERE character_id = ?').get(characterId);
  }

  getTransactionsByJournalRefs(characterId, entryIds) {
    if (!entryIds || entryIds.length === 0) return [];
    const placeholders = entryIds.map(() => '?').join(',');
    return this.db.prepare(
      `SELECT * FROM wallet_transactions WHERE character_id = ? AND journal_ref_id IN (${placeholders})`
    ).all(characterId, ...entryIds);
  }

  getTransactionsByDates(characterId, dates) {
    if (!dates || dates.length === 0) return [];
    const placeholders = dates.map(() => '?').join(',');
    return this.db.prepare(
      `SELECT * FROM wallet_transactions WHERE character_id = ? AND date IN (${placeholders})`
    ).all(characterId, ...dates);
  }

  // ===== BLUEPRINTS =====

  saveBlueprintProducts(entries) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO blueprint_products (blueprint_id, activity_id, product_type_id, quantity) VALUES (?, ?, ?, ?)'
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.blueprint_id, item.activity_id, item.product_type_id, item.quantity);
      }
    });
    batch(entries);
    return entries.length;
  }

  saveBlueprintMaterials(entries) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO blueprint_materials (blueprint_id, activity_id, material_type_id, quantity) VALUES (?, ?, ?, ?)'
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.blueprint_id, item.activity_id, item.material_type_id, item.quantity);
      }
    });
    batch(entries);
    return entries.length;
  }

  getBlueprintForProduct(productTypeId, activityId = 1) {
    return this.db.prepare(
      'SELECT blueprint_id, quantity FROM blueprint_products WHERE product_type_id = ? AND activity_id = ?'
    ).get(productTypeId, activityId);
  }

  getBlueprintMaterials(blueprintId, activityId = 1) {
    return this.db.prepare(
      'SELECT material_type_id, quantity FROM blueprint_materials WHERE blueprint_id = ? AND activity_id = ?'
    ).all(blueprintId, activityId);
  }

  saveBlueprintActivities(entries) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO blueprint_activities (blueprint_id, activity_id, time) VALUES (?, ?, ?)'
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.blueprint_id, item.activity_id, item.time);
      }
    });
    batch(entries);
    return entries.length;
  }

  getBlueprintActivityTime(blueprintId, activityId = 1) {
    const row = this.db.prepare(
      'SELECT time FROM blueprint_activities WHERE blueprint_id = ? AND activity_id = ?'
    ).get(blueprintId, activityId);
    return row?.time || 0;
  }

  getBlueprintActivitiesCount() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM blueprint_activities').get();
    return row?.count || 0;
  }

  getBlueprintProductsCount() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM blueprint_products').get();
    return row?.count || 0;
  }

  clearBlueprintData() {
    this.db.exec(`
      DELETE FROM blueprint_products;
      DELETE FROM blueprint_materials;
      DELETE FROM blueprint_activities;
    `);
  }

  getSdeMeta(key) {
    const row = this.db.prepare('SELECT value FROM sde_meta WHERE key = ?').get(key);
    return row?.value || null;
  }

  setSdeMeta(key, value) {
    this.db.prepare(
      'INSERT OR REPLACE INTO sde_meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
    ).run(key, value);
  }

  // ===== TYPE SEARCH =====

  searchTypes(query, limit = 20) {
    return this.db.prepare(
      `SELECT id, name FROM name_cache WHERE category = 'type' AND name LIKE ? ORDER BY name ASC LIMIT ?`
    ).all(`%${query}%`, limit);
  }

  // ===== STATION/STRUCTURE SEARCH =====

  searchSystems(query, limit = 20) {
    return this.db.prepare(
      `SELECT id, name, extra_data FROM name_cache
       WHERE category = 'system' AND name LIKE ?
       ORDER BY name ASC LIMIT ?`
    ).all(`%${query}%`, limit);
  }

  searchStations(query, limit = 20) {
    // Search both stations and structures in name_cache
    const rows = this.db.prepare(
      `SELECT id, name, category, extra_data FROM name_cache
       WHERE category IN ('station', 'structure') AND name LIKE ?
       ORDER BY category ASC, name ASC LIMIT ?`
    ).all(`%${query}%`, limit);
    return rows;
  }

  getSystemRegion(systemId) {
    const row = this.db.prepare(
      'SELECT extra_data FROM name_cache WHERE id = ? AND category = ?'
    ).get(systemId, 'system');
    if (!row?.extra_data) return null;
    try {
      const data = JSON.parse(row.extra_data);
      return data.regionId || null;
    } catch {
      return null;
    }
  }

  // ===== TRADE HUBS =====

  // Default hubs seeded per-user on first trading access
  static DEFAULT_HUBS = [
    { name: 'Jita 4-4', station_id: 60003760, region_id: 10000002 },
    { name: 'Dodixie', station_id: 60011866, region_id: 10000032 },
    { name: 'Amarr', station_id: 60008494, region_id: 10000043 },
    { name: 'Rens', station_id: 60004588, region_id: 10000030 },
    { name: 'Hek', station_id: 60005686, region_id: 10000042 },
  ];

  seedDefaultHubsForUser(userId) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO trade_hubs (user_id, name, station_id, region_id, is_default, is_structure)
       VALUES (?, ?, ?, ?, 1, 0)`
    );
    const batch = this.db.transaction((hubs) => {
      for (const hub of hubs) {
        stmt.run(userId, hub.name, hub.station_id, hub.region_id);
      }
    });
    batch(DB.DEFAULT_HUBS);
  }

  getTradeHubs(userId) {
    return this.db.prepare(
      'SELECT * FROM trade_hubs WHERE user_id = ? ORDER BY is_default DESC, name ASC'
    ).all(userId);
  }

  getEnabledTradeHubs(userId) {
    return this.db.prepare(
      'SELECT * FROM trade_hubs WHERE user_id = ? AND enabled = 1 ORDER BY is_default DESC, name ASC'
    ).all(userId);
  }

  getAllEnabledHubs() {
    // Deduped by station_id across all users (for the fetcher)
    return this.db.prepare(
      `SELECT DISTINCT station_id, region_id, name
       FROM trade_hubs WHERE enabled = 1
       ORDER BY station_id`
    ).all();
  }

  getTradeHub(hubId, userId) {
    return this.db.prepare(
      'SELECT * FROM trade_hubs WHERE id = ? AND user_id = ?'
    ).get(hubId, userId);
  }

  addTradeHub(userId, name, stationId, regionId, isStructure = 0) {
    const result = this.db.prepare(
      `INSERT INTO trade_hubs (user_id, name, station_id, region_id, is_default, is_structure)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).run(userId, name, stationId, regionId, isStructure ? 1 : 0);
    return result.lastInsertRowid;
  }

  removeTradeHub(hubId, userId) {
    const result = this.db.prepare(
      'DELETE FROM trade_hubs WHERE id = ? AND user_id = ?'
    ).run(hubId, userId);
    return result.changes;
  }

  setHubEnabled(hubId, userId, enabled) {
    const result = this.db.prepare(
      'UPDATE trade_hubs SET enabled = ? WHERE id = ? AND user_id = ?'
    ).run(enabled ? 1 : 0, hubId, userId);
    return result.changes;
  }

  // ===== HUB PRICES =====

  setHubPrices(stationId, prices) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO hub_prices (type_id, station_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.type_id, stationId, item.sell_min || 0, item.buy_max || 0,
                 item.sell_volume || 0, item.buy_volume || 0,
                 item.sell_order_count || 0, item.buy_order_count || 0);
      }
    });
    batch(prices);
    return prices.length;
  }

  getHubPrices(stationId, typeIds) {
    if (!typeIds || typeIds.length === 0) return {};
    const placeholders = typeIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT type_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count
       FROM hub_prices WHERE station_id = ? AND type_id IN (${placeholders})`
    ).all(stationId, ...typeIds);
    const result = {};
    for (const row of rows) {
      result[row.type_id] = row;
    }
    return result;
  }

  getHubPricesForType(typeId, stationIds) {
    if (!stationIds || stationIds.length === 0) return {};
    const placeholders = stationIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT station_id, sell_min, buy_max, sell_volume, buy_volume, sell_order_count, buy_order_count
       FROM hub_prices WHERE type_id = ? AND station_id IN (${placeholders})`
    ).all(typeId, ...stationIds);
    const result = {};
    for (const row of rows) {
      result[row.station_id] = row;
    }
    return result;
  }

  getHubPriceAge(stationId) {
    return this.db.prepare(
      'SELECT MIN(updated_at) as oldest, MAX(updated_at) as newest, COUNT(*) as count FROM hub_prices WHERE station_id = ?'
    ).get(stationId);
  }

  // ===== HUB REFRESH STATUS =====

  setHubRefreshStatus(stationId, regionId, data) {
    this.db.prepare(
      `INSERT OR REPLACE INTO hub_refresh_status (station_id, region_id, last_refresh_at, last_page_count, last_order_count, status, error_message)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`
    ).run(stationId, regionId, data.pageCount || 0, data.orderCount || 0, data.status || 'ok', data.error || null);
  }

  getHubRefreshStatuses(stationIds) {
    if (!stationIds || stationIds.length === 0) return {};
    const placeholders = stationIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT station_id, last_refresh_at, last_page_count, last_order_count, status, error_message
       FROM hub_refresh_status WHERE station_id IN (${placeholders})`
    ).all(...stationIds);
    const result = {};
    for (const row of rows) {
      result[row.station_id] = row;
    }
    return result;
  }

  getAllHubRefreshStatuses() {
    return this.db.prepare('SELECT * FROM hub_refresh_status').all();
  }

  // ===== TRADE SETTINGS =====

  getTradeSettings(characterId) {
    return this.db.prepare('SELECT * FROM trade_settings WHERE character_id = ?').get(characterId);
  }

  setTradeSettings(characterId, settings) {
    this.db.prepare(
      `INSERT OR REPLACE INTO trade_settings (character_id, accounting_level, broker_relations_level, advanced_broker_level, faction_standing, corp_standing, preferred_source_hub, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(characterId, settings.accounting_level || 0, settings.broker_relations_level || 0,
          settings.advanced_broker_level || 0, settings.faction_standing || 0,
          settings.corp_standing || 0, settings.preferred_source_hub || null);
  }

  // ===== FEATURE PERMISSIONS =====

  isAdmin(userId) {
    const row = this.db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
    return row?.is_admin === 1;
  }

  setAdmin(userId, isAdmin) {
    return this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId).changes;
  }

  getUserFeatures(userId) {
    return this.db.prepare('SELECT feature_name, granted_at, granted_by FROM user_features WHERE user_id = ?').all(userId);
  }

  hasUserFeature(userId, featureName) {
    return !!this.db.prepare('SELECT 1 FROM user_features WHERE user_id = ? AND feature_name = ?').get(userId, featureName);
  }

  grantUserFeature(userId, featureName, grantedBy) {
    this.db.prepare('INSERT OR IGNORE INTO user_features (user_id, feature_name, granted_by) VALUES (?, ?, ?)').run(userId, featureName, grantedBy);
  }

  revokeUserFeature(userId, featureName) {
    return this.db.prepare('DELETE FROM user_features WHERE user_id = ? AND feature_name = ?').run(userId, featureName).changes;
  }

  getCorpFeatures(corporationId) {
    return this.db.prepare('SELECT feature_name, granted_at, granted_by FROM corp_features WHERE corporation_id = ?').all(corporationId);
  }

  hasCorpFeature(corporationId, featureName) {
    return !!this.db.prepare('SELECT 1 FROM corp_features WHERE corporation_id = ? AND feature_name = ?').get(corporationId, featureName);
  }

  grantCorpFeature(corporationId, corporationName, featureName, grantedBy) {
    this.db.prepare('INSERT OR IGNORE INTO corp_features (corporation_id, corporation_name, feature_name, granted_by) VALUES (?, ?, ?, ?)').run(corporationId, corporationName, featureName, grantedBy);
  }

  revokeCorpFeature(corporationId, featureName) {
    return this.db.prepare('DELETE FROM corp_features WHERE corporation_id = ? AND feature_name = ?').run(corporationId, featureName).changes;
  }

  getAllCorpFeatures() {
    return this.db.prepare('SELECT * FROM corp_features ORDER BY corporation_name, feature_name').all();
  }

  getAllUsers() {
    return this.db.prepare(`
      SELECT u.id, u.primary_character_id, u.primary_character_name, u.is_admin, u.created_at,
             COUNT(c.id) as character_count
      FROM users u
      LEFT JOIN characters c ON c.user_id = u.id
      GROUP BY u.id
      ORDER BY u.primary_character_name
    `).all();
  }

  getUserWithFeatures(userId) {
    const user = this.db.prepare('SELECT id, primary_character_id, primary_character_name, is_admin, created_at FROM users WHERE id = ?').get(userId);
    if (!user) return null;
    user.features = this.getUserFeatures(userId);
    return user;
  }

  // ===== TYPE METADATA (group/category cache) =====

  getTypeMetadata(typeId) {
    return this.db.prepare('SELECT * FROM type_metadata WHERE type_id = ?').get(typeId);
  }

  getTypeMetadataBatch(typeIds) {
    if (!typeIds || typeIds.length === 0) return {};
    const placeholders = typeIds.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT type_id, group_id, category_id, group_name, category_name
       FROM type_metadata WHERE type_id IN (${placeholders})`
    ).all(...typeIds);
    const result = {};
    for (const row of rows) result[row.type_id] = row;
    return result;
  }

  setTypeMetadata(entries) {
    if (!entries || entries.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO type_metadata (type_id, group_id, category_id, group_name, category_name, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const batch = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.type_id, item.group_id || null, item.category_id || null,
                 item.group_name || null, item.category_name || null);
      }
    });
    batch(entries);
    return entries.length;
  }

  // ===== CORP JOB HISTORY =====

  insertCorpJobHistory(jobs) {
    if (!jobs || jobs.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO corp_job_history (
        job_id, corporation_id, installer_id, installer_name,
        activity_id, blueprint_type_id, product_type_id, product_name,
        product_group_id, product_category_id, product_group_name, product_category_name,
        runs, licensed_runs, facility_id, location_id, start_date, end_date, status, cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let inserted = 0;
    const batch = this.db.transaction((items) => {
      for (const j of items) {
        const r = stmt.run(
          j.job_id, j.corporation_id, j.installer_id || null, j.installer_name || null,
          j.activity_id, j.blueprint_type_id || null, j.product_type_id || null, j.product_name || null,
          j.product_group_id || null, j.product_category_id || null,
          j.product_group_name || null, j.product_category_name || null,
          j.runs, j.licensed_runs || null,
          j.facility_id || null, j.location_id || null, j.start_date, j.end_date, j.status || null, j.cost || 0
        );
        inserted += r.changes;
      }
    });
    batch(jobs);
    return inserted;
  }

  getCorpJobHistoryStats(corporationId) {
    return this.db.prepare(
      `SELECT COUNT(*) as count, MIN(end_date) as oldest, MAX(end_date) as newest,
              MAX(archived_at) as last_archived
       FROM corp_job_history WHERE corporation_id = ?`
    ).get(corporationId);
  }

  _buildCorpJobWhere({ corporationIds, from, to, activityId, activityIds }, alias = '') {
    const p = alias ? `${alias}.` : '';
    const clauses = [];
    const params = [];
    if (corporationIds && corporationIds.length > 0) {
      clauses.push(`${p}corporation_id IN (${corporationIds.map(() => '?').join(',')})`);
      params.push(...corporationIds);
    }
    if (from) { clauses.push(`${p}end_date >= ?`); params.push(from); }
    if (to) { clauses.push(`${p}end_date <= ?`); params.push(to); }
    if (activityIds && activityIds.length > 0) {
      clauses.push(`${p}activity_id IN (${activityIds.map(() => '?').join(',')})`);
      params.push(...activityIds);
    } else if (activityId) {
      clauses.push(`${p}activity_id = ?`);
      params.push(activityId);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  queryCorpJobSummary(filters) {
    // Aliased so we can LEFT JOIN jita_prices for the ISK-produced estimate.
    // Missing prices contribute 0 instead of dropping the row. Only
    // manufacturing/reactions actually produce a sellable product.
    const { where, params } = this._buildCorpJobWhere(filters, 'h');
    return this.db.prepare(
      `SELECT COUNT(*) as job_count,
              SUM(h.runs) as total_runs,
              COUNT(DISTINCT h.product_type_id) as unique_products,
              COUNT(DISTINCT h.installer_id) as unique_installers,
              SUM(h.cost) as total_cost,
              SUM(CASE WHEN h.activity_id IN (1, 9, 11)
                       THEN h.runs * COALESCE(j.sell_min, 0)
                       ELSE 0 END) as isk_produced_est,
              MIN(h.end_date) as first_job,
              MAX(h.end_date) as last_job
       FROM corp_job_history h
       LEFT JOIN jita_prices j ON j.type_id = h.product_type_id
       ${where}`
    ).get(...params);
  }

  queryCorpJobsByMonth(filters) {
    const { where, params } = this._buildCorpJobWhere(filters);
    return this.db.prepare(
      `SELECT strftime('%Y-%m', end_date) as month,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM corp_job_history ${where}
       GROUP BY month
       ORDER BY month ASC`
    ).all(...params);
  }

  queryCorpJobsByMonthAndCategory(filters) {
    const { where, params } = this._buildCorpJobWhere(filters);
    return this.db.prepare(
      `SELECT strftime('%Y-%m', end_date) as month,
              product_category_id,
              product_category_name,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM corp_job_history ${where}
       GROUP BY month, product_category_id
       ORDER BY month ASC`
    ).all(...params);
  }

  queryCorpTopProducts(filters, limit = 25) {
    const { where, params } = this._buildCorpJobWhere(filters, 'h');
    return this.db.prepare(
      `SELECT h.product_type_id, h.product_name, h.product_group_id, h.product_category_id,
              h.product_group_name, h.product_category_name, h.activity_id,
              COUNT(*) as job_count,
              SUM(h.runs) as total_runs,
              SUM(h.cost) as total_cost,
              SUM(CASE WHEN h.activity_id IN (1, 9, 11)
                       THEN h.runs * COALESCE(j.sell_min, 0)
                       ELSE 0 END) as isk_produced_est
       FROM corp_job_history h
       LEFT JOIN jita_prices j ON j.type_id = h.product_type_id
       ${where}
       GROUP BY h.product_type_id, h.activity_id
       ORDER BY total_runs DESC
       LIMIT ?`
    ).all(...params, limit);
  }

  queryCorpTopInstallers(filters, limit = 25) {
    const { where, params } = this._buildCorpJobWhere(filters);
    return this.db.prepare(
      `SELECT installer_id, installer_name,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost,
              COUNT(DISTINCT product_type_id) as unique_products
       FROM corp_job_history ${where}
       GROUP BY installer_id
       ORDER BY job_count DESC
       LIMIT ?`
    ).all(...params, limit);
  }

  queryCorpJobsByGroup(filters) {
    const { where, params } = this._buildCorpJobWhere(filters);
    return this.db.prepare(
      `SELECT product_group_id, product_category_id,
              product_group_name, product_category_name,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM corp_job_history ${where}
       GROUP BY product_group_id
       ORDER BY total_runs DESC`
    ).all(...params);
  }

  queryCorpJobsByActivity(filters) {
    const { where, params } = this._buildCorpJobWhere(filters);
    return this.db.prepare(
      `SELECT activity_id,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM corp_job_history ${where}
       GROUP BY activity_id
       ORDER BY job_count DESC`
    ).all(...params);
  }

  queryCorpJobHistory(filters, limit = 100, offset = 0) {
    const { where, params } = this._buildCorpJobWhere(filters, 'h');
    return this.db.prepare(
      `SELECT h.*,
              fac.name as facility_name,
              loc.name as location_name
       FROM corp_job_history h
       LEFT JOIN name_cache fac ON fac.id = h.facility_id AND fac.category IN ('station','structure')
       LEFT JOIN name_cache loc ON loc.id = h.location_id AND loc.category IN ('station','structure')
       ${where}
       ORDER BY h.end_date DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
  }

  countCorpJobHistory(filters) {
    const { where, params } = this._buildCorpJobWhere(filters);
    return this.db.prepare(`SELECT COUNT(*) as c FROM corp_job_history ${where}`).get(...params).c;
  }

  // ===== CHARACTER JOB HISTORY =====

  insertCharacterJobHistory(jobs) {
    if (!jobs || jobs.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO character_job_history (
        job_id, character_id, character_name,
        activity_id, blueprint_type_id, product_type_id, product_name,
        product_group_id, product_category_id, product_group_name, product_category_name,
        runs, licensed_runs, facility_id, location_id,
        start_date, end_date, status, cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let inserted = 0;
    const batch = this.db.transaction((items) => {
      for (const j of items) {
        const r = stmt.run(
          j.job_id, j.character_id, j.character_name || null,
          j.activity_id, j.blueprint_type_id || null, j.product_type_id || null, j.product_name || null,
          j.product_group_id || null, j.product_category_id || null,
          j.product_group_name || null, j.product_category_name || null,
          j.runs, j.licensed_runs || null, j.facility_id || null, j.location_id || null,
          j.start_date, j.end_date, j.status || null, j.cost || 0
        );
        inserted += r.changes;
      }
    });
    batch(jobs);
    return inserted;
  }

  getCharacterJobHistoryStats(characterId) {
    return this.db.prepare(
      `SELECT COUNT(*) as count, MIN(end_date) as oldest, MAX(end_date) as newest,
              MAX(archived_at) as last_archived
       FROM character_job_history WHERE character_id = ?`
    ).get(characterId);
  }

  _buildCharacterJobWhere({ characterIds, from, to, activityId, activityIds }, alias = '') {
    const p = alias ? `${alias}.` : '';
    const clauses = [];
    const params = [];
    if (characterIds && characterIds.length > 0) {
      clauses.push(`${p}character_id IN (${characterIds.map(() => '?').join(',')})`);
      params.push(...characterIds);
    }
    if (from) { clauses.push(`${p}end_date >= ?`); params.push(from); }
    if (to) { clauses.push(`${p}end_date <= ?`); params.push(to); }
    if (activityIds && activityIds.length > 0) {
      clauses.push(`${p}activity_id IN (${activityIds.map(() => '?').join(',')})`);
      params.push(...activityIds);
    } else if (activityId) {
      clauses.push(`${p}activity_id = ?`);
      params.push(activityId);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  queryCharacterJobSummary(filters) {
    const { where, params } = this._buildCharacterJobWhere(filters, 'h');
    return this.db.prepare(
      `SELECT COUNT(*) as job_count,
              SUM(h.runs) as total_runs,
              COUNT(DISTINCT h.product_type_id) as unique_products,
              COUNT(DISTINCT h.character_id) as unique_characters,
              SUM(h.cost) as total_cost,
              SUM(CASE WHEN h.activity_id IN (1, 9, 11)
                       THEN h.runs * COALESCE(j.sell_min, 0)
                       ELSE 0 END) as isk_produced_est,
              MIN(h.end_date) as first_job,
              MAX(h.end_date) as last_job
       FROM character_job_history h
       LEFT JOIN jita_prices j ON j.type_id = h.product_type_id
       ${where}`
    ).get(...params);
  }

  queryCharacterJobsByMonth(filters) {
    const { where, params } = this._buildCharacterJobWhere(filters);
    return this.db.prepare(
      `SELECT strftime('%Y-%m', end_date) as month,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM character_job_history ${where}
       GROUP BY month
       ORDER BY month ASC`
    ).all(...params);
  }

  queryCharacterJobsByMonthAndCategory(filters) {
    const { where, params } = this._buildCharacterJobWhere(filters);
    return this.db.prepare(
      `SELECT strftime('%Y-%m', end_date) as month,
              product_category_id,
              product_category_name,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM character_job_history ${where}
       GROUP BY month, product_category_id
       ORDER BY month ASC`
    ).all(...params);
  }

  queryCharacterTopProducts(filters, limit = 25) {
    const { where, params } = this._buildCharacterJobWhere(filters, 'h');
    return this.db.prepare(
      `SELECT h.product_type_id, h.product_name, h.product_group_id, h.product_category_id,
              h.product_group_name, h.product_category_name, h.activity_id,
              COUNT(*) as job_count,
              SUM(h.runs) as total_runs,
              SUM(h.cost) as total_cost,
              SUM(CASE WHEN h.activity_id IN (1, 9, 11)
                       THEN h.runs * COALESCE(j.sell_min, 0)
                       ELSE 0 END) as isk_produced_est
       FROM character_job_history h
       LEFT JOIN jita_prices j ON j.type_id = h.product_type_id
       ${where}
       GROUP BY h.product_type_id, h.activity_id
       ORDER BY total_runs DESC
       LIMIT ?`
    ).all(...params, limit);
  }

  queryCharacterBreakdown(filters, limit = 25) {
    const { where, params } = this._buildCharacterJobWhere(filters);
    return this.db.prepare(
      `SELECT character_id, character_name,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost,
              COUNT(DISTINCT product_type_id) as unique_products
       FROM character_job_history ${where}
       GROUP BY character_id
       ORDER BY job_count DESC
       LIMIT ?`
    ).all(...params, limit);
  }

  queryCharacterJobsByGroup(filters) {
    const { where, params } = this._buildCharacterJobWhere(filters);
    return this.db.prepare(
      `SELECT product_group_id, product_category_id,
              product_group_name, product_category_name,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM character_job_history ${where}
       GROUP BY product_group_id
       ORDER BY total_runs DESC`
    ).all(...params);
  }

  queryCharacterJobsByActivity(filters) {
    const { where, params } = this._buildCharacterJobWhere(filters);
    return this.db.prepare(
      `SELECT activity_id,
              COUNT(*) as job_count,
              SUM(runs) as total_runs,
              SUM(cost) as total_cost
       FROM character_job_history ${where}
       GROUP BY activity_id
       ORDER BY job_count DESC`
    ).all(...params);
  }

  queryCharacterJobHistory(filters, limit = 100, offset = 0) {
    const { where, params } = this._buildCharacterJobWhere(filters, 'h');
    return this.db.prepare(
      `SELECT h.*,
              fac.name as facility_name,
              loc.name as location_name
       FROM character_job_history h
       LEFT JOIN name_cache fac ON fac.id = h.facility_id AND fac.category IN ('station','structure')
       LEFT JOIN name_cache loc ON loc.id = h.location_id AND loc.category IN ('station','structure')
       ${where}
       ORDER BY h.end_date DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
  }

  countCharacterJobHistory(filters) {
    const { where, params } = this._buildCharacterJobWhere(filters);
    return this.db.prepare(`SELECT COUNT(*) as c FROM character_job_history ${where}`).get(...params).c;
  }

  // Sum wallet sales (is_buy=0) for the given character set inside a date
  // window. Used alongside character_job_history to surface *real* ISK
  // earned, not the current-Jita-price estimate. Sales aren't tied to a
  // specific job — it's "I sold this much of X in this window," which may
  // include inventory built earlier.
  queryCharacterSalesSummary({ characterIds, from, to }) {
    const clauses = [];
    const params = [];
    if (characterIds && characterIds.length > 0) {
      clauses.push(`character_id IN (${characterIds.map(() => '?').join(',')})`);
      params.push(...characterIds);
    }
    clauses.push(`is_buy = 0`);
    if (from) { clauses.push(`date >= ?`); params.push(from); }
    if (to) { clauses.push(`date <= ?`); params.push(to); }
    const where = `WHERE ${clauses.join(' AND ')}`;
    return this.db.prepare(
      `SELECT SUM(quantity * unit_price) as isk_sold,
              SUM(quantity) as units_sold,
              COUNT(DISTINCT type_id) as unique_types_sold
       FROM wallet_transactions ${where}`
    ).get(...params);
  }

  queryCharacterSalesByType({ characterIds, from, to }) {
    const clauses = [];
    const params = [];
    if (characterIds && characterIds.length > 0) {
      clauses.push(`character_id IN (${characterIds.map(() => '?').join(',')})`);
      params.push(...characterIds);
    }
    clauses.push(`is_buy = 0`);
    if (from) { clauses.push(`date >= ?`); params.push(from); }
    if (to) { clauses.push(`date <= ?`); params.push(to); }
    const where = `WHERE ${clauses.join(' AND ')}`;
    return this.db.prepare(
      `SELECT type_id,
              SUM(quantity * unit_price) as isk_sold,
              SUM(quantity) as units_sold
       FROM wallet_transactions ${where}
       GROUP BY type_id`
    ).all(...params);
  }

  // ===== HUB PRICE HISTORY =====

  /** Append one-per-day snapshots for a station's current hub_prices rows. */
  snapshotHubPrices(stationId) {
    // capture_date is the UTC YYYY-MM-DD; PRIMARY KEY + INSERT OR IGNORE
    // means only the first refresh of each day for a given (type, station)
    // actually lands a row.
    const today = new Date().toISOString().slice(0, 10);
    const inserted = this.db.prepare(
      `INSERT OR IGNORE INTO hub_price_history (
        type_id, station_id, capture_date, sell_min, buy_max, sell_volume, buy_volume
       )
       SELECT type_id, ?, ?, sell_min, buy_max, sell_volume, buy_volume
       FROM hub_prices WHERE station_id = ?`
    ).run(stationId, today, stationId);
    return inserted.changes;
  }

  queryHubPriceHistory(typeId, stationId, days = 90) {
    return this.db.prepare(
      `SELECT capture_date, sell_min, buy_max, sell_volume, buy_volume
       FROM hub_price_history
       WHERE type_id = ? AND station_id = ?
         AND capture_date >= date('now', '-' || ? || ' days')
       ORDER BY capture_date ASC`
    ).all(typeId, stationId, days);
  }

  /** Retention cleanup — keep six months of daily history by default. */
  pruneHubPriceHistory(keepDays = 180) {
    return this.db.prepare(
      `DELETE FROM hub_price_history WHERE capture_date < date('now', '-' || ? || ' days')`
    ).run(keepDays).changes;
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = new DB();
