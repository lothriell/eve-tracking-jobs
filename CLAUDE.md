# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Deploy

```bash
# Full rebuild and deploy
docker-compose up -d --build

# View logs
docker-compose logs -f backend
docker-compose logs backend | grep -E "CACHE|SDE|STRUCTURE"

# Safe production update (backs up .env, pulls, rebuilds)
./safe-pull.sh

# Quick redeploy
./deploy.sh
```

No local Node.js — all builds happen inside Docker containers on the Arch Linux server. Never run `npm` locally.

## Architecture

```
Browser → Nginx (port 9000) → /auth/*, /api/* proxied to Backend (port 3001)
                             → /* serves React SPA from /build
```

**Backend**: Express.js on Node 22 Alpine
- `server.js` → routes (`auth.js`, `api.js`) → controllers → services → `db.js` (better-sqlite3)
- `esiClient.js`: All ESI HTTP calls with rate limiting (20 req/s), batch name resolution via `POST /universe/names/`
- `tokenRefresh.js`: Transparent token refresh before ESI calls (5-min buffer)
- `corporationService.js`: Corp-specific ESI (roles, jobs, customs offices)
- `cacheRefresh.js`: Background scheduler — market prices + cost indices every 6 hours
- `sdeImport.js`: First-startup download of EVE SDE from Fuzzwork (~95K types, ~5K stations, ~8K systems)

**Frontend**: React 18 + Vite 6 (migrated from CRA in v3.6.0)
- `Main.jsx` renders views based on `currentView` state: dashboard, jobs, corp-jobs, assets, planets
- `Sidebar.jsx` handles character selection, nav, ESI scope indicator dots
- `services/api.js`: Axios client using relative URLs (Nginx proxies to backend)
- All `.jsx` files (Vite convention), services stay `.js`

**Database**: SQLite at `/app/database/data/eve_esi.db` (Docker volume `eve-esi-data`)

## Key Patterns

**ESI Name Resolution** — three-tier strategy:
1. SQLite `name_cache` table (instant, persists across restarts)
2. SDE bulk import from Fuzzwork CSVs on first startup
3. ESI API fallback for unknown IDs (cached after first fetch)

**Location ID classification** (`classifyLocationId` in esiClient.js):
- 30M-33M → solar system → `/universe/systems/{id}/`
- 60M-64M → NPC station → `/universe/stations/{id}/`
- \>1T → player structure → **BROKEN** (CCP removed `esi-universe.read_structures.v1` from SSO but endpoint still requires it — always returns 401)
- 2004 → Asset Safety

**Asset container chain**: ESI reports items in player structures as `location_type: "item"` (not "station"). The structure itself isn't in the character's asset list. Code follows `item_id` → `location_id` chains to find the root station/structure.

**Auth flow**: Local login (bcrypt) → session → EVE SSO (OAuth2 PKCE) to link characters. PKCE state stored in session, verified on callback. Tokens in `characters` table.

## ESI Constraints

**Scopes we request** (in `authController.js` `REQUIRED_SCOPES`):
```
esi-industry.read_character_jobs.v1
esi-skills.read_skills.v1
esi-industry.read_corporation_jobs.v1
esi-corporations.read_corporation_membership.v1
esi-characters.read_corporation_roles.v1
esi-assets.read_assets.v1
esi-assets.read_corporation_assets.v1
esi-planets.manage_planets.v1
```

**`esi-universe.read_structures.v1`** — MUST be added to the EVE Developer Application at developers.eveonline.com. "invalid_scope" error means the app config is missing it, not that CCP removed it.

**ID ranges** (for classifying location_id values):
- 500K-2M: Factions/NPC corps
- 10M-13M: Regions
- 20M-21M: Constellations
- 30M-33M: Solar systems
- 40M-50M: Celestial bodies
- 60M-64M: NPC stations
- \>1T: Player structures

## Database Schema

- `users`: id, username, password_hash
- `characters`: id, user_id, character_id, character_name, access_token, refresh_token, token_expiry, scopes
- `name_cache`: (id, category) PK — category: type/station/system/character/region/constellation. `extra_data` stores system_id for stations, JSON {regionId, constellationId, security} for systems
- `market_prices`: type_id PK, adjusted_price, average_price
- `cost_indices`: (system_id, activity) PK, cost_index

## Environment

Configured via `.env` (see `.env.example`). Key vars: `EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `EVE_REDIRECT_URI`, `APP_USERNAME`, `APP_PASSWORD`, `SESSION_SECRET`, `PORT` (default 9000), `SERVER_IP`.

## Version

Bump in `backend/routes/api.js` (`version` field). Always update `CHANGELOG.md` (full detail) and `README.md` (summary + version table) before pushing.
