# Changelog

All notable changes to the EVE Industry Tracker will be documented in this file.

## [v5.16.1] - 2026-04-22

### Trade Finder — Ghost Opportunity Fix
- **Stale hub_prices rows now pruned.** `setHubPrices` used `INSERT OR REPLACE`, so types that had orders at an earlier refresh but have no orders now kept their old row indefinitely. Those rows leaked into Trade Finder as "expired" opportunities — the listed price hadn't existed on the in-game market for hours or days.
- **Fix, three layers:**
  1. Per-station prune inside `refreshHubPrices` — capture refresh-start timestamp, `DELETE FROM hub_prices WHERE station_id = ? AND updated_at < ?` after the new batch lands, so any type missing from the latest scrape is removed.
  2. Global sweep at the top of each `runFullRefresh` — wipe any hub_prices row older than 6 hours across all stations. Catches accumulated pre-fix rows on first boot after deploy and any data from stations we no longer refresh.
  3. Query-time 6-hour freshness filter in every `hub_prices` read in `tradingController` (both arbitrage and stock-analysis paths). Defense in depth — if a refresh silently fails, stale data still doesn't reach the UI.
- **No schema change.** `updated_at` already existed, just wasn't being used as a freshness gate.

## [v5.16.0] - 2026-04-21

### Trade Finder — Cargo Optimizer + Bait/Scam Risk + Skin Filter

#### Cargo Manifest Optimizer
- **New collapsible panel** in TradeFinder: pick a ship preset (Deep-Space Transport 62.5k m³, Jump Freighter 360k, Freighter 1.125M, Bowhead 1.4M, or custom), optional ISK budget, "Build Manifest" button.
- **Greedy bounded knapsack** — sorts opportunities by profit/m³ descending, takes `min(source_sell_volume, capacity_remaining/volume, budget_remaining/buy_price)` per item. Near-optimal at our scale (≤500 opps), O(N) after sort.
- **Result table** — units, m³ per unit, total volume, buy price, total cost, total profit, risk badge per item; cap-fill bar; totals row with margin.
- **One-click in-game multibuy paste** + **CSV export** of the manifest.
- **"Skip 🔴 critical" toggle** (on by default) — manifest avoids known-bait opportunities.

#### Bait / Scam Risk Scoring
- **Per-opportunity risk badge** (🟢 Low / 🟡 Medium / 🟠 High / 🔴 Critical) with hover tooltip listing the triggered signals. Critical rows are dimmed.
- **Heuristics implemented** (researched against EVE Uni wiki, Brave Collective station-trading guide, EVE forums):
  - **CRITICAL** — same-hub inverted spread (`buy_max ≥ sell_min` at source = margin-trading scam signature); price 10× off the 30-day average (decimal/zero-count outlier).
  - **HIGH** — single sell order at source (single-seller pump); source `sell_volume` < intended haul size; destination is a player Upwell structure (ACL-lockout / structure-destruction risk).
  - **MEDIUM** — thin order depth (2-3 sell orders); barely-enough source stock; price < 50% of 30d median; zero destination volume.
- **New "Intended Qty" filter input** — feeds the "can this fill my haul" check; defaults to 100.
- **30-day average from `hub_price_history`** (started capturing 2026-04-20) — anomaly checks fill in over time. Empty history degrades gracefully (no false positives).

#### Skin / SKINR / Paragon filter
- **Hidden by default** — TradeFinder no longer surfaces ship SKINs, SKINR rewards, or Paragon items as arbitrage opportunities. The market for these is structurally thin (stale 2024 orders, ~zero demand) so they were generating bait-by-accident signals.
- **"Include skins" checkbox** — opt back in if you actually trade them.
- **Filter is name-based** (`name LIKE '% SKIN%' / '%SKINR%' / '%Paragon%'`) — verified to catch all 11,625 SKIN types in the SDE without false positives.

#### Backend changes
- New `backend/services/baitScore.js` — pure module exposing `scoreOpportunity()` + `categoryRiskTag()`.
- `findTradeOpportunities` now returns `source_buy_max` + `source_sell_order_count` per opportunity (needed for scoring).
- `findTrades` enriches each opportunity with `volume_m3`, `profit_per_m3`, `category_risk_tag`, `risk_level`, `risk_reasons[]`. Over-fetches 4× to allow filtering without losing the requested limit.
- New query params on `GET /trading/find`: `includeSkins=true|false` (default false), `intendedQty=N` (default 100).

## [v5.15.0] - 2026-04-21

### Personal Industry Stats Dashboard
- **New sidebar view "My Industry Stats"** — mirror of the corp industry dashboard, reading from the `character_job_history` archive (populated every 15 minutes since v5.14.0). Headline cards (jobs, runs, unique products, active characters, job cost, ISK produced estimate, **ISK sold (real)**), top-ships grid, activity rollup tiles, monthly trend chart, by-category group bars, top products table (with per-type **real sales** from wallet), and a per-character breakdown table.
- **Real ISK sold figure** — sums `wallet_transactions` sales (`is_buy=0`) across the user's characters inside the same window, shown as a headline card and as a per-type column in the Top Products table. Complements the Jita-sell estimate. Sales aren't tied to specific jobs, so the figure can include inventory produced before the window.
- **Filters** — date-range presets (this/last month, 30d, 90d, 6m, all), activity type, per-character picker (appears when user has multiple alts with archived jobs).
- **CSV export** — full raw history dump with character + facility + location denormalized.
- **Access scope** — user only sees jobs for characters linked to their account.

### Price Trend Chart in Hub Compare
- **Click a hub row to expand an inline price trend chart** (sell_min green, buy_max red) reading from the `hub_price_history` daily snapshots (one row per type × hub × UTC day, 180-day retention, populated since v5.14.0).
- **Range toggle** — 1W / 1M / 3M / 6M, matching the WealthChart trading-platform style.
- **Hand-rolled Canvas2D** — no new dependencies; reuses `WealthChart.css` so visuals stay consistent.
- **Chart fills in over time** — only ~1 day of history at release; becomes increasingly useful as days accrue.

### Backend
- New `backend/controllers/characterIndustryController.js` exposing `GET /character/industry/stats`, `GET /character/industry/history`, and `POST /character/industry/backfill` (admin-only).
- New `GET /trading/price-history?type_id=&station_id=&days=` endpoint with hub-access guard (403 if station isn't one of the user's enabled hubs).
- Eight new `db.queryCharacter*` helpers mirroring the corp query family (summary, byMonth, byMonthCategory, topProducts, breakdown, byGroup, byActivity, history).

## [v5.14.1] - 2026-04-21

### Backend Stability Fixes
- **EventEmitter leak resolved** — outbound ESI / SSO calls now go through a shared axios client (`backend/services/httpClient.js`) with `keepAlive:false` on both http + https agents. Under Node 19+'s default keep-alive, axios was reusing TLSSockets and its internal listener attachment accumulated `error` listeners until Node emitted `MaxListenersExceededWarning (11 error listeners on [TLSSocket])` during the token refresh cycle. Fresh socket per request removes the reuse path. All 10 backend `require('axios')` sites now import the shared client.
- **Hub-price refresh no longer blocks event loop** — `refreshJitaPrices` and `refreshHubPrices` aggregation loops (up to ~329k orders per region) now yield with `await new Promise(resolve => setImmediate(resolve))` every 1000 iterations. This unblocks `/health` during the 70+ second refresh window and stops K3s readiness probes from timing out. Wall-time impact negligible (<50 ms per refresh).

## [v5.14.0] - 2026-04-20

### Corporation Industry History & Stats Dashboard
- **New `corp_job_history` table** — append-only archive of completed corp jobs (status `delivered` or `ready`). PK `job_id` makes re-archival idempotent.
- **Archival every 15 minutes** (`backend/services/corpJobArchive.js`) — fetches from ESI with `include_completed=true`, dedups per corporation (two alts in one corp only trigger one fetch).
- **Denormalized product metadata** — product name, group id/name, and category id/name stored on each row so aggregates like "Heavy Assault Cruisers: 12 runs" need no joins.
- **Lazy type metadata resolver** (`backend/services/typeMetadata.js`) — on first archival, fetches `/universe/types`, `/universe/groups`, `/universe/categories` from ESI and caches into new `type_metadata` table; zero ESI cost on steady state.
- **New sidebar view "Corp Industry Stats"** — headline cards (jobs completed, runs, unique products, active installers, total job cost), top products table, top installers table, category breakdown grid.
- **Filters** — date-range presets (this/last month, 30d, 90d, 6m, all time), activity type (manufacturing / reactions / invention / research / copying), and per-corp picker when user has alts in multiple corps.
- **Admin endpoint** `POST /api/corporation/industry/backfill` — triggers archival on demand (useful for first backfill).
- **Access scope** — user sees stats for any corp their characters currently belong to.

### Warehouse Decision
- Stayed on SQLite (append-only history tables, same pattern as existing `wealth_snapshots`/`wallet_journal`). DuckDB can `ATTACH` the same file if we ever need a dedicated analytics path.

### Known Limits
- History only starts on ship date — ESI retains ~30 days of completed jobs, so a one-time backfill captures only what ESI still exposes.
- Job `cost` is install cost, not ISK-produced. ISK-value-produced estimate (Phase 3) will use product × runs × Jita sell.

## [v5.13.0] - 2026-04-08

### Blueprint Data Fix — Hoboleaks Live SDE
- **Stale SDE data fixed** — blueprint material data was imported from Fuzzwork (last updated July 2025) and never refreshed. CCP has since rebalanced many ships (all carriers, likely more). Quantities were significantly wrong (e.g. Nidhoggur G-O Trigger: 28 instead of correct 11)
- **Switched to Hoboleaks** — blueprint data now sourced from `sde.hoboleaks.space/tq/blueprints.json`, which auto-updates within minutes of every TQ patch
- **Auto-refresh on startup** — backend checks Hoboleaks revision on each startup and re-imports if a new game patch is detected
- **Admin SDE refresh** — `POST /api/admin/sde/refresh` endpoint for manual blueprint data refresh
- **ME formula fix** — changed from additive percentages to EVE's actual multiplicative formula: `(1 - ME/100) × (1 - struct/100) × (1 - rig/100)`
- **Per-run material rounding fix** — now uses EVE's actual formula `max(runs, ceil(runs × baseQty × meFactor))` instead of ceiling per-unit then multiplying

## [v5.12.0] - 2026-04-08

### PI Factory Status Fix & Storage Value
- **Factory planet status fix** — mid-cycle factories no longer incorrectly show "Waiting"; simulation now detects factories currently producing and marks them correctly
- **Unscheduled factory input pull** — factories that were never scheduled in simulation now pull inputs from storage via routes, so the idle check reflects available materials
- **Mid-cycle factory contents** — running factories show their input materials instead of empty contents
- **Unified Active status** — "Extracting" and "Active" merged into single "Active" status for all planets with running extractors
- **Estimated storage value** — each planet shows Jita sell value of stored PI materials, with per-item breakdown on hover
- **Value column in list view** — separate column for ISK value next to storage bar
- **Character total value** — sum of all colony values shown in character section header (both list and grid views)
- **Grid card value** — colony cards in grid view show per-planet ISK value with tooltip breakdown
- **Unified font sizes** — consistent 12px in list table, 11px in grid cards across all numeric fields

## [v5.11.0] - 2026-04-07

### Production Planner Improvements
- **Job consolidation** — duplicate jobs (same item appearing in multiple tree branches) are now merged into a single job with summed runs, dramatically reducing job count (e.g. 131 → ~30 for a Thanatos)
- **Max job length splitting** — "Don't split < (days)" replaced with "Max job length (days)": consolidated jobs exceeding the limit are split into chunks that fit the time window, matching Ravworks behavior
- **Import cost breakdown** — IMPORT recommendation now includes shipping cost for the finished product (buy + shipping + collateral), with "can't ship" for capitals
- **BUILD/IMPORT full comparison** — both verdicts show complete cost breakdowns on both sides (materials, jobs, shipping)
- **Sell price & profit** — Jita sell price auto-populated (editable), with sell revenue, build profit, and import profit stat boxes (green/red coloring)
- **Build tree column alignment** — right-side columns (qty, action, cost, savings, time, job cost) now have fixed widths with proper headers
- **UI layout consolidation** — config rows reorganized: structure/rig/security on row 1, all other params + Build Tree button on row 2
- **Unified field styling** — select dropdowns match input styling (same height, background, border, radius)

## [v5.10.0] - 2026-04-07

### PI Colony Simulation
- **Local PI simulation** — advances stale ESI planet snapshots to current time, showing accurate pin contents (produced outputs, consumed inputs, correct storage %)
- **Event-driven simulation engine** (`piSimulator.js`) — modeled on RIFT's ColonySimulation.kt, replays factory and extractor cycles with proper routing
- **Extractor degradation formula** — ported from RIFT, matches EVE's decay + noise oscillation for accurate extraction output prediction
- **Route-based material flow** — factories pull inputs from storage via inbound routes, output routed to downstream factories (by buffer fill priority) then storage (distributed evenly)
- **Storage capacity enforcement** — launchpad (10K m3), storage (12K m3), command center (500 m3) volumetric limits respected; excess stays in factory buffer
- **Factory idle detection** — `simulated_idle` flag marks factories that can't run (insufficient inputs), fixes colony status showing "Producing" instead of "Waiting"
- **Pulsing "Waiting" status** — factory-only planets with exhausted inputs show pulsing status badge for attention
- **Safety cap** — 50K iteration limit prevents runaway simulation on very stale snapshots
- **Schematic input queries** — new `getSchematicInputs` / `getSchematicInputsBatch` DB methods for factory input material lookup

## [v5.9.0] - 2026-04-04

### Production Planner — Recursive Build Tree
- **Recursive build tree** — resolves blueprint chains up to 4 levels deep (raw → reactions → components → assembly)
- **Build-or-buy per node** — each component shows buy cost vs build cost, auto-picks cheapest
- **Blueprint ownership** — fetches all characters' BPOs/BPCs via ESI, shows green BPO/orange BPC badges with ME level on tree nodes
- **Shopping list** — flattens tree leaves into raw materials list with "Copy Multi-Buy" clipboard button
- **Summary panel** — verdict (BUILD/IMPORT), savings, material cost, shipping, JF loads, job count, owned blueprints count
- **Job times** — imported from SDE (19K activity entries), shown per buildable node
- **Capital ship support** — tested on Moros (186 nodes, 35 materials), Thanatos (176 nodes), Cerberus (45 nodes)
- **Production nav** — replaces Build vs Buy in sidebar under Trading
- **Reaction chains** — T2 component sub-materials (moon goo → composites) resolve in tree via activityID 11
- **Facility config** — structure type (Raitaru/Azbel/Sotiyo/Tatara/Athanor), rig tier (T1/T2), security multiplier applied to ME + TE reduction
- **Missing Blueprints tab** — shows BPs needed for the build but not owned by any character
- **Contract price field** — compare build cost vs contract buy price for capitals (not on regular market)
- **Capital detection** — CAPITAL badge on ships with buy price 0 (not market-tradeable)
- **Import Calculator** — split nav: Build Planner (corp manufacturing) vs Import Calculator (Halo shipping)
- **Halo shipping formula** — real per-m³ rate + minimum fee + max volume cap
- **Packaged ship volumes** — imported from `invVolumes.csv` for accurate shipping calculations
- **localStorage persistence** — selected item, ME level, and config remembered across sessions
- **Job installation cost** — EIV × system cost index × (1 + tax%) per BUILD node, system search autocomplete
- **TE reduction** — Time Efficiency (0-20) + structure time bonus (Sotiyo 30%, Azbel 20%, etc.) + rig TE bonus applied to all job times
- **Job Scheduler** — auto-detect MFG/Reaction slots from ESI (17 chars, 139 mfg / 122 react), split jobs across slots with parallel time calculation
- **"Don't split jobs shorter than X days"** threshold — short jobs stay on 1 slot
- **"Build All" toggle** — forces all buildable nodes to BUILD (like Ravworks), recalculates summary, shopping list, and job counts client-side
- **Jobs tab** — wall-clock time estimate, bottleneck identification, reaction + manufacturing job tables with runs, time/run, split info, parallel time, job cost
- **Crosschecked with Ravworks** — Thanatos TE16+Sotiyo = 13.6d (Ravworks 14.0d), job scheduling and material costs align
- **EVE-accurate job cost formula** — `EIV × CI × (1 - structure_bonus) + EIV × (facility_tax + SCC_surcharge)`, crosschecked against in-game 139.5M Thanatos job cost
- **SCC surcharge (4%)** — fixed surcharge since 2022 industry update, auto-applied
- **Structure job cost bonus** — Sotiyo -5%, Azbel -4%, Raitaru -3%, Tatara -4%, Athanor -3%
- **Ravworks-style job categories** — collapsible groups: Intermediate/Composite/Biochem/Hybrid Reactions, Advanced Components, Capital Components, End Product
- **EVE type icons** — item icons from images.evetech.net on tree nodes, job tables, and shopping list

### New ESI Scopes
- `esi-characters.read_blueprints.v1` — BPO/BPC detection with ME/TE/runs
- `esi-contracts.read_character_contracts.v1` — for future BPC purchasing support
- Characters need to re-authenticate to grant new permissions

### SDE Data
- Blueprint activities (job times): 19,012 entries from industryActivity.csv
- Blueprint products: 6,266 entries
- Blueprint materials: 36,193 entries
- Packaged ship volumes: from invVolumes.csv

### Bug Fixes
- **PI factory planet status** — factory-only planets now show "Producing" when factories have input materials (contents check) and "Waiting" when empty, instead of always showing "STOPPED"
- **BPO badges in Assets** — ESI omits `is_blueprint_copy` for originals (undefined, not false); fixed detection logic
- **Assets table Safari rendering** — moved row separator border from `td` to `tr` to fix Safari subpixel rendering artifacts (dotted/broken lines)
- **BPO/BPC badges in Assets** — searchable blueprint type indicators with (Original)/(Copy) in type name
- **Import Calculator** — fixed blank screen (missing loadSaved) and undefined variable (importJfLoads, shippingFlatFee)

## [v5.8.0] - 2026-04-04

### Trading Feature — Hub Comparison + Trade Finder (owner-locked)
- **Multi-hub market data** — fetches orders for all configured trade hubs across 5+ regions every 30 minutes
- **Configurable hubs** — 5 default NPC trade hubs (Jita, Amarr, Dodixie, Rens, Hek) + add custom player structures (nullsec alliance hubs)
- **Station search** — search by name with auto-resolve of station → system → region chain, no manual ID entry
- **Hub Comparison view** — compare item prices across all hubs with best-price highlighting, spread calculation
- **Item name search** — type-ahead autocomplete for 50K+ EVE item types
- **Trade Finder** — find arbitrage opportunities between hub pairs (Type A buy-order / Type B instant-relist)
- **Trade calculator** — broker fee + sales tax calculation with EVE-accurate skill formulas
- **Auto-detect skills** — pull Accounting/Broker Relations/Advanced Broker Relations levels from ESI
- **Multi-buy export** — copy item list to clipboard in EVE in-game multi-buy format
- **CSV/JSON export** — export trade opportunities and hub comparisons
- **Filters** — min ROI%, min profit, max buy price, min volume, sortable columns
- **Data freshness** — per-hub refresh status indicators, stale data warnings (>1h)
- **Access control** — entire trading feature locked to Lothriell (403 for all other users, hidden from sidebar)
- New DB tables: trade_hubs, hub_prices, hub_refresh_status, trade_settings
- New backend: tradeCalculator.js, tradingController.js, 10 API endpoints

## [v5.7.0] - 2026-04-03

### Planetary Industry — Grid View Upgrade
- **Product icons** — EVE type icon overlaid on planet circle showing final product
- **Tier badges** — P1/P2/P3/P4 color-coded labels (gray/blue/teal/gold/green) with product name
- **PI schematics SDE import** — schematic_id → output type + cycle time from Fuzzwork planetSchematics
- Smart tier detection: Basic→P1, Advanced→P2 (with Basic) or P3 (standalone), High-Tech→P4
- Planet name and type on one line, full names without truncation

### Planetary Industry — Enhanced Colony Statuses
- **10-state pin status system** (RIFT-inspired): extracting, expired, inactive, producing, factory-idle, not-setup, input/output-not-routed, storage-full, static
- **6 colony statuses**: Active, Extracting, Producing, Stopped, Attention, Setup, Idle
- Status reason text (e.g. "2 expired, storage full", "3 factories idle")
- Factory-only planets now show Producing/Stopped instead of misleading "STOPPED"
- Uses ESI `last_cycle_start` + schematic `cycle_time` for factory activity detection
- Routes analyzed for input/output routing validation

### Planetary Industry — List View Enhancements
- **Product column** with EVE type icon, tier badge, and full product name
- **AlertBadges restored** alongside new status column
- **Level (stars) moved** to ColonyDetail header
- Pins column removed from table (kept in detail panel)
- Planet and product icons increased 25%
- Unified row height (48px)

### Storage Tier Visualization
- **Color-coded storage breakdown** by PI tier (P0–P4) in both grid gauge and list bar
- P0 gray, P1 blue, P2 teal, P3 gold, P4 green
- Tier classified by SDE packaged volume (0.005/0.19/0.75/3.0/50.0 m³)
- Hover tooltip shows per-tier percentage breakdown
- Grid card tooltip: alerts first, then storage utilization

### Extraction Graphs
- **HiDPI sharp rendering** — canvas uses devicePixelRatio for crisp bars and labels on retina
- Single extractor graph capped at 50% width (matches 2-extractor layout)

### Auto-Refresh Countdown
- **Live countdown timer** on auto-refresh button (e.g. "⟳ 5m 3:42")
- Resets on manual refresh and interval change
- Wider button (min-width 105px) prevents layout shift

## [v5.6.0] - 2026-04-02

### Wallet Journal — Unified Table Views
- **Unified 8-column layout** across all tabs (Date, Qty, Item, Buy/Sell, Amount, Balance, Description, Parties)
- All tab merges ref_type into Item cell when no market transaction exists
- Consistent row height (32px) across all tabs — badge padding no longer causes uneven rows
- Fixed-height tab content container — no page jump when switching between Overview/Transactions/Market/All
- Market Transactions tab gets "All loaded" button matching other tabs
- Overview tab donut dynamically scales to fill container via ResizeObserver
- Empty state shows clean message instead of empty box with +0 ISK

### Wealth History Chart
- **Trading platform range selector** — pill-style buttons: 1D, 1W, 1M, 3M, 6M, 1Y, MAX
- **Unlimited history** — backend accepts up to 3650 days or 'all', no retention on financial data
- **No layout jump** on range change — keeps old chart visible while fetching
- **Adaptive X-axis labels** based on actual data span (hours for <2d, M/D+hour for <7d, M/D for <90d, Mon D for <1Y, Mon 'YY for MAX)
- Min-height container prevents collapse during loading

### Skill Queue — EVE-Style Overhaul
- **Level indicator boxes** — 5 small squares per skill, filled gray up to trained level
- **Currently training pulse** — yellow pulsing animation on the active level
- **Training timeline bar** — two-tone gray blocks showing each skill's % of total training time
- **Training Time label** — "Xd Xh Xm" displayed left of timeline bar
- Hover tooltip on timeline blocks shows skill name + remaining time

### UI Fixes
- Top bar wallet ISK color matches character page (#f6c90e, no more dimming)

---

## [v5.5.0] - 2026-04-01

### Wallet Journal Improvements
- **Item names in All tab** — market transactions now show item name, quantity, and buy/sell badge via date+amount matching (ESI journal_ref_id doesn't match entry_id)
- **Unified table layout** — All, Transactions, and Market Transactions tabs share consistent column widths (percentage-based with `table-layout: fixed`)
- **Separate Qty, Item, Buy/Sell columns** on All tab (badge moved out of Item cell)
- **Buy/Sell filter dropdown** on All tab — second dropdown alongside ref-type filter
- **Market Transactions filter/export moved to tab bar** — consistent with other tabs (no separate toolbar row)
- **Correct per-tab counts** — Market tab shows "X transactions", others show "X entries"
- **Buy/Sell badge colors swapped** — sell = green (income), buy = red (expense)
- **Market Transactions buy/sell filter** converted from buttons to dropdown (matching ref-type filter style)
- **All filters aligned left** — dropdowns sit after tab buttons, not centered
- **Market tab prices colored** — green for sell, red for buy on Unit Price and Total columns
- **Market tab columns reordered** — Date, Qty, Item, Buy/Sell, Unit Price, Total, Description, Parties

### Wealth History Fixes
- **Deduplicated snapshots** — chart aggregation deduplicates per character per hour before summing, preventing inflated values
- **Backend dedup guard** — `saveWealthSnapshot` checks for existing snapshot within the last hour per character before inserting
- **Purged bad historical data** on test environment

### UI Fixes
- **Market Transactions tab scroll jump** — `scrollIntoView` on tab switch prevents page jumping when content height changes during data fetch
- **Top bar wallet ISK color** — removed opacity dimming, now matches character page wallet box (#f6c90e gold)

---

## [v5.4.0] - 2026-04-01

### Global Refresh
- **Auto-refresh + manual refresh moved to main header** — works globally across all views
- Auto-refresh dropdown (Off / 5m / 10m / 15m) persisted in localStorage
- Manual refresh button reloads whichever view is active (stays on current page)
- Removed per-view refresh buttons from Dashboard, IndustryJobs, CorporationJobs, CharacterPage, Planets
- Removed Dashboard Overview header entirely

### Dashboard Layout
- **Slot cards moved inside Characters Overview section** — sticky on scroll, uses section background (no gradient mismatch)
- Characters Overview header + stats merged into single line
- zKillboard links on character names in Dashboard cards

### Style Fixes
- **Unified ISK colors to amber (#f6ad55)** across Assets view (badges, cells, price mode selector)
- **Wallet boxes changed to golden-yellow (#f6c90e)** — distinct from asset amber
- **Header wealth** split into separate Assets + Wallet boxes (matching Dashboard card layout)
- **Assets toolbar** — smaller buttons by default, stable layout (no resize on collapse/expand)
- **External links dropdown** — switched to position:fixed to prevent clipping under table rows
- Removed zKillboard from item links (kept only for characters)
- Fixed Character Page job tables: correct field names for progress, blueprint names, locations

### Performance
- **Wealth endpoint** — parallel character fetching + 2-minute cache
- **Dashboard stats** — parallel ESI calls via Promise.all, eliminated duplicate getCharacterIndustryJobs call, 2-minute cache
- **Frontend** — stats, corp info, and wealth fetched in parallel instead of sequential

### Bug Fixes
- Fixed corporation assets showing empty (character filter was filtering corp-wide data)
- Fixed blank page after login (slotsLoading undefined in Dashboard)

---

## [v5.3.0] - 2026-04-01

### Character Page
- **Dedicated character view** — clicking a sidebar character opens a full Character Page
- **Corporation & Alliance** with EVE logos in the header
- **Expandable skill queue table** — full training queue with skill names, levels, and finish times
- **Personal & Corp industry jobs** tables with progress bars, countdowns, and resolved locations
- **Planetary industry cards** with extractor expiry countdown and launchpad storage fill bar
- **Per-character net worth** displayed in the header

### Self-Contained Character Filters
- **All nav views** (Jobs, Corp Jobs, Assets, Planets) now have their own character filter dropdown
- Sidebar characters no longer act as a global filter — they navigate to the Character Page
- `selectedCharacter` prop removed from all views

### External Lookups
- **Reusable ExternalLinks component** — small icon button with dropdown on item/system/character names
- Links to Fuzzwork Market, EVE Ref, zKillboard, Dotlan (depending on entity type)
- Integrated across IndustryJobs, CorporationJobs, Assets, and CharacterPage

### CSV/JSON Export
- **ExportButton component** — dropdown with CSV and JSON export options
- Added to IndustryJobs, CorporationJobs, Assets, and Planets toolbars
- Exports respect current filters

### Net Worth per Character
- **/api/wealth** extended with per-character breakdown (backward compatible)
- Dashboard character cards show asset ISK value in amber boxes
- Wallet placeholder boxes (golden-yellow, dimmed) ready for Phase 2
- Header shows separate Assets + Wallet boxes

### Unified Table Styling
- CorporationJobs now shares table/toolbar CSS from IndustryJobs
- Fixed blueprint icon offset in CorporationJobs (was display:flex on `<td>`)
- Character Page job tables use fixed column widths for consistent alignment

### Performance Optimization
- **Dashboard stats**: all characters processed in parallel via `Promise.all`
- **Eliminated duplicate ESI calls**: new `getMaxSlots()` fetches only skills, not jobs again
- **2-minute in-memory cache** for dashboard stats
- **Frontend**: stats, corp info, and wealth fetched in parallel instead of sequential
- Expected ~50-70% latency reduction for multi-character users

---

## [v5.2.0] - 2026-03-30

### Skill Training Status on Dashboard
- **Skill queue on character cards** — shows currently training skill, level (roman numerals), and live countdown
- **Queue depth indicator** — shows (+N) for remaining queued skills
- **Red flashing alerts** — "No Skill in Training" when queue is empty or finished, "Training Paused" when paused
- **New ESI scope** — `esi-skills.read_skillqueue.v1` (must be enabled on all 3 EVE Developer Applications)
- Characters need re-authorization to grant the new skillqueue scope

---

## [v5.1.2] - 2026-03-30

### Fix: Planets detail button clipped on right side
- **Widened action column** from 6% to 8% and added right margin to detail button
- Matches left-side planet icon offset for visual balance

---

## [v5.1.1] - 2026-03-30

### Fix: Docker Compose test environment SSO login
- **Fixed `invalid_state` error** on Docker Compose (HTTP) test environment
- `NODE_ENV` no longer hardcoded to `production` in docker-compose.yml — defaults to `development`
- Production mode (`secure` cookies, `trust proxy`) only applies in K8s via K8s Secrets
- Root cause: `secure: true` cookies prevented session round-trip on plain HTTP

---

## [v5.1.0] - 2026-03-30

### Planets Auto-Refresh
- **Auto-refresh for Planets view** — same design as Dashboard: Off / 5m / 10m / 15m dropdown
- Setting persists in localStorage (separate key from Dashboard)
- Spinning refresh icon indicates active auto-refresh

---

## [v5.0.0] - 2026-03-29

### Breaking: EVE SSO-Only Authentication
- **Removed local username/password login** — EVE SSO is now the sole authentication method
- **"Login with EVE Online" button** replaces the username/password form on the landing page
- **First SSO login creates your account** — no registration needed, CharacterID becomes your identity
- **Alt character linking** — SSO while already logged in links additional characters to your account
- **Removed `bcrypt` dependency** — no more password hashing
- **New `users` table schema** — `primary_character_id` and `primary_character_name` replace `username`/`password_hash`
- **Removed `APP_USERNAME` / `APP_PASSWORD`** from `.env`, `docker-compose.yml`, and all backend references
- **Removed `POST /auth/login` route** — only SSO endpoints remain
- **Simplified `App.jsx`** — removed react-router login/redirect, auth check drives rendering directly

### Migration
- **Database must be recreated** — drop the SQLite volume and rebuild. SDE import and cache refresh repopulate automatically, re-authenticate via EVE SSO.

```bash
docker-compose down
docker volume rm eve-esi-app_eve-esi-data
docker-compose up -d --build
```

---

## [v4.6.0] - 2026-03-26

### Added: PI Grid View
- **Colony cards** in a responsive CSS grid — visual overview of all colonies across all characters
- **Planet icon** with planet type color and first letter (T=Temperate, B=Barren, etc.)
- **Circular fill gauge** (SVG) around planet icon — blue (<60%), amber (60-80%), red (>80%)
- **Status-based card borders** — green (extracting), blue (producing), red (needs attention)
- **Red attention pulse** animation on colonies needing attention
- **Live countdown** per card showing time until earliest extractor expires
- **Extraction rate** displayed per card
- **Character name** at bottom of each card
- **View toggle** in toolbar: ☰ List / ⊞ Grid

### Added: Extraction Prediction Bar Graph
- **Canvas-based bar chart** in colony detail showing predicted output per extraction cycle
- **EVE decay formula** — same algorithm as RIFT/eve-pi with cosine oscillations
- **Color gradient** — bars colored blue→green→yellow→red based on output level relative to max
- **Current time indicator** — white vertical line showing current cycle position
- **Hover interaction** — move mouse over bars to see cycle number, units, and accumulated total
- **Per-extractor graphs** — each extractor in a colony gets its own chart with product name and u/h rate

### Fixed
- **Storage fill calculation** — now identifies storage pins by type name (Launchpad/Storage/Command Center) instead of hardcoded type IDs that didn't match ESI data

---

## [v4.5.0] - 2026-03-26

### Added: Jita Market Prices + Price Mode Toggle
- **Jita price cache**: Background service fetches ALL Jita 4-4 sell/buy orders every 6 hours, computes min sell and max buy per type, stores in new `jita_prices` SQLite table
- **Price mode dropdown** in Assets toolbar with 3 options:
  - **AVG Price** — 30-day CCP weighted average (existing, default)
  - **Jita Sell** — minimum sell order price at Jita 4-4 ("what can I sell for")
  - **Jita Buy** — maximum buy order price at Jita 4-4 ("what can I buy for")
- Switching price mode **instantly re-valuates** all assets with the selected pricing
- Golden dropdown styled to match the ISK theme
- Works in both Tree View and Value View
- Applied to personal and corporation assets

### Technical
- New `jita_prices` table: type_id, sell_min, buy_max, sell_volume, buy_volume
- Fetches from `GET /markets/10000002/orders/` (The Forge region, all pages)
- Filters to Jita station ID 60003760 only
- ~300 pages × 1000 orders, processed to per-type min/max
- Added to 6-hour background refresh cycle

---

## [v4.4.0] - 2026-03-26

### Added: ISK Valuation on Assets
- **Every asset shows its ISK value** using cached market prices (~14K types)
- **Per-item value column** — "Value" column in the table showing total ISK per line item
- **Per-station totals** — gold ISK badge on each station header (e.g., "1.2B")
- **Per-system totals** — gold ISK badge on each system header (e.g., "3.7B")
- **Grand total in toolbar** — "52,940 units • 3 systems • **4.2B ISK**"
- **Gold color theme** for ISK values (#f6c90e) — matches EVE's ISK color
- Uses `average_price` from ESI (falls back to `adjusted_price`)
- **Smart formatting**: 1.2T, 3.45B, 450.2M, 12K
- Both personal and corporation assets include ISK valuation
- Zero-cost items (no market data) show "—"

---

## [v4.3.0] - 2026-03-26

### Added: Server Status Indicators
- **Tranquility (TQ)** and **ESI API** status indicators in the header bar, next to the Logout button
- Green dot + "TQ" with player count when Tranquility is online
- Red dot when offline or in maintenance
- Green/red dot for ESI API availability
- **Auto-refresh every 60 seconds** — follows EVE best practices for status polling
- Hover tooltip shows detailed status: player count, maintenance state
- Backend endpoint `GET /api/eve/status` checks `GET /status/?datasource=tranquility` with 5s timeout
- Detects maintenance (502/503), complete outage (connection refused), and partial issues

---

## [v4.2.0] - 2026-03-26

### Added: Landing Page Redesign
- **Cinematic dark space landing page** inspired by eveonline.com and firewatchgame.com
- **Parallax star field** with mouse-tracking movement effect on stars and nebula layers
- **Hero section** with gradient title "Command Your Industrial Empire", feature stats, and CTA buttons
- **Feature cards** (4 columns) showcasing Industry Jobs, Asset Browser, Planetary Industry, Corporation
- **Login modal** — slides up on "Access Dashboard" click, dark glass-morphism design with blur backdrop
- **Smooth animations** — fade-in-up on hero, staggered feature cards, modal slide transition
- **Responsive** — 2-column features on tablet, single column on mobile

### Added: EVE Server Maintenance Detection
- All views (Dashboard, Industry Jobs, Corp Jobs, Assets, Planets) now detect HTTP 502/503/504 from ESI
- Shows friendly message: "EVE servers are in maintenance — data will refresh automatically when they come back online"
- Replaces generic "Failed to load" errors during EVE daily downtime (~11:00 UTC)

---

## [v4.1.0] - 2026-03-26

### Added: Manual Structure Naming
- **Rename button** on unresolved player structures in Assets view — click "Rename" to type the structure name
- Names saved to SQLite `name_cache` — persists across restarts and shared across all characters
- Once named, the structure appears with its custom name on all future loads
- Backend endpoint: `POST /api/structures/name` accepts `structureId` and `name`

### Confirmed: Structure Name Resolution — CCP Limitation
After extensive testing with all available ESI scopes, confirmed that player structure names **cannot be resolved by new web applications**:
- `GET /universe/structures/{id}/` requires `esi-universe.read_structures.v1` — **removed from SSO**, always returns 401
- `GET /corporations/{id}/structures/` requires `esi-corporations.read_structures.v1` + **Director role** — too restrictive for regular users
- New scopes `esi-structures.read_character.v1` and `esi-structures.read_corporation.v1` do NOT work with either endpoint
- RIFT desktop app works because its scope was **grandfathered** before CCP removed it

### Cleaned Up
- Removed structure scopes from REQUIRED_SCOPES (they don't help)
- Removed corp structures pre-fetch (requires Director, not usable for regular users)
- Removed excessive debug logging
- Stopped wasteful ESI calls to broken endpoints

---

## [v4.0.0] - 2026-03-26

### Major: EVE SDE (Static Data Export) Integration

The entire EVE universe database is now imported on first startup from Fuzzwork SDE dumps. This eliminates thousands of ESI API calls for name resolution and provides instant access to all item, station, and system names.

#### SDE Data Imported
| Data | Source | Count | Purpose |
|------|--------|-------|---------|
| Item types | `invTypes.csv` | ~80,000 | Item/ship/module names — never need ESI for type names again |
| NPC stations | `staStations.csv` | ~5,000 | Station names + system IDs — instant station resolution |
| Solar systems | `mapSolarSystems.csv` | ~8,000 | System names + security + region/constellation IDs |
| Regions | `mapRegions.csv` | ~100 | Region names |
| Constellations | `mapConstellations.csv` | ~1,100 | Constellation names |

#### How It Works
- On first startup (or after database reset), the SDE import service downloads CSV files from `fuzzwork.co.uk/dump/latest/`
- Data is parsed and batch-imported into the `name_cache` SQLite table using transactions (5000 rows per batch)
- Subsequent startups skip import if >50,000 types already cached
- Solar systems include region/constellation IDs and security status as extra_data (JSON)
- Total import takes ~15-30 seconds on first run

#### Performance Impact
| Operation | Before (ESI calls) | After (SQLite) |
|-----------|-------------------|----------------|
| Resolve 500 type names | 1-2 ESI POST calls | 0 calls (instant) |
| Resolve station name | 1 ESI GET per station | 0 calls (instant) |
| Resolve system name | 1 ESI GET per system | 0 calls (instant) |
| First page load (assets) | 50+ ESI calls, 5-10s | 0 calls, <1s |
| Container restarts | All names lost | All names preserved |

#### Replaced
- Old constellation/region name fetching via ESI removed (SDE handles it)
- On-demand ESI type lookups now only needed for brand-new items not yet in SDE

---

## [v3.9.0] - 2026-03-26

### Added: Background Cache Refresh Service
- **`cacheRefresh.js`**: New background service that automatically refreshes semi-static ESI data
- **Schedule**: Runs 5 seconds after startup, then every 6 hours (4x/day)
- **Graceful shutdown**: Stops refresh timer on SIGTERM/SIGINT

### Cached Data

| Data | Table | Refresh | Source |
|------|-------|---------|--------|
| Market prices (adjusted + average) | `market_prices` | Every 6h | `GET /markets/prices/` |
| System cost indices | `cost_indices` | Every 6h | `GET /industry/systems/` |
| Region names | `name_cache` | Once (startup) | `POST /universe/names/` |
| Constellation names | `name_cache` | Once (startup) | `POST /universe/names/` |
| Character names | `name_cache` | On demand | `POST /universe/names/` |

### Improved
- **Character/installer names**: Now cached in SQLite — job pages load faster, names survive restarts
- **Cache status endpoint**: `GET /api/cache/status` shows cache counts, oldest/newest entries per category
- **Market prices foundation**: ~14,000 type prices cached, ready for ISK valuation features (assets, jobs, PI)
- **Cost indices foundation**: ~5,000 system cost indices cached, ready for manufacturing cost display

### Database Schema
- New `market_prices` table: `type_id`, `adjusted_price`, `average_price`
- New `cost_indices` table: `system_id`, `activity`, `cost_index`
- Both tables auto-maintained by background refresh service

---

## [v3.8.0] - 2026-03-26

### Added: Persistent SQLite Name Cache
- **New `name_cache` table** in SQLite for storing resolved type names, station names, and system names
- **First load**: fetches from ESI and stores in database
- **All subsequent loads**: instant lookup from SQLite (zero ESI calls for known items)
- **Batch operations**: `getCachedNames()` and `setCachedNames()` for efficient bulk lookups/writes using SQLite transactions
- **Cache stats**: `getCacheStats()` returns counts and age per category
- **Stale purge**: `purgeStaleCache(hours)` removes entries older than specified hours

### Improved: Performance
- **Type names**: SQLite cache checked before ESI — 500+ types resolved instantly after first load
- **Station names**: cached with `system_id` as extra data — station + system resolved in one lookup
- **System names**: cached in SQLite — zero ESI calls for known systems
- **Removed in-memory cache**: SQLite is the single source of truth, simpler and survives container restarts
- **Assets load dramatically faster** on second+ view — only new/unknown IDs hit ESI

### Fixed
- **Assets blank page**: Reduced API calls from 200+ to minimum needed. Structures skip broken endpoint immediately. Custom names only fetched for containers (~50 items) not all assets (~5000).

---

## [v3.7.5] - 2026-03-25

### Improved
- **3-tier structure name resolution**: Player structures now attempt resolution through multiple methods before giving up:
  1. `GET /universe/structures/{id}/` with each character's token (existing method)
  2. `POST /characters/{id}/assets/names/` with the structure ID — works when the character has assets in the structure even without docking access (discovered workaround from ESI community)
  3. Final fallback: `Player Structure #XXXXXX` with unique ID suffix
- **Failed structure lookups no longer cached**: Returns an `unresolved` marker instead, allowing retry with different methods and tokens without waiting for cache expiry

### Research Notes
- CCP's official position (ESI issue #916): "Game Design does not want us to have access to the names of structures that the character is not on the ACL for"
- ESI issue #643 confirmed: corporation assets include office folders that can be named via `POST /corporations/{id}/assets/names/`
- The `esi-universe.read_structures.v1` scope was removed from EVE SSO entirely — the structures endpoint works with any valid token for structures where the character has access

---

## [v3.7.4] - 2026-03-25

### Fixed
- **Login broken after better-sqlite3 migration**: Added `linux-headers` to Alpine build dependencies required by `better-sqlite3` native compilation. Changed Dockerfile to install all deps first (including devDeps for native build), then prune after compilation. This ensures the native SQLite module compiles correctly on Alpine Linux.

---

## [v3.7.3] - 2026-03-25

### Fixed
- **Multi-character structure resolution**: When one character gets 403 on a structure, the system now tries all other characters' tokens before giving up. Previously each character resolved locations independently, missing structures accessible by other characters.
- **Structure failures not cached**: Failed structure resolutions (403) are no longer cached for 1 hour. This allows retry with another character's token immediately.
- **Unique labels for unresolvable structures**: Each unresolvable player structure now shows a unique identifier (`Player Structure #XXXXXX` using last 6 digits of ID) instead of all grouping under one generic "Player Structure" label.

### Improved
- **Two-pass asset processing**: Pass 1 collects all assets and tokens from all characters. Pass 2 resolves locations using shared cache, trying multiple character tokens for structures.
- **Shared location cache**: Location resolutions are shared across all characters in a single request, avoiding duplicate ESI calls for the same structure.

---

## [v3.7.2] - 2026-03-25

### Fixed
- **Location resolution rewritten with proper ESI ID range logic**: Locations are now classified by ID range before resolution:
  - Station IDs (60M-64M) → `/universe/stations/{id}/` (public, always works)
  - System IDs (30M-33M) → `/universe/systems/{id}/` (public, always works)
  - Player structures (>1T) → `/universe/structures/{id}/` with auth (may 403 if no docking access)
  - Asset Safety (ID 2004) → labeled "Asset Safety"
  - Previously all IDs > 1B were treated as structures, causing incorrect resolution attempts
- **Visual tree indentation completely reworked**:
  - Station content indented with left border connector line (blue)
  - Container headers styled as bordered cards with orange accent
  - Container content wrapped in dedicated indented div with orange left border
  - Clear visual hierarchy: System → Station (indented) → Container (card) → Items (further indented)
- **ESI reference skill created**: Comprehensive EVE ESI API reference saved to memory for daily use — covers all endpoints, ID ranges, scopes, and location resolution patterns

### Technical Note
- Player structures that return 403 (no docking access) show "Player Structure" — this is an ESI limitation with no available workaround. The `esi-universe.read_structures.v1` scope was removed by CCP; structure names can only be resolved when the character has docking access.

---

## [v3.7.1] - 2026-03-25

### Fixed
- **Player structures no longer show raw IDs**: When the `/universe/structures/` endpoint returns 403 (no docking access), structures are labeled "Player Structure" instead of showing a 13-digit ID. When the system can't be resolved, assets group directly under the location name without an "Unknown System" wrapper.
- **Proper tree indentation**: Station-level content indented with a left border line (blue). Container content further indented with its own left border (orange). Expanded items now visually nest under their parent instead of appearing as separate full-width tables.

### Added
- **Custom container names**: Ships and containers with player-assigned names now show both the type and custom name, e.g. "Orca (My Mining Ship)". Uses ESI `POST /characters/{id}/assets/names/` endpoint.
- **Smart grouping for unresolvable locations**: When system_name can't be resolved, the location_name is used as the top-level group (no redundant "Unknown System" → "Player Structure" nesting).

---

## [v3.7.0] - 2026-03-25

### Redesigned: Hierarchical Asset Tree View
Complete rework of the Assets view from flat location grouping to a proper hierarchical tree:

#### Tree Structure
- **Level 1 — Solar System**: Top-level grouping by system name (e.g., "Rens", "Jita"), sorted alphabetically, default expanded
- **Level 2 — Station/Structure**: Station or player structure within that system, shows item count and container count, default expanded
- **Level 3 — Container**: Ships, secure containers, and other items that contain other items, shown in orange text, default collapsed, expandable to reveal contents
- **Direct hangar items** displayed directly under the station level (no container wrapper)

#### Backend Improvements
- **System name resolution**: Stations and structures now return their `system_id` from ESI, which is resolved to a system name. Each asset includes `system_name`, `location_name`, and optionally `container_name`.
- **`getLocationInfo()`**: New ESI client function that returns both station/structure name and system_id in a single call (cached 1 hour).
- **Container chain following**: Items nested multiple levels deep (item inside container inside ship) correctly resolve to the root station.

#### Frontend
- Three-level expandable tree with indented headers (system 0px, station 32px, container 52px)
- Each level has its own visual styling: system (bold white), station (blue), container (orange)
- Search filter works across all levels: item name, system, station, container, character
- Stats bar shows system count instead of location count

---

## [v3.6.4] - 2026-03-25

### Fixed
- **Full asset location chain resolution**: Items inside containers now resolve to their actual station/structure by following the parent chain (`location_type: "item"` → parent `item_id` → root station). Previously showed "In Container" with no station context.

### Added
- **Container column** in Assets table: Shows the container name (ship, hangar container, etc.) for items stored inside other items. Direct hangar items show "—".
- **Container chain following**: Backend builds an `item_id` lookup map and follows container chains up to the root station/structure, resolving names at each level.
- **Search by container name**: Filter now also matches container names (e.g., search "Orca" to find items in an Orca's fleet hangar).
- Applied to both personal and corporation asset endpoints.

---

## [v3.6.3] - 2026-03-25

### Fixed
- **Corporation Jobs broken**: Fixed `useCallback` hook ordering — `loadData` was referenced in `useEffect` before being defined, causing the component to fail silently. Moved `loadData` definition above the `useEffect` that depends on it.
- **Player structure names showing as IDs**: Assets inside containers (`location_type: "item"`) were incorrectly being resolved as structures (returning 403). Now skips ESI resolution for container items and shows "In Container" instead. Station/structure resolution only attempted for actual station and solar_system location types.
- **Assets now loads all characters by default**: No longer requires selecting a specific character. Opens with all characters' assets aggregated, with a character dropdown filter to narrow down. Shows a "Character" column when viewing all characters.

### Added
- **Character filter dropdown** on Assets view: Filter assets by character when viewing all characters, matching the Corporation Jobs filter pattern. Dropdown styled consistently with existing filter controls.
- **Search by character name**: Filter input now also matches character names.

---

## [v3.6.2] - 2026-03-25

### Fixed
- **Asset locations now show station/structure names** instead of numeric IDs. Locations are resolved via ESI: NPC stations use `/universe/stations/`, player structures use `/universe/structures/`. Results are cached for 1 hour.
- **Asset search now includes location names**: Filter input searches across item name, station name, and system name — enabling future "find everything in Jita" workflows.
- Groups in the asset view now display the resolved station/structure name as the section header.

---

## [v3.6.1] - 2026-03-25

### Added
- **ESI scope completeness indicator**: Tiny colored dot on each character's portrait in the sidebar
  - **Green dot**: All required ESI scopes are granted — character has full functionality
  - **Red dot**: One or more scopes are missing — character needs to be re-added to get new permissions
  - Visible in both expanded and collapsed sidebar states
  - Hover tooltip shows "All ESI scopes granted" or "Missing N scope(s) — re-add character to fix"
  - Backend compares stored character scopes against current `REQUIRED_SCOPES` list and returns `scopes_complete` flag and `missing_scopes` array per character

---

## [v3.6.0] - 2026-03-25

### Migrated: Frontend CRA → Vite
- **Replaced Create React App with Vite 6**: Eliminates ~1000 transitive dependencies and all associated deprecation warnings
- **Build time improvement**: Vite builds significantly faster than CRA's webpack-based build
- **Cleaner dependency tree**: From ~1300 packages down to ~300
- **All CRA-originated vulnerabilities eliminated** (26 vulnerabilities removed)
- React component files renamed from `.js` to `.jsx` (Vite convention)
- Entry point moved from `public/index.html` to root `index.html` with `<script type="module">` tag
- Environment variables changed from `REACT_APP_*` to `VITE_*` prefix
- Dev server proxy configured in `vite.config.js`

### Migrated: Backend sqlite3 → better-sqlite3
- **Replaced callback-based `sqlite3` with synchronous `better-sqlite3`**: Simpler, faster, no native build warnings
- **All sqlite3-originated vulnerabilities eliminated** (9 vulnerabilities removed: npmlog, gauge, glob, rimraf, tar, etc.)
- Database class rewritten with synchronous API (no more Promise wrappers)
- WAL journal mode enabled for better concurrent read performance
- Foreign keys enforced at connection level
- Dockerfile updated with `python3 make g++` build tools for native module compilation
- Existing database files are fully compatible (no migration needed)

### Technical Notes
- All existing functionality unchanged — both migrations are infrastructure-only
- Existing SQLite database files work without modification
- Docker build will be clean with minimal warnings

---

## [v3.5.5] - 2026-03-25

### Fixed
- **ESLint warnings eliminated**: Fixed all 3 build warnings:
  - `CorporationJobs.js`: Wrapped `loadData` in `useCallback` and added to useEffect dependency array
  - `Sidebar.js`: Wrapped `loadCharacters` in `useCallback` and added to useEffect dependency array
  - `Planets.js`: Removed unused `CC_STORAGE_CAPACITY` constant
- **Backend Dockerfile**: Changed deprecated `npm install --production` to `npm install --omit=dev`
- **Removed deprecated `crypto` npm package**: Already built into Node.js, the npm package was unnecessary (removed in v3.5.4)

### Note on remaining build warnings
- **Backend transitive deps** (npmlog, gauge, glob, rimraf, etc.): All originate from `sqlite3`'s native build tool `node-pre-gyp`. Cannot be fixed without migrating to `better-sqlite3`.
- **Frontend transitive deps** (@babel/plugin-proposal-*, workbox-*, svgo, eslint@8, etc.): All originate from `react-scripts` (Create React App, deprecated). Cannot be fixed without migrating to Vite.
- These are cosmetic warnings and do not affect runtime behavior.

---

## [v3.5.4] - 2026-03-25

### Updated
- **Node.js 18 → 22 LTS**: Updated both frontend and backend Dockerfiles from `node:18-alpine` (EOL April 2025) to `node:22-alpine` (current LTS)
- **Backend dependencies updated**:
  - express: 4.18.2 → 4.21.2
  - express-session: 1.17.3 → 1.18.1
  - sqlite3: 5.1.6 → 5.1.7
  - axios: 1.6.2 → 1.7.9
  - dotenv: 16.3.1 → 16.4.7
  - nodemon: 3.0.2 → 3.1.9
  - Removed deprecated `crypto` npm package (built-in to Node.js)
- **Frontend dependencies updated**:
  - react: 18.2.0 → 18.3.1
  - react-dom: 18.2.0 → 18.3.1
  - react-router-dom: 6.20.0 → 6.28.1
  - axios: 1.6.2 → 1.7.9

### Note
- `react-scripts` remains at 5.0.1 as it is the last released version (Create React App is deprecated by the React team). Most build warnings originate from its transitive dependencies. A future migration to Vite would eliminate these warnings entirely.

---

## [v3.5.3] - 2026-03-25

### Fixed
- **Character selection no longer forces Jobs view**: Selecting a character now stays on the current view (Assets, Planets, etc.) instead of always switching to Industry Jobs. Previously, clicking a character in the sidebar always navigated to the "jobs" view.

### Improved
- **CSS theme alignment for Assets and Planets**: Both new views now match the existing EVE dark theme used by Dashboard, Industry Jobs, and Corporation Jobs:
  - Table styling: `rgba(0,0,0,0.2)` backgrounds, `rgba(0,0,0,0.4)` headers, consistent padding (12px 16px), font-weight 600
  - Badges: pill-shaped (`border-radius: 12px`) matching existing status badges
  - Cards/sections: `border-radius: 12px`, matching `jobs-section` styling
  - Buttons: Assets tabs and PI toolbar buttons now match the auto-refresh/filter button design
  - Stat cards in colony detail now match slot-cards-grid hover effect
  - Color values aligned to existing palette (`#10b981`, `#4a9eff`, `#ff6b35`, etc.)
  - Responsive breakpoints added for mobile
  - Input fields match existing filter styling (`rgba(0,0,0,0.3)` background)

---

## [v3.5.2] - 2026-03-25

### Fixed
- **Extractor timers showing STOPPED incorrectly**: Fixed `expiry_time` being read from `pin.extractor_details.expiry_time` (wrong) instead of `pin.expiry_time` (correct ESI path). All running extractors now show proper live countdowns.
- **Name resolution throughout PI view**: Solar system IDs now resolved to actual system names (e.g., "Auga" instead of "System 30001396"). Pin types show structure names (e.g., "Extractor Control Unit" instead of type IDs). Content items show item names (e.g., "Base Metals ×534" instead of "2267×534").

### Improved
- Pin table column renamed from "Pin ID" to "Structure" showing readable type names
- Backend resolves all type IDs and system IDs before sending to frontend
- Added `getSystemNames()` to ESI client for batch solar system name resolution

---

## [v3.5.1] - 2026-03-25

### Fixed
- **Invalid ESI scope**: Removed `esi-universe.read_structures.v1` from required scopes — this scope is no longer valid in EVE SSO and was causing character authorization to fail. Structure name resolution works with any authenticated token without a dedicated scope.

---

## [v3.5.0] - 2026-03-25

### Enhanced Planetary Industry — Inspired by eve-pi

#### Live Countdown Timers
- **Real-time ticking countdowns** for all extractor expiry times (updates every second)
- **Color-coded urgency system** matching EVE conventions:
  - Red (#AB324A) — Expired / Stopped
  - Dark red (#9C4438) — Less than 2 hours
  - Brown (#765B21) — Less than 4 hours
  - Olive (#63620D) — Less than 8 hours
  - Green (#2C6C2F) — Less than 12 hours
  - Teal (#2F695A) — Less than 24/48 hours
  - Blue (#006596) — Normal / OK
- **STOPPED indicator** for extractors with no expiry time set

#### Extraction Rate Calculation
- **Units per hour (u/h)** calculated from `qty_per_cycle` and `cycle_time` for each extractor
- **Total extraction rate** displayed per colony in summary table and detail panel
- **Low extraction warning** when rate drops below 500 u/h threshold
- **Per-extractor rates** shown in colony detail pin table

#### Extractor Balance Detection
- Detects when two extractors on the same planet differ by more than 1,000 u/h
- **OFF-BAL badge** displayed on colony summary row and detail panel
- Helps optimize extractor head placement for even resource distribution

#### Storage Fill Tracking
- **Visual storage bar** with fill percentage for each colony
- Calculates used vs. total capacity across launchpads and storage facilities
- **Color-coded warnings**: green (<60%), amber (60-80%), red (>80%)
- **Tooltip** showing exact m³ used / capacity
- Uses accurate PI product volume constants (R0 through P4)

#### Alert System
- **Four alert types**: EXPIRED, OFF-BAL (off-balance), LOW (low extraction), STORAGE (>60% full)
- **Alert badges** displayed inline on colony summary rows
- **Alert count** shown in character section header
- **Alert Mode toggle** — filter to show only planets needing attention
- **Row highlighting** for colonies with active alerts
- **Color legend** in toolbar for quick reference

#### Colony Summary Table Enhancements
- Added **Rate** column showing total extraction u/h per colony
- Added **Storage** column with visual fill bar
- Added **Status** column showing alert badges
- Colony layouts **pre-fetched** in background for instant alert computation
- Earliest extractor expiry shown (not just colony-level expiry)

#### Colony Detail Panel Enhancements
- Stats grid expanded to **5 columns**: Extractors, Factories, With Contents, Extraction Rate, Storage
- Pin table now includes **Rate** column for per-extractor u/h display
- Live countdowns on individual extractor pins

### Technical
- No new ESI scopes or endpoints needed — all data from existing planet layout API
- PI product volume constants for all tiers (R0, P1, P2, P3, P4)
- Storage capacity constants for launchpads, storage facilities, and command centers
- 1-second interval timer for live countdown updates (single timer per component)

---

## [v3.4.0] - 2026-03-25

### New Features: Assets & Planetary Industry

#### Assets View
- **Personal Assets**: Browse character asset inventory with type name resolution
- **Corporation Assets**: View corp assets with role-based access (Director, Accountant, Station Manager)
- **Real-time Filtering**: Search by item name, type ID, or location ID
- **Location Grouping**: Assets grouped by location with collapsible sections, sorted by item count
- **Quantity Display**: Formatted unit counts, location flag badges, assembled/stack state indicators

#### Planetary Industry (PI) View
- **Colony Overview**: Summary table showing all planet colonies per character
- **Planet Type Colors**: Color-coded badges matching EVE planet types (temperate, barren, oceanic, ice, gas, lava, storm, plasma, shattered)
- **Upgrade Stars**: Visual star rating for colony upgrade level (1-5)
- **Expiry Countdown**: Real-time countdown showing time remaining before colony expires
- **Colony Detail Panel**: Expandable detail view with extractors, factories, storage breakdown
- **Pin Table**: Type classification (Extractor/Factory/Storage), pin ID, expiry timer, contents listing
- **Multi-Character Support**: Shows colonies for all characters or selected character

#### Backend
- **5 New API Endpoints**:
  - `GET /api/assets` — Personal character assets (paginated, supports all-characters mode)
  - `GET /api/assets/corp` — Corporation assets with role check
  - `GET /api/planets` — Planet colony listing
  - `GET /api/planets/layout` — Colony detail (pins, links, routes)
  - `GET /api/planets/customs` — Corporation customs offices
- **ESI Integration**: Paginated asset fetching (1000 items/page), colony layout with pin/link/route data
- **Role-Based Access**: Corporation assets require Director, Accountant, or Station Manager role

#### Authentication
- **4 New ESI Scopes** added to authorization flow:
  - `esi-assets.read_assets.v1` — Personal asset inventory
  - `esi-assets.read_corporation_assets.v1` — Corporation asset inventory
  - `esi-planets.manage_planets.v1` — Planetary industry colonies and layouts
  - `esi-universe.read_structures.v1` — Player structure name resolution
- **Graceful Scope Handling**: Characters without new scopes see a re-authorization prompt instead of errors

#### Navigation
- **Sidebar Updated**: Assets (📦) and Planets (🪐) added to both expanded and collapsed sidebar navigation

### Notes
- Existing characters need to be re-added to get the new ESI scopes
- No database schema changes required
- No Docker configuration changes required
- All existing functionality (Dashboard, Industry Jobs, Corp Jobs) unchanged

---

## [v3.3.10] - 2026-03-11

### Configuration Architecture
- **100% .env-Driven Configuration**: Removed all hardcoded IP addresses from codebase
- **IP-Agnostic Deployment**: Application now works with any IP address or hostname
- **No Frontend/Backend Hardcoding**: All URLs use environment variables or relative paths
- **Comprehensive Documentation**: Created `docs/CONFIGURATION.md` with deployment scenarios

### Technical
- Frontend uses relative URLs, relying on Nginx proxy configuration
- Backend reads all configuration from environment variables
- No code changes required when changing server IP or hostname

---

## [v3.3.9] - 2026-03-11

### Fixed
- **Loading Page After IP Change**: Fixed frontend getting stuck on loading screen
- **Relative URLs**: Frontend now uses relative URLs instead of hardcoded IPs
- **Nginx Proxy Configuration**: API requests properly proxied to backend

### Architecture
- Better separation between frontend and backend
- Nginx reverse proxy handles all routing
- More robust deployment architecture

---

## [v3.3.8] - 2026-03-11

### Improved
- **Multi-Deployment Support**: Updated `.env.example` with comprehensive templates
- **Deployment Options**: Support for Local IP, Hostname, Tailscale IP, and MagicDNS
- **Quick Start Guide**: Added clear deployment instructions

### Documentation
- Added deployment examples for each option
- Clearer environment variable documentation
- Simplified setup process

---

## [v3.3.7] - 2026-03-08

### Fixed
- **Job Status Calculation**: Fixed with `effectiveStatus` implementation
- **Active Jobs**: Now correctly identified when `status === 'active'`
- **Ready Jobs**: Properly detected when `end_date` has passed

---

## [v3.3.6] - 2026-03-09

### Bug Fixes
- **Corporation Jobs Scope**: Fixed to show ALL corporation jobs, not just jobs from user's characters
  - Previously filtered by `installer_id` to only show user's characters' jobs
  - Now displays all corporation member jobs as intended
- **Counter Logic Fixed**: Active and Ready jobs are now counted separately (no double counting)
  - Active: Jobs currently in progress (`status === 'active'`)
  - Ready: Jobs completed and waiting for delivery (`status === 'ready'`)
  - Fixed status filter that incorrectly treated "Ready" as "Active with time <= 0"
- **Added Ready Counter**: Stats bar now shows Total, Active, and Ready counts

### Improvements
- Accurate job status filtering following EVE ESI status values
- Clear visual separation of job states in stats display

## [v3.3.5] - 2026-03-08

### UI Improvements
- **Font Size Consistency**: Sidebar logo "EVE Industry" now matches main header font size (22px)
- **Subtle Collapse Button**: Toned down brightness - changed from bright blue border to subtle white border
  - Now uses `rgba(255, 255, 255, 0.2)` instead of `#4a9eff`
  - More consistent with overall dark theme
- **Character Count Repositioned**: Moved count badge to right side of "All Characters" row
  - Clearer visual association with character list
  - Updated styling to match theme colors

## [v3.3.4] - 2026-03-08

### Fixed
- **Safari Favicon Support**: Added Safari-specific favicon meta tags
  - Added `apple-touch-icon` with proper link order (Safari prefers these first)
  - Added `mask-icon` for Safari pinned tabs
  - Added `apple-mobile-web-app-title`, `apple-mobile-web-app-capable`, and `apple-mobile-web-app-status-bar-style` meta tags
  - Cache-busting updated to `?v=3.3.4`

- **Expanded Sidebar Logo Still Not Displaying**: Fixed persistent logo issue
  - `logo.svg` had corrupted/invalid `xmlns` attribute pointing to random URLs
  - Completely rewrote `logo.svg` with proper `xmlns="http://www.w3.org/2000/svg"` namespace
  - Logo now displays correctly in expanded sidebar

- **Collapse/Expand Arrow Only Showing Half**: Fixed toggle button being clipped
  - Changed sidebar `overflow` from `auto` to `visible` to prevent button clipping
  - Increased toggle button size from 24px to 28px
  - Added proper blue border (`#4a9eff`) for better visibility
  - Increased `z-index` to 1000 for reliable layering
  - Added `box-shadow` for depth
  - Added hover scale effect for better UX

### Technical
- Sidebar content areas (`.sidebar-collapsed`, `.collapsed-characters`) now handle their own scrolling
- Toggle button styling improved for mobile responsiveness

---

## [v3.3.3] - 2026-03-08

### Fixed
- **Collapsed Sidebar Scrollbar**: Hidden scrollbar completely while maintaining scroll functionality
  - Scrollbar no longer obscures character portraits
  - "+ Add Character" button fully visible at bottom
  - Uses `scrollbar-width: none` (Firefox) and `-webkit-scrollbar: display: none` (Chrome/Safari)

- **Sidebar Background Height**: Fixed sidebar background cutting off at viewport bottom
  - Sidebar now uses `position: fixed` with `height: 100vh`
  - Background extends properly when scrolling
  - Main content uses `margin-left` to accommodate fixed sidebar

- **Expanded Sidebar Logo Not Displaying**: Fixed broken logo showing "?"
  - Corrected invalid `xmlns` namespace in `logo.svg`
  - Was: `https://uxwing.com/wp-content/themes/uxwing/download/web-app-development/sidebar-panel-expand-icon.svg` (invalid URL)
  - Fixed to: `http://www.w3.org/2000/svg` (proper SVG namespace)

- **Browser Tab Favicon**: Fixed favicon not displaying in any browser
  - Created proper `.ico` file with multiple sizes (16x16, 32x32, 48x48)
  - Created PNG fallbacks: `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`
  - Updated `index.html` with proper favicon link order for cross-browser support
  - Chrome, Firefox, Safari, Opera, and Edge all display favicon correctly

### Added
- **Cross-Browser Favicon Support**: Multiple favicon formats for full compatibility
  - `favicon.ico` - Multi-size ICO for IE/Edge/Chrome
  - `favicon-16x16.png` - Small PNG for modern browsers
  - `favicon-32x32.png` - Standard PNG favicon
  - `apple-touch-icon.png` - 180x180 for iOS devices
  - `favicon.svg` - Scalable SVG (browsers that support it)

### Technical
- Sidebar state (collapsed/expanded) now managed in `Main.js` for proper margin coordination
- Main content area uses `margin-left` transition for smooth sidebar toggle
- Cache-busting updated to `?v=3.3.3` for all favicon links

---

## [v3.3.2] - 2026-03-08

### Fixed
- **Favicon Not Displaying**: Fixed incorrect xmlns attribute in favicon.svg that prevented browser display
  - Corrected `xmlns` from invalid URL to proper `http://www.w3.org/2000/svg`
  - Added cache-busting query parameter to favicon link

- **Header Alignment (Final Fix)**: Properly aligned sidebar header with main content header
  - Both headers now have explicit `height: 54px` with `box-sizing: border-box`
  - Matching background color `rgba(0, 0, 0, 0.3)` for visual consistency
  - Fixed both expanded and collapsed states

- **Scrollbar Blocking Portraits**: Increased collapsed sidebar width to prevent scrollbar overlap
  - Collapsed sidebar width increased from 60px to 80px
  - Character portrait items increased to 56x56px with centered 42x42px portraits
  - Better visual balance and more breathing room

- **Navigation Bar Height**: Fixed navigation not extending to full page height
  - Added `flex-shrink: 0` and `margin-top: auto` to `.sidebar-nav`
  - Navigation now stays at bottom of sidebar regardless of character count
  - Sidebar characters section properly scrolls while navigation remains fixed

### Added
- **Application Logo**: Replaced "CHARACTERS" text with EVE Industry logo
  - Created new `logo.svg` with gear icon and "EVE Industry" text
  - Logo matches application theme with gradient styling
  - Shown in expanded sidebar header

### Changed
- Collapsed sidebar icons/portraits enlarged for better visibility (36px → 42px)
- Sidebar padding adjusted for wider collapsed state

## [v3.3.1] - 2026-03-08

### Fixed
- **Dashboard Job Numbers**: Fixed incorrect calculation of personal vs corp job breakdown
  - Backend now correctly tracks `personal_jobs_by_activity` and `corp_jobs_by_activity` separately
  - Frontend displays accurate "(X personal + Y corp)" breakdown for each job type
  - Manufacturing, Science, and Reactions cards all show correct numbers
  
- **Sidebar Alignment**: Fixed alignment between sidebar header and main content header
  - Both headers now have matching height (54px) for visual consistency
  - Added matching background styling

- **Collapsed Sidebar Scrollbar**: Fixed scrollbar blocking character portraits when sidebar is collapsed
  - Implemented thin (4px) custom scrollbar that doesn't overlap portraits
  - Uses overlay-style scrollbar with transparent track
  - Works on both Firefox (scrollbar-width: thin) and Chrome/Safari (webkit-scrollbar)

- **Collapsed Sidebar Icon**: Changed collapsed sidebar top icon from activity-specific emoji to neutral EVE icon
  - Now uses the application favicon (gear icon) for brand consistency
  - No longer shows the "My Industry Jobs" factory emoji when collapsed

### Added
- **Browser Tab Favicon**: Added EVE-themed favicon with industry gear icon
  - SVG format for crisp display at all sizes
  - Gradient styling matching application theme (#667eea to #764ba2)
  - Updated theme-color meta tag to match app background

---

## [v3.3.0] - 2026-03-08

### Features
- **Hover-to-Highlight Character Availability**: New interactive feature for dashboard
  - Hover over Manufacturing, Science, or Reactions job type cards to highlight character availability
  - Characters with free slots remain at normal brightness (100% opacity)
  - Characters with full slots for that job type are dimmed (40% opacity)
  - Smooth 0.3s transition animation
  - Visual feedback: hovered job type card gets a glowing border
  - Mobile/touch support: tap to toggle the highlight effect
  - Accessibility: ARIA labels and keyboard focusable cards

### UX Improvements
- Easier to quickly identify which characters can take more jobs of a specific type
- Interactive slot cards with cursor pointer and hover effects
- Smooth transitions for better visual experience

---

## [v3.2.1] - 2026-03-08

### Fixed
- **Reaction Slot Calculation Bug**: Fixed incorrect skill IDs for reaction slot calculation
  - **Previous (incorrect)**: Used skill IDs 45746 (Reactions) and 45748 (Mass Reactions)
  - **Fixed (correct)**: Now uses 45748 (Mass Reactions) and 45749 (Advanced Mass Reactions)
  - 45746 is the base "Reactions" skill (reduces time, doesn't add slots)
  - 45748 is "Mass Reactions" (+1 slot per level)
  - 45749 is "Advanced Mass Reactions" (+1 slot per level)
  - Characters like Akira Tendo now show correct reaction slots (e.g., R: 1/2 instead of R: 1/6)

---

## [v3.2.0] - 2026-03-08

### Changed
- **Application Renamed**: "EVE ESI Dashboard" → "EVE Industry Tracker"
  - Updated all references: page titles, login page, header, documentation
  - More descriptive name reflecting the application's purpose

### Added
- **Auto-Refresh Feature**: New auto-refresh button in dashboard header
  - Dropdown with options: Off, 5 minutes, 10 minutes, 15 minutes
  - Visual indicator (spinning icon) when auto-refresh is active
  - Setting persisted in localStorage
  - Located next to the manual refresh button

- **Collapsed Sidebar Icons**: Sidebar now shows content when collapsed
  - Navigation icons remain visible (Dashboard, My Industry Jobs, Corporation Jobs)
  - Character portraits displayed as small thumbnails
  - Add Character button accessible
  - Tooltips on hover showing full names
  - Smooth transitions between states

- **Dashboard Job Breakdown Format**: Main dashboard now shows job breakdown
  - Slot cards display "(X personal + Y corp)" format
  - Matches the format used in My Industry Jobs page
  - Clear visibility of personal vs corporation job distribution

### Fixed
- **Character Overview Slot Numbers**: Verified and confirmed slot calculations
  - Manufacturing: 1 + Mass Production + Advanced Mass Production
  - Science: 1 + Laboratory Operation + Advanced Laboratory Operation
  - Reactions: 1 + Mass Reactions + Advanced Mass Reactions
  - Active job counting includes both personal and corp jobs (where character is installer)

- **Corporation Industry Section Repositioned**: Now appears BELOW Characters Overview
  - Reduced font size for a more compact appearance
  - Aligned styling with Characters Overview section
  - "Corps with Access" and "Corp Active Jobs" use consistent layout

- **Dashboard Alignment**: Fixed alignment issues throughout dashboard
  - Characters Overview and Corporation Industry sections now aligned
  - Consistent padding and margins across all sections

### Technical Details
- `Dashboard.js`: Added `autoRefreshInterval` state with localStorage persistence
- `Dashboard.css`: Added auto-refresh button styles, dropdown styles, overview row styles
- `Sidebar.js`: Added collapsed state rendering with icons and mini portraits
- `Sidebar.css`: Added `.sidebar-collapsed`, `.collapsed-*` styles for collapsed state
- Multiple files updated for rename: `index.html`, `Main.js`, `Login.js`, `Dashboard.js`

---

## [v3.1.1] - 2026-03-07

### Changed
- Updated documentation to use generic IP placeholders instead of real IP addresses
- Added backward compatibility note for v3.1.0 changes
- Clarified that existing users do not need to update .env file

### Documentation
- Replaced all instances of hardcoded IP with `YOUR_SERVER_IP` placeholder
- Added explanation for determining server IP (localhost, LAN IP, public IP)
- Updated `.env.example` with clearer placeholder and comments
- Added prominent backward compatibility note at top of README.md

---

## [v3.1.0] - 2026-03-07

### Added
- **Configurable PORT** via environment variable for multi-instance deployment
- **SERVER_IP** environment variable for dynamic callback URL configuration
- **PROJECT_NAME** environment variable for unique Docker container names per instance
- **Multi-Instance Deployment Guide** in README.md with step-by-step instructions
  - Setup instructions for each user/instance
  - EVE Developer Application configuration (separate or shared)
  - Container naming and management
  - Firewall configuration examples

### Changed
- `docker-compose.yml` now uses `${PORT:-9000}` instead of hardcoded port 9000
- `docker-compose.yml` includes `name:` field for Docker Compose project naming
- Removed hardcoded container names to allow multiple instances
- Environment variables table in README now includes default values

### Technical Details
- Backend callback URL dynamically constructed from `SERVER_IP` and `PORT`
- Frontend port mapping uses `${PORT:-9000}:80`
- Each instance gets isolated containers with unique names based on `PROJECT_NAME`
- Backward compatible: defaults work without any `.env` changes

---

## [v3.0.11] - 2026-03-07

### Documentation
- **Comprehensive Installation Guide** - Added step-by-step instructions for new users
  - Prerequisites and requirements
  - EVE Developer Application setup with all ESI scopes
  - Environment configuration
  - Docker deployment steps
  - Verification procedures

- **Updated Required ESI Scopes** - Fixed missing scope in Setup section
  - Added `esi-characters.read_corporation_roles.v1` (was missing from Setup section)
  - All five required scopes now documented in multiple locations

- **Expanded Troubleshooting Section**
  - "invalid_scope" error resolution
  - Container startup issues
  - Callback URL mismatches
  - Corporation access problems
  - Database reset instructions

- **Update/Upgrade Guide** - How to update to latest version
  - Standard update procedure
  - When to re-authorize characters
  - How to check CHANGELOG for breaking changes

- **Contributing Guidelines** - Documentation standards for future updates
  - When to update README.md
  - Breaking change documentation requirements

---

## [v3.0.10] - 2026-03-02

### Fixed
- **Dashboard Slot Count Now Includes Corporation Jobs**
  - Fixed the My Industry Jobs dashboard to show total job count (personal + corp) in the main slot numbers
  - Previously displayed only personal jobs: `3/132` when it should show `21/132`
  - Now correctly calculates: Manufacturing, Science, and Reactions slots all include corp jobs
  - The breakdown text `(X personal + Y corp)` was already correct; now the main number matches the total

### Technical Details
- `IndustryJobs.js`:
  - Added `setSlots()` update after calculating breakdown to set `current` to `personal + corp` for each activity type
  - Example: Manufacturing `current = breakdown.manufacturing.personal + breakdown.manufacturing.corp`

### Expected Results
- Manufacturing: 21/132 (3 personal + 18 corp) - main number now shows 21, not 3
- Science: 35/138 (3 personal + 32 corp) - main number now shows 35, not 3
- Reactions: 8/119 (0 personal + 8 corp) - main number now shows 8, not 0
- Color coding now reflects true total utilization percentage

---

## [v3.0.9] - 2026-03-02

### Fixed
- **Blueprint Images in My Industry Jobs**
  - Fixed `getBlueprintIcon()` function that was returning hardcoded YouTube thumbnail URLs
  - Now correctly uses EVE Image Service URLs:
    - BPC (Blueprint Copy): `https://i.ytimg.com/vi/T4MU5kqWlqs/sddefault.jpg`
    - BPO (Blueprint Original): `https://i.ytimg.com/vi/P-kdAM0I1EE/hqdefault.jpg`
    - Fallback: `https://upload.wikimedia.org/wikipedia/commons/3/36/EVEOnlineLogo.png`
  - Both Personal Jobs and Corporation Jobs sections now display correct blueprint icons

- **Corporation Jobs Filtering in My Industry Jobs**
  - Fixed filtering when "All Characters" is selected
  - Previously showed ALL corporation jobs including those from non-authorized installers
  - Now correctly filters to show only jobs where the installer is one of the user's authorized characters
  - Uses `authorizedCharacterIds` array to filter corp jobs regardless of character selection

### Technical Details
- `IndustryJobs.js`:
  - `getBlueprintIcon()`: Fixed to return EVE Image Service URLs instead of YouTube thumbnails
  - Added proper `authorizedCharacterIds` array from `characters.map(char => char.character_id)`
  - Applied filter `corpJobsList.filter(job => authorizedCharacterIds.includes(job.installer_id))` for "All Characters" view

---


### Added
- **Personal/Corp Job Breakdown** - Industry Jobs slot cards now show detailed breakdown
  - Format changed from "X/Y" to "X/Y (Z personal + W corp)"
  - Shows exactly how many slots are used by personal vs corporation jobs
  - Applies to Manufacturing, Science, and Reactions cards

### Changed
- **Navigation Renamed** - "Industry Jobs" → "My Industry Jobs"
  - Better reflects that this page shows the user's personal industry activity

- **Corporation Jobs - Filtered to Authorized Characters**
  - Now only shows corp jobs where one of your linked characters is the installer
  - Effectively makes this "My Corporation Jobs"
  - Stats update to reflect filtered job counts

- **Blueprint Images Fixed**
  - Now uses correct EVE Image Service URLs
  - Properly distinguishes between BPC (copies) and BPO (originals)
  - BPC URL: https://i.ytimg.com/vi/T4MU5kqWlqs/sddefault.jpg
  - BPO URL: https://i.ytimg.com/vi/P-kdAM0I1EE/hqdefault.jpg
  - Fallback to icon if blueprint image unavailable

- **Corporation Summary Cards - Now Collapsible**
  - Cards default to collapsed state, showing "X characters - Role ▼"
  - Click to expand and see individual character names
  - Smooth animation on expand/collapse
  - Saves vertical space on the Corporation Jobs page

### Technical Details
- Added `slotBreakdown` state to track personal vs corp job counts by activity
- Added `expandedCorps` state for collapsible card management
- `getBlueprintIcon()` now accepts `runs` parameter to determine BPC vs BPO
- Corp jobs filtered by `authorizedCharacterIds.includes(job.installer_id)`
- CSS animations for smooth expand/collapse transitions

---

## [v3.0.7] - 2026-03-02

### Added
- **UI Improvements with EVE-inspired color scheme**

### Changed
- **Dashboard - Job Slot Summary**
  - Split single-row slot summary into grid of three separate cards
  - Manufacturing card with orange/red color (#ff6b35)
  - Science card with blue color (#4a9eff)
  - Reactions card with green color (#10b981)

- **Dashboard - Corporation Stats**
  - Simplified role display - now groups characters by role
  - Shows "X characters - Role" instead of listing each character
  - Cleaner, more scannable layout

- **Dashboard - Characters Overview**
  - Added EVE colors to M:/S:/R: slot indicators
  - M: (Manufacturing) = orange/red with colored background
  - S: (Science) = blue with colored background
  - R: (Reactions) = green with colored background

- **Industry Jobs Page - Job Slot Summary**
  - Updated to grid format matching dashboard
  - Three separate cards with EVE colors
  - Same visual style for consistency

- **Industry Jobs Page - Corporation Jobs Section**
  - Added new "Corporation Jobs" section below "Personal Jobs"
  - Shows corp jobs where the character is the installer
  - Applies same filters (activity, status) to both sections
  - Visual distinction with corp-themed styling

### Technical Details
- **EVE Color Palette**:
  - Manufacturing: #ff6b35 (orange/red)
  - Science: #4a9eff (blue)
  - Reactions: #10b981 (green)
- Activity badges in job tables now use EVE colors
- CSS variables added for consistent color usage

---

## [v3.0.6] - 2026-03-01

### Fixed
- **Fixed maximum slot calculation for reactions**
  - Added missing Advanced Mass Reactions skill (ID: 45748) to slot calculation
  - Reactions now correctly use base 1 slot + Mass Reactions + Advanced Mass Reactions
  - Example: Character with Mass Reactions V + Advanced Mass Reactions IV now shows 0/10 instead of 0/5

### Technical Details
- **Corrected skill IDs**:
  - Mass Reactions: 45746 (+1 slot per level, max 5)
  - Advanced Mass Reactions: 45748 (+1 slot per level, max 5)
- **Corrected formula**: `reactionSlots = 1 + massReactionsLevel + advMassReactionsLevel`
- **Verified all slot types**:
  - Manufacturing: 1 + Mass Production + Advanced Mass Production (max 11)
  - Science: 1 + Laboratory Operation + Advanced Laboratory Operation (max 11)
  - Reactions: 1 + Mass Reactions + Advanced Mass Reactions (max 11)

---

## [v3.0.5] - 2026-03-01

### Fixed
- **Fixed dashboard activity type calculation to include corporation jobs**
  - Previously, corporation jobs were not counted in the activity type totals (Manufacturing, Science, Reactions)
  - Dashboard now correctly shows combined slot usage: "Science jobs: 9/31" instead of "0/31"
  - Activity breakdown (Manufacturing/Science/Reactions) now includes both personal AND corp jobs

### Technical Details
- **Two-pass approach**: First fetches all corp jobs, then calculates per-character stats
- **Correct slot attribution**: Corp jobs are attributed to their installer (the character who started the job)
- **Shared slot calculation**: Slots are correctly calculated as (personal + corp) jobs against max slots
- **Activity mapping**: Corp jobs activity IDs (1=Manufacturing, 3/4/5/7/8=Science, 9=Reactions) properly mapped to categories
- Added `activity_breakdown` field to character stats for per-character activity counts

---

## [v3.0.4] - 2026-03-01

### Improved

#### Dashboard - Corporation Jobs Integration
- Dashboard now includes corporation jobs in character statistics
- Total active jobs shows combined count (personal + corp jobs)
- New breakdown display: "X personal + Y corp" under total jobs
- Character cards show combined job counts with detailed breakdown when corp jobs exist

#### Reversed Color Coding Logic
- **High utilization is now GREEN** (industry best practice - maximize slot usage to earn more ISK)
- Color thresholds updated:
  - 80-100% utilization = **Green** (excellent)
  - 40-79% utilization = **Yellow** (okay)
  - 0-39% utilization = **Red** (poor utilization, wasting potential income)
- Updated both slot summaries and progress bars

#### Corporation Jobs - Character Filter
- Added new "Character" filter dropdown to Corporation Jobs page
- Filter options:
  - "All Characters" (default) - shows all corp jobs
  - Individual character names - shows only jobs started by that character
- Filter works alongside existing corporation, activity, and status filters

### Technical Details
- Backend: `getDashboardStats` now fetches corporation jobs per character
- Frontend: New slot classes `slot-high`, `slot-medium`, `slot-low` replace old naming
- CorporationJobs component now loads character list for filter dropdown

---

## [v3.0.2] - 2026-03-01

### Fixed
- **Fixed corporation role detection**: Re-added `esi-characters.read_corporation_roles.v1` scope which IS required by the ESI API. The previous version incorrectly removed this scope, causing "No Corporation Access" errors even for characters with Director or Factory Manager roles.

### Changed
- Updated required scopes to include all necessary scopes:
  - `esi-industry.read_character_jobs.v1` - Personal industry jobs
  - `esi-skills.read_skills.v1` - Job slot calculation
  - `esi-industry.read_corporation_jobs.v1` - Corporation industry jobs
  - `esi-corporations.read_corporation_membership.v1` - Corporation membership
  - `esi-characters.read_corporation_roles.v1` - **Reading character corporation roles (Director/Factory_Manager check)**

**⚠️ BREAKING CHANGE**: All characters must be re-authorized to fix corporation access. Characters authorized with v3.0.1 will need re-authorization.

### Re-authorization Required
After updating:
1. Log into the application
2. Click "Re-authorize Characters" button (or remove and re-add characters)
3. Authorize with EVE SSO (will request new permissions)

---

## [v3.0.1] - 2026-03-01 (SUPERSEDED by v3.0.2)

### Fixed
- **Incorrectly removed ESI scope**: This version erroneously removed the `esi-characters.read_corporation_roles.v1` scope believing it was invalid. This caused corporation role detection to fail. **See v3.0.2 for the fix.**

### Changed
- Updated required scopes (incomplete - see v3.0.2)

## [v3.0.0-alpha] - 2026-03-01 (Phase 3A-1: Corporation Industry Jobs)

### Added

#### Corporation Industry Jobs
- **New "Corporation Jobs" view** in sidebar navigation
- View industry jobs across all corporations you have access to
- Corporation summary cards showing:
  - Corporation name and ticker
  - Characters with industry roles (Director/Factory Manager)
- Jobs table with corporation-specific columns:
  - Corporation ticker and name
  - Installer name (who started the job)
  - All existing job fields (blueprint, activity, progress, time remaining)

#### Corporation Roles Support
- Automatic detection of Director and Factory Manager roles
- Clear messaging when characters lack required roles
- Role badges showing access level per character

#### New ESI Scopes
- `esi-industry.read_corporation_jobs.v1` - Required for corp industry jobs
- `esi-corporations.read_corporation_membership.v1` - Required for corp membership
- *Note: Character roles don't require a special scope (fixed in v3.0.1)*

**⚠️ BREAKING CHANGE**: All characters must be re-authorized to use corporation features. Characters authorized before this update will not have the required scopes.

#### Dashboard Updates
- Corporation industry summary section
- Shows corporations with industry access
- Active corp job count
- Quick access to corporation roles

#### Backend Enhancements
- New `corporationService.js` - Corporation data handling
- New API endpoints:
  - `GET /api/corporations` - List all user's corporations
  - `GET /api/corporation/jobs` - All corporation jobs
  - `GET /api/corporation/jobs/:characterId` - Corp jobs for specific character
  - `GET /api/corporation/roles/:characterId` - Character's corp roles
- Corporation data caching (1 hour)
- Graceful error handling for missing roles/scopes

#### Frontend Components
- `CorporationJobs.js` - Full corporation jobs view
- `CorporationJobs.css` - Styling with blue accent theme
- Corporation filter dropdown
- Activity and status filters
- Real-time countdown timers

### How to Update
```bash
cd ~/docker/eve_esi_app
git pull origin main
docker-compose down
docker-compose up -d --build
```

### Re-authorization Required
After updating, all characters need to be re-authorized:
1. Log into the application
2. Remove existing characters (×button in sidebar)
3. Click "Add Character" to re-link with new scopes
4. Authorize with EVE SSO (will request new permissions)

### Notes
- Only characters with Director or Factory Manager role can view corp jobs
- Multiple corporations supported (if you have alts in different corps)
- Personal jobs and corporation jobs are shown separately

---

## [v2.0.2] - 2026-03-01

### Added
- **Delete Character Button**: Visible "×" button appears on hover in sidebar
  - Confirmation dialog before deletion
  - Refreshes character list after removal
  - Warns about re-adding with updated permissions
- **Scope Warning Banner**: Dashboard shows warning when characters need re-authorization
  - Highlights characters with missing skills scope
  - Shows "⚠️ Re-auth needed" badge on affected characters
  - Clear instructions for users

### Improved
- Better error handling for missing `esi-skills.read_skills.v1` scope
  - Returns `needsReauthorization: true` flag in API responses
  - Shows base slot values (1/1/0) when scope is missing
  - No longer shows "Failed to fetch" errors
- Character cards highlight when needing re-authorization
- CSS styling for delete button, modal, and warning badges

### How to Use Delete Feature
1. Hover over a character in the sidebar
2. Click the "×" button that appears
3. Confirm deletion in the modal
4. Use "Add Character" to re-link with correct scopes

### Deployment
```bash
cd ~/docker/eve_esi_app
git pull origin main
docker-compose down
docker-compose up -d --build
```

---

## [v2.0.1] - 2026-03-01

### Fixed
- Fixed token refresh error: "Client credentials should only be provided once"
  - Removed `client_id` from token refresh request body in `tokenRefresh.js`
  - Credentials now sent exclusively via Authorization header (Basic Auth)
- Added `esi-skills.read_skills.v1` scope to required scopes
  - Needed for fetching character skills to calculate max job slots
  - **Note: Existing characters must be re-authorized to get the new scope**

### How to Apply Fix
```bash
# On your server, pull the latest code
cd ~/docker/eve_esi_app
git pull origin main

# Rebuild containers
docker-compose down
docker-compose up -d --build
```

After rebuilding, users need to re-authorize their EVE characters:
1. Log into the application
2. Remove existing characters (click character → delete)
3. Re-link characters using "Add Character" button

---

## [v2.0.0] - 2026-02-28

### Added

#### Multiple Character Support
- Support for linking multiple EVE characters per user account
- New database methods for managing multiple characters
- Character deletion functionality
- Backend endpoints for multi-character operations

#### Sidebar Navigation
- Collapsible sidebar component with character list
- Character portraits with thumbnail display
- Quick character switching functionality
- Navigation items: Dashboard, Industry Jobs
- "Add Character" button for linking additional characters
- Responsive design with mobile support

#### Dashboard
- New Dashboard view with aggregate statistics
- Total job slot summary across all characters
- Per-character job counts and slot usage
- Jobs breakdown by activity type with visual bars
- Character cards with avatar, name, and stats

#### Enhanced Industry Jobs Table
- EVE-like time remaining display (XD HH:MM:SS format)
- Real-time countdown timer updates every second
- Blueprint icons from EVE image service
- Blueprint names resolved from ESI
- Activity type badges with color coding
- Progress bars showing job completion percentage
- Installer names fetched from ESI
- Status badges: Active, Ready, Delivered, Paused, Cancelled

#### Job Slot Tracking
- Manufacturing, Science, and Reaction slot tracking
- Slot counts calculated from character skills:
  - Mass Production, Advanced Mass Production
  - Laboratory Operation, Advanced Laboratory Operation
  - Reactions skill
- Color-coded indicators: Green/Yellow/Red based on usage

#### Filters
- Activity type filter: All, Manufacturing, Science, Reactions
- Status filter: All, Active, Ready, Delivered
- Character filter via sidebar selection
- "All Characters" view for aggregate data

#### Backend Enhancements
- `GET /api/characters` - List all linked characters
- `GET /api/characters/:characterId` - Get specific character
- `DELETE /api/characters/:characterId` - Remove character
- `GET /api/industry/slots` - Job slot usage endpoint
- `GET /api/dashboard/stats` - Dashboard statistics
- Enhanced ESI client with:
  - Type name caching and batch fetching
  - Character skills fetching
  - Job slot calculation
  - Installer name resolution

### Changed
- Main layout now uses sidebar + content area design
- Industry jobs table redesigned with EVE-like aesthetics
- Dark theme refined with EVE Online-inspired styling
- API endpoints support `all=true` query parameter
- Character controller supports multi-character operations

### Technical Details

#### New Components
- `Sidebar.js` - Navigation sidebar with character list
- `Dashboard.js` - Statistics overview page
- `JobSlotSummary.js` - Job slot display component

#### Updated Components
- `Main.js` - New layout with sidebar integration
- `IndustryJobs.js` - Complete rewrite with enhanced features
- `CharacterInfo.js` - Simplified for use with sidebar

#### New CSS Files
- `Sidebar.css`
- `Dashboard.css`
- `JobSlotSummary.css`

#### Backend Changes
- `db.js` - Added `getAllCharactersByUserId`, `deleteCharacter`, `getCharacterByDbId`
- `esiClient.js` - Added skill fetching, slot calculation, name resolution
- `characterController.js` - New endpoints for multi-character support
- `api.js` - Updated routes for new endpoints

### Deployment
```bash
# Rebuild both containers
docker-compose down
docker-compose up -d --build

# Or rebuild individually
docker-compose build backend frontend
docker-compose up -d
```

---

## [v1.0.3] - 2026-02-28

### Fixed
- Fixed "Client credentials should only be provided once" OAuth2 error
- Removed duplicate client_id from token exchange request body
- Credentials now sent exclusively via Authorization header

---

## [v1.0.2] - 2026-02-28

### Fixed
- Fixed "Cannot GET /auth/callback" routing error
- Added `/callback` route to auth routes
- Updated nginx proxy configuration

---

## [v1.0.1] - 2026-02-28

### Fixed
- Fixed "invalid_scope" error by using correct ESI scope name
- Changed from `esi-corporations.read_corporation_membership.v1` to `esi-industry.read_character_jobs.v1`

---

## [v1.0.0] - 2026-02-28

### Added
- Initial release
- Simple username/password authentication
- Single EVE character linking via SSO
- Basic industry jobs display
- Character portrait display
- Docker containerization
- SQLite database