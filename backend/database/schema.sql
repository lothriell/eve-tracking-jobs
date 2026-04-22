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

-- Planet schematics (PI factory recipes from SDE)
CREATE TABLE IF NOT EXISTS planet_schematics (
    schematic_id INTEGER NOT NULL,
    type_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 0,
    is_input INTEGER DEFAULT 0,
    PRIMARY KEY (schematic_id, type_id)
);

CREATE INDEX IF NOT EXISTS idx_planet_schematics_output ON planet_schematics(schematic_id, is_input);

-- Planet schematic info (cycle times + names from SDE)
CREATE TABLE IF NOT EXISTS planet_schematic_info (
    schematic_id INTEGER PRIMARY KEY,
    schematic_name TEXT,
    cycle_time INTEGER DEFAULT 0
);

-- ===== TRADING FEATURE =====

-- Configurable trade hubs (per-user)
CREATE TABLE IF NOT EXISTS trade_hubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    station_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    is_default INTEGER DEFAULT 0,
    is_structure INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, station_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_trade_hubs_user ON trade_hubs(user_id);

-- Aggregated hub prices (min sell / max buy per type per station, shared globally)
CREATE TABLE IF NOT EXISTS hub_prices (
    type_id INTEGER NOT NULL,
    station_id INTEGER NOT NULL,
    sell_min REAL DEFAULT 0,
    buy_max REAL DEFAULT 0,
    sell_volume INTEGER DEFAULT 0,
    buy_volume INTEGER DEFAULT 0,
    sell_order_count INTEGER DEFAULT 0,
    buy_order_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (type_id, station_id)
);
CREATE INDEX IF NOT EXISTS idx_hub_prices_station ON hub_prices(station_id);

-- Blueprint activity times (job duration from SDE)
CREATE TABLE IF NOT EXISTS blueprint_activities (
    blueprint_id INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    time INTEGER DEFAULT 0,
    PRIMARY KEY (blueprint_id, activity_id)
);

-- Per-character trade skill settings (for fee calculation)
CREATE TABLE IF NOT EXISTS trade_settings (
    character_id INTEGER PRIMARY KEY,
    accounting_level INTEGER DEFAULT 0,
    broker_relations_level INTEGER DEFAULT 0,
    advanced_broker_level INTEGER DEFAULT 0,
    faction_standing REAL DEFAULT 0,
    corp_standing REAL DEFAULT 0,
    preferred_source_hub INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Blueprint manufacturing products (blueprint_id → product_id)
CREATE TABLE IF NOT EXISTS blueprint_products (
    blueprint_id INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    product_type_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    PRIMARY KEY (blueprint_id, activity_id, product_type_id)
);
CREATE INDEX IF NOT EXISTS idx_bp_product ON blueprint_products(product_type_id, activity_id);

-- Blueprint manufacturing materials (blueprint_id → required materials)
CREATE TABLE IF NOT EXISTS blueprint_materials (
    blueprint_id INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    material_type_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    PRIMARY KEY (blueprint_id, activity_id, material_type_id)
);
CREATE INDEX IF NOT EXISTS idx_bp_materials ON blueprint_materials(blueprint_id, activity_id);

-- SDE metadata (tracks data source revision for staleness checks)
CREATE TABLE IF NOT EXISTS sde_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Hub refresh tracking (keyed by station_id, shared globally)
CREATE TABLE IF NOT EXISTS hub_refresh_status (
    station_id INTEGER PRIMARY KEY,
    region_id INTEGER NOT NULL,
    last_refresh_at DATETIME,
    last_page_count INTEGER DEFAULT 0,
    last_order_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT
);

-- ===== PREMIUM FEATURE ACCESS =====

-- Per-user feature grants
CREATE TABLE IF NOT EXISTS user_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_name TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER,
    UNIQUE(user_id, feature_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_features_user ON user_features(user_id);
CREATE INDEX IF NOT EXISTS idx_user_features_feature ON user_features(feature_name);

-- Per-corporation feature grants
CREATE TABLE IF NOT EXISTS corp_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    corporation_id INTEGER NOT NULL,
    corporation_name TEXT,
    feature_name TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER,
    UNIQUE(corporation_id, feature_name)
);
CREATE INDEX IF NOT EXISTS idx_corp_features_corp ON corp_features(corporation_id);
CREATE INDEX IF NOT EXISTS idx_corp_features_feature ON corp_features(feature_name);

-- ===== TYPE METADATA (lazy-cached group/category lookup from ESI) =====
-- Populated on-demand by services/typeMetadata.js — stores group_id, category_id
-- and their human-readable names so we can group jobs/items by ship class etc.
CREATE TABLE IF NOT EXISTS type_metadata (
    type_id INTEGER PRIMARY KEY,
    group_id INTEGER,
    category_id INTEGER,
    group_name TEXT,
    category_name TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_type_meta_group ON type_metadata(group_id);
CREATE INDEX IF NOT EXISTS idx_type_meta_category ON type_metadata(category_id);

-- ===== HISTORICAL INDUSTRY TRACKING =====

-- Corporation industry job history (append-only archive)
-- Populated by cacheRefresh.archiveCorpJobs() from ESI every 15 min.
-- ESI retains ~30 days of completed jobs, so history is forward-only after ship date.
CREATE TABLE IF NOT EXISTS corp_job_history (
    job_id INTEGER PRIMARY KEY,
    corporation_id INTEGER NOT NULL,
    installer_id INTEGER,
    installer_name TEXT,
    activity_id INTEGER NOT NULL,
    blueprint_type_id INTEGER,
    product_type_id INTEGER,
    product_name TEXT,
    product_group_id INTEGER,
    product_category_id INTEGER,
    product_group_name TEXT,
    product_category_name TEXT,
    runs INTEGER NOT NULL,
    licensed_runs INTEGER,
    facility_id INTEGER,
    location_id INTEGER,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status TEXT,
    cost REAL,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_corp_job_history_corp_end ON corp_job_history(corporation_id, end_date);
CREATE INDEX IF NOT EXISTS idx_corp_job_history_product ON corp_job_history(product_type_id, end_date);
CREATE INDEX IF NOT EXISTS idx_corp_job_history_installer ON corp_job_history(installer_id, end_date);
CREATE INDEX IF NOT EXISTS idx_corp_job_history_group ON corp_job_history(product_group_id, end_date);
CREATE INDEX IF NOT EXISTS idx_corp_job_history_activity ON corp_job_history(activity_id, end_date);

-- Personal industry job history (append-only, mirrors corp_job_history).
-- Populated by characterJobArchive.js every 15 min. ESI retains ~30 days
-- of completed jobs, so history is forward-only after ship date.
CREATE TABLE IF NOT EXISTS character_job_history (
    job_id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    character_name TEXT,
    activity_id INTEGER NOT NULL,
    blueprint_type_id INTEGER,
    product_type_id INTEGER,
    product_name TEXT,
    product_group_id INTEGER,
    product_category_id INTEGER,
    product_group_name TEXT,
    product_category_name TEXT,
    runs INTEGER NOT NULL,
    licensed_runs INTEGER,
    facility_id INTEGER,
    location_id INTEGER,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status TEXT,
    cost REAL,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_char_job_history_char_end ON character_job_history(character_id, end_date);
CREATE INDEX IF NOT EXISTS idx_char_job_history_product ON character_job_history(product_type_id, end_date);
CREATE INDEX IF NOT EXISTS idx_char_job_history_group ON character_job_history(product_group_id, end_date);
CREATE INDEX IF NOT EXISTS idx_char_job_history_activity ON character_job_history(activity_id, end_date);

-- Daily hub price history — one snapshot per (type, hub, UTC-day). Populated
-- after every hub price refresh; (type_id, station_id, capture_date) PK +
-- INSERT OR IGNORE means only the first refresh of each UTC day actually
-- stores. Caps volume at ~65K rows/day (vs ~3M if we stored every 30-min
-- refresh). Unlocks price-trend charts in the Trading view.
CREATE TABLE IF NOT EXISTS hub_price_history (
    type_id INTEGER NOT NULL,
    station_id INTEGER NOT NULL,
    capture_date TEXT NOT NULL,
    sell_min REAL DEFAULT 0,
    buy_max REAL DEFAULT 0,
    sell_volume INTEGER DEFAULT 0,
    buy_volume INTEGER DEFAULT 0,
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (type_id, station_id, capture_date)
);
CREATE INDEX IF NOT EXISTS idx_hub_price_history_date ON hub_price_history(capture_date);
CREATE INDEX IF NOT EXISTS idx_hub_price_history_type_time ON hub_price_history(type_id, station_id, capture_date);

-- Public BPC contract offers scraped from The Forge. One row per
-- (contract_id, type_id) pair — a single-item BPC contract yields one row.
-- Multi-item bundles are skipped at scrape time for price-per-BP clarity.
-- runs × price_per_run derivable at query time (runs stored as-is). Stale
-- rows are pruned when a contract is no longer visible on ESI's public
-- contracts feed (closed, expired, or bought out).
CREATE TABLE IF NOT EXISTS contract_bpc_offers (
    contract_id INTEGER NOT NULL,
    type_id INTEGER NOT NULL,
    price REAL NOT NULL,
    runs INTEGER DEFAULT 1,
    material_efficiency INTEGER DEFAULT 0,
    time_efficiency INTEGER DEFAULT 0,
    issuer_id INTEGER,
    issuer_corp_id INTEGER,
    location_id INTEGER,
    start_location_id INTEGER,
    date_issued DATETIME,
    date_expired DATETIME,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (contract_id, type_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_bpc_type ON contract_bpc_offers(type_id);
CREATE INDEX IF NOT EXISTS idx_contract_bpc_last_seen ON contract_bpc_offers(last_seen);

-- Scraper progress tracker. Remembers the last scrape time + stats so we
-- can surface staleness in the UI and drive incremental fetches.
CREATE TABLE IF NOT EXISTS contract_scraper_state (
    region_id INTEGER PRIMARY KEY,
    last_full_scrape DATETIME,
    last_incremental DATETIME,
    contracts_seen INTEGER DEFAULT 0,
    bpc_offers_stored INTEGER DEFAULT 0,
    status TEXT,
    error TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
