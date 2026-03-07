# EVE Online ESI Web Application

A web application for tracking EVE Online industry jobs across multiple characters using the EVE Swagger Interface (ESI).

## Features

### Current Features (v3.1.0)

#### Dashboard
- Aggregate statistics across all characters
- Total job slot summary (Manufacturing, Science, Reactions) with EVE-inspired colors
- Per-character job counts and slot usage
- Jobs breakdown by activity type with visual progress bars
- Corporation statistics with role summaries

#### Personal Industry Jobs ("My Industry Jobs")
- **EVE-like Time Display**: Time remaining shown as "XD HH:MM:SS" format
- **Real-time Countdown**: Live updating timers
- **Blueprint Icons**: Fetched from EVE image service (BPC/BPO distinction)
- **Activity Categories**: Manufacturing, Science (TE/ME Research, Copying, Invention), Reactions
- **Status Badges**: Active, Ready, Delivered, Paused, Cancelled
- **Progress Bars**: Visual job completion indicator
- **Slot Usage**: Shows combined personal + corporation job counts

#### Corporation Industry Jobs
- View corporation industry jobs across all corporations you have access to
- Corporation summary cards with collapsible details
- Filter by corporation, activity type, status, and character
- Only shows jobs installed by your linked characters
- Role detection for Director and Factory Manager

#### Multi-Character Support
- Link unlimited EVE Online characters
- Support for characters across different accounts
- Character management via collapsible sidebar
- Character portraits and quick switching

#### Multi-Instance Deployment
- Configurable port via `PORT` environment variable
- Run multiple instances on the same server for different users
- Unique Docker container names per instance
- Comprehensive deployment guide included

#### Job Slot Tracking
- Manufacturing, Science, and Reaction slot tracking
- Slots calculated from character skills
- Color coding: Green (high utilization), Yellow (medium), Red (low utilization)
- Combined personal + corporation job counts

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
   http://YOUR_SERVER_IP:9000/auth/callback
   ```
   Replace `YOUR_SERVER_IP` with your server's IP address (e.g., `http://10.69.10.15:9000/auth/callback`)

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

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your values
nano .env
```

Fill in your `.env` file:

```env
# EVE Online SSO Configuration
EVE_CLIENT_ID=your_client_id_here
EVE_CLIENT_SECRET=your_secret_key_here
EVE_REDIRECT_URI=http://YOUR_SERVER_IP:9000/auth/callback

# Application Credentials (your choice for web app login)
APP_USERNAME=your_username
APP_PASSWORD=your_secure_password

# Session Secret (generate with: openssl rand -hex 32)
SESSION_SECRET=your_random_session_secret
```

Generate a secure session secret:
```bash
openssl rand -hex 32
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

1. Open your browser: `http://YOUR_SERVER_IP:9000`
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
SERVER_IP=10.69.10.15
PROJECT_NAME=eve-esi-user1

# EVE Developer Application
EVE_CLIENT_ID=your_client_id_1
EVE_CLIENT_SECRET=your_client_secret_1
EVE_REDIRECT_URI=http://10.69.10.15:9000/auth/callback

# Application Login
APP_USERNAME=user1
APP_PASSWORD=password1

# Session Secret (generate a random string)
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
SERVER_IP=10.69.10.15
PROJECT_NAME=eve-esi-user2       # ← Different project name!

# EVE Developer Application
EVE_CLIENT_ID=your_client_id_2
EVE_CLIENT_SECRET=your_client_secret_2
EVE_REDIRECT_URI=http://10.69.10.15:9001/auth/callback  # ← Matching port!

# Application Login
APP_USERNAME=user2
APP_PASSWORD=password2

# Session Secret
SESSION_SECRET=random_secret_2
```

Repeat for additional users with ports 9002, 9003, etc.

### EVE Developer Application Setup

#### Option 1: Separate Apps (Recommended)

Each user creates their own EVE Developer Application:
- User 1 callback: `http://10.69.10.15:9000/auth/callback`
- User 2 callback: `http://10.69.10.15:9001/auth/callback`
- User 3 callback: `http://10.69.10.15:9002/auth/callback`
- User 4 callback: `http://10.69.10.15:9003/auth/callback`

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
| User 1 | `http://10.69.10.15:9000` | 9000 |
| User 2 | `http://10.69.10.15:9001` | 9001 |
| User 3 | `http://10.69.10.15:9002` | 9002 |
| User 4 | `http://10.69.10.15:9003` | 9003 |

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

### Backend
- Node.js with Express
- SQLite database
- EVE ESI API integration
- Session-based authentication

### Frontend
- React 18
- React Router for navigation
- Axios for API calls
- CSS with EVE-inspired dark theme

### Infrastructure
- Docker & Docker Compose
- Nginx reverse proxy

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
| `PORT` | External port for the application | `9000` |
| `SERVER_IP` | Server IP address for callback URLs | `10.69.10.15` |
| `PROJECT_NAME` | Docker project name (for multi-instance) | `eve-esi-app` |
| `EVE_CLIENT_ID` | EVE SSO Client ID | (required) |
| `EVE_CLIENT_SECRET` | EVE SSO Secret Key | (required) |
| `EVE_REDIRECT_URI` | OAuth callback URL | auto-generated |
| `APP_USERNAME` | Application login username | (required) |
| `APP_PASSWORD` | Application login password | (required) |
| `SESSION_SECRET` | Express session secret | (required) |
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
- Planetary Interaction tracking
- Job completion notifications
- Blueprint library management
- Material efficiency tracking
- Cost calculations
- Export to CSV/Excel

---

## License

MIT License
