// Shared socket.io client singleton.
// =============================================================
// One authenticated socket per logged-in user. Both presence and
// chat (and any future realtime feature) ride this same connection
// instead of opening their own -- otherwise the server's
// "kick on duplicate connect" dedup would treat the second module's
// socket as a stale tab and disconnect the first.
//
// USAGE
// -----
//   import socketBus from './socket.js';
//   socketBus.ensureSocket();                 // lazy connect; idempotent
//   socketBus.on('connect', () => ...);       // lifecycle subscribers
//   socketBus.onSocketEvent('chat:message', fn); // socket.io event subscribers (auto-rebound on reconnect)
//   const s = socketBus.getSocket();          // for one-off emits; may be null
//
// LIFECYCLE EVENTS  (the "bus" layer)
//   'connect'    { socketId }            -- (re)connected, ready to send
//   'disconnect' { reason }              -- transport died
//   'error'      { message }             -- auth or network failure
//   'kicked'     { reason }              -- server kicked us (dupe tab)
//
// SOCKET EVENTS  (raw socket.io events)
//   onSocketEvent handlers queue if the socket doesn't exist yet, and
//   re-bind on every (re)connect so they survive transport drops.
//
// FEATURE FLAG
// ------------
// `VITE_PRESENCE_ENABLED === 'true'` (named after the first feature
// that used the socket; covers chat too). When false, ensureSocket()
// is a no-op and getSocket() returns null. Callers should be defensive.

import { io as ioClient } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ENABLED = import.meta.env.VITE_PRESENCE_ENABLED === 'true';

let socket = null;
let connecting = false;

// Lifecycle subscribers (connect/disconnect/error/kicked).
const lifecycleListeners = new Map();
function emitLifecycle(event, payload) {
  const set = lifecycleListeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (err) { console.error('socket bus listener error', event, err); }
  }
}

// Raw socket.io event subscribers, keyed by event name. We track them
// here (not just on the socket object) so we can:
//   (a) re-bind every handler on each socket reconnect (so chat doesn't
//       silently stop receiving messages after a transient drop)
//   (b) allow modules to register listeners BEFORE the socket exists
//       (they get bound when ensureSocket() runs)
const socketEventBindings = new Map(); // event -> Set<fn>

function bindAllSocketEvents() {
  if (!socket) return;
  for (const [event, fns] of socketEventBindings.entries()) {
    // Remove any prior handlers for this event on the current socket
    // (in case of reconnect with same socket object -- rare but safe).
    socket.off(event);
    for (const fn of fns) socket.on(event, fn);
  }
}

function getToken() {
  return localStorage.getItem('star-shipper-token');
}

export function ensureSocket() {
  if (socket && socket.connected) return socket;
  if (connecting) return socket;
  if (!ENABLED) return null;
  const token = getToken();
  if (!token) return null;

  connecting = true;
  // If a previous socket exists but is dead (gave up reconnecting, was
  // kicked, or auth-failed), tear it down before building a new one --
  // otherwise the old instance keeps its listeners + reconnection timers
  // alive and orphans accumulate across a long session.
  if (socket) {
    try { socket.removeAllListeners(); socket.disconnect(); } catch (err) { /* already dead */ }
    socket = null;
  }
  socket = ioClient(SERVER_URL, {
    auth: { token },
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  // Lifecycle wiring.
  socket.on('connect', () => {
    connecting = false;
    bindAllSocketEvents();
    emitLifecycle('connect', { socketId: socket.id });
  });

  socket.on('disconnect', (reason) => {
    emitLifecycle('disconnect', { reason });
  });

  socket.on('connect_error', (err) => {
    if (err?.message === 'Authentication required' || err?.message === 'Invalid token') {
      socket.disconnect();
    }
    emitLifecycle('error', { message: err?.message || 'connection error' });
  });

  socket.on('kicked', (payload) => {
    emitLifecycle('kicked', payload);
    socket.disconnect();
  });

  return socket;
}

export function getSocket() { return socket; }
export function isEnabled() { return ENABLED; }

// Lifecycle subscription. Returns unsubscribe.
export function on(event, fn) {
  if (!lifecycleListeners.has(event)) lifecycleListeners.set(event, new Set());
  lifecycleListeners.get(event).add(fn);
  return () => lifecycleListeners.get(event)?.delete(fn);
}

// Raw socket.io event subscription. Returns unsubscribe. Listener is
// auto-bound on the current socket if it exists, AND re-bound on every
// future reconnect.
export function onSocketEvent(event, fn) {
  if (!socketEventBindings.has(event)) socketEventBindings.set(event, new Set());
  socketEventBindings.get(event).add(fn);
  if (socket) socket.on(event, fn);
  return () => {
    socketEventBindings.get(event)?.delete(fn);
    if (socket) socket.off(event, fn);
  };
}

export default { ensureSocket, getSocket, isEnabled, on, onSocketEvent };
