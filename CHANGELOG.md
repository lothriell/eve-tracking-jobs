# Changelog

All notable changes to the EVE ESI Application will be documented in this file.

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
