# EVE Industry Tracker - Documentation

## 📚 Documentation Index

### Getting Started
- [Installation Guide](../README.md#installation-guide) - Complete installation instructions
- [Quick Start Guide](../QUICKSTART.md) - Fast setup for experienced users
- [Configuration Guide](CONFIGURATION.md) - Detailed configuration options

### Deployment
- [Deployment Options](CONFIGURATION.md#deployment-examples) - Local IP, Tailscale, Hostname, MagicDNS
- [Multi-Instance Setup](../README.md#multi-instance-deployment) - Running multiple instances

### Reference
- [Version History](../README.md#version-history) - All versions and changes
- [Changelog](../CHANGELOG.md) - Detailed change log
- [Environment Variables](CONFIGURATION.md#environment-variables) - All .env variables

### Troubleshooting
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Solutions to common problems

---

## 🔗 Quick Links

| Resource | URL |
|----------|-----|
| GitHub Repository | https://github.com/lothriell/eve-tracking-jobs |
| EVE Developer Console | https://developers.eveonline.com/applications |
| Docker Documentation | https://docs.docker.com/ |

---

## 📁 Project Structure

```
eve-tracking-jobs/
├── README.md              # Main documentation
├── QUICKSTART.md          # Quick setup guide
├── CHANGELOG.md           # Version history
├── .env.example           # Environment template
├── docker-compose.yml     # Docker configuration
├── docs/
│   ├── README.md          # This file (documentation index)
│   ├── CONFIGURATION.md   # Configuration guide
│   └── TROUBLESHOOTING.md # Troubleshooting guide
├── backend/               # Node.js API server
│   ├── server.js
│   ├── controllers/
│   ├── services/
│   └── database/
└── frontend/              # React application
    ├── src/
    ├── public/
    └── nginx.conf         # Nginx configuration
```

---

## ⚙️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                          │
│                  http://SERVER_IP:9000                   │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│              Frontend (Nginx + React)                    │
│                    Port 9000                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Serves React SPA                                  │  │
│  │  Proxies /auth/* and /api/* to backend            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│               Backend (Node.js + Express)                │
│                    Port 3001                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  REST API                                          │  │
│  │  EVE SSO Authentication                            │  │
│  │  ESI API Integration                               │  │
│  │  SQLite Database                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                    EVE Online APIs                       │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   EVE SSO       │    │        ESI API              │ │
│  │   (OAuth 2.0)   │    │   (Industry, Skills, etc.)  │ │
│  └─────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Notes

1. **Never commit .env file** - Contains secrets
2. **Use strong passwords** - For APP_PASSWORD
3. **Generate unique session secrets** - Use `openssl rand -base64 32`
4. **Keep Docker updated** - Security patches
5. **Firewall rules** - Only expose port 9000

---

## 📝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

**EVE Industry Tracker** - Track your industrial empire! 🏭
