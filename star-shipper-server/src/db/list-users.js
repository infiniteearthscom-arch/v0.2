// List every player — `npm run db:users` from the DO console.
// =============================================================
// Admin view of who has an account. One row per user, most recently
// active first. "Last active" is derived from the newest of the
// player's activity_events / chat_messages / player_system_visits rows,
// because users.last_seen_at is never written (updateUserOnline has no
// callers). NULL last active = registered but never did anything logged.
//
// Pass a number to limit rows: `npm run db:users -- 20`.

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const limit = Math.max(1, parseInt(process.argv[2], 10) || 500);

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(
    `SELECT u.username,
            u.email,
            u.auth_provider,
            u.credits::BIGINT AS credits,
            u.created_at,
            GREATEST(
              (SELECT MAX(created_at)      FROM activity_events      WHERE user_id = u.id),
              (SELECT MAX(created_at)      FROM chat_messages        WHERE sender_id = u.id),
              (SELECT MAX(first_visited_at) FROM player_system_visits WHERE user_id = u.id)
            ) AS last_active
       FROM users u
      ORDER BY last_active DESC NULLS LAST, u.created_at DESC
      LIMIT $1`,
    [limit]
  );

  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—');
  const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

  console.log(`${rows.length} player(s)\n`);
  console.log(`${pad('USERNAME', 20)} ${pad('EMAIL', 32)} ${pad('VIA', 7)} ${pad('CREDITS', 10)} ${pad('JOINED', 16)} ${pad('LAST ACTIVE', 16)}`);
  console.log('-'.repeat(20 + 1 + 32 + 1 + 7 + 1 + 10 + 1 + 16 + 1 + 16));
  for (const r of rows) {
    console.log(
      `${pad(r.username, 20)} ${pad(r.email, 32)} ${pad(r.auth_provider, 7)} ` +
      `${pad(r.credits, 10)} ${pad(fmt(r.created_at), 16)} ${pad(fmt(r.last_active), 16)}`
    );
  }
} catch (err) {
  console.error('❌ FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
