# EVE Industry Tracker

**Current Version:** v5.16.3 | **Build Date:** 2026-04-22

A comprehensive web application for tracking EVE Online industry jobs, assets, planetary industry, and character management across multiple characters and corporations.

---

## Environments

| Environment | URL |
|---|---|
| Production | https://eve.lothriell.com |
| Development | https://dev-eve.lothriell.com |

---

## Features

### Character Page
- **Dedicated character view** — click any character in the sidebar for full details
- **Corporation & Alliance** display with EVE logos
- **Skill queue** — EVE-style level boxes, expandable queue table, training timeline bar
- **Per-character net worth** — asset value + wallet balance
- **Personal & Corporation industry jobs** with progress bars and locations
- **Planetary industry** — extractor expiry countdown + launchpad storage fill bar

### Dashboard
- **Job slot summary** — manufacturing/science/reactions with personal + corp breakdown
- **Character overview grid** — drag-to-reorder, skill training, slot badges
- **Per-character asset value** — amber boxes with ISK formatting
- **Corporation industry** summary with role-based access
- **Auto-refresh** — Off / 5m / 10m / 15m intervals
- **Hover-to-highlight** — hover job type cards to see which characters have free slots

### My Industry Jobs
- Personal + corporation jobs in unified table
- Character, activity, and status filters
- Blueprint icons (BPC/BPO distinction), live countdown timers
- External lookups (Fuzzwork, EVE Ref, zKillboard) on blueprints and installers
- CSV/JSON export

### Corporation Jobs
- All corporation jobs across all corps with industry access
- Character, corporation, activity, and status filters
- Role-based access (Director / Factory Manager)
- Collapsible corporation summary cards
- CSV/JSON export

### Assets
- Personal and corporation asset inventory
- Tree view (System > Station > Container > Items) and Value view (flat, sorted by ISK)
- Three price modes: AVG Price, Jita Sell, Jita Buy
- **BPO/BPC badges** — blueprint originals and copies labeled in search results
- Character filter, text search, collapse/expand all
- Manual structure naming for unresolved player structures
- External lookups on item names
- CSV/JSON export

### Planetary Industry
- Colony overview with list and grid views
- **Product icons + tier badges** (P1–P4) on grid cards and list table
- **Enhanced colony statuses** — Active, Producing, Waiting, Stopped, Attention, Setup, Idle with reason text
- **Color-coded storage breakdown** by PI tier (P0 gray, P1 blue, P2 teal, P3 gold, P4 green)
- **Estimated storage value** — Jita sell price per planet with per-item breakdown tooltip
- Live countdown timers with 8-level color urgency
- Extraction rate calculation + balance detection
- Storage fill tracking with visual bars and alerts
- Alert mode filter (EXPIRED, OFF-BAL, LOW, STORAGE)
- Extraction prediction bar graphs per extractor (HiDPI sharp)
- Character filter, auto-refresh with countdown
- CSV/JSON export

### Cross-Cutting Features
- **EVE SSO authentication** — no passwords, first login creates account
- **Multi-character support** — unlimited characters with alt linking
- **External lookups** — Fuzzwork, EVE Ref, zKillboard, Dotlan on items/systems/characters
- **CSV/JSON export** on all table views
- **Net worth tracking** — per-character asset values + wallet balances on dashboard and character page
- **Wealth history chart** — hourly snapshots with 1D/1W/1M/3M/6M/1Y/MAX views, per-character deduplication
- **Wallet journal** — Overview (donut chart), Transactions, Market Transactions, and All tabs with filters and export
- **EVE-inspired dark theme** with responsive design

---

## Architecture

```
Browser → Cloudflare Tunnel → Nginx (frontend pod)
            → /auth/*, /api/* proxied to Backend pod (port 3001)
            → /* serves React SPA from /build
```

- **Frontend**: React 18 + Vite 6
- **Backend**: Express.js on Node 22 Alpine
- **Database**: SQLite (better-sqlite3) on Longhorn PVC
- **Auth**: EVE SSO OAuth2 with PKCE
- **Deployment**: K8s (ArgoCD + Kustomize) / Docker Compose (test)
- **Images**: Gitea registry (`gitea.homielab.omg`)

---

## Required ESI Scopes

| Scope | Purpose |
|-------|---------|
| `esi-industry.read_character_jobs.v1` | Personal industry jobs |
| `esi-skills.read_skills.v1` | Skills for slot calculation |
| `esi-skills.read_skillqueue.v1` | Skill training queue |
| `esi-industry.read_corporation_jobs.v1` | Corporation industry jobs |
| `esi-corporations.read_corporation_membership.v1` | Corporation membership |
| `esi-characters.read_corporation_roles.v1` | Director/Factory Manager role check |
| `esi-assets.read_assets.v1` | Personal assets |
| `esi-assets.read_corporation_assets.v1` | Corporation assets |
| `esi-planets.manage_planets.v1` | Planetary industry |
| `esi-universe.read_structures.v1` | Player structure names |
| `esi-wallet.read_character_wallet.v1` | Wallet balance + journal + transactions |

---

## Recent Updates

### v5.9.0 (2026-04-04)
- Production Planner — recursive build tree with BPO/BPC ownership badges
- Resolves 4 levels deep, build-or-buy per component, shopping list with multi-buy
- Reaction chains, facility config, missing blueprints tab, import calculator
- Capital ship support with contract price comparison
- Halo Logistics shipping formula with packaged ship volumes
- EVE-accurate job cost formula (EIV × CI × structure bonus + facility tax + SCC surcharge)
- TE reduction with structure time bonuses, crosschecked against in-game Thanatos build
- Job Scheduler: auto-detect 139 mfg / 122 react slots, split jobs, parallel time calc
- "Build All" toggle, "Don't split" threshold, Jobs tab with Ravworks-style categories
- EVE type icons on tree nodes, job tables, and shopping list
- PI factory planet status fix, BPO badges in Assets, Safari rendering fixes
- New ESI scopes: blueprints + contracts

### v5.14.0 (2026-04-20)
- Corporation Industry History — new append-only archive of completed corp jobs (`corp_job_history`)
- Archiver runs every 15 minutes, denormalizes product name + group + category
- New sidebar view "Corp Industry Stats" with headline cards, top products, top installers, category breakdown
- Date range (this month / last month / 30d / 90d / 6m / all) + activity filter (mfg / reactions / invention)
- Admin backfill endpoint (`POST /api/corporation/industry/backfill`) for on-demand archival
- History starts from ship date — ESI only retains ~30 days of completed jobs

### v5.13.0 (2026-04-08)
- Blueprint data switched to Hoboleaks (live SDE, auto-refreshes with game patches)
- Fixed stale material quantities for carriers and all ships (was 9 months outdated)
- ME formula corrected to EVE's multiplicative formula

### v5.12.0 (2026-04-08)
- PI factory status fix — mid-cycle factories correctly show "Producing"
- Estimated Jita sell value of PI storage per planet and per character
- Unified Active status for extraction planets
- Consistent font sizes across list and grid views

### v5.8.0 (2026-04-04)
- Trading Feature — multi-hub price comparison + trade finder (owner-locked)
- Configurable hubs: 5 NPC defaults + custom player structures (nullsec)
- Station search by name with auto-resolve region
- Trade calculator with skill-based fee/tax, auto-detect from ESI
- Multi-buy clipboard export, CSV/JSON export, sortable results

### v5.7.0 (2026-04-03)
- Planetary Industry — product icons + P1–P4 tier badges on grid and list views
- Enhanced 10-state colony status system with reason text (RIFT-inspired)
- Color-coded storage breakdown by PI tier (P0–P4)
- HiDPI extraction graphs, auto-refresh countdown timer

### v5.6.0 (2026-04-02)
- Wallet Journal — unified 8-column layout, fixed-height tabs, dynamic overview donut
- Wealth History — trading platform range selector (1D–MAX), unlimited history retention
- Skill Queue — EVE-style level boxes with training pulse, timeline bar with training time
- Adaptive chart X-axis labels based on actual data span

### v5.5.0 (2026-04-01)
- Wallet Journal — item names via date+amount matching, buy/sell filters, colored prices
- Wealth History — deduplicated snapshots per character per hour
- Top bar wallet ISK color matches character page

### v5.4.0 (2026-04-01)
- Global refresh — auto-refresh + manual refresh moved to header, works across all views
- Slot cards moved inside Characters Overview (sticky on scroll, no background mismatch)
- zKillboard links on character names (Dashboard cards + Character Page header)
- Compact Assets toolbar (smaller buttons, stable layout on collapse/expand)
- Unified ISK colors to amber across all views

### v5.3.0 (2026-04-01)
- Character Page — dedicated view with skill queue, jobs, planets, corp/alliance logos
- Self-contained character filters on all nav views (sidebar released from filter role)
- Unified table styling between IndustryJobs and CorporationJobs
- External lookups (Fuzzwork, EVE Ref, zKillboard, Dotlan) on all views
- CSV/JSON export on all table views
- Per-character net worth on Dashboard cards and Character Page
- Dashboard performance optimization (parallel ESI calls + 2-min cache)

### v5.2.0 (2026-03-30)
- Skill training status on Dashboard character cards
- Queue depth indicator, red flashing alerts for empty/paused queues

### v5.1.0 (2026-03-30)
- Planets auto-refresh, Docker Compose SSO fix

### v5.0.0 (2026-03-29)
- EVE SSO-only authentication (removed local login)
- Breaking: database must be recreated

[See full changelog →](CHANGELOG.md)

---

## Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| v5.16.3 | 2026-04-22 | Trade Finder: Max ROI % filter to cap unrealistic opportunities |
| v5.16.2 | 2026-04-22 | Trade Finder: hide 906 "Expired …" legacy event items by default (AIR boosters, filaments, etc.) |
| v5.16.1 | 2026-04-22 | Trade Finder: prune stale hub_prices rows (ghost opportunities) + 6h query-time freshness filter |
| v5.16.0 | 2026-04-21 | Trade Finder: cargo manifest optimizer (knapsack with ship presets), bait/scam risk scoring, skin/SKINR/Paragon hidden by default |
| v5.15.0 | 2026-04-21 | Personal industry stats dashboard + inline price trend chart in Hub Compare |
| v5.14.1 | 2026-04-21 | Backend stability: EventEmitter leak fix (shared axios client, keepAlive:false) + hub-price refresh yields to event loop |
| v5.14.0 | 2026-04-20 | Corporation industry history archive + stats dashboard (top products, installers, categories) |
| v5.13.0 | 2026-04-08 | Blueprint data switched to Hoboleaks live SDE, ME formula fix, stale data resolved |
| v5.12.0 | 2026-04-08 | PI factory status fix, storage value estimates (Jita sell), unified Active status |
| v5.9.0 | 2026-04-04 | Production Planner: recursive build tree, BPO/BPC ownership, shopping list, blueprint ESI scope |
| v5.8.0 | 2026-04-04 | Trading: multi-hub comparison, trade finder, configurable hubs (incl. nullsec structures), skill-based fees |
| v5.7.0 | 2026-04-03 | PI product icons + tier badges, enhanced colony statuses, storage tier colors, auto-refresh countdown |
| v5.6.0 | 2026-04-02 | Unified wallet journal, wealth chart ranges, EVE skill boxes |
| v5.5.0 | 2026-04-01 | Wallet journal items, wealth dedup, ISK colors |
| v5.4.0 | 2026-04-01 | Global refresh, sticky slot cards, zKillboard on characters, ISK color unify |
| v5.3.0 | 2026-04-01 | Character Page, external lookups, CSV export, per-char net worth, perf |
| v5.2.0 | 2026-03-30 | Skill training on Dashboard cards |
| v5.1.0 | 2026-03-30 | Planets auto-refresh |
| v5.0.0 | 2026-03-29 | EVE SSO-only auth (breaking) |
| v4.6.0 | 2026-03-26 | PI grid view + extraction bar graphs |
| v4.5.0 | 2026-03-26 | Jita market prices + price mode toggle |
| v4.0.0 | 2026-03-26 | EVE SDE integration (~95K cached entries) |
| v3.9.0 | 2026-03-26 | Background cache: market prices, cost indices |
| v3.7.0 | 2026-03-25 | Hierarchical asset tree |
| v3.6.0 | 2026-03-25 | Vite + better-sqlite3 migration |
| v3.5.0 | 2026-03-25 | Enhanced PI: countdowns, rates, alerts |
| v3.4.0 | 2026-03-25 | Assets + Planetary Industry views |

---

## Security

See [SECURITY.md](SECURITY.md) for credential handling and security practices.

---

## License

This project is for personal use.
