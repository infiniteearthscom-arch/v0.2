// Activity logger (Social Multiplayer Step 3).
// =============================================================
// Server-side helper for recording notable player actions to the
// activity_events table + broadcasting them live to all connected
// clients via socket.io. Callers don't need to know about the socket
// layer -- they just call logActivity() from inside their existing
// route handlers.
//
// USAGE
//   import { logActivity } from '../lib/activity.js';
//   await logActivity({
//     userId: req.user.id,
//     senderName: req.user.username,
//     type: 'module_crafted',
//     systemId: null,
//     payload: { module_name: 'Mining Laser II', quality: 73 },
//   });
//
// The function never throws -- if the INSERT or broadcast fails, it
// logs and returns null so the caller's primary flow (the craft, the
// purchase, etc.) isn't affected by activity-log issues.
//
// SOCKET WIRING
// -------------
// `setActivityIO(io)` is called once at server startup from
// realtime/socketHandler.js. Until that runs, broadcasts no-op (the
// INSERT still happens). Same lazy-init pattern keeps API modules
// decoupled from socket.io setup order.

import { queryOne } from '../db/index.js';

let ioRef = null;

export function setActivityIO(io) {
  ioRef = io;
}

export async function logActivity({ userId, senderName, type, systemId = null, payload = {} }) {
  if (!userId || !senderName || !type) {
    console.warn('activity: logActivity called with missing fields', { userId, senderName, type });
    return null;
  }
  try {
    const row = await queryOne(
      `INSERT INTO activity_events (user_id, sender_name, event_type, system_id, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [userId, senderName, type, systemId, JSON.stringify(payload)]
    );
    // Wire shape matches the REST history endpoint so live + historical
    // events are interchangeable on the client.
    const event = {
      id: row.id,
      type,
      sender_id: userId,
      sender_name: senderName,
      system_id: systemId,
      payload,
      ts: new Date(row.created_at).getTime(),
    };
    if (ioRef) ioRef.emit('activity:event', event);
    return event;
  } catch (err) {
    console.error('activity: logActivity failed', err);
    return null;
  }
}

export default { logActivity, setActivityIO };
