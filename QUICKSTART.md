# Quick Start Guide

Get EVE Industry Tracker running in 5 minutes!

---

## 1️⃣ Copy Environment File

```bash
cd eve-tracking-jobs
cp .env.example .env
```

## 2️⃣ Edit Configuration

```bash
nano .env
```

**Set your server address** (replace `YOUR_SERVER_ADDRESS`):

| Deployment Type | Example Value |
|-----------------|---------------|
| Local IP | `192.168.1.100` |
| Tailscale IP | `100.82.8.96` |
| Hostname | `eve-tracker.local` |
| Tailscale MagicDNS | `server.tailnet-abc.ts.net` |

**Update these lines in .env:**
```env
SERVER_IP=192.168.1.100                                    # Your IP/hostname
EVE_REDIRECT_URI=http://192.168.1.100:9000/auth/callback   # Match SERVER_IP
FRONTEND_URL=http://192.168.1.100:9000                     # Match SERVER_IP
```

## 3️⃣ Create EVE Developer Application

1. Go to: https://developers.eveonline.com/applications
2. Click **"Create New Application"**
3. Set **Callback URL** to: `http://YOUR_SERVER_ADDRESS:9000/auth/callback`
4. Enable these **ESI Scopes**:
   - ✅ `esi-industry.read_character_jobs.v1`
   - ✅ `esi-skills.read_skills.v1`
   - ✅ `esi-industry.read_corporation_jobs.v1`
   - ✅ `esi-corporations.read_corporation_membership.v1`
   - ✅ `esi-characters.read_corporation_roles.v1`
5. Copy **Client ID** and **Secret** to `.env`:
   ```env
   EVE_CLIENT_ID=your_client_id_here
   EVE_CLIENT_SECRET=your_secret_here
   ```

## 4️⃣ Set Login Credentials

```env
APP_USERNAME=your_username
APP_PASSWORD=your_secure_password
```

## 5️⃣ Generate Session Secret

```bash
openssl rand -base64 32
```

Copy output to `.env`:
```env
SESSION_SECRET=your_generated_secret_here
```

## 6️⃣ Build & Run

```bash
docker-compose down && git pull origin main && docker-compose up -d --build
```

Wait ~30 seconds for startup.

## 7️⃣ Access Application

Open in browser:
```
http://YOUR_SERVER_ADDRESS:9000
```

Login with your APP_USERNAME and APP_PASSWORD, then click **"Add Character"** to link EVE characters.

---

## ✅ Done!

For detailed configuration options, see:
- [Configuration Guide](docs/CONFIGURATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Full README](README.md)

---

## Quick Commands

| Command | Description |
|---------|-------------|
| `docker-compose down && git pull origin main && docker-compose up -d --build` | Build and start |
| `docker-compose down` | Stop containers |
| `docker-compose logs -f` | View logs |
| `docker-compose ps` | Check status |
| `curl http://localhost:9000/api/version` | Check version |
