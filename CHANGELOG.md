# Changelog

## [1.0.1] - 2026-02-28

### Fixed
- **EVE SSO Invalid Scope Error**: Removed the invalid scope `esi-corporations.read_corporation_membership.v1` from the authentication request. This scope was causing the "invalid_scope" error during EVE character linking.

### Changed
- Simplified EVE SSO scopes for Phase 1 to only request `esi-industry.read_character_jobs.v1`
- Phase 1 focuses on **personal** industry jobs only; corporation features will be added in Phase 2

### Notes
- If you previously attempted to link a character and received the scope error, you will need to:
  1. Rebuild the Docker containers
  2. Clear any cached browser data/cookies
  3. Re-attempt the EVE character linking

---

## [1.0.0] - Initial Release

### Features
- User authentication (username/password)
- EVE SSO OAuth2 with PKCE integration
- Character linking
- Personal industry jobs display
- Docker deployment support
