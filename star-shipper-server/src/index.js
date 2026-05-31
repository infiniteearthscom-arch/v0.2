import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import modules
import pool from './db/index.js';
import authRoutes from './api/auth.js';
import shipsRoutes from './api/ships.js';
import resourcesRoutes from './api/resources.js';
import harvesterRoutes from './api/harvesters.js';
import fittingRoutes from './api/fitting.js';
import questRoutes from './api/quests.js';
import skillsRoutes from './api/skills.js';
import researchRoutes from './api/research.js';
import galaxyRoutes from './api/galaxy.js';
import chatRoutes from './api/chat.js';
import activityRoutes from './api/activity.js';
import leaderboardsRoutes from './api/leaderboards.js';
import profileRoutes from './api/profile.js';
import tradeRoutes from './api/trade.js';
import marketRoutes from './api/market.js';
import { setupSocketIO } from './realtime/socketHandler.js';

// ============================================
// EXPRESS SETUP
// ============================================

const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for game assets
}));

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ships', shipsRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/harvesters', harvesterRoutes);
app.use('/api/fitting', fittingRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/galaxy', galaxyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/leaderboards', leaderboardsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/market', marketRoutes);

// Realtime presence diag (Phase 1 verification). Counts only -- no
// user data -- so safe to leave unauthenticated. Returns 503 if the
// presence module hasn't attached (catches deploy misconfig). MUST be
// registered before the 404 catch-all below; the `io.presence` ref is
// resolved at request time (after setupSocketIO has run).
app.get('/api/diag/presence', (req, res) => {
  const p = io?.presence;
  if (!p || typeof p.stats !== 'function') {
    return res.status(503).json({ error: 'presence module not attached' });
  }
  res.json({ ...p.stats(), now: Date.now() });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// SOCKET.IO SETUP
// ============================================

const io = setupSocketIO(httpServer);
// Expose io on the express app so route modules (e.g. trade.js, which
// needs the presence-query helpers attached to io.presence) can reach
// it via `req.app.get('io')` without circular imports.
app.set('io', io);

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🚀 STAR SHIPPER SERVER                          ║
║                                                   ║
║   HTTP:   http://localhost:${PORT}                  ║
║   Socket: ws://localhost:${PORT}                    ║
║   Env:    ${process.env.NODE_ENV || 'development'}                        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    pool.end();
    process.exit(0);
  });
});
