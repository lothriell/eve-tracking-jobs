-- Users table for simple username/password authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Characters table for EVE Online character data and tokens
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    character_id INTEGER UNIQUE NOT NULL,
    character_name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry DATETIME NOT NULL,
    scopes TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_character_id ON characters(character_id);

-- Name cache for ESI lookups (types, stations, systems)
CREATE TABLE IF NOT EXISTS name_cache (
    id INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    extra_data TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, category)
);

CREATE INDEX IF NOT EXISTS idx_name_cache_category ON name_cache(category);
CREATE INDEX IF NOT EXISTS idx_name_cache_updated ON name_cache(updated_at);

-- Market prices cache (adjusted + average per type)
CREATE TABLE IF NOT EXISTS market_prices (
    type_id INTEGER PRIMARY KEY,
    adjusted_price REAL DEFAULT 0,
    average_price REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System cost indices cache
CREATE TABLE IF NOT EXISTS cost_indices (
    system_id INTEGER NOT NULL,
    activity TEXT NOT NULL,
    cost_index REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (system_id, activity)
);
