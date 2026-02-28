# EVE Online ESI Web Application

A web application for tracking EVE Online industry jobs across multiple characters using the EVE Swagger Interface (ESI).

## Features

### Phase 2 (Current Version)

#### Multiple Character Support
- Link multiple EVE Online characters to a single account
- Support for characters across different accounts
- Character management via sidebar

#### Sidebar Navigation
- Collapsible sidebar with character list
- Character portraits with thumbnails
- Quick character switching
- Navigation between Dashboard and Industry Jobs views
- "Add Character" button for linking additional characters

#### Dashboard
- Aggregate statistics across all characters
- Total job slot summary (Manufacturing, Science, Reactions)
- Per-character job counts and slot usage
- Jobs breakdown by activity type
- Visual progress bars

#### Industry Jobs View
- **EVE-like Time Display**: Time remaining shown as "XD HH:MM:SS" format
- **Real-time Countdown**: Live updating time remaining
- **Blueprint Icons**: Fetched from EVE image service
- **Blueprint Names**: Resolved from ESI
- **Activity Categories**: Manufacturing, Science (TE/ME Research, Copying, Invention), Reactions
- **Status Badges**: Active, Ready, Delivered, Paused, Cancelled
- **Progress Bars**: Visual job completion indicator
- **Installer Names**: Shows who installed each job

#### Job Slot Tracking
- Manufacturing jobs: X / Y (current/max slots)
- Science jobs: X / Y
- Reactions: X / Y
- Color coding: Green (available), Yellow (near full), Red (full)
- Slot counts calculated from character skills

#### Filters
- Filter by activity type (All, Manufacturing, Science, Reactions)
- Filter by status (All, Active, Ready, Delivered)
- View all characters or specific character

### Phase 1 Features
- Simple username/password authentication
- Single character linking via EVE SSO
- Basic industry jobs display
- Character portrait display

## Prerequisites

- Docker and Docker Compose
- EVE Online Developer Application credentials

## Setup

### 1. Create EVE SSO Application

1. Go to [EVE Developers](https://developers.eveonline.com/)
2. Create a new application
3. Set the callback URL to: `http://YOUR_SERVER_IP:9000/auth/callback`
4. Select the following scopes:
   - `esi-industry.read_character_jobs.v1`
   - `esi-skills.read_skills.v1`
5. Note your Client ID and Secret Key

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# EVE Online SSO Configuration
EVE_CLIENT_ID=your_client_id
EVE_CLIENT_SECRET=your_secret_key
EVE_REDIRECT_URI=http://YOUR_SERVER_IP:9000/auth/callback

# Application Credentials
APP_USERNAME=your_username
APP_PASSWORD=your_secure_password

# Session Secret (generate with: openssl rand -hex 32)
SESSION_SECRET=your_session_secret
```

### 3. Build and Run

```bash
# Build and start the application
docker-compose up -d --build

# View logs
docker-compose logs -f
```

### 4. Access the Application

Open `http://YOUR_SERVER_IP:9000` in your browser.

## Usage

### Linking Characters

1. Log in with your application credentials
2. Click "Add Character" in the sidebar
3. Authorize the application with your EVE account
4. Repeat for additional characters

### Viewing Industry Jobs

1. Select "Industry Jobs" from the navigation
2. Choose a specific character or view all characters
3. Use filters to narrow down results
4. Jobs update in real-time with countdown timers

### Dashboard

1. Select "Dashboard" from the navigation
2. View aggregate statistics across all characters
3. See per-character job summaries
4. Monitor slot usage across all characters

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/check` - Check authentication status
- `GET /auth/eve/authorize` - Initiate EVE SSO
- `GET /auth/callback` - EVE SSO callback

### Characters
- `GET /api/character` - Get first linked character (legacy)
- `GET /api/characters` - Get all linked characters
- `GET /api/characters/:characterId` - Get specific character
- `DELETE /api/characters/:characterId` - Remove character
- `GET /api/character/portrait/:characterId` - Get portrait URL

### Industry
- `GET /api/industry/jobs` - Get industry jobs
  - Query params: `characterId`, `all=true`
- `GET /api/industry/slots` - Get job slot usage
  - Query params: `characterId`, `all=true`

### Dashboard
- `GET /api/dashboard/stats` - Get aggregate statistics

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

## Development

### Local Development

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm start
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `EVE_CLIENT_ID` | EVE SSO Client ID |
| `EVE_CLIENT_SECRET` | EVE SSO Secret Key |
| `EVE_REDIRECT_URI` | OAuth callback URL |
| `APP_USERNAME` | Application login username |
| `APP_PASSWORD` | Application login password |
| `SESSION_SECRET` | Express session secret |
| `DB_PATH` | SQLite database path |

## Troubleshooting

### "invalid_scope" Error
Ensure your EVE SSO application has the required scopes enabled.

### "Cannot GET /auth/callback"
The redirect URI must match exactly what's configured in your EVE application.

### Jobs Not Loading
1. Check that the character has the required ESI scopes
2. Verify the character's tokens haven't expired
3. Check backend logs for ESI errors

### Slot Counts Incorrect
Slot counts are calculated from character skills. Ensure `esi-skills.read_skills.v1` scope is authorized.

## Future Enhancements

- Corporation job support
- Job completion notifications
- Blueprint library management
- Material efficiency tracking
- Cost calculations
- Export to CSV/Excel

## License

MIT License
