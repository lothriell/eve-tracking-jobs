# Troubleshooting Guide

Solutions to common issues with EVE Industry Tracker.

---

## 🔄 Loading Page Issues

### Symptom
- Page shows "Loading..." indefinitely
- No content appears after login

### Solutions

1. **Clear browser cache**
   ```
   Ctrl+Shift+R (hard refresh)
   ```

2. **Check containers are running**
   ```bash
   docker-compose ps
   ```
   Both `backend` and `frontend` should show "Up"

3. **Check backend logs**
   ```bash
   docker-compose logs backend | tail -50
   ```

4. **Rebuild containers**
   ```bash
   docker-compose down
   docker-compose down && git pull origin main && docker-compose up -d --build
   ```

---

## 🔐 EVE SSO Callback Error

### Symptom
- "Callback URL mismatch" error
- "invalid_request" after EVE login
- Redirected to error page

### Solutions

1. **Verify callback URL matches exactly**
   
   In EVE Developer Console:
   ```
   http://YOUR_SERVER_ADDRESS:9000/auth/callback
   ```
   
   In `.env` file:
   ```env
   EVE_REDIRECT_URI=http://YOUR_SERVER_ADDRESS:9000/auth/callback
   ```
   
   ⚠️ These must match **exactly** (including http/https, port, and path)

2. **Wait after updating EVE Developer Console**
   - Changes can take 5-10 minutes to propagate

3. **Clear browser cookies**
   - Delete cookies for your server address
   - Try incognito/private window

4. **Rebuild after .env changes**
   ```bash
   docker-compose down
   docker-compose down && git pull origin main && docker-compose up -d --build
   ```

---

## 🌐 Cannot Access Application

### Symptom
- Browser shows "Cannot connect"
- Connection timeout
- "Connection refused"

### Solutions

1. **Check containers are running**
   ```bash
   docker-compose ps
   ```

2. **Verify port is correct**
   ```bash
   docker-compose ps
   # Look for port mapping like "0.0.0.0:9000->80/tcp"
   ```

3. **Check firewall**
   ```bash
   # Allow port 9000 (varies by OS)
   sudo ufw allow 9000    # Ubuntu
   sudo firewall-cmd --add-port=9000/tcp --permanent  # RHEL/CentOS
   ```

4. **Test locally first**
   ```bash
   curl http://localhost:9000/api/version
   ```

5. **Verify SERVER_IP is correct**
   - Use the IP/hostname you can ping from your browser's machine
   - For Tailscale: `tailscale ip -4`

---

## 🔑 Invalid Scope Error

### Symptom
- "invalid_scope" error during EVE login
- "Missing required scope" error

### Solutions

1. **Enable ALL required scopes in EVE Developer Console**:
   - ✅ `esi-industry.read_character_jobs.v1`
   - ✅ `esi-skills.read_skills.v1`
   - ✅ `esi-industry.read_corporation_jobs.v1`
   - ✅ `esi-corporations.read_corporation_membership.v1`
   - ✅ `esi-characters.read_corporation_roles.v1`

2. **Wait 5-10 minutes** after adding scopes

3. **Re-authorize characters**
   - Remove character from sidebar (× button)
   - Click "Add Character" again
   - Authorize with updated scopes

---

## 🏭 Corporation Jobs Not Showing

### Symptom
- Personal jobs appear, but corporation jobs don't
- "No corporation jobs" message

### Solutions

1. **Verify character has required roles**
   - Must have **Director** or **Factory Manager** role in-game

2. **Check scope is enabled**
   - `esi-industry.read_corporation_jobs.v1` must be enabled
   - `esi-characters.read_corporation_roles.v1` must be enabled

3. **Re-authorize character** with updated scopes

---

## 📊 Slot Counts Incorrect

### Symptom
- Job slot counts don't match in-game
- "0/0" showing for slots

### Solutions

1. **Check skills scope is enabled**
   - `esi-skills.read_skills.v1` required

2. **Re-authorize character**

3. **Refresh data**
   - Click Refresh button
   - Wait for data to load

---

## 🐳 Docker Issues

### Container won't start

```bash
# Check for errors
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose down && git pull origin main && docker-compose up -d --build
```

### Port already in use

```bash
# Find what's using port 9000
lsof -i :9000

# Change port in .env
PORT=9001
```

### Out of disk space

```bash
# Clean up Docker
docker system prune -a
```

---

## 🔧 Environment Issues

### .env not loading

1. **Verify .env exists**
   ```bash
   ls -la .env
   ```

2. **Check for syntax errors**
   - No spaces around `=`
   - No quotes needed for simple values
   - No trailing spaces

3. **Rebuild containers**
   ```bash
   docker-compose down
   docker-compose down && git pull origin main && docker-compose up -d --build
   ```

### Session expiring too quickly

1. **Generate new session secret**
   ```bash
   openssl rand -base64 32
   ```

2. **Update SESSION_SECRET in .env**

3. **Rebuild containers**

---

## 📋 Diagnostic Commands

```bash
# Check container status
docker-compose ps

# View backend logs
docker-compose logs backend

# View frontend logs
docker-compose logs frontend

# Test API
curl http://localhost:9000/api/version

# Test backend directly
curl http://localhost:3001/health

# Check .env is loaded
docker-compose config | grep SERVER_IP
```

---

## 🆘 Still Need Help?

1. **Check the logs**
   ```bash
   docker-compose logs -f
   ```

2. **Review CHANGELOG.md** for breaking changes

3. **Check GitHub Issues** for similar problems

4. **Open a new issue** with:
   - Docker logs
   - .env file (with secrets redacted)
   - Browser console errors
   - Steps to reproduce
