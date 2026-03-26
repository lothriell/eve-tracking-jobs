require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const db = require('./database/db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { startCacheRefresh, stopCacheRefresh } = require('./services/cacheRefresh');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'eve-esi-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function start() {
  try {
    await db.init();
    startCacheRefresh();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`EVE ESI Backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  stopCacheRefresh();
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  stopCacheRefresh();
  db.close();
  process.exit(0);
});

start();
