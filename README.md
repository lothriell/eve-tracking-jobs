# EVE Industry Tracker

**Current Version:** v3.9.0 | **Build Date:** 2026-03-26

A comprehensive web application for tracking EVE Online industry jobs across multiple characters and corporations.

EVE Industry Tracker provides real-time tracking of your industry jobs, slot utilization, and corporation activities. With support for unlimited characters, auto-refresh functionality, hover-to-highlight features, and an EVE-inspired interface, it's the perfect tool for managing your industrial empire.

---

## 📋 Recent Updates

### v3.9.0 (2026-03-26) - Background Cache + Market Prices
- ✅ Background service refreshes market prices and cost indices every 6 hours
- ✅ Region and constellation names cached on startup
- ✅ Character names cached in SQLite (job pages load faster)
- ✅ ~14,000 market prices + ~5,000 cost indices ready for ISK valuation

### v3.7.0 (2026-03-25) - Hierarchical Asset Tree
- ✅ Tree view: System → Station → Container → Items
- ✅ System names resolved from ESI station/structure data
- ✅ Containers expandable to show contents (ships, secure containers)
- ✅ Search across all levels (item, system, station, container, character)

### v3.6.0 (2026-03-25) - Vite + better-sqlite3 Migration
- ✅ Frontend migrated from Create React App to Vite 6 (eliminates ~1000 deps + 26 vulnerabilities)
- ✅ Backend migrated from sqlite3 to better-sqlite3 (eliminates 9 vulnerabilities + build warnings)
- ✅ Clean build with minimal warnings

### v3.5.0 (2026-03-25) - Enhanced Planetary Industry
- ✅ Live color-coded countdown timers (ticking every second, 8-level urgency colors)
- ✅ Extraction rate calculation (units/hour per extractor and per colony)
- ✅ Extractor balance detection with OFF-BAL warning badge
- ✅ Storage fill tracking with visual bar and capacity percentages
- ✅ Alert system: EXPIRED, OFF-BAL, LOW, STORAGE badges with alert mode filter
- ✅ Enhanced colony summary table with Rate, Storage, and Status columns

### v3.4.0 (2026-03-25) - Assets & Planetary Industry
- ✅ Personal and Corporation asset inventory with filtering and location grouping
- ✅ Planetary Industry view: colony overview, planet type colors, upgrade stars, expiry countdown
- ✅ Expandable colony detail with extractor/factory/storage breakdown and pin table
- ✅ 5 new API endpoints (assets, assets/corp, planets, planets/layout, planets/customs)
- ✅ 4 new ESI scopes for assets, corp assets, planets, and structure resolution
- ✅ Sidebar updated with Assets (📦) and Planets (🪐) navigation

### v3.3.10 (2026-03-11) - Configuration Architecture
- ✅ Removed all hardcoded IP addresses
- ✅ 100% .env-driven configuration
- ✅ IP-agnostic deployment (works with any IP/hostname)
- ✅ Created comprehensive configuration documentation

### v3.3.9 (2026-03-11) - Loading Page Fix
- ✅ Fixed loading page issue after IP change
- ✅ Frontend now uses relative URLs
- ✅ Nginx proxies API requests to backend
- ✅ Better architecture with reverse proxy

### v3.3.8 (2026-03-11) - Multi-Deployment Support
- ✅ Updated .env.example with comprehensive templates
- ✅ Support for Local IP, Hostname, Tailscale IP, and MagicDNS
- ✅ Added Quick Start Guide
- ✅ Deployment examples for each option

### v3.3.7 (2026-03-08) - Job Status Calculation
- ✅ Fixed job status with `effectiveStatus` implementation
- ✅ Active/Ready jobs correctly identified

### v3.3.6 (2026-03-09) - Corporation Jobs Fix
- ✅ Shows ALL corporation jobs (all members)
- ✅ Fixed counters (no double counting)
- ✅ Added separate Ready counter

[See full changelog →](CHANGELOG.md)

---

## 📊 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| v3.9.0  | 2026-03-26 | Background cache refresh: market prices, cost indices, names |
| v3.7.0  | 2026-03-25 | Hierarchical asset tree: System → Station → Container → Items |
| v3.6.0  | 2026-03-25 | Migrated frontend to Vite 6, backend to better-sqlite3 — clean builds |
| v3.5.0  | 2026-03-25 | Enhanced PI: live countdowns, extraction rates, storage tracking, alert system |
| v3.4.0  | 2026-03-25 | Assets view (personal + corp), Planetary Industry view (colonies, detail, customs) |
| v3.3.10 | 2026-03-11 | Removed all hardcoded IPs, 100% .env-driven configuration |
| v3.3.9 | 2026-03-11 | Fixed loading page issue, relative URLs, Nginx proxy |
| v3.3.8 | 2026-03-11 | Multi-deployment support, updated .env.example |
| v3.3.7 | 2026-03-08 | Fixed job status calculation with effectiveStatus |
| v3.3.6 | 2026-03-09 | Fixed corporation jobs display and counters |
| v3.3.5 | 2026-03-08 | UI improvements: logo, collapse button, character count |
| v3.3.4 | 2026-03-08 | Fixed favicon, logo, collapse button |
| v3.3.3 | 2026-03-08 | Fixed sidebar scrollbar, logo, favicon |
| v3.3.2 | 2026-03-08 | Fixed favicon, header alignment, scrollbar |
| v3.3.1 | 2026-03-08 | Fixed skill IDs for Mass Reactions |
| v3.3.0 | 2026-03-08 | Hover-to-highlight, renamed to EVE Industry Tracker |
| v3.2.1 | 2026-03-08 | Fixed skill IDs |
| v3.2.0 | 2026-03-08 | 7 features including slot calculation, dashboard |
| v3.1.1 | 2026-03-08 | Documentation updates |
| v3.1.0 | 2026-03-08 | Multi-instance deployment support |

[See full changelog →](CHANGELOG.md)

---

## Browser Compatibility

EVE Industry Tracker is fully compatible with:
- ✅ Google Chrome (latest)
- ✅ Mozilla Firefox (latest)
- ✅ Safari (latest) - Fixed in v3.3.4
- ✅ Microsoft Edge (latest)
- ✅ Opera (latest)

## ⚠️ Backward Compatibility Note (v3.1.0+)

**Existing users do NOT need to update their .env file!**

The `PORT`, `SERVER_IP`, and `PROJECT_NAME` variables added in v3.1.0 are **optional** and have default values:
- `PORT` defaults to `9000` (same as before)
- `SERVER_IP` defaults to your server's IP
- `PROJECT_NAME` defaults to `eve-esi-app`

Your existing deployment will continue to work without any changes.

**Only add these variables if you want to:**
- Change the default port (9000)
- Run multiple instances on the same server
- Customize container names

---

## ✨ Features

### Core Features
- 🎯 **Multi-character support** (unlimited characters)
- 🏭 **Personal industry jobs** tracking
- 🏢 **Corporation industry jobs** tracking (role-based access)
- ⏱️ **Real-time countdown timers**
- 📊 **Job slot utilization** with EVE color coding
- 🔄 **Auto-refresh** (5m/10m/15m intervals)
- 🎨 **EVE-themed UI** with professional design

### Configuration & Deployment (v3.3.10)
- 🌐 **IP-agnostic deployment** - Works with any IP or hostname
- 🔧 **100% .env-driven** - No hardcoded values
- 🌍 **Multi-deployment support** - Local IP, Tailscale, Hostname, MagicDNS
- 🔒 **Secure architecture** - Nginx reverse proxy
- 📱 **Responsive design** - Works on all devices

### Dashboard
- **Hover-to-Highlight**: Hover over job type cards to instantly see which characters have free slots
- **Job Slot Tracking** with breakdown: "X/Y (Z personal + W corp)"
- **Auto-Refresh** functionality with configurable intervals (5m, 10m, 15m)
- **Character Overview** with accurate slot calculations
- **Corporation Industry** tracking with role-based access
- Real-time countdown timers for active jobs
- EVE-like interface with color-coded slot utilization

### My Industry Jobs
- **Personal Jobs** tracking with detailed information
- **Corporation Jobs** filtering (only your characters)
- Job slot summary with breakdown format
- Activity filtering (Manufacturing, Science, Reactions)
- Status filtering (Active, Completed, etc.)
- Blueprint icons with BPC/BPO distinction
- **EVE-like Time Display**: Time remaining shown as "XD HH:MM:SS" format
- **Real-time Countdown**: Live updating timers

### Corporation Jobs
- **Multi-Corporation** support
- **Role-Based Access** (Director, Factory Manager)
- **Collapsible Corporation Cards** for space efficiency
- Filter by authorized characters only
- Detailed job information and tracking

### User Interface
- **Collapsed Sidebar** with icons and character portraits
- **Responsive Design** for different screen sizes
- **EVE-Inspired Colors** (Manufacturing: orange, Science: blue, Reactions: green)
- **Smooth Transitions** and animations
- **Tooltips** for better UX

### Multi-Character Support
- Unlimited character support (tested with 16+ characters)
- Easy character switching
- Aggregate statistics across all characters
- Individual character job tracking

### Multi-Instance Deployment
- Configurable port via environment variable
- Support for multiple users on same server
- Unique container naming per instance
- Separate databases per instance

### Auto-Refresh

The dashboard includes an auto-refresh feature that automatically updates your data at regular intervals:

- **Off**: Manual refresh only
- **5 minutes**: Refresh every 5 minutes
- **10 minutes**: Refresh every 10 minutes
- **15 minutes**: Refresh every 15 minutes

The setting is saved in your browser and persists across sessions. A spinning icon indicates when auto-refresh is active.

---

## Screenshots

*Screenshots showing v3.2.0 features including auto-refresh, collapsed sidebar, and job breakdown format.*

---

## Installation Guide

### Prerequisites

- **Linux server** (tested on Arch Linux, works on Ubuntu, Debian, etc.)
- **Docker** and **Docker Compose** installed
- **EVE Online account**
- **Network access** to your server (port 9000)

### Step 1: Create EVE Developer Application

1. Go to [EVE Developers](https://developers.eveonline.com/)
2. Log in with your EVE account
3. Click **"Create New Application"**
4. Fill in the application details:
   - **Name**: Your app name (e.g., "My Industry Tracker")
   - **Description**: Brief description
   - **Connection Type**: Authentication & API Access

5. **Set the Callback URL**:
   ```
   http://YOUR_SERVER_ADDRESS:9000/auth/callback
   ```
   
   **Note:** Replace `YOUR_SERVER_ADDRESS` with your actual server address:
   - **Local IP**: Use your server's LAN IP (e.g., `192.168.1.100`)
   - **Tailscale**: Use your Tailscale IP (e.g., `100.82.8.96`)
   - **Hostname**: Use your hostname (e.g., `eve-tracker.local`)
   - **MagicDNS**: Use your Tailscale MagicDNS name (e.g., `server.tailnet-abc.ts.net`)

6. **⚠️ CRITICAL: Enable all required ESI scopes**:
   - ✅ `esi-industry.read_character_jobs.v1` - Personal industry jobs
   - ✅ `esi-skills.read_skills.v1` - Character skills for slot calculation
   - ✅ `esi-industry.read_corporation_jobs.v1` - Corporation industry jobs
   - ✅ `esi-corporations.read_corporation_membership.v1` - Corporation membership
   - ✅ `esi-characters.read_corporation_roles.v1` - Reading corporation roles (Director/Factory_Manager check)

   **Important**: All five scopes must be checked in the EVE Developer Application settings. Missing any scope will cause "invalid_scope" errors during authorization.

7. Click **"Create Application"**
8. Note your **Client ID** and **Secret Key** (you'll need these next)

### Step 2: Clone the Repository

```bash
# Create directory for Docker projects (optional)
mkdir -p ~/docker
cd ~/docker

# Clone the repository
git clone https://github.com/lothriell/eve-tracking-jobs.git
cd eve-tracking-jobs
```

### Step 3: Configure Environment Variables

**Copy the environment template:**
```bash
cp .env.example .env
```

**Edit the .env file:**
```bash
nano .env
```

**Choose your deployment type and set YOUR_SERVER_ADDRESS:**

**Option 1: Local IP Address**
```env
YOUR_SERVER_ADDRESS=192.168.1.100
```

**Option 2: Tailscale IP**
```env
YOUR_SERVER_ADDRESS=100.82.8.96
```

**Option 3: Hostname**
```env
YOUR_SERVER_ADDRESS=eve-tracker.local
```

**Option 4: Tailscale MagicDNS**
```env
YOUR_SERVER_ADDRESS=server.tailnet-abc.ts.net
```

**Fill in your .env file:**

```env
# ============================================================================
# Deployment Configuration
# ============================================================================
# Set your server IP or hostname
YOUR_SERVER_ADDRESS=YOUR_IP_OR_HOSTNAME
PORT=9000

# ============================================================================
# EVE Online SSO Configuration
# ============================================================================
# Get these from: https://developers.eveonline.com/applications
EVE_CLIENT_ID=YOUR_EVE_CLIENT_ID
EVE_CLIENT_SECRET=YOUR_EVE_CLIENT_SECRET
EVE_REDIRECT_URI=http://YOUR_SERVER_ADDRESS:9000/auth/callback

# ============================================================================
# Application Credentials
# ============================================================================
# Your login credentials for the web application
APP_USERNAME=YOUR_USERNAME
APP_PASSWORD=YOUR_PASSWORD

# ============================================================================
# Session Security
# ============================================================================
# Generate with: openssl rand -base64 32
SESSION_SECRET=YOUR_RANDOM_SESSION_SECRET

# ============================================================================
# Server Configuration
# ============================================================================
FRONTEND_URL=http://YOUR_SERVER_ADDRESS:9000
SERVER_IP=YOUR_SERVER_ADDRESS

# ============================================================================
# Application Settings
# ============================================================================
PROJECT_NAME=eve_esi_app
NODE_ENV=production

# ============================================================================
# CORS Configuration
# ============================================================================
ALLOWED_ORIGINS=http://YOUR_SERVER_ADDRESS:9000
```

**Important:** Replace `YOUR_SERVER_ADDRESS` with your actual IP or hostname in all the variables above.

**Generate a secure session secret:**
```bash
openssl rand -base64 32
```
Copy the output and paste it as your `SESSION_SECRET` value.

**Example configurations:**

**For Local IP (192.168.1.100):**
```env
YOUR_SERVER_ADDRESS=192.168.1.100
EVE_REDIRECT_URI=http://192.168.1.100:9000/auth/callback
FRONTEND_URL=http://192.168.1.100:9000
SERVER_IP=192.168.1.100
ALLOWED_ORIGINS=http://192.168.1.100:9000
```

**For Tailscale (100.82.8.96):**
```env
YOUR_SERVER_ADDRESS=100.82.8.96
EVE_REDIRECT_URI=http://100.82.8.96:9000/auth/callback
FRONTEND_URL=http://100.82.8.96:9000
SERVER_IP=100.82.8.96
ALLOWED_ORIGINS=http://100.82.8.96:9000
```

### Step 4: Deploy with Docker

```bash
# Build and start the application
docker-compose up -d --build

# Wait a few seconds for containers to start
sleep 5

# Verify containers are running
docker-compose ps
```

Expected output:
```
NAME                    STATUS
eve-esi-app-backend     Up
eve-esi-app-frontend    Up
```

### Step 5: Verify Deployment

```bash
# Check backend logs for any errors
docker-compose logs backend | tail -30

# Test backend health endpoint
curl http://localhost:3001/health
```

### Step 6: Access the Application

1. Open your browser: `http://YOUR_SERVER_ADDRESS:9000`
2. Log in with your `APP_USERNAME` and `APP_PASSWORD`
3. Click **"Add Character"** in the sidebar
4. Authorize with EVE SSO
5. Your industry jobs will load automatically

---

## Updating / Upgrading

### Standard Update

```bash
cd ~/docker/eve-tracking-jobs  # or your installation directory

# Pull latest changes
git pull origin main

# Rebuild and restart containers
docker-compose down
docker-compose up -d --build

# Verify update
docker-compose logs backend | tail -20
```

### When to Re-authorize Characters

Check the [CHANGELOG.md](CHANGELOG.md) for version updates that require re-authorization. Generally, characters need re-authorization when:

- New ESI scopes are added
- Breaking changes are announced in the changelog
- You see "needs re-authorization" warnings in the app

**How to re-authorize:**
1. Log into the application
2. Click the "×" button on a character to remove it
3. Click "Add Character" to re-link with updated scopes
4. Authorize with EVE SSO

---

## Multi-Instance Deployment

If you want to run multiple instances of this application on the same server (e.g., for different users), follow these steps.

### Why Multiple Instances?

Each instance has:
- Its own database (characters and settings)
- Its own EVE Developer Application (or shared with multiple callbacks)
- Its own port
- Isolated Docker containers

### Setup for Each User

**User 1 (Port 9000):**
```bash
mkdir -p ~/docker/eve_esi_app_user1
cd ~/docker/eve_esi_app_user1
git clone https://github.com/lothriell/eve-tracking-jobs.git .
cp .env.example .env
nano .env
```

Configure `.env`:
```env
# Server Configuration
PORT=9000
SERVER_IP=YOUR_SERVER_ADDRESS
PROJECT_NAME=eve-esi-user1

# EVE Developer Application
EVE_CLIENT_ID=your_client_id_1
EVE_CLIENT_SECRET=your_client_secret_1
EVE_REDIRECT_URI=http://YOUR_SERVER_ADDRESS:9000/auth/callback

# Application Login
APP_USERNAME=user1
APP_PASSWORD=password1

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=random_secret_1
```

**User 2 (Port 9001):**
```bash
mkdir -p ~/docker/eve_esi_app_user2
cd ~/docker/eve_esi_app_user2
git clone https://github.com/lothriell/eve-tracking-jobs.git .
cp .env.example .env
nano .env
```

Configure `.env`:
```env
# Server Configuration
PORT=9001                        # ← Different port!
SERVER_IP=YOUR_SERVER_ADDRESS
PROJECT_NAME=eve-esi-user2       # ← Different project name!

# EVE Developer Application
EVE_CLIENT_ID=your_client_id_2
EVE_CLIENT_SECRET=your_client_secret_2
EVE_REDIRECT_URI=http://YOUR_SERVER_ADDRESS:9001/auth/callback  # ← Matching port!

# Application Login
APP_USERNAME=user2
APP_PASSWORD=password2

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=random_secret_2
```

Repeat for additional users with ports 9002, 9003, etc.

### EVE Developer Application Setup

#### Option 1: Separate Apps (Recommended)

Each user creates their own EVE Developer Application:
- User 1 callback: `http://YOUR_SERVER_ADDRESS:9000/auth/callback`
- User 2 callback: `http://YOUR_SERVER_ADDRESS:9001/auth/callback`
- User 3 callback: `http://YOUR_SERVER_ADDRESS:9002/auth/callback`
- User 4 callback: `http://YOUR_SERVER_ADDRESS:9003/auth/callback`

Each user has their own Client ID and Secret.

#### Option 2: Shared App

One EVE Developer Application with multiple callback URLs:
1. In EVE Developer portal, add ALL callback URLs (one per line)
2. All users share the same `EVE_CLIENT_ID` and `EVE_CLIENT_SECRET`
3. Each user's `.env` has their specific port in `EVE_REDIRECT_URI`

### Deploy Each Instance

Each user deploys their own instance:

```bash
cd ~/docker/eve_esi_app_userX
docker-compose up -d --build
```

Verify containers are running:
```bash
docker-compose ps
```

### Access Each Instance

| User | URL | Port |
|------|-----|------|
| User 1 | `http://YOUR_SERVER_ADDRESS:9000` | 9000 |
| User 2 | `http://YOUR_SERVER_ADDRESS:9001` | 9001 |
| User 3 | `http://YOUR_SERVER_ADDRESS:9002` | 9002 |
| User 4 | `http://YOUR_SERVER_ADDRESS:9003` | 9003 |

### Container Naming

Each instance has unique container names using `PROJECT_NAME`:
```
eve-esi-user1-frontend-1
eve-esi-user1-backend-1
eve-esi-user2-frontend-1
eve-esi-user2-backend-1
```

View all instances:
```bash
docker ps --filter "name=eve-esi"
```

### Firewall Configuration

Make sure all required ports are open:

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 9000/tcp
sudo ufw allow 9001/tcp
sudo ufw allow 9002/tcp
sudo ufw allow 9003/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 9000:9003 -j ACCEPT
```

### Managing Multiple Instances

```bash
# Start all instances (run from each directory)
cd ~/docker/eve_esi_app_user1 && docker-compose up -d
cd ~/docker/eve_esi_app_user2 && docker-compose up -d

# Stop specific instance
cd ~/docker/eve_esi_app_user1 && docker-compose down

# View logs for specific instance
cd ~/docker/eve_esi_app_user1 && docker-compose logs -f

# Update specific instance
cd ~/docker/eve_esi_app_user1 && git pull && docker-compose up -d --build
```

---

## Troubleshooting

### "invalid_scope" Error During Authorization

**Cause**: One or more ESI scopes are not enabled in your EVE Developer Application.

**Solution**:
1. Go to [EVE Developers](https://developers.eveonline.com/)
2. Edit your application
3. Ensure ALL five scopes are checked:
   - `esi-industry.read_character_jobs.v1`
   - `esi-skills.read_skills.v1`
   - `esi-industry.read_corporation_jobs.v1`
   - `esi-corporations.read_corporation_membership.v1`
   - `esi-characters.read_corporation_roles.v1`
4. Save changes and try authorizing again

### Container Won't Start

```bash
# Check logs for errors
docker-compose logs backend
docker-compose logs frontend

# Common fixes
docker-compose down
docker-compose up -d --build
```

### Can't Access Web App

1. Check firewall allows port 9000
2. Verify containers are running: `docker-compose ps`
3. Check the correct IP address is in your browser
4. Test locally: `curl http://localhost:9000`

### "Cannot GET /auth/callback" Error

**Cause**: Callback URL mismatch between EVE Developer Application and your `.env` file.

**Solution**: Ensure `EVE_REDIRECT_URI` in `.env` matches exactly what you configured in the EVE Developer Application.

### "No Corporation Access" Despite Having Roles

**Cause**: Character was authorized before the `esi-characters.read_corporation_roles.v1` scope was added.

**Solution**: Remove and re-add the character to grant the new scope.

### Blueprint Images Not Showing

1. Clear browser cache (Ctrl+Shift+R)
2. Check browser developer console for image loading errors

### Slot Counts Incorrect

**Cause**: Missing `esi-skills.read_skills.v1` scope.

**Solution**: Re-authorize the character to grant the skills scope.

### Jobs Not Loading

1. Check character has required ESI scopes
2. Verify tokens haven't expired
3. Check backend logs: `docker-compose logs backend`

### Database Reset (Nuclear Option)

If you need to completely reset:
```bash
docker-compose down
docker volume rm eve-tracking-jobs_eve-esi-data
docker-compose up -d --build
```
**Warning**: This deletes all linked characters and you'll need to re-authorize them.

---

## Required ESI Scopes

| Scope | Purpose |
|-------|---------|
| `esi-industry.read_character_jobs.v1` | Read personal industry jobs |
| `esi-skills.read_skills.v1` | Calculate max job slots from skills |
| `esi-industry.read_corporation_jobs.v1` | Read corporation industry jobs |
| `esi-corporations.read_corporation_membership.v1` | Verify corporation membership |
| `esi-characters.read_corporation_roles.v1` | Check for Director/Factory Manager roles |

**All scopes must be enabled in your EVE Developer Application.**

---

## Technology Stack

- **Frontend**: React 18, React Router, Axios, CSS3
- **Backend**: Node.js, Express, SQLite
- **Infrastructure**: Docker Compose, Nginx
- **Authentication**: EVE SSO OAuth2 + Simple Login
- **Real-time Updates**: Auto-refresh with configurable intervals

---

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/check` - Check authentication status
- `GET /auth/eve/authorize` - Initiate EVE SSO
- `GET /auth/callback` - EVE SSO callback

### Characters
- `GET /api/characters` - Get all linked characters
- `GET /api/characters/:characterId` - Get specific character
- `DELETE /api/characters/:characterId` - Remove character
- `GET /api/character/portrait/:characterId` - Get portrait URL

### Industry
- `GET /api/industry/jobs` - Get personal industry jobs
- `GET /api/industry/slots` - Get job slot usage

### Corporation
- `GET /api/corporations` - Get all corporations from linked characters
- `GET /api/corporation/jobs` - Get all corporation jobs
- `GET /api/corporation/jobs/:characterId` - Get corp jobs for specific character
- `GET /api/corporation/roles/:characterId` - Get character's corporation roles

### Dashboard
- `GET /api/dashboard/stats` - Get aggregate statistics

---

## Development

### Local Development

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (in another terminal)
cd frontend
npm install
npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `YOUR_SERVER_ADDRESS` | Server IP or hostname | (required) |
| `PORT` | External port for the application | `9000` |
| `SERVER_IP` | Server IP address (alias for YOUR_SERVER_ADDRESS) | (required) |
| `PROJECT_NAME` | Docker project name (for multi-instance) | `eve_esi_app` |
| `EVE_CLIENT_ID` | EVE SSO Client ID | (required) |
| `EVE_CLIENT_SECRET` | EVE SSO Secret Key | (required) |
| `EVE_REDIRECT_URI` | OAuth callback URL | (required) |
| `APP_USERNAME` | Application login username | (required) |
| `APP_PASSWORD` | Application login password | (required) |
| `SESSION_SECRET` | Express session secret | (required) |
| `FRONTEND_URL` | Frontend URL for CORS | (required) |
| `ALLOWED_ORIGINS` | CORS allowed origins | (required) |
| `NODE_ENV` | Node environment | `production` |
| `DB_PATH` | SQLite database path | `/app/database/data/eve_esi.db` |

---

## Security

See [SECURITY.md](SECURITY.md) for:
- Handling sensitive credentials
- What files should never be committed
- What to do if credentials are accidentally exposed

**Important**: The `.env` file contains sensitive credentials and is NOT committed to the repository.

---

## Contributing

When contributing to this project:

1. **New ESI Scopes**: Always update the README.md "Required ESI Scopes" section
2. **New Features**: Update the Features section in README.md
3. **Breaking Changes**: Document in CHANGELOG.md with re-authorization requirements
4. **Deployment Changes**: Update the Installation Guide

---

## Future Enhancements

- ~~Corporation job support~~ ✅ (v3.0.0)
- ~~Auto-refresh functionality~~ ✅ (v3.2.0)
- Planetary Interaction tracking
- Job completion notifications
- Blueprint library management
- Material efficiency tracking
- Cost calculations
- Export to CSV/Excel

---

## License

MIT License
