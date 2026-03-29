# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Current version:** v5.0.0 (2026-03-29)

## Build & Deploy

### K8s (production + dev) — primary deployment

```bash
# Build and push images to Gitea registry (ARM64 for Pi cluster)
./deploy-k8s.sh          # prod: tags :latest
./deploy-k8s.sh --dev    # dev: tags :dev

# ArgoCD Image Updater auto-detects new digests and syncs pods (~2 min)
```

Images: `gitea.homielab.omg/sann/eve-tracking-jobs-{backend,frontend}`

K8s manifests live in a separate repo: `sann/eve-tracker-k8s` on Gitea, managed via Kustomize overlays (`base/`, `overlays/prod/`, `overlays/dev/`).

### Docker Compose (old test environment)

```bash
docker-compose down && git pull origin main && docker-compose up -d --build
docker-compose logs -f backend
```

### Environments

| Environment | URL | Namespace |
|---|---|---|
| Production | https://eve.lothriell.com | eve-tracker |
| Dev | https://dev-eve.lothriell.com | eve-tracker-dev |
| Old test | http://100.82.8.96:9000 | N/A (Docker Compose) |

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
- `cacheRefresh.js`: Background scheduler — market prices, Jita prices, cost indices every 6 hours
- `sdeImport.js`: First-startup download of EVE SDE from Fuzzwork (~50K types with volumes, ~5K stations, ~8K systems)

**Frontend**: React 18 + Vite 6 (migrated from CRA in v3.6.0)
- `App.jsx`: Auth check on mount → renders `Login` or `Main` (no react-router)
- `Main.jsx` renders views based on `currentView` state: dashboard, jobs, corp-jobs, assets, planets
- `Login.jsx`: Single "Login with EVE Online" button (no username/password)
- `Sidebar.jsx` handles character selection, nav, ESI scope indicator dots
- `services/api.js`: Axios client using relative URLs (Nginx proxies to backend)
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
esi-industry.read_corporation_jobs.v1
esi-corporations.read_corporation_membership.v1
esi-characters.read_corporation_roles.v1
esi-assets.read_assets.v1
esi-assets.read_corporation_assets.v1
esi-planets.manage_planets.v1
esi-universe.read_structures.v1
```

**Three EVE Developer Applications** — all must have these scopes enabled:
1. Old test: callback `http://100.82.8.96:9000/auth/callback`
2. Prod: callback `https://eve.lothriell.com/auth/callback`
3. Dev: callback `https://dev-eve.lothriell.com/auth/callback`

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

## Environment

Configured via `.env` (Docker Compose) or K8s Secret (K8s). Key vars: `EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `EVE_REDIRECT_URI`, `SESSION_SECRET`, `FRONTEND_URL`. `NODE_ENV=production` enables secure cookies and trust proxy.

## Version

Bump in `backend/routes/api.js` (`version` field). Always update `CHANGELOG.md` (full detail) and `README.md` (summary + version table) before pushing. Run `./deploy-k8s.sh` after every push.
