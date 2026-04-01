-- Users table for EVE SSO authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    primary_character_id INTEGER,
    primary_character_name TEXT,
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

-- Jita market prices (min sell / max buy per type)
CREATE TABLE IF NOT EXISTS jita_prices (
    type_id INTEGER PRIMARY KEY,
    sell_min REAL DEFAULT 0,
    buy_max REAL DEFAULT 0,
    sell_volume INTEGER DEFAULT 0,
    buy_volume INTEGER DEFAULT 0,
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

-- Wealth snapshots (historical net worth tracking)
CREATE TABLE IF NOT EXISTS wealth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    wallet_balance REAL DEFAULT 0,
    asset_value REAL DEFAULT 0,
    total_wealth REAL DEFAULT 0,
    snapshot_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wealth_snapshots_char_date ON wealth_snapshots(character_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_wealth_snapshots_user ON wealth_snapshots(user_id);

-- Wallet journal entries (cached from ESI)
CREATE TABLE IF NOT EXISTS wallet_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    entry_id INTEGER NOT NULL,
    amount REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    date DATETIME NOT NULL,
    description TEXT,
    first_party_id INTEGER,
    second_party_id INTEGER,
    ref_type TEXT,
    reason TEXT,
    UNIQUE(character_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_journal_char_date ON wallet_journal(character_id, date);
CREATE INDEX IF NOT EXISTS idx_wallet_journal_ref_type ON wallet_journal(ref_type);

-- Wallet market transactions (cached from ESI)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    character_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    journal_ref_id INTEGER,
    type_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 0,
    unit_price REAL DEFAULT 0,
    is_buy BOOLEAN DEFAULT 0,
    client_id INTEGER,
    location_id INTEGER,
    date DATETIME NOT NULL,
    UNIQUE(character_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_trans_char_date ON wallet_transactions(character_id, date);
CREATE INDEX IF NOT EXISTS idx_wallet_trans_journal ON wallet_transactions(character_id, journal_ref_id);
