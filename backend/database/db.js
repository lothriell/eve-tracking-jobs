const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'eve_esi.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, async (err) => {
        if (err) {
          console.error('Failed to open database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          try {
            await this.initializeSchema();
            await this.createDefaultUser();
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  }

  async initializeSchema() {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          console.error('Failed to initialize schema:', err);
          reject(err);
        } else {
          console.log('Database schema initialized');
          resolve();
        }
      });
    });
  }

  async createDefaultUser() {
    const username = process.env.APP_USERNAME;
    const password = process.env.APP_PASSWORD;

    if (!username || !password) {
      console.warn('APP_USERNAME or APP_PASSWORD not set in .env, skipping default user creation');
      return;
    }

    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          console.log('Default user already exists');
          resolve();
          return;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        this.db.run(
          'INSERT INTO users (username, password_hash) VALUES (?, ?)',
          [username, passwordHash],
          (err) => {
            if (err) {
              console.error('Failed to create default user:', err);
              reject(err);
            } else {
              console.log('Default user created successfully');
              resolve();
            }
          }
        );
      });
    });
  }

  // User operations
  async getUserByUsername(username) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Character operations - Multiple character support
  async getCharacterByUserId(userId) {
    // Returns first character for backward compatibility
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Get all characters for a user
  async getAllCharactersByUserId(userId) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC', [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async getCharacterById(characterId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM characters WHERE character_id = ?', [characterId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getCharacterByDbId(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM characters WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async saveCharacter(userId, characterId, characterName, accessToken, refreshToken, tokenExpiry, scopes) {
    return new Promise((resolve, reject) => {
      // Check if character already exists for any user
      this.db.get('SELECT id, user_id FROM characters WHERE character_id = ?', [characterId], (err, existing) => {
        if (err) {
          reject(err);
          return;
        }

        if (existing) {
          // Update existing character
          this.db.run(
            `UPDATE characters 
             SET user_id = ?, character_name = ?, access_token = ?, refresh_token = ?, token_expiry = ?, scopes = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE character_id = ?`,
            [userId, characterName, accessToken, refreshToken, tokenExpiry, scopes, characterId],
            function(err) {
              if (err) reject(err);
              else resolve(existing.id);
            }
          );
        } else {
          // Insert new character
          this.db.run(
            `INSERT INTO characters (user_id, character_id, character_name, access_token, refresh_token, token_expiry, scopes, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [userId, characterId, characterName, accessToken, refreshToken, tokenExpiry, scopes],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        }
      });
    });
  }

  async updateCharacterTokens(characterId, accessToken, refreshToken, tokenExpiry) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE characters 
         SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE character_id = ?`,
        [accessToken, refreshToken, tokenExpiry, characterId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async deleteCharacter(characterId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM characters WHERE character_id = ? AND user_id = ?',
        [characterId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) console.error('Error closing database:', err);
        else console.log('Database connection closed');
      });
    }
  }
}

module.exports = new Database();
