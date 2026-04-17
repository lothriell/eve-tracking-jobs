# EVE Trading Feature - Design Document

## Origin

Inspired by an EVE Online YouTube video (AI_plays_eve.md in eve-trading project) where a player built an "AI Trade Computer" in Excel to:
- Compare market prices across trade hubs
- Get AI recommendations on where to sell items and what to buy for relisting
- Track inventory, manufacturing, and P&L

Goal: Build this as a web feature within the existing eve-tracking-jobs app.

---

## Trade Types

### Trade Type A — Buy Order Arbitrage
1. Place **buy orders** at a source hub (cheaper prices)
2. Wait for orders to fill
3. Transport items to destination hub
4. Sell as **sell orders** at destination
- **Pros:** Higher margins
- **Cons:** Slower, capital tied up, orders may not fill

### Trade Type B — Instant Arbitrage (Relist)
1. **Buy from sell orders** at source hub (instant purchase)
2. Transport items to destination hub
3. **Relist as sell orders** at destination
- **Pros:** Instant, predictable
- **Cons:** Lower margins (buying at sell price)

---

## Features to Build

### 1. Market Data Collection (Backend)
- Fetch regional market orders for all major hubs:
  - **Jita** (The Forge, region 10000002)
  - **Dodixie** (Sinq Laison, region 10000032)
  - **Amarr** (Domain, region 10000043)
  - **Rens** (Heimatar, region 10000030)
  - **Hek** (Metropolis, region 10000042)
- ESI endpoint: `GET /markets/{region_id}/orders/` (paginated)
- Filter orders by station ID for hub-specific prices
- Cache in SQLite with periodic refresh (extend existing cacheRefresh.js)
- Store: type_id, price, volume_remain, is_buy_order, location_id, region_id

**Hub Station IDs:**
- Jita 4-4: 60003760
- Dodixie: 60011866
- Amarr: 60008494
- Rens: 60004588
- Hek: 60005686

### 2. Trade Calculator Engine (Backend)
- For each item across hub pairs, calculate:
  - **Buy price** (source hub — lowest sell order for Type B, highest buy order for Type A)
  - **Sell price** (destination hub — lowest sell order to undercut)
  - **Gross margin** = sell price - buy price
  - **Broker fee** (source) = buy price × broker_fee_rate
  - **Broker fee** (destination) = sell price × broker_fee_rate
  - **Sales tax** = sell price × sales_tax_rate
  - **Net profit per unit** = gross margin - broker fees - sales tax
  - **Volume** (daily/weekly trade volume at destination for demand estimation)
  - **ROI %** = net profit / buy price × 100
  - **Potential daily profit** = net profit × estimated daily volume
- Default tax rates (configurable per character skills):
  - Broker fee: 3.0% (base, reduced by skills)
  - Sales tax: 3.6% (base, reduced by Accounting skill)
- Cargo volume consideration (m³) for transport planning

### 3. Trade Finder Page (Frontend)
- **Source hub selector** (default: Jita)
- **Destination hub selector** (or "all hubs")
- **Trade type toggle** (Type A / Type B)
- **Filters:**
  - Minimum profit per unit
  - Minimum ROI %
  - Minimum daily volume
  - Maximum buy price (capital limit)
  - Item category filter (ships, modules, ammo, etc.)
- **Results table:**
  - Item name, buy price, sell price, margin, fees, net profit, ROI%, volume, cargo m³
  - Sortable by any column
  - Color-coded profit indicators
- **Multi-buy export** — Generate pasteable list for EVE in-game multi-buy window
- **CSV/JSON export** (reuse existing ExportButton component)

### 4. Hub Comparison Page (Frontend)
- Select an item (search by name)
- See prices across all hubs in a comparison table
- Show: sell price, buy price, volume, spread at each hub
- Highlight best buy / best sell locations
- Historical price trend (if data accumulated over time)

### 5. Tax/Fee Calculator (Frontend)
- Input character skills (Accounting, Broker Relations, Advanced Broker Relations)
- Input standing with station corporation
- Calculate effective broker fee and sales tax rates
- Could pull skills from ESI (already have esi-skills.read_skills.v1 scope)

---

## What We Can Leverage from Existing Codebase

| Existing | How to Reuse |
|---|---|
| `esiClient.js` — rate limiter, caching | Add new ESI calls for regional orders |
| `cacheRefresh.js` — scheduled jobs | Add hub order refresh schedule |
| `jita_prices` table | Already have Jita data, extend to other hubs |
| `market_prices` table | Global average prices for reference |
| `name_cache` + SDE import | Item name resolution already works |
| EVE SSO auth | Use character skills for tax calculation |
| `ExportButton.jsx` | Reuse for trade list CSV/JSON export |
| Docker/K8s pipeline | No deployment changes needed |

---

## New Database Tables

```sql
-- Regional market orders (cached from ESI)
CREATE TABLE IF NOT EXISTS hub_orders (
    order_id INTEGER PRIMARY KEY,
    type_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    is_buy_order BOOLEAN NOT NULL,
    price REAL NOT NULL,
    volume_remain INTEGER NOT NULL,
    volume_total INTEGER NOT NULL,
    min_volume INTEGER DEFAULT 1,
    issued TEXT,
    duration INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hub_orders_type ON hub_orders(type_id, location_id, is_buy_order);
CREATE INDEX idx_hub_orders_location ON hub_orders(location_id);

-- Trade history / volume tracking
CREATE TABLE IF NOT EXISTS hub_market_history (
    type_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    average REAL,
    highest REAL,
    lowest REAL,
    volume INTEGER,
    order_count INTEGER,
    PRIMARY KEY (type_id, region_id, date)
);

-- User trade settings (per character)
CREATE TABLE IF NOT EXISTS trade_settings (
    character_id INTEGER PRIMARY KEY,
    accounting_level INTEGER DEFAULT 0,
    broker_relations_level INTEGER DEFAULT 0,
    advanced_broker_level INTEGER DEFAULT 0,
    faction_standing REAL DEFAULT 0,
    corp_standing REAL DEFAULT 0,
    preferred_source_hub INTEGER DEFAULT 60003760,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## ESI Endpoints Needed

| Endpoint | Purpose | Cache Duration |
|---|---|---|
| `GET /markets/{region_id}/orders/` | Live orders per region (paginated) | 5 min (ESI cache) |
| `GET /markets/{region_id}/history/` | Daily volume/price history per type | 1 hour |
| `GET /characters/{id}/skills/` | Already have — for tax calc | Existing |

**Note:** Regional orders endpoint returns ALL orders in a region. For 5 hubs this is significant data. Strategy:
- Fetch full region orders on schedule (every 15-30 min)
- Filter by hub station IDs server-side
- Store only hub-relevant orders in SQLite

---

## Implementation Order

1. **Phase 1 — Data Layer**
   - Add hub_orders and hub_market_history tables to schema.sql
   - Add regional order fetching to esiClient.js
   - Add hub order cache refresh to cacheRefresh.js
   - API endpoints: GET /api/trading/opportunities, GET /api/trading/compare/:typeId

2. **Phase 2 — Trade Calculator**
   - Build trade calculation logic (margins, fees, ROI)
   - API endpoint: GET /api/trading/find?source=jita&dest=dodixie&type=B
   - Tax calculation based on character skills

3. **Phase 3 — Frontend**
   - Trade Finder page component
   - Hub Comparison page component
   - Multi-buy list generator
   - Add navigation items to Sidebar

4. **Phase 4 — Polish**
   - Historical price charts
   - Favorite items / watchlist
   - Alert thresholds (notify when margin exceeds X%)
