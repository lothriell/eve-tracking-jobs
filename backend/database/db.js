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

  close() {
    if (this.db) {
      this.db.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = new DB();
