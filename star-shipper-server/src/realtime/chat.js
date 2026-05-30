// Realtime Chat -- multiplayer Phase 2 step 1.
// =============================================================
// Two channels for v1:
//   'system' -- broadcast to everyone in the sender's current
//               procedural system. Reuses the presence room
//               `presence:system:${systemId}` so we don't need a
//               separate room subscription path.
//   'global' -- broadcast to every connected client.
//
// 'fleet' channel is reserved for when corps land; for now it's
// silently dropped (no error) so the client can ship the UI tab
// even before the server fully supports it.
//
// PROTOCOL
//   Client -> Server: 'chat:send' { channel, text }
//   Server -> Client: 'chat:message' { id, channel, channel_id,
//                                       sender_id, sender_name, text, ts }
//   Server -> Client: 'chat:error'  { message }
//
// PERSISTENCE
// -----------
// Every successful broadcast also INSERTs into `chat_messages`. The
// REST history endpoint (api/chat.js) reads from that table for
// hydration on connect / channel switch. Schema fixed in migration
// 056 to allow VARCHAR(64) channel_id (was UUID-only) so procedural
// system ids fit.
//
// RATE LIMITING
// -------------
// Per-socket: max 1 message every 750ms. Defense against accidental
// rapid-fire (held-down enter) + casual spam. Real abuse needs more.

import { queryOne } from '../db/index.js';

const MAX_TEXT_LEN = 500;
const MIN_MSG_INTERVAL_MS = 750;
const VALID_CHANNELS = new Set(['system', 'global', 'fleet']);

// Same room prefix presence uses -- chat hitches a ride.
const systemRoomFor = (systemId) => `presence:system:${systemId}`;

export function attachChat(io) {
  // Per-socket last-message timestamp for rate limiting.
  const lastSendMs = new Map(); // socketId -> ms

  io.on('connection', (socket) => {
    const user = socket.user;
    if (!user) return;

    socket.on('chat:send', async (payload) => {
      try {
        const channel = String(payload?.channel || '').toLowerCase();
        const text = (payload?.text || '').toString().trim();

        if (!VALID_CHANNELS.has(channel)) {
          socket.emit('chat:error', { message: `Unknown channel: ${channel}` });
          return;
        }
        if (!text || text.length === 0) return; // silent drop
        if (text.length > MAX_TEXT_LEN) {
          socket.emit('chat:error', { message: `Message too long (max ${MAX_TEXT_LEN} chars)` });
          return;
        }

        // Rate limit (per socket). 750ms is conservative; tune later
        // if real conversation pace bumps into it.
        const now = Date.now();
        const last = lastSendMs.get(socket.id) || 0;
        if (now - last < MIN_MSG_INTERVAL_MS) {
          socket.emit('chat:error', { message: 'Slow down' });
          return;
        }
        lastSendMs.set(socket.id, now);

        // Determine channel_id + broadcast scope.
        let channelId = null;
        let broadcastTarget = null; // 'room:XXX' | 'all' | 'self'
        if (channel === 'system') {
          // socket.data.presence is owned by presence.js; we read but
          // never mutate. If user isn't in a system, drop (no error,
          // they can switch channels and try again).
          const systemId = socket.data?.presence?.systemId;
          if (!systemId) {
            socket.emit('chat:error', { message: 'Not in a system' });
            return;
          }
          channelId = systemId;
          broadcastTarget = { kind: 'room', room: systemRoomFor(systemId) };
        } else if (channel === 'global') {
          broadcastTarget = { kind: 'all' };
        } else if (channel === 'fleet') {
          // Placeholder until corps land. Echo back to the sender so
          // the UI confirms send, but don't broadcast anywhere.
          broadcastTarget = { kind: 'self' };
        }

        // Persist. Server time is the truth for chat history; the
        // client's clock isn't involved.
        let saved;
        try {
          saved = await queryOne(
            `INSERT INTO chat_messages
               (channel_type, channel_id, sender_id, sender_name, content)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, created_at`,
            [channel, channelId, user.id, user.username, text]
          );
        } catch (err) {
          console.error('chat: db insert failed', err);
          socket.emit('chat:error', { message: 'Server error storing message' });
          return;
        }

        // Wire shape -- mirrors REST history rows so the client can
        // treat live + historical messages identically.
        const msg = {
          id: saved.id,
          channel,
          channel_id: channelId,
          sender_id: user.id,
          sender_name: user.username,
          text,
          ts: new Date(saved.created_at).getTime(),
        };

        if (broadcastTarget.kind === 'room') {
          // Includes sender (io.to() not socket.to()) so they see
          // their own message land at the same time as everyone else,
          // confirming send. Avoids the "did my message go through?"
          // moment.
          io.to(broadcastTarget.room).emit('chat:message', msg);
        } else if (broadcastTarget.kind === 'all') {
          io.emit('chat:message', msg);
        } else if (broadcastTarget.kind === 'self') {
          socket.emit('chat:message', msg);
        }
      } catch (err) {
        console.error('chat:send unexpected error', err);
        socket.emit('chat:error', { message: 'Server error' });
      }
    });

    socket.on('disconnect', () => {
      lastSendMs.delete(socket.id);
    });
  });
}
