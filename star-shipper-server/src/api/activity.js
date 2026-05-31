// Activity REST API -- Social Multiplayer Step 3.
// =============================================================
// One endpoint today: GET /activity/recent -- pulls the last N events
// galaxy-wide so the client ticker can hydrate on connect. Live events
// keep flowing via the socket 'activity:event' broadcast (lib/activity.js).
//
//   GET /api/activity/recent?limit=50
//
// Response shape mirrors the wire shape of the socket event so the
// client can treat historical + live events identically.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { queryAll } from '../db/index.js';

const router = express.Router();

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

router.get('/recent', authMiddleware, async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const rows = await queryAll(
      `SELECT id, user_id, sender_name, event_type, system_id, payload, created_at
         FROM activity_events
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );

    const events = rows.map(r => ({
      id: r.id,
      type: r.event_type,
      sender_id: r.user_id,
      sender_name: r.sender_name,
      system_id: r.system_id,
      payload: r.payload,
      ts: new Date(r.created_at).getTime(),
    }));

    res.json({ events });
  } catch (err) {
    console.error('activity recent error', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

export default router;
