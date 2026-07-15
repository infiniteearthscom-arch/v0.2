// galaxy.js -- player-scoped galaxy state. Today: visited-system
// tracking that backs the galaxy-map fog of war. Future: per-player
// system claims, bookmarks, jump-route caching, etc.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryAll, queryOne } from '../db/index.js';
import { logActivity } from '../lib/activity.js';

const router = express.Router();
router.use(authMiddleware);

// ============================================
// GET /galaxy/visits -- list this player's visited system procedural ids.
// Client merges into discoveredSystems on app start so the galaxy map
// renders fog of war correctly even on first paint.
// ============================================
router.get('/visits', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT system_procedural_id, first_visited_at
         FROM player_system_visits
        WHERE user_id = $1
        ORDER BY first_visited_at ASC`,
      [req.user.id]
    );
    res.json({
      visits: rows.map(r => r.system_procedural_id),
      // Full detail kept in case future UI wants "first visited Tuesday"
      // style metadata. Omit if it ever causes payload bloat.
      detail: rows,
    });
  } catch (e) {
    console.error('Error fetching visits:', e);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

// ============================================
// GET /galaxy/discoverers -- galaxy-wide map of system procedural id ->
// username of the FIRST pilot ever to enter it (earliest
// first_visited_at, user_id tie-break for determinism). Backs the
// "Discovered by" row in the galaxy-map info panel. Sol is excluded:
// every pilot starts there, so its earliest visit reflects
// registration order, not exploration.
// ============================================
router.get('/discoverers', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT DISTINCT ON (v.system_procedural_id)
              v.system_procedural_id, u.username
         FROM player_system_visits v
         JOIN users u ON u.id = v.user_id
        WHERE v.system_procedural_id <> 'sol'
        ORDER BY v.system_procedural_id, v.first_visited_at ASC, v.user_id`
    );
    const discoverers = {};
    for (const r of rows) discoverers[r.system_procedural_id] = r.username;
    res.json({ discoverers });
  } catch (e) {
    console.error('Error fetching discoverers:', e);
    res.status(500).json({ error: 'Failed to fetch discoverers' });
  }
});

// ============================================
// POST /galaxy/visit -- mark a system as visited. Idempotent (ON
// CONFLICT DO NOTHING preserves the first_visited_at timestamp).
// Fired by the client's enterSystem store action; no harm if it
// fails (next entry retries; client local state is the working copy).
// ============================================
router.post('/visit', async (req, res) => {
  try {
    const { system_procedural_id, system_name } = req.body;
    if (!system_procedural_id) {
      return res.status(400).json({ error: 'system_procedural_id required' });
    }
    // RETURNING ... only fires when a row is actually inserted -- the
    // ON CONFLICT DO NOTHING silently no-ops on re-visits. We use that
    // to gate the activity log: only emit on first-ever visit per
    // player, never on the normal every-jump pings.
    const inserted = await queryOne(
      `INSERT INTO player_system_visits (user_id, system_procedural_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, system_procedural_id) DO NOTHING
       RETURNING user_id`,
      [req.user.id, system_procedural_id]
    );
    if (inserted) {
      // Fire-and-forget. Activity log failures must not break the
      // primary flow -- the player has discovered the system; the
      // ticker entry is just an ambient nice-to-have.
      logActivity({
        userId: req.user.id,
        senderName: req.user.username,
        type: 'system_discovered',
        systemId: system_procedural_id,
        payload: { system_name: system_name || system_procedural_id },
      });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Error recording visit:', e);
    res.status(500).json({ error: 'Failed to record visit' });
  }
});

export default router;
