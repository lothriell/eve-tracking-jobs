# Changelog

All notable changes to the EVE Industry Tracker will be documented in this file.

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