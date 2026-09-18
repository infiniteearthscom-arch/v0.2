// Recalculate every ship's computed_* stats — `npm run db:recalc-ships`
// from the DO console.
// =============================================================
// computed_max_speed / computed_max_shield / computed_cargo / sensor /
// scan values are only refreshed when a module is fitted or unfitted.
// Run this after a change to the recalc math so existing ships pick it
// up without every player having to re-fit something.
//
// First use (2026-09-18): engines finally add speed — recalcShipStats
// now reads `speed_bonus`, which every seeded engine row carries.
//
// Idempotent; safe to re-run. Uses the SAME recalcShipStats the fit
// endpoint uses, so there is one source of truth for the math.

import dotenv from 'dotenv';
import pg from 'pg';
import { recalcShipStats } from '../api/fitting.js';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const client = await pool.connect();
let done = 0, failed = 0;
try {
  const { rows } = await client.query(`SELECT id, user_id, name, hull_type_id FROM ships ORDER BY user_id, created_at`);
  console.log(`🔧 Recalculating ${rows.length} ship(s)...`);
  for (const s of rows) {
    try {
      await client.query('BEGIN');
      await recalcShipStats(client, s.id, s.user_id);
      await client.query('COMMIT');
      done++;
    } catch (err) {
      await client.query('ROLLBACK');
      failed++;
      console.error(`❌ ${s.name || s.id} (${s.hull_type_id}): ${err.message}`);
    }
  }
  const sample = await client.query(
    `SELECT hull_type_id, COUNT(*)::int AS n, MIN(computed_max_speed) AS min_spd, MAX(computed_max_speed) AS max_spd
       FROM ships GROUP BY hull_type_id ORDER BY hull_type_id`
  );
  console.log(`\n✅ recalculated ${done}, failed ${failed}\n`);
  console.log('hull                 ships  speed range');
  for (const r of sample.rows) console.log(`${String(r.hull_type_id).padEnd(20)} ${String(r.n).padEnd(6)} ${r.min_spd}–${r.max_spd}`);
} catch (err) {
  console.error('❌ FAILED:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
