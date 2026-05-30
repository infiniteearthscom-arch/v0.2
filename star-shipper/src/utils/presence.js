// Realtime Presence -- client singleton.
// =============================================================
// Wraps a single socket.io connection to the game server and
// surfaces a small API for SystemView (and any future consumer):
//
//   presence.enterSystem(systemId)
//   presence.leaveSystem(systemId)
//   presence.sendPos({ x, y, vx, vy, rot, ship_visual_v? })
//   presence.getPeers()         // Map<userId, peerState> -- read-only, mutated in place by the singleton
//   presence.getOnlineStats()   // { total_online, by_system: { [systemId]: count } } -- replaced (not mutated) on each update
//   presence.bumpShipVisual()   // forces peers to refetch our descriptor
//   presence.on(event, fn) -> unsubscribe
//
// EVENTS (presence.on)
//   'peers_changed' { count }        -- peer Map size changed
//   'stats_changed' { total_online, by_system }  -- roster snapshot updated
//   'connected'                      -- socket (re)connected
//   'disconnected' { reason }
//   'kicked'       { reason }        -- server kicked us (dupe tab)
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

// Migrated 2026-05-29: socket lifecycle now lives in utils/socket.js
// (shared with chat + future realtime modules). This file owns only
// presence-specific state (peers map, ship visual version) + the
// presence:* event handlers it binds via socketBus.onSocketEvent.
import socketBus from './socket.js';

const ENABLED = import.meta.env.VITE_PRESENCE_ENABLED === 'true';
const POS_SEND_INTERVAL_MS = 100; // 10 Hz -- matches server cap
// Render time = now - RENDER_DELAY_MS so we usually have a prev+next
// pair bracketing it. With 100ms snapshots, a 150ms buffer means
// render time normally sits ~50ms before `next` -- plenty of headroom
// for arrival jitter (snapshots rarely arrive exactly on schedule).
// Smaller buffer means less lag but more frequent extrapolation/
// interpolation mode switches at the snapshot boundary which causes
// visible stutter.
const RENDER_DELAY_MS = 150;
// If `now - next.ts` exceeds this, we extrapolate from `next` instead
// of lerping (the broadcaster went quiet -- maybe disconnected). Past
// this window the stale-peer cleanup kicks in.
const EXTRAPOLATE_AFTER_MS = 500;

// ----- module-scope state -----
let currentSystemId = null;       // system the user has asked us to be in
let shipVisualVersion = 0;        // monotonic; bump when player re-fits / changes ship
let listenersBound = false;       // ensure we only attach socket handlers once per app session

const peers = new Map();          // userId -> peerState

// Roster stats (Step 2). Server pushes 'presence:stats' on every
// roster change. by_system only includes non-empty systems; consumers
// MUST treat the broadcast as a full replacement, not a merge, so a
// system going 1->0 cleanly disappears from the map. Default values
// keep UI defensive against "no message yet" state.
let onlineStats = { total_online: 0, by_system: {} };

// Pub/sub: small Map<event, Set<fn>>. Each on() call returns its own
// unsubscribe; no risk of cross-component leaks. These are
// presence-specific events (`peers_changed`, `kicked`, etc) -- the
// socket lifecycle events live on the socket bus.
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

// Bind all presence-related socket.io handlers via the shared bus.
// Idempotent -- only runs once per app session. The bus re-binds
// each event handler on every reconnect, so a transient socket drop
// doesn't silently break peer updates.
function ensureListenersBound() {
  if (listenersBound) return;
  listenersBound = true;

  // Bus-level: re-enter the current system on every (re)connect so
  // the server-side room membership is restored after restarts.
  socketBus.on('connect', () => {
    if (currentSystemId) {
      const s = socketBus.getSocket();
      s?.emit('presence:enter', { system_id: currentSystemId });
    }
    emit('connected', {});
  });
  socketBus.on('disconnect', (p) => emit('disconnected', p));
  socketBus.on('kicked', (p) => emit('kicked', p));

  // Presence socket.io events. socketBus.onSocketEvent rebinds these
  // automatically on each reconnect so we don't silently lose updates
  // after a transport blip.
  socketBus.onSocketEvent('presence:snapshot', ({ system_id, peers: snap }) => {
    if (system_id !== currentSystemId) return; // stale snapshot from a prior system
    peers.clear();
    // IMPORTANT: stamp ts with CLIENT receive time, not the
    // server-supplied p.ts. Render math compares ts against
    // Date.now() - RENDER_DELAY_MS; mixing server-time and client-time
    // domains under any clock skew between the two machines causes
    // interp t to clamp permanently to 0 or 1, producing visible
    // teleport-stutter every snapshot interval. Server ts is ignored
    // for interp; staleness is detected via local receive ts too.
    const recvNow = Date.now();
    for (const p of snap || []) {
      const initialSnap = {
        ts: recvNow,
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, rot: p.rot,
        fleet: p.fleet || [],
      };
      peers.set(p.user_id, {
        name: p.name,
        ship_visual: p.ship_visual,
        prev: initialSnap,
        next: initialSnap,
        ...initialSnap,
      });
    }
    emit('peers_changed', { count: peers.size });
  });

  socketBus.onSocketEvent('presence:peer_join', ({ user_id, name, ship_visual }) => {
    const existing = peers.get(user_id);
    if (existing) {
      existing.name = name;
      existing.ship_visual = ship_visual;
    } else {
      peers.set(user_id, {
        name, ship_visual,
        prev: null, next: null,
        x: 0, y: 0, vx: 0, vy: 0, rot: 0,
        ts: 0,
        fleet: [],
      });
    }
    emit('peers_changed', { count: peers.size });
  });

  socketBus.onSocketEvent('presence:peer_leave', ({ user_id }) => {
    if (peers.delete(user_id)) emit('peers_changed', { count: peers.size });
  });

  socketBus.onSocketEvent('presence:stats', (stats) => {
    if (!stats || typeof stats !== 'object') return;
    onlineStats = {
      total_online: typeof stats.total_online === 'number' ? stats.total_online : 0,
      // Replace, don't merge -- a system that emptied out is absent
      // from the payload and must drop from the local map too.
      by_system: stats.by_system && typeof stats.by_system === 'object' ? stats.by_system : {},
    };
    emit('stats_changed', onlineStats);
  });

  socketBus.onSocketEvent('presence:peers', ({ peers: updates }) => {
    const recvNow = Date.now();
    for (const u of updates || []) {
      const p = peers.get(u.user_id);
      if (!p) continue;
      const newSnap = {
        ts: recvNow,
        x: u.x, y: u.y, vx: u.vx, vy: u.vy, rot: u.rot,
        fleet: Array.isArray(u.fleet) ? u.fleet : (p.next?.fleet || []),
      };
      p.prev = p.next || newSnap;
      p.next = newSnap;
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
  ensureListenersBound();
  socketBus.ensureSocket();
  // peers Map is for the OLD system; clear so consumers don't briefly
  // render the prior system's peers while waiting for the snapshot.
  peers.clear();
  emit('peers_changed', { count: 0 });
  const s = socketBus.getSocket();
  if (s?.connected) {
    s.emit('presence:enter', { system_id: systemId });
  }
  // If not connected yet, the bus's 'connect' handler will fire enter for us.
}

export function leaveSystem() {
  if (!ENABLED) return;
  const wasIn = currentSystemId;
  currentSystemId = null;
  peers.clear();
  emit('peers_changed', { count: 0 });
  const s = socketBus.getSocket();
  if (wasIn && s?.connected) {
    s.emit('presence:leave', { system_id: wasIn });
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
  const s = socketBus.getSocket();
  if (!s?.connected || !currentSystemId) {
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
  s.emit('presence:pos', makePosPayload(state));
}

// Catch the trailing edge: if the consumer stopped calling sendPos but
// we have a pending coalesced update, flush it after the interval.
setInterval(() => {
  const s = socketBus.getSocket();
  if (!ENABLED || !pendingPos || !s?.connected || !currentSystemId) return;
  const now = Date.now();
  if (now - lastPosSendMs < POS_SEND_INTERVAL_MS) return;
  lastPosSendMs = now;
  const state = pendingPos;
  pendingPos = null;
  s.emit('presence:pos', makePosPayload(state));
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

// Latest server-pushed roster snapshot. Safe to read at any time;
// defaults to zeros until the first 'presence:stats' arrives. The
// stats object is replaced (not mutated) on each update, so the
// returned reference is stable until the next change -- callers can
// memoize on identity.
export function getOnlineStats() { return onlineStats; }

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
  window.__presence = { getPeers, getOnlineStats, enterSystem, leaveSystem, isEnabled };
}

export default {
  enterSystem, leaveSystem, sendPos, getPeers, getRenderState, getOnlineStats, bumpShipVisual, on, isEnabled,
};
