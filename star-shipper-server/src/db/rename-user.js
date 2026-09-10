// Rename a player — `npm run db:rename -- OLDNAME NEWNAME` from the DO console.
// =============================================================
// There is no in-game rename feature. `users.username` is the name shown
// everywhere (chat, presence tags, leaderboards, profile, mail). Login is
// by email, so renaming never affects sign-in.
//
// Two tables snapshot the name at write time, so they are updated too or
// old chat lines / ticker events would keep showing the old name:
//   chat_messages.sender_name    (keyed by sender_id)
//   activity_events.sender_name  (keyed by user_id)
//
// Everything runs in one transaction — either all three tables change or
// none do. Same validation rules as registration: 3–32 chars, [A-Za-z0-9_],
// unique. Names are case-sensitive.

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const [oldName, newName] = process.argv.slice(2);

if (!oldName || !newName) {
  console.error('Usage: npm run db:rename -- OLDNAME NEWNAME');
  process.exit(1);
}
if (newName.length < 3 || newName.length > 32 || !/^[a-zA-Z0-9_]+$/.test(newName)) {
  console.error('❌ NEWNAME must be 3–32 characters, letters/digits/underscore only');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const user = await client.query(
    `UPDATE users SET username = $2, display_name = $2
     WHERE username = $1
     RETURNING id`,
    [oldName, newName]
  );
  if (user.rowCount !== 1) {
    throw new Error(`user not found: "${oldName}" (names are case-sensitive)`);
  }
  const userId = user.rows[0].id;

  const chat = await client.query(
    `UPDATE chat_messages SET sender_name = $2 WHERE sender_id = $1`,
    [userId, newName]
  );
  const activity = await client.query(
    `UPDATE activity_events SET sender_name = $2 WHERE user_id = $1`,
    [userId, newName]
  );

  await client.query('COMMIT');
  console.log(`✅ renamed "${oldName}" → "${newName}"`);
  console.log(`   chat messages updated: ${chat.rowCount}`);
  console.log(`   activity events updated: ${activity.rowCount}`);
  console.log('   Ask the player to refresh the game.');
} catch (err) {
  await client.query('ROLLBACK');
  if (err.code === '23505') {
    console.error(`❌ "${newName}" is already taken`);
  } else {
    console.error('❌ FAILED, nothing changed:', err.message);
  }
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
