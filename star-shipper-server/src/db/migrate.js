import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  console.log('🔄 Running database migrations...\n');

  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Get already executed migrations
    const executed = await pool.query('SELECT name FROM migrations');
    const executedNames = new Set(executed.rows.map(r => r.name));

    // Read migration files
    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (executedNames.has(file)) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`▶️  Running ${file}...`);

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await pool.query(sql);
      await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);

      console.log(`✅ Completed ${file}`);
    }

    console.log('\n✅ All migrations completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
