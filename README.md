# EVE Online ESI Web Application - Phase 1

A local LAN web application for EVE Online ESI (EVE Swagger Interface) integration, featuring character authentication, industry job tracking, and automatic token management.

## 📋 Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [EVE SSO Application Setup](#eve-sso-application-setup)
- [Installation & Configuration](#installation--configuration)
- [Deployment](#deployment)
- [Usage](#usage)
- [Technical Details](#technical-details)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements](#future-enhancements)

## ✨ Features

### Phase 1 (Current)
- **Simple Authentication**: Username/password login (credentials stored in `.env`)
- **EVE SSO Integration**: OAuth2 with PKCE flow to securely link one EVE character
- **Character Management**: 
  - Display character portrait from EVE image service
  - Show character name and ID
  - Automatic token refresh (EVE tokens expire after 20 minutes)
- **Industry Jobs**: View personal industry jobs for the linked character
- **Modern UI**: Clean, responsive React-based interface
- **Persistent Storage**: SQLite database with Docker volume
- **LAN Access**: Accessible from any PC on your local network

## 🔧 Prerequisites

Before you begin, ensure you have the following installed on your Arch Linux host (10.69.10.15):

- **Docker**: Container runtime
  ```bash
  sudo pacman -S docker
  sudo systemctl enable --now docker
  ```

- **Docker Compose**: Container orchestration
  ```bash
  sudo pacman -S docker-compose
  ```

- **User Permissions**: Add your user to the docker group
  ```bash
  sudo usermod -aG docker $USER
  # Log out and log back in for changes to take effect
  ```

## 🎮 EVE SSO Application Setup

You need to create an EVE Online SSO application to get your Client ID and Secret. Follow these steps:

### Step 1: Access EVE Developers Portal
1. Go to [https://developers.eveonline.com/](https://developers.eveonline.com/)
2. Log in with your EVE Online account

### Step 2: Create New Application
1. Click on **"Manage Applications"** in the top menu
2. Click **"Create New Application"**
3. Fill in the application details:
   - **Application Name**: `EVE ESI Local App` (or any name you prefer)
   - **Description**: `Personal EVE industry management application`
   - **Connection Type**: Select **"Authentication & API Access"**

### Step 3: Configure Callback URL
**IMPORTANT**: The callback URL must match your network configuration.

- **Callback URL**: `http://10.69.10.15:9000/auth/callback`

⚠️ **Note**: This URL must be exact. The port `9000` must match the port in your docker-compose.yml.

### Step 4: Select Scopes
Select the following ESI scopes (required for Phase 1):

- ✅ `esi-industry.read_character_jobs.v1` - View character industry jobs
- ✅ `esi-assets.read_assets.v1` - View character assets (for future use)
- ✅ `esi-corporations.read_corporation_membership.v1` - View corporation membership (for future use)

### Step 5: Get Your Credentials
1. Click **"Create Application"**
2. You'll see your application details
3. **Copy the following**:
   - **Client ID**: A long string like `abc123def456...`
   - **Secret Key**: Click "View Secret Key" and copy it
   
⚠️ **IMPORTANT**: Keep these credentials secure! Do not share them or commit them to version control.

## 📦 Installation & Configuration

### Step 1: Download/Clone the Application

If you received this as a directory, navigate to it:
```bash
cd /path/to/eve_esi_app
```

### Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your favorite text editor:
   ```bash
   nano .env
   # or
   vim .env
   ```

3. Fill in your credentials:
   ```env
   # EVE Online SSO Configuration
   EVE_CLIENT_ID=your_client_id_from_eve_developers
   EVE_CLIENT_SECRET=your_secret_from_eve_developers
   EVE_REDIRECT_URI=http://10.69.10.15:9000/auth/callback
   
   # Application Credentials (choose your own)
   APP_USERNAME=admin
   APP_PASSWORD=YourSecurePassword123!
   
   # Session Secret (generate a random string)
   SESSION_SECRET=your_random_secret_here
   ```

4. Generate a secure session secret (recommended):
   ```bash
   openssl rand -base64 32
   ```
   Copy the output and use it as your `SESSION_SECRET`.

## 🚀 Deployment

### Start the Application

1. Build and start the Docker containers:
   ```bash
   docker-compose up -d
   ```

2. Check that containers are running:
   ```bash
   docker-compose ps
   ```

   You should see two containers running:
   - `eve-esi-backend` on port 3001
   - `eve-esi-frontend` on port 9000

3. View logs (optional):
   ```bash
   # All services
   docker-compose logs -f
   
   # Backend only
   docker-compose logs -f backend
   
   # Frontend only
   docker-compose logs -f frontend
   ```

### Access the Application

From any PC on your LAN (including the host):
- Open a web browser
- Navigate to: **http://10.69.10.15:9000**

## 📱 Usage

### Step 1: Login
1. Open http://10.69.10.15:9000 in your browser
2. You'll see the login page
3. Enter your credentials:
   - **Username**: The `APP_USERNAME` from your `.env` file
   - **Password**: The `APP_PASSWORD` from your `.env` file
4. Click **Login**

### Step 2: Link Your EVE Character
1. After login, you'll see the dashboard
2. Click the **"Link EVE Character"** button
3. You'll be redirected to EVE Online's SSO login page
4. Login with your EVE Online account
5. Select the character you want to link
6. Click **"Authorize"** to grant the required permissions
7. You'll be redirected back to the application

### Step 3: View Character & Industry Jobs
Once linked, you'll see:
- **Character Information**:
  - Character portrait (256x256 image)
  - Character name
  - Character ID
  - Linked status badge

- **Industry Jobs Table**:
  - Job ID
  - Activity type (Manufacturing, Research, Copying, etc.)
  - Status (Active, Ready, etc.)
  - Number of runs
  - Start and end dates

### Additional Actions

- **Refresh Jobs**: Reload the page to fetch latest jobs
- **Logout**: Click the "Logout" button in the top-right corner
- **Token Management**: Tokens are automatically refreshed when they expire (every 20 minutes)

## 🔍 Technical Details

### Architecture

```
┌─────────────────┐
│  Browser (LAN)  │
│  10.69.10.15    │
└────────┬────────┘
         │ Port 9000
         ▼
┌─────────────────────────────────────┐
│  Frontend Container (nginx)         │
│  - React SPA                        │
│  - Routes: /, /login                │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Backend Container (Node.js)        │
│  - Express API (Port 3001)          │
│  - Routes:                          │
│    • /auth/* - Authentication       │
│    • /api/* - Character & Jobs      │
│  - SQLite Database (Volume)         │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  EVE Online ESI API                 │
│  https://esi.evetech.net/latest/    │
└─────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Node.js 18 (Alpine Linux)
- Express.js - Web framework
- SQLite3 - Database
- bcrypt - Password hashing
- axios - HTTP client for ESI API
- express-session - Session management

**Frontend:**
- React 18 - UI framework
- React Router v6 - Client-side routing
- axios - API communication
- nginx - Production web server

**DevOps:**
- Docker - Containerization
- Docker Compose - Multi-container orchestration
- Volume - Persistent SQLite storage

### Database Schema

**users table:**
- `id` - Primary key
- `username` - Unique username
- `password_hash` - bcrypt hashed password
- `created_at` - Timestamp

**characters table:**
- `id` - Primary key
- `user_id` - Foreign key to users
- `character_id` - EVE character ID (unique)
- `character_name` - Character name
- `access_token` - Current OAuth access token
- `refresh_token` - OAuth refresh token
- `token_expiry` - Token expiration timestamp
- `scopes` - Granted ESI scopes
- `created_at` - Timestamp
- `updated_at` - Last update timestamp

### API Endpoints

**Authentication:**
- `POST /auth/login` - Username/password login
- `POST /auth/logout` - Logout
- `GET /auth/check` - Check authentication status
- `GET /auth/eve/authorize` - Initiate EVE SSO flow
- `GET /auth/eve/callback` - EVE SSO callback handler

**Character & Data:**
- `GET /api/character` - Get linked character info
- `GET /api/character/portrait` - Get character portrait URL
- `GET /api/industry/jobs` - Get character industry jobs

### Security Features

- **Password Hashing**: bcrypt with salt rounds
- **PKCE OAuth2**: Prevents authorization code interception
- **Session Management**: Secure HTTP-only cookies
- **Automatic Token Refresh**: Tokens refreshed before expiry
- **Rate Limiting**: ESI API rate limit compliance (20 req/s)
- **Error Handling**: Graceful handling of expired tokens and missing scopes

## 🐛 Troubleshooting

### Cannot Access Application from Other PCs

**Problem**: http://10.69.10.15:9000 doesn't load from other computers on the LAN.

**Solutions**:
1. Check firewall on the host:
   ```bash
   sudo ufw allow 9000/tcp
   sudo ufw allow 3001/tcp
   ```

2. Verify containers are running:
   ```bash
   docker-compose ps
   ```

3. Check if ports are listening:
   ```bash
   sudo netstat -tulpn | grep -E '9000|3001'
   ```

### EVE SSO Login Fails

**Problem**: OAuth redirect doesn't work or shows error.

**Solutions**:
1. Verify your callback URL in EVE Developers console exactly matches:
   ```
   http://10.69.10.15:9000/auth/callback
   ```

2. Check environment variables are set correctly:
   ```bash
   docker-compose exec backend env | grep EVE
   ```

3. Look for errors in backend logs:
   ```bash
   docker-compose logs backend
   ```

### No Industry Jobs Showing

**Problem**: Character linked but no jobs display.

**Solutions**:
1. **Check Scopes**: Ensure you granted `esi-industry.read_character_jobs.v1` during authorization
2. **Re-link Character**: If scopes were missing, re-link your character
3. **Check ESI Status**: Visit https://eve-offline.net/ to check if ESI is online
4. **No Active Jobs**: You might not have any active industry jobs

### Database Errors

**Problem**: SQLite errors or data not persisting.

**Solutions**:
1. Check volume exists:
   ```bash
   docker volume ls | grep eve-esi
   ```

2. Recreate volume:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```
   ⚠️ **Warning**: This deletes all data!

### Port Conflicts

**Problem**: Port 9000 or 3001 already in use.

**Solutions**:
1. Change ports in `docker-compose.yml`:
   ```yaml
   frontend:
     ports:
       - "8080:80"  # Change 9000 to 8080
   ```

2. Update callback URL in:
   - EVE Developers console
   - `.env` file (`EVE_REDIRECT_URI`)

### Forgot Login Credentials

**Problem**: Can't remember APP_USERNAME or APP_PASSWORD.

**Solutions**:
1. Check your `.env` file:
   ```bash
   cat .env | grep APP_
   ```

2. Change password in `.env` and restart:
   ```bash
   nano .env  # Edit APP_PASSWORD
   docker-compose restart backend
   ```

## 🔮 Future Enhancements

The following features are planned for future phases:

### Phase 2 - Multi-Character & Enhanced UI
- Support for multiple characters per user
- Sidebar navigation with dashboard layout
- Character switcher
- Enhanced industry job filtering and sorting
- Real-time job notifications
- Export jobs to CSV

### Phase 3 - Corporation Features
- Corporation industry job tracking
- Member management
- Corporation assets overview
- Shared bookmarks and locations

### Phase 4 - Advanced Features
- Planetary Interaction (PI) management
- Customs office tracking
- Market data integration
- Manufacturing profit calculator
- Blueprint library
- Asset tracking and search
- Contract monitoring

### Phase 5 - Analytics & Automation
- Industry job analytics and charts
- Automated notifications (Discord/Email)
- Job profitability analysis
- Historical data tracking
- API webhooks for external integrations

## 📄 License

This project is for personal use. EVE Online and all related content are property of CCP Games.

## 🙏 Acknowledgments

- CCP Games for EVE Online and ESI API
- EVE Swagger Interface (ESI) documentation
- Docker and the open-source community

---

**Project Structure:**
```
eve_esi_app/
├── backend/
│   ├── controllers/
│   ├── database/
│   ├── routes/
│   ├── services/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

**Support**: For issues or questions, check the Troubleshooting section above or review Docker logs.

**Version**: 1.0.0 (Phase 1)
