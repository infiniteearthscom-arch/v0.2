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
//     x, y, vx, vy, rot, ts                    // latest server-stamped state
//   }>
//
// Consumers (SystemView render loop) read peers.values() each frame
// and apply LINEAR EXTRAPOLATION:
//   render_x = peer.x + peer.vx * ((now - peer.ts) / 1000)
// 5 Hz snapshots + a steady velocity means the render stays smooth
// between updates; a sudden direction change pops by one frame, which
// at 60fps is invisible. Phase 2 can swap in proper prev->next lerp.
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
const POS_SEND_INTERVAL_MS = 200; // 5 Hz -- server cap is 10 Hz

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
      peers.set(p.user_id, {
        name: p.name,
        ship_visual: p.ship_visual,
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, rot: p.rot, ts: p.ts || Date.now(),
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
      peers.set(user_id, {
        name,
        ship_visual,
        x: 0, y: 0, vx: 0, vy: 0, rot: 0,
        ts: 0, // 0 marks "no pos yet" -- consumers can hide until first pos arrives
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
      p.x = u.x; p.y = u.y;
      p.vx = u.vx; p.vy = u.vy;
      p.rot = u.rot;
      p.ts = u.ts || Date.now();
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
  socket.emit('presence:pos', {
    x: state.x, y: state.y,
    vx: state.vx ?? 0, vy: state.vy ?? 0,
    rot: state.rot ?? 0,
    ship_visual_v: shipVisualVersion,
  });
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
  socket.emit('presence:pos', {
    x: state.x, y: state.y,
    vx: state.vx ?? 0, vy: state.vy ?? 0,
    rot: state.rot ?? 0,
    ship_visual_v: shipVisualVersion,
  });
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
  enterSystem, leaveSystem, sendPos, getPeers, bumpShipVisual, on, isEnabled,
};
