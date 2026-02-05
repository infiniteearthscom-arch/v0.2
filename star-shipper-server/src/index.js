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
  max: 100, // Limit each IP to 100 requests per windowMs
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

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ships', shipsRoutes);

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
