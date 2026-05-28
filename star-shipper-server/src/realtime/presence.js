// Realtime Presence -- Phase 1 of the multiplayer roadmap.
// ============================================================
// PURE RELAY: clients self-report their ship position; this module
// fans the updates out to every other socket in the same system room.
// No server tick, no DB writes, no validation -- the next phase
// (server-owned enemies) introduces a tick; the one after (combat)
// introduces validation. Today this just lets two players in Sol see
// each other's ships move.
//
// MEMORY MODEL
// ------------
//   userSockets: Map<userId, socketId>
//     Single active socket per user. Logging in from a new tab kicks
//     the old socket via the 'kicked' event so we don't get "where am
//     I really" with two ghosts of the same player.
//
//   systemPeers: Map<systemId, Map<userId, peerState>>
//     One Map per active system room. peerState shape:
//       { x, y, vx, vy, rot, ship_visual_v, ts, name, ship_visual }
//     ts is server-stamped at broadcast time so peers can interpolate
//     + detect staleness without trusting client clocks.
//
// ROOM MODEL
// ----------
//   socket.join(`presence:system:${systemId}`)
//   The "presence:" prefix keeps these rooms disjoint from the legacy
//   hub: rooms in socketHandler.js -- they coexist while we migrate.
//
// PROTOCOL  (see STATUS.md "Realtime multiplayer Phase 1" for full spec)
// ----------------------------------------------------------------------
//   Client -> Server:
//     'presence:enter'  { system_id }
//     'presence:leave'  { system_id }
//     'presence:pos'    { x, y, vx, vy, rot, ship_visual_v }
//
//   Server -> Client:
//     'presence:peer_join'   { user_id, name, ship_visual }
//     'presence:peer_leave'  { user_id }
//     'presence:peers'       { peers: [{ user_id, x, y, vx, vy, rot, ts }, ...] }
//     'presence:snapshot'    { peers: [...] }   (sent once on enter)
//     'kicked'               (sent to the older socket when same user
//                            connects from a new tab)

import { queryOne } from '../db/index.js';

// Cap on client-driven pos broadcasts to defend against a misbehaving
// or malicious client flooding the room. Spec target is 5 Hz; we allow
// 10 to leave headroom for natural jitter and re-fit storms.
const MAX_POS_HZ = 10;
const MIN_POS_INTERVAL_MS = 1000 / MAX_POS_HZ;

// Peer is considered alive while its last pos update is within this
// window. Stale eviction sweep runs every second.
const STALE_PEER_MS = 5000;

// Room prefix -- keeps our rooms disjoint from the legacy `hub:` namespace.
const roomFor = (systemId) => `presence:system:${systemId}`;

// ============================================================
// SHIP VISUAL DESCRIPTOR
// ============================================================
// Tiny payload describing the player's active (non-stored) ship.
// Shipped on peer_join (and on enter snapshots), then re-fetched lazily
// by peers when they see the broadcaster's ship_visual_v bump.
// Falls back to a generic stub if the player has no active ship --
// they shouldn't show as a peer in that case, but defensive.
async function fetchShipVisual(userId, username) {
  // Active ship = user's first non-stored ship. Mirrors the same
  // "storage_body_id IS NULL" filter the fleet-cargo + module checks
  // use elsewhere (pitfall #15).
  const ship = await queryOne(
    `SELECT s.id, s.name, s.hull_type_id, s.fitted_modules, ht.name as hull_name
       FROM ships s
       JOIN hull_types ht ON s.hull_type_id = ht.id
      WHERE s.user_id = $1 AND s.storage_body_id IS NULL
      ORDER BY s.created_at ASC
      LIMIT 1`,
    [userId]
  );
  if (!ship) {
    return {
      hull_type_id: null,
      ship_name: username,
      accent_color: '#4488ff',
      fitted_summary: [],
    };
  }
  // fitted_summary is the slot->module_type_id map flattened to an
  // array of module type ids so the client can render the silhouette
  // with the right hardpoints. Phase 1 doesn't need quality data
  // (peers aren't combatants yet), so just the type id list.
  const fittedSummary = Object.values(ship.fitted_modules || {})
    .map(m => m?.module_type_id)
    .filter(Boolean);
  return {
    hull_type_id: ship.hull_type_id,
    hull_name: ship.hull_name,
    ship_name: ship.name || username,
    accent_color: '#4488ff', // Phase 1: all peers cyan. Faction tints in Phase 2.
    fitted_summary: fittedSummary,
  };
}

// ============================================================
// REGISTRATION
// ============================================================

export function attachPresence(io) {
  // Module-scope state. Lives for the process lifetime; cleared on
  // server restart (clients auto-reconnect via socket.io defaults).
  const userSockets = new Map(); // userId -> socket.id
  const systemPeers = new Map(); // systemId -> Map<userId, peerState>
  const lastPosTs   = new Map(); // socketId -> last-pos-emit timestamp (rate limit)

  // Helper: remove a user from whatever system they're in + tell the
  // room. Idempotent. Used on leave, disconnect, kick.
  function removeFromSystem(userId, socket) {
    const currentSystem = socket?.data?.presence?.systemId;
    if (!currentSystem) return;
    const peers = systemPeers.get(currentSystem);
    if (peers) {
      peers.delete(userId);
      if (peers.size === 0) systemPeers.delete(currentSystem);
    }
    socket.leave(roomFor(currentSystem));
    io.to(roomFor(currentSystem)).emit('presence:peer_leave', { user_id: userId });
    socket.data.presence.systemId = null;
    console.log(`👋 presence: user ${userId} left ${currentSystem}`);
  }

  // We attach to the same `io` the legacy handler uses. The
  // io.use(socketAuthMiddleware) call in socketHandler.js has already
  // populated socket.user before we ever see the connection.
  io.on('connection', (socket) => {
    const user = socket.user;
    if (!user) return; // auth middleware should have rejected

    // Init per-socket scratch space. data.presence holds the systemId
    // this socket is currently in (null if not in any system).
    socket.data.presence = { systemId: null };

    // -- Connection dedup ------------------------------------------
    // Single active socket per user. Kick the older one if the same
    // user opens a new tab / refreshes. The kicked socket fires
    // 'kicked' so the client can show a toast + close gracefully.
    const existingSocketId = userSockets.get(user.id);
    if (existingSocketId && existingSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existingSocketId);
      if (oldSocket) {
        oldSocket.emit('kicked', { reason: 'newer_connection' });
        // Remove from any system the old socket was in. Critical --
        // otherwise the new socket joins the same room and sees the
        // old self as a peer.
        removeFromSystem(user.id, oldSocket);
        oldSocket.disconnect(true);
      }
    }
    userSockets.set(user.id, socket.id);

    // -- Enter a system room --------------------------------------
    socket.on('presence:enter', async ({ system_id }) => {
      if (!system_id || typeof system_id !== 'string') return;

      // If already in a different system, leave it first.
      const currentSystem = socket.data.presence.systemId;
      if (currentSystem && currentSystem !== system_id) {
        removeFromSystem(user.id, socket);
      } else if (currentSystem === system_id) {
        return; // no-op
      }

      // Build the ship visual descriptor for the new peer.
      let shipVisual;
      try {
        shipVisual = await fetchShipVisual(user.id, user.username);
      } catch (err) {
        console.error('presence: fetchShipVisual failed', err);
        shipVisual = { ship_name: user.username, accent_color: '#4488ff', fitted_summary: [] };
      }

      // Initialize per-system map if first arrival.
      if (!systemPeers.has(system_id)) systemPeers.set(system_id, new Map());
      const peers = systemPeers.get(system_id);

      // Insert self with a stub position (0,0). The next 'presence:pos'
      // overwrites it within ~200ms. ts=0 marks "no pos yet" so peers
      // can render at the broadcast pos rather than (0,0) until the
      // first real update lands. `fleet` is the (denormalized) array
      // of wingman positions/hulls -- starts empty, populated on first
      // pos broadcast.
      peers.set(user.id, {
        x: 0, y: 0, vx: 0, vy: 0, rot: 0,
        ship_visual_v: 0,
        ts: 0,
        name: user.username,
        ship_visual: shipVisual,
        fleet: [],
      });

      socket.join(roomFor(system_id));
      socket.data.presence.systemId = system_id;
      console.log(`🛰️  presence: ${user.username} entered ${system_id} (${peers.size} in room)`);

      // Snapshot: tell the new arrival who's already here. Includes the
      // ship_visual so they can render peer silhouettes without a
      // round trip per peer. Self is excluded.
      const snapshot = [];
      for (const [pid, p] of peers.entries()) {
        if (pid === user.id) continue;
        snapshot.push({
          user_id: pid,
          name: p.name,
          ship_visual: p.ship_visual,
          x: p.x, y: p.y, vx: p.vx, vy: p.vy, rot: p.rot, ts: p.ts,
          fleet: p.fleet || [],
        });
      }
      socket.emit('presence:snapshot', { system_id, peers: snapshot });

      // Notify existing peers about the new arrival. Only includes
      // descriptor data -- the first pos update will follow shortly.
      socket.to(roomFor(system_id)).emit('presence:peer_join', {
        user_id: user.id,
        name: user.username,
        ship_visual: shipVisual,
      });
    });

    // -- Leave a system room --------------------------------------
    socket.on('presence:leave', ({ system_id } = {}) => {
      // system_id is informational -- we authoritative use whatever's
      // in socket.data.presence to avoid client-server desync.
      removeFromSystem(user.id, socket);
    });

    // -- Position update (the hot path) ---------------------------
    socket.on('presence:pos', (payload) => {
      const systemId = socket.data.presence.systemId;
      if (!systemId) return; // not in any system; ignore

      // Rate limit: drop updates that arrive faster than MAX_POS_HZ.
      const now = Date.now();
      const last = lastPosTs.get(socket.id) || 0;
      if (now - last < MIN_POS_INTERVAL_MS) return;
      lastPosTs.set(socket.id, now);

      // Update in-memory peer state. Validate types -- a malformed
      // payload should drop the update, not crash the relay.
      const peers = systemPeers.get(systemId);
      const peer = peers?.get(user.id);
      if (!peer) return; // entered + left in race; ignore
      const { x, y, vx, vy, rot, ship_visual_v, fleet } = payload || {};
      if (typeof x !== 'number' || typeof y !== 'number') return;
      peer.x = x;
      peer.y = y;
      peer.vx = typeof vx === 'number' ? vx : 0;
      peer.vy = typeof vy === 'number' ? vy : 0;
      peer.rot = typeof rot === 'number' ? rot : 0;
      peer.ts = now;
      // Wingmen: denormalized fleet array. Cap at 4 (MAX_FLEET_SIZE-1)
      // so a malicious client can't pump up the broadcast size. Each
      // entry validated independently -- bad entries skipped, valid
      // ones kept.
      if (Array.isArray(fleet)) {
        const cleaned = [];
        for (const f of fleet.slice(0, 4)) {
          if (!f || typeof f.x !== 'number' || typeof f.y !== 'number') continue;
          cleaned.push({
            x: f.x, y: f.y,
            rot: typeof f.rot === 'number' ? f.rot : 0,
            hull_type_id: typeof f.hull_type_id === 'string' ? f.hull_type_id : null,
          });
        }
        peer.fleet = cleaned;
      }

      // Visual version bump -> refresh the descriptor so peers see the
      // new fit. Refetch async; the next snapshot includes it.
      if (typeof ship_visual_v === 'number' && ship_visual_v !== peer.ship_visual_v) {
        peer.ship_visual_v = ship_visual_v;
        fetchShipVisual(user.id, user.username).then(sv => {
          peer.ship_visual = sv;
          io.to(roomFor(systemId)).emit('presence:peer_join', {
            user_id: user.id, name: user.username, ship_visual: sv,
          });
        }).catch(() => { /* swallow */ });
      }

      // Broadcast to the room (excluding self). Single-peer payload --
      // the array shape leaves room for Phase 2 batched ticks without
      // changing the wire format.
      socket.to(roomFor(systemId)).emit('presence:peers', {
        peers: [{
          user_id: user.id,
          x: peer.x, y: peer.y, vx: peer.vx, vy: peer.vy, rot: peer.rot,
          ts: peer.ts,
          fleet: peer.fleet,
        }],
      });
    });

    // -- Disconnect ------------------------------------------------
    socket.on('disconnect', () => {
      // Only clear from userSockets if THIS socket is still the
      // registered one. If we were kicked, the new socket already
      // replaced our entry and we should leave it alone.
      if (userSockets.get(user.id) === socket.id) {
        userSockets.delete(user.id);
      }
      lastPosTs.delete(socket.id);
      removeFromSystem(user.id, socket);
    });
  });

  // -- Stale peer sweep ---------------------------------------------
  // socket.io disconnect can take up to ~15s to fire if the
  // underlying TCP connection dies silently (pingTimeout=5s after
  // pingInterval=10s in socketHandler.js). This sweep catches peers
  // who stopped sending pos updates well before disconnect lands so
  // ghost ships don't linger in the room.
  setInterval(() => {
    const now = Date.now();
    for (const [systemId, peers] of systemPeers.entries()) {
      for (const [userId, peer] of peers.entries()) {
        // peer.ts === 0 means they just entered and haven't sent
        // their first pos yet -- give them a grace window.
        if (peer.ts === 0) continue;
        if (now - peer.ts > STALE_PEER_MS) {
          peers.delete(userId);
          io.to(roomFor(systemId)).emit('presence:peer_leave', { user_id: userId });
        }
      }
      if (peers.size === 0) systemPeers.delete(systemId);
    }
  }, 1000);

  // -- Diagnostic counters (exported for /api/diag) -----------------
  return {
    stats: () => ({
      users_connected: userSockets.size,
      systems_active: systemPeers.size,
      total_peers: [...systemPeers.values()].reduce((s, m) => s + m.size, 0),
    }),
  };
}
