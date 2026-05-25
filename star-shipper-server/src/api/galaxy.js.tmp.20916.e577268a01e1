// galaxy.js -- player-scoped galaxy state. Today: visited-system
// tracking that backs the galaxy-map fog of war. Future: per-player
// system claims, bookmarks, jump-route caching, etc.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryAll } from '../db/index.js';

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
// POST /galaxy/visit -- mark a system as visited. Idempotent (ON
// CONFLICT DO NOTHING preserves the first_visited_at timestamp).
// Fired by the client's enterSystem store action; no harm if it
// fails (next entry retries; client local state is the working copy).
// ============================================
router.post('/visit', async (req, res) => {
  try {
    const { system_procedural_id } = req.body;
    if (!system_procedural_id) {
      return res.status(400).json({ error: 'system_procedural_id required' });
    }
    await query(
      `INSERT INTO player_system_visits (user_id, system_procedural_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, system_procedural_id) DO NOTHING`,
      [req.user.id, system_procedural_id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Error recording visit:', e);
    res.status(500).json({ error: 'Failed to record visit' });
  }
});

export default router;
