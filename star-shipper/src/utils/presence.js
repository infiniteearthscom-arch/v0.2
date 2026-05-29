// Realtime Presence -- client singleton.
// =============================================================
// Wraps a single socket.io connection to the game server and
// surfaces a small API for SystemView (and any future consumer):
//
//   presence.enterSystem(systemId)
//   presence.leaveSystem(systemId)
//   presence.sendPos({ x, y, vx, vy, rot, ship_visual_v? })
//   presence.getPeers()    // Map<userId, peerState> -- read-only, mutated in place by the singleton
//   presence.bumpShipVisual() // forces peers to refetch our descriptor
//   presence.on(event, fn) -> unsubscribe
//
// MEMORY MODEL
// ------------
//   peers: Map<userId, {
//     name, ship_visual,                       // identity (refreshed on peer_join)
//     prev: snapshot|null,                     // 2nd-most-recent snapshot (for interpolation)
//     next: snapshot|null,                     // most-recent snapshot
//     x, y, vx, vy, rot, ts, fleet,            // == next.* (backward-compat fields)
//   }>
//   snapshot = { ts, x, y, vx, vy, rot, fleet }
//
// RENDER: BUFFERED INTERPOLATION
// ------------------------------
// At 5 Hz, naive linear extrapolation snaps every 200ms when the next
// snapshot arrives -- visible jerk on any direction/speed change.
// Instead consumers call presence.getRenderState(peer, now) which
// renders at `now - RENDER_DELAY_MS` (slightly in the past) so we
// always have prev+next snapshots that bracket the render time. Lerp
// between them. Costs ~150ms perceived render lag, gains smooth
// motion. Standard multiplayer netcode pattern.
//
// CONNECTION LIFECYCLE
// --------------------
// Lazy connect: the first enterSystem() call wakes the socket. Socket
// stays alive across system changes; only the 'presence:enter' /
// 'presence:leave' messages bounce the room membership. On
// reconnect (server restart, network blip) we re-emit
// 'presence:enter' for the current system automatically.
//
// FEATURE FLAG
// ------------
// `import.meta.env.VITE_PRESENCE_ENABLED === 'true'` -- when false (or
// unset), every method is a safe no-op so we can ship with the flag
// off and flip it once we've verified the server in prod.

import { io as ioClient } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ENABLED = import.meta.env.VITE_PRESENCE_ENABLED === 'true';
const POS_SEND_INTERVAL_MS = 100; // 10 Hz -- matches server cap
// Render time = now - RENDER_DELAY_MS so we usually have a prev+next
// pair bracketing it. With 100ms snapshots a 100ms buffer means the
// render usually lands ON or just-before `next`, giving us a tight
// lerp window. If a snapshot's late we extend gracefully into the
// extrapolation fallback below.
const RENDER_DELAY_MS = 100;
// If `now - next.ts` exceeds this, we extrapolate from `next` instead
// of lerping (the broadcaster went quiet -- maybe disconnected). Past
// this window the stale-peer cleanup kicks in.
const EXTRAPOLATE_AFTER_MS = 500;

// ----- module-scope state -----
let socket = null;
let connecting = false;
let currentSystemId = null;       // system the user has asked us to be in
let shipVisualVersion = 0;        // monotonic; bump when player re-fits / changes ship

const peers = new Map();          // userId -> peerState

// Pub/sub: small Map<event, Set<fn>>. Each on() call returns its own
// unsubscribe; no risk of cross-component leaks.
const listeners = new Map();
function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (err) { console.error('presence listener error', event, err); }
  }
}

// Pos send throttle. Internal -- callers can fire as fast as the
// game loop runs; we coalesce.
let lastPosSendMs = 0;
let pendingPos = null;

function getToken() {
  return localStorage.getItem('star-shipper-token');
}

// Internal: open the socket if we haven't, attach listeners. Idempotent.
function ensureSocket() {
  if (socket && socket.connected) return;
  if (connecting) return;
  if (!ENABLED) return;
  const token = getToken();
  if (!token) {
    // Not logged in yet. Bail; enterSystem() will retry next call.
    return;
  }
  connecting = true;
  socket = ioClient(SERVER_URL, {
    auth: { token },
    // socket.io defaults give us auto-reconnect with backoff. Capping
    // at 10 attempts keeps us from hammering a truly-down server, but
    // 10 * default-backoff covers a ~5 min outage window.
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    connecting = false;
    // Re-enter the current system on every (re)connect. On the first
    // connect this propagates the user's intent; on reconnect after
    // a server restart this restores room membership.
    if (currentSystemId) {
      socket.emit('presence:enter', { system_id: currentSystemId });
    }
    emit('connected', { socketId: socket.id });
  });

  socket.on('disconnect', (reason) => {
    // We don't clear `peers` here -- ghosts will linger until reconnect
    // or until consumer triggers a leave. Server already broadcasted
    // 'presence:peer_leave' for us to everyone else.
    emit('disconnected', { reason });
  });

  socket.on('connect_error', (err) => {
    // Most common cause: bad token. Don't spam reconnects in that case.
    if (err?.message === 'Authentication required' || err?.message === 'Invalid token') {
      socket.disconnect();
    }
    emit('error', { message: err?.message || 'connection error' });
  });

  socket.on('kicked', (payload) => {
    // Server kicked us because another tab/connection took over.
    emit('kicked', payload);
    socket.disconnect();
  });

  // --- presence events ---
  socket.on('presence:snapshot', ({ system_id, peers: snap }) => {
    if (system_id !== currentSystemId) return; // stale snapshot from a prior system
    peers.clear();
    for (const p of snap || []) {
      const initialSnap = {
        ts: p.ts || Date.now(),
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, rot: p.rot,
        fleet: p.fleet || [],
      };
      peers.set(p.user_id, {
        name: p.name,
        ship_visual: p.ship_visual,
        // Both prev + next start identical; first new update from this
        // peer rolls next into prev so interpolation has a real window.
        prev: initialSnap,
        next: initialSnap,
        // Top-level fields mirror `next` for backward-compat with any
        // consumer that still reads them directly (debug, hover).
        ...initialSnap,
      });
    }
    emit('peers_changed', { count: peers.size });
  });

  socket.on('presence:peer_join', ({ user_id, name, ship_visual }) => {
    const existing = peers.get(user_id);
    if (existing) {
      // Visual refresh path (ship_visual_v bump): preserve position so
      // the ghost doesn't jump back to (0,0).
      existing.name = name;
      existing.ship_visual = ship_visual;
    } else {
      // No prev/next yet -- consumer's getRenderState() will skip until
      // ts > 0 (first pos arrives).
      peers.set(user_id, {
        name,
        ship_visual,
        prev: null, next: null,
        x: 0, y: 0, vx: 0, vy: 0, rot: 0,
        ts: 0,
        fleet: [],
      });
    }
    emit('peers_changed', { count: peers.size });
  });

  socket.on('presence:peer_leave', ({ user_id }) => {
    if (peers.delete(user_id)) emit('peers_changed', { count: peers.size });
  });

  socket.on('presence:peers', ({ peers: updates }) => {
    for (const u of updates || []) {
      const p = peers.get(u.user_id);
      if (!p) continue; // not in room (yet); the peer_join is coming
      const newSnap = {
        ts: u.ts || Date.now(),
        x: u.x, y: u.y, vx: u.vx, vy: u.vy, rot: u.rot,
        fleet: Array.isArray(u.fleet) ? u.fleet : (p.next?.fleet || []),
      };
      // Slide the buffer: prev becomes the prior next; next becomes
      // the just-arrived snapshot. On the very first pos update for a
      // peer that joined mid-session (no prev/next yet from snapshot),
      // both prev and next get the new value -- next update will
      // give us a real lerp window.
      p.prev = p.next || newSnap;
      p.next = newSnap;
      // Mirror top-level fields for backward-compat consumers (hover
      // panel that reads p.name etc; debug console).
      p.x = newSnap.x; p.y = newSnap.y;
      p.vx = newSnap.vx; p.vy = newSnap.vy;
      p.rot = newSnap.rot;
      p.ts = newSnap.ts;
      p.fleet = newSnap.fleet;
    }
  });
}

// ----- public API -----

export function enterSystem(systemId) {
  if (!ENABLED || !systemId) return;
  currentSystemId = systemId;
  ensureSocket();
  // peers Map is for the OLD system; clear so consumers don't briefly
  // render the prior system's peers while waiting for the snapshot.
  peers.clear();
  emit('peers_changed', { count: 0 });
  if (socket?.connected) {
    socket.emit('presence:enter', { system_id: systemId });
  }
  // If not connected yet, the 'connect' handler will fire enter for us.
}

export function leaveSystem() {
  if (!ENABLED) return;
  const wasIn = currentSystemId;
  currentSystemId = null;
  peers.clear();
  emit('peers_changed', { count: 0 });
  if (wasIn && socket?.connected) {
    socket.emit('presence:leave', { system_id: wasIn });
  }
}

// Build the wire payload from a caller-supplied state object. Both
// the immediate and the trailing-edge flush go through this so the
// shape stays consistent in one place.
function makePosPayload(state) {
  return {
    x: state.x, y: state.y,
    vx: state.vx ?? 0, vy: state.vy ?? 0,
    rot: state.rot ?? 0,
    ship_visual_v: shipVisualVersion,
    // Wingmen (denormalized): each entry is { x, y, rot, hull_type_id }.
    // Server caps at 4. Empty array if caller didn't pass one.
    fleet: Array.isArray(state.fleet) ? state.fleet : [],
  };
}

// Throttled. Safe to call every frame; only emits every POS_SEND_INTERVAL_MS.
export function sendPos(state) {
  if (!ENABLED) return;
  if (!socket?.connected || !currentSystemId) {
    pendingPos = state;
    return;
  }
  const now = Date.now();
  if (now - lastPosSendMs < POS_SEND_INTERVAL_MS) {
    pendingPos = state; // most-recent-wins; coalesced on next interval
    return;
  }
  lastPosSendMs = now;
  pendingPos = null;
  socket.emit('presence:pos', makePosPayload(state));
}

// Catch the trailing edge: if the consumer stopped calling sendPos but
// we have a pending coalesced update, flush it after the interval.
setInterval(() => {
  if (!ENABLED || !pendingPos || !socket?.connected || !currentSystemId) return;
  const now = Date.now();
  if (now - lastPosSendMs < POS_SEND_INTERVAL_MS) return;
  lastPosSendMs = now;
  const state = pendingPos;
  pendingPos = null;
  socket.emit('presence:pos', makePosPayload(state));
}, POS_SEND_INTERVAL_MS);

// Bump when the player re-fits / changes active ship. Peers will see
// the new ship_visual_v in our next pos broadcast and the server will
// rebroadcast a fresh ship_visual descriptor to the room.
export function bumpShipVisual() {
  shipVisualVersion += 1;
}

// Live, read-only peer map. Consumers MUST NOT mutate. Read in the
// render loop via .values() or .get().
export function getPeers() { return peers; }

// Shortest-arc angular lerp (degrees, math convention).
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * t;
}

const lerp = (a, b, t) => a + (b - a) * t;

// Cubic Hermite spline through (p0, m0) -> (p1, m1) where m0/m1 are
// the tangent vectors at each endpoint. We use velocity * span as the
// tangent so the curve passes through both positions WITH the right
// slope -- the result hugs the broadcaster's actual trajectory through
// each snapshot instead of darting straight between them. Much smoother
// around direction changes than the straight linear lerp.
//
//   H(t) = (2t^3 - 3t^2 + 1) p0
//        + (t^3 - 2t^2 + t)  m0
//        + (-2t^3 + 3t^2)    p1
//        + (t^3 - t^2)       m1
//
// `spanSec` is the time between snapshots in seconds; tangents are
// scaled by it so the units work (vel is units/sec, position is units).
function hermite(p0, v0, p1, v1, t, spanSec) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 =  2 * t3 - 3 * t2 + 1;
  const h10 =      t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 =      t3 -     t2;
  return h00 * p0 + h10 * v0 * spanSec + h01 * p1 + h11 * v1 * spanSec;
}

// Render-time interpolated state for a peer. Returns:
//   { x, y, rot, fleet, ageMs }   if renderable
//   null                          if the peer has no pos yet or is stale
//
// `fleet` is interpolated per-index against the matched entry in prev
// (degrades gracefully if length differs -- jumps to next's value for
// indices that don't have a prev twin).
export function getRenderState(peer, now = Date.now()) {
  if (!peer?.next || !peer.next.ts) return null;
  const ageNext = now - peer.next.ts;
  if (ageNext > 5000) return null; // stale; eviction pending

  // Render time is slightly in the past so we usually have prev+next
  // bracketing it. The first ~150ms after a new peer joins we won't
  // have a real prev (prev === next from snapshot init), so the lerp
  // degenerates to "snap to next" which is fine.
  const renderTime = now - RENDER_DELAY_MS;
  const prev = peer.prev || peer.next;
  const span = peer.next.ts - prev.ts;

  let x, y, rot, fleet;
  if (span <= 0 || ageNext > EXTRAPOLATE_AFTER_MS) {
    // No real interp window (first frame after join) OR broadcaster
    // went quiet -- fall back to linear extrapolation from `next`.
    const dt = ageNext / 1000;
    x = peer.next.x + (peer.next.vx || 0) * dt;
    y = peer.next.y + (peer.next.vy || 0) * dt;
    rot = peer.next.rot;
    fleet = peer.next.fleet;
  } else {
    // Standard buffered interp: t = how far renderTime is between prev
    // and next. Clamped [0,1] so a slow tab doesn't pull t past 1 and
    // turn into accidental extrapolation. Position uses cubic Hermite
    // with broadcast velocities as tangents -- smooth around direction
    // changes. Rotation stays linear (we don't broadcast angular
    // velocity, and shortest-arc linear is fine for ship heading).
    const t = Math.max(0, Math.min(1, (renderTime - prev.ts) / span));
    const spanSec = span / 1000;
    x = hermite(prev.x, prev.vx || 0, peer.next.x, peer.next.vx || 0, t, spanSec);
    y = hermite(prev.y, prev.vy || 0, peer.next.y, peer.next.vy || 0, t, spanSec);
    rot = lerpAngle(prev.rot || 0, peer.next.rot || 0, t);
    // Wingmen: we don't broadcast individual wingman velocities (the
    // payload would balloon), so wingmen still get linear lerp. They
    // already look smoother than the flagship in practice because the
    // broadcaster's lagged-follow filter smooths their motion on the
    // send side -- direction changes are gentler.
    fleet = (peer.next.fleet || []).map((nf, i) => {
      const pf = prev.fleet?.[i];
      if (!pf) return nf;
      return {
        x: lerp(pf.x, nf.x, t),
        y: lerp(pf.y, nf.y, t),
        rot: lerpAngle(pf.rot || 0, nf.rot || 0, t),
        hull_type_id: nf.hull_type_id,
      };
    });
  }
  return { x, y, rot, fleet, ageMs: ageNext };
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function isEnabled() { return ENABLED; }

// For debugging in the browser console: window.__presence = ...
if (typeof window !== 'undefined' && ENABLED) {
  window.__presence = { getPeers, enterSystem, leaveSystem, isEnabled };
}

export default {
  enterSystem, leaveSystem, sendPos, getPeers, getRenderState, bumpShipVisual, on, isEnabled,
};
