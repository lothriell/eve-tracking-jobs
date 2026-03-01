# Changelog

All notable changes to the EVE ESI Application will be documented in this file.

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
