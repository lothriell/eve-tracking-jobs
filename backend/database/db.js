const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

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
    await this.createDefaultUser();
  }

  initializeSchema() {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    this.db.exec(schema);
    console.log('Database schema initialized');
  }

  async createDefaultUser() {
    const username = process.env.APP_USERNAME;
    const password = process.env.APP_PASSWORD;

    if (!username || !password) {
      console.warn('APP_USERNAME or APP_PASSWORD not set in .env, skipping default user creation');
      return;
    }

    const row = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);

    if (row) {
      console.log('Default user already exists');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    this.db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    console.log('Default user created successfully');
  }

  // User operations
  getUserByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
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

  close() {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = new DB();
