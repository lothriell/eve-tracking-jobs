# Security Guidelines

This document outlines security best practices and procedures for the EVE ESI application.

## Sensitive Files

### Files Containing Sensitive Data

| File | Contains | Risk Level |
|------|----------|------------|
| `.env` | EVE API credentials, session secrets, passwords | 🔴 **Critical** |
| `backend/database/data/eve_esi.db` | User data, character tokens | 🔴 **Critical** |
| `docker-compose.override.yml` | Custom environment variables | 🟡 **Medium** |

### Files That Should NEVER Be Committed

```
.env                    # Environment variables with secrets
.env.local              # Local environment overrides
.env.production         # Production secrets
*.db                    # Database files with user data
*.db-journal            # SQLite journal files
```

## Handling the .env File

### Best Practices

1. **Never commit .env to Git**
   - The `.gitignore` already excludes it
   - Always verify before pushing: `git status`

2. **Use strong secrets**
   ```bash
   # Generate a secure SESSION_SECRET
   openssl rand -base64 32
   ```

3. **Rotate secrets periodically**
   - Change `SESSION_SECRET` every 90 days
   - Regenerate EVE API credentials if compromised

4. **Use different credentials per environment**
   - Development: Use a separate EVE Developer Application
   - Production: Use production-specific credentials

### If .env Was Accidentally Committed

⚠️ **IMMEDIATE ACTIONS REQUIRED**:

1. **Remove from Git history**
   ```bash
   # Remove the file from history (requires force push)
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch .env" \
     --prune-empty --tag-name-filter cat -- --all
   
   # Force push (DANGEROUS - coordinate with team)
   git push origin --force --all
   ```

2. **Rotate ALL credentials immediately**
   - Go to [EVE Developers Portal](https://developers.eveonline.com/)
   - Revoke the compromised application
   - Create a new application with new credentials
   - Update `.env` with new values
   - Change `SESSION_SECRET`
   - Change `APP_PASSWORD`

3. **Notify team members**
   - All team members must re-pull
   - Coordinate the force push

## Credential Storage

### EVE Online API Credentials

- `EVE_CLIENT_ID` and `EVE_CLIENT_SECRET` are obtained from [developers.eveonline.com](https://developers.eveonline.com/)
- Store only in `.env` file
- Never hardcode in source files
- Never log or print these values

### Session Secret

- Used for signing session cookies
- Must be a strong, random string (minimum 32 characters)
- If compromised, all user sessions become invalid

### Application Password

- Used for the default admin user
- Should be strong and unique
- Consider implementing proper password policies for production

## Access Token Security

### EVE SSO Tokens

- Access tokens are stored in the SQLite database
- Tokens are automatically refreshed before expiry
- Refresh tokens provide long-term access
- If database is compromised, all character tokens must be revoked

### Revoking Compromised Tokens

If you suspect token compromise:

1. Users should revoke access at: https://community.eveonline.com/support/third-party-applications/
2. Delete the character from the application database
3. Re-link the character with fresh tokens

## Docker Security

### Volume Security

- Database is stored in Docker volume `eve-esi-data`
- Volume data persists after container removal
- Secure the Docker host appropriately

### Network Security

- Services communicate via `eve-esi-network`
- Only frontend port (9000) should be exposed publicly
- Backend port (3001) should only be accessible internally

## Production Deployment Checklist

- [ ] `.env` file is not in repository
- [ ] Strong, unique `SESSION_SECRET` generated
- [ ] EVE API credentials are for production application
- [ ] `APP_PASSWORD` is strong and unique
- [ ] Database volume is backed up regularly
- [ ] HTTPS is configured (via reverse proxy)
- [ ] Access logs are monitored
- [ ] Regular security updates applied

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** create a public issue
2. Contact the repository maintainers privately
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

## Security Checklist for Contributors

Before committing:

- [ ] No credentials hardcoded in code
- [ ] No `.env` file in commit
- [ ] No API keys in comments or documentation
- [ ] No database files in commit
- [ ] `git status` shows only intended files

## Additional Resources

- [EVE Online Security Best Practices](https://developers.eveonline.com/)
- [OWASP Security Guidelines](https://owasp.org/)
- [Git Security Best Practices](https://git-scm.com/book/en/v2/Git-Tools-Signing-Your-Work)
