import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Or use individual params:
  // host: process.env.DB_HOST,
  // port: process.env.DB_PORT,
  // database: process.env.DB_NAME,
  // user: process.env.DB_USER,
  // password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('📦 Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
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
    await client.query('ROLLBACK');
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
