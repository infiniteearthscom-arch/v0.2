import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('📦 Database connected');
});

// Errors on IDLE pooled clients (server restart, network blip, DO
// failover) land here. Log and let the pool replace the dead client —
// exiting (the old behavior) turned a routine idle-connection drop
// into a full multi-second outage for every player. In-flight query
// errors are NOT handled here; they reject their own promises and are
// handled by each endpoint's try/catch. Audit fix 2026-09-02.
pool.on('error', (err) => {
  console.error('❌ Idle database client error (pool will recover):', err.message);
});

// Query helper
export const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('📝 Query:', { text: text.substring(0, 50), duration: `${duration}ms`, rows: result.rowCount });
  }

  return result;
};

// Transaction helper
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // If the connection itself died, ROLLBACK will also throw — swallow
    // that so the ORIGINAL error propagates, not the rollback failure.
    try { await client.query('ROLLBACK'); } catch { /* connection gone */ }
    throw error;
  } finally {
    client.release();
  }
};

// Get single row
export const queryOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Get all rows
export const queryAll = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

export default pool;