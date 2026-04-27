# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Current version:** v5.13.0 (2026-04-08)

## Build & Deploy

Deploy chain: **dev → test → prod.** Dev (Docker Compose on minisforum) is the fast iteration loop. Test and prod are K8s and take ~2 min each via ArgoCD.

### Dev — Docker Compose on minisforum (fast loop)

```bash
ssh ansible@100.82.8.96 "sudo su - sann -c 'cd ~/docker/eve_esi_app && git pull origin main && docker-compose up -d --build'"
docker-compose logs -f backend
```

URL: http://100.82.8.96:9000

### Test + Prod — K8s

```bash
# Build and push images to Gitea registry (ARM64 for Pi cluster)
./deploy-k8s.sh          # prod: tags :latest
./deploy-k8s.sh --test   # test: tags :test

# ArgoCD Image Updater auto-detects new digests and syncs pods (~2 min)
```

Images: `gitea.homielab.omg/sann/eve-tracking-jobs-{backend,frontend}`

K8s manifests live in a separate repo: `sann/eve-tracker-k8s` on Gitea, managed via Kustomize overlays (`base/`, `overlays/prod/`, `overlays/test/`).

### Environments

| Environment | URL | Host / Namespace |
|---|---|---|
| Dev | http://100.82.8.96:9000 | minisforum (Docker Compose) |
| Test | https://test-eve.lothriell.com | K8s `eve-tracker-test` |
| Production | https://eve.lothriell.com | K8s `eve-tracker` |

## Architecture

```
Browser → Cloudflare Tunnel → Nginx (frontend pod)
            → /auth/*, /api/* proxied to Backend pod (port 3001)
            → /* serves React SPA from /build
```

**Backend**: Express.js on Node 22 Alpine
- `server.js` → routes (`auth.js`, `api.js`) → controllers → services → `db.js` (better-sqlite3)
- `esiClient.js`: All ESI HTTP calls with rate limiting (20 req/s), batch name resolution via `POST /universe/names/`
- `tokenRefresh.js`: Transparent token refresh before ESI calls (5-min buffer)
- `corporationService.js`: Corp-specific ESI (roles, jobs, customs offices)
- `cacheRefresh.js`: Background scheduler — market prices, Jita prices, cost indices every 6 hours; hub prices every 30 minutes
- `tradeCalculator.js`: Pure calculation module — broker fees, sales tax, trade opportunity finder
- `tradingController.js`: Trading API endpoints (hub CRUD, price comparison, trade finder, settings, build tree) — locked to Lothriell
- `ProductionTree.jsx`: Recursive build tree with BPO/BPC ownership badges, shopping list, summary
- `sdeImport.js`: First-startup download of EVE SDE from Fuzzwork (~50K types with volumes, ~5K stations, ~8K systems)

**Frontend**: React 18 + Vite 6 (migrated from CRA in v3.6.0)
- `App.jsx`: Auth check on mount → renders `Login` or `Main` (no react-router)
- `Main.jsx` renders views based on `currentView` state: dashboard, character, jobs, corp-jobs, assets, planets
- `Main.jsx` owns global refresh (auto + manual) via `refreshKey` prop passed to all views
- `HubComparison.jsx`: cross-hub price comparison with item name search + hub manager
- `TradeFinder.jsx`: trade opportunity finder with ROI/margin calc, multi-buy export, fee settings
- `Login.jsx`: Single "Login with EVE Online" button (no username/password)
- `Sidebar.jsx`: clicking character → navigates to CharacterPage; nav items switch views
- `CharacterPage.jsx`: per-character detail view (skill queue, jobs, planets, net worth)
- Each nav view has its own character filter dropdown (self-contained, no `selectedCharacter` prop)
- Shared components: `ExternalLinks.jsx` (lookup links), `ExportButton.jsx` (CSV/JSON export)
- `services/api.js`: Axios client using relative URLs (Nginx proxies to backend)
- `services/export.js`: Client-side CSV/JSON generation utility
- All `.jsx` files (Vite convention), services stay `.js`

**Database**: SQLite on Longhorn PVC (K8s) or Docker volume (Compose)

## Key Patterns

**Auth flow**: EVE SSO only (OAuth2 PKCE). No local passwords.
- First SSO login creates user from CharacterID/CharacterName
- Subsequent SSO while logged in links alt characters
- PKCE state stored in session, verified on callback
- `req.session.save()` called explicitly before SSO redirect (critical with `saveUninitialized: false`)
- Session cookies: `secure: true` + `trust proxy` when `NODE_ENV=production`, `secure: false` otherwise

**ESI Name Resolution** — three-tier strategy:
1. SQLite `name_cache` table (instant, persists across restarts)
2. SDE bulk import from Fuzzwork CSVs on first startup
3. ESI API fallback for unknown IDs (cached after first fetch)

**Location ID classification** (`classifyLocationId` in esiClient.js):
- 30M-33M → solar system → `/universe/systems/{id}/`
- 60M-64M → NPC station → `/universe/stations/{id}/`
- \>1T → player structure → requires `esi-universe.read_structures.v1`
- 2004 → Asset Safety

**Asset container chain**: ESI reports items in player structures as `location_type: "item"` (not "station"). The structure itself isn't in the character's asset list. Code follows `item_id` → `location_id` chains to find the root station/structure.

**Nginx proxy (K8s)**: ConfigMap overrides frontend nginx.conf. Uses `X-Forwarded-Proto: https` (hardcoded, not `$scheme`) because nginx sits behind Cloudflare tunnel and `$scheme` would be `http`.

## ESI Constraints

**Scopes we request** (in `authController.js` `REQUIRED_SCOPES`):
```
esi-industry.read_character_jobs.v1
esi-skills.read_skills.v1
esi-skills.read_skillqueue.v1
esi-industry.read_corporation_jobs.v1
esi-corporations.read_corporation_membership.v1
esi-characters.read_corporation_roles.v1
esi-assets.read_assets.v1
esi-assets.read_corporation_assets.v1
esi-planets.manage_planets.v1
esi-universe.read_structures.v1
esi-wallet.read_character_wallet.v1
esi-characters.read_blueprints.v1
esi-contracts.read_character_contracts.v1
```

**Three EVE Developer Applications** — all must have these scopes enabled:
1. Dev: callback `http://100.82.8.96:9000/auth/callback`
2. Prod: callback `https://eve.lothriell.com/auth/callback`
3. Test: callback `https://test-eve.lothriell.com/auth/callback`

**Note:** EVE Developer Application scope changes can take several minutes to propagate at CCP's end.

**ID ranges** (for classifying location_id values):
- 500K-2M: Factions/NPC corps
- 10M-13M: Regions
- 20M-21M: Constellations
- 30M-33M: Solar systems
- 40M-50M: Celestial bodies
- 60M-64M: NPC stations
- \>1T: Player structures

## Database Schema

- `users`: id, primary_character_id, primary_character_name
- `characters`: id, user_id, character_id, character_name, access_token, refresh_token, token_expiry, scopes
- `name_cache`: (id, category) PK — category: type/station/system/character/region/constellation. `extra_data` stores system_id for stations, JSON {regionId, constellationId, security} for systems
- `market_prices`: type_id PK, adjusted_price, average_price
- `jita_prices`: type_id PK, sell_min, buy_max, sell_volume, buy_volume
- `cost_indices`: (system_id, activity) PK, cost_index
- `trade_hubs`: per-user configurable trade hubs (station_id, region_id, is_default, is_structure, enabled)
- `hub_prices`: (type_id, station_id) PK — aggregated sell_min/buy_max/volumes per hub
- `hub_refresh_status`: station_id PK — tracks last refresh time/status per hub
- `trade_settings`: character_id PK — Accounting/Broker Relations skill levels + standings
- `blueprint_products`: (blueprint_id, activity_id, product_type_id) — what each BP produces
- `blueprint_materials`: (blueprint_id, activity_id, material_type_id) — manufacturing inputs
- `blueprint_activities`: (blueprint_id, activity_id) — job times in seconds

## Environment

Configured via `.env` (Docker Compose) or K8s Secret (K8s). Key vars: `EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `EVE_REDIRECT_URI`, `SESSION_SECRET`, `FRONTEND_URL`. `NODE_ENV=production` enables secure cookies and trust proxy.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Version

Bump in `backend/routes/api.js` (`version` field). Always update `CHANGELOG.md` (full detail) and `README.md` (summary + version table) before pushing. Run `./deploy-k8s.sh` after every push.
