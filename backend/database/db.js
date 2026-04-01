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

  // Wealth snapshots
  saveWealthSnapshot(characterId, userId, walletBalance, assetValue) {
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

  close() {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = new DB();
