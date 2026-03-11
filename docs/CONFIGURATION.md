# EVE Industry Tracker - Configuration Architecture

## ✅ No Hardcoded IPs

The application is **fully configurable via `.env`** with **zero hardcoded IP addresses** in the source code.

---

## Frontend Architecture

### API Communication
- Uses **relative URLs** (e.g., `/api/version`, `/auth/login`)
- **No hardcoded IPs or backend URLs**
- Nginx proxies requests to the backend container

### How It Works
```
Browser → http://YOUR_IP:9000/api/jobs
         ↓
Nginx receives at /api/jobs
         ↓
Nginx proxies to http://backend:3001/api/jobs
         ↓
Backend responds
         ↓
Nginx returns to browser
```

### Benefits
- Works with **any IP address** (local, Tailscale, public)
- Works with **any hostname** or domain
- **No code changes** needed for different deployments

---

## Backend Architecture

### Environment Variables Used

| Variable | Purpose | Required |
|----------|---------|----------|
| `EVE_CLIENT_ID` | EVE SSO application ID | ✅ Yes |
| `EVE_CLIENT_SECRET` | EVE SSO secret | ✅ Yes |
| `EVE_REDIRECT_URI` | OAuth callback URL | ✅ Yes |
| `APP_USERNAME` | Login username | ✅ Yes |
| `APP_PASSWORD` | Login password | ✅ Yes |
| `SESSION_SECRET` | Session encryption | ✅ Yes |
| `FRONTEND_URL` | CORS origin | ✅ Yes |
| `PORT` | Backend port | Optional (default: 3001) |
| `ALLOWED_ORIGINS` | Additional CORS origins | Optional |

### No Hardcoded Values
- ✅ No hardcoded IPs
- ✅ No hardcoded URLs  
- ✅ No hardcoded credentials
- ✅ All configuration via `.env`

---

## Deployment Flexibility

Change deployment by updating `.env` only:

### Local Network
```env
SERVER_IP=192.168.1.100
FRONTEND_URL=http://192.168.1.100:9000
EVE_REDIRECT_URI=http://192.168.1.100:9000/auth/callback
```

### Tailscale
```env
SERVER_IP=100.82.8.96
FRONTEND_URL=http://100.82.8.96:9000
EVE_REDIRECT_URI=http://100.82.8.96:9000/auth/callback
```

### Custom Hostname
```env
SERVER_IP=eve-tracker.local
FRONTEND_URL=http://eve-tracker.local:9000
EVE_REDIRECT_URI=http://eve-tracker.local:9000/auth/callback
```

**No code changes required!**

---

## Verification Audit (v3.3.10)

### Frontend Source (`frontend/src/`)
| Pattern | Result |
|---------|--------|
| `10.69.10.15` | ✅ Not found |
| `100.82.8.96` | ✅ Not found |
| `192.168.x.x` | ✅ Not found |
| `localhost:3001` | ✅ Not found |

### Backend Source (`backend/*.js`)
| Pattern | Result |
|---------|--------|
| `10.69.10.15` | ✅ Not found |
| `100.82.8.96` | ✅ Not found |

### API Client Configuration
```javascript
// frontend/src/services/api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
// Uses relative URLs - nginx proxies to backend
```

---

## Summary

| Component | Configuration Method |
|-----------|---------------------|
| Frontend API calls | Relative URLs via nginx proxy |
| Backend CORS | `FRONTEND_URL` from `.env` |
| EVE SSO | `EVE_*` variables from `.env` |
| Authentication | `APP_*` variables from `.env` |
| Session | `SESSION_SECRET` from `.env` |

**Result:** 100% configurable via `.env` file with zero hardcoded values.
