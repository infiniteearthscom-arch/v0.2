// Chat REST API -- multiplayer Phase 2 step 1.
// =============================================================
// Today's only endpoint: GET /chat/history -- pulls the last N
// messages for a channel + channel_id so the client can hydrate
// when it opens a tab. Live messages keep flowing via the socket.io
// 'chat:message' event handled in realtime/chat.js.
//
//   GET /api/chat/history?channel=system&channel_id=sol&limit=50
//   GET /api/chat/history?channel=global&limit=50
//   GET /api/chat/history?channel=fleet&limit=50            (returns
//                                                            sender's
//                                                            own fleet
//                                                            history)
//
// Response shape mirrors the wire shape of socket 'chat:message' so
// the client can treat historical + live messages identically.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { queryAll } from '../db/index.js';
import { getMembershipFor } from '../lib/corp.js';

const router = express.Router();

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const VALID_CHANNELS = new Set(['system', 'global', 'fleet']);

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const channel = String(req.query.channel || '').toLowerCase();
    if (!VALID_CHANNELS.has(channel)) {
      return res.status(400).json({ error: 'Invalid channel' });
    }
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    let channelId = req.query.channel_id || null;
    if (channel === 'system' && !channelId) {
      return res.status(400).json({ error: 'channel_id required for system channel' });
    }
    if (channel === 'fleet') {
      // Step 7: fleet = corp channel. History scopes to the
      // requesting user's corp_id (which is what realtime/chat.js
      // stamps as channel_id on send). If they're not in a corp,
      // there's nothing for them to read -- return empty.
      const membership = await getMembershipFor(req.user.id);
      if (!membership) return res.json({ messages: [] });
      channelId = membership.corp_id;
    }
    if (channel === 'global') channelId = null;

    // Query is keyed by the (channel_type, channel_id, created_at DESC)
    // composite index recreated in migration 056. Newest-first; the
    // client reverses for natural display order.
    let rows;
    if (channelId === null) {
      rows = await queryAll(
        `SELECT id, channel_type AS channel, channel_id, sender_id, sender_name,
                content AS text, created_at
           FROM chat_messages
          WHERE channel_type = $1 AND channel_id IS NULL
          ORDER BY created_at DESC
          LIMIT $2`,
        [channel, limit]
      );
    } else {
      rows = await queryAll(
        `SELECT id, channel_type AS channel, channel_id, sender_id, sender_name,
                content AS text, created_at
           FROM chat_messages
          WHERE channel_type = $1 AND channel_id = $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [channel, channelId, limit]
      );
    }

    const messages = rows.map(r => ({
      id: r.id,
      channel: r.channel,
      channel_id: r.channel_id,
      sender_id: r.sender_id,
      sender_name: r.sender_name,
      text: r.text,
      ts: new Date(r.created_at).getTime(),
    }));

    res.json({ messages });
  } catch (err) {
    console.error('chat history error', err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

export default router;
