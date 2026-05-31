// Activity event singleton (Social Multiplayer Step 3).
// =============================================================
// Mirrors the chat singleton: lazy-connects via the shared socket bus,
// hydrates recent events via REST on first load, and appends live
// events from the server's broadcast.
//
// PROTOCOL  (mirrors lib/activity.js + api/activity.js on the server)
//   Server -> Client:
//     'activity:event' { id, type, sender_id, sender_name,
//                        system_id, payload, ts }
//
// MESSAGE BUFFER
// --------------
//   events: Event[]                bounded to MAX_MEMORY_EVENTS
// Consumers (ActivityTicker) read via getEvents() and subscribe to
// 'event' (live arrival) / 'hydrated' (initial load done) for
// re-render triggers.
//
// HYDRATION
// ---------
// On first loadEvents() call the client fetches
// `/api/activity/recent?limit=50` and seeds the buffer. Subsequent live
// events append. Server returns newest-first; we reverse so the buffer
// ends up oldest-first (matching live event order).

import socketBus from './socket.js';

const ENABLED = import.meta.env.VITE_PRESENCE_ENABLED === 'true';
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
const MAX_MEMORY_EVENTS = 100; // ticker only needs the most recent few; cap small

let listenersBound = false;
let hydrated = false;
let hydrating = false;
const events = []; // append-only, capped at MAX_MEMORY_EVENTS

const eventListeners = new Map();
function emitEvent(event, payload) {
  const set = eventListeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (err) { console.error('activity listener error', event, err); }
  }
}

function pushEvent(evt) {
  events.push(evt);
  // Trim from the head if over budget. Newest-tail is what the ticker
  // reads from, so head pruning is cheap and preserves recency.
  if (events.length > MAX_MEMORY_EVENTS) {
    events.splice(0, events.length - MAX_MEMORY_EVENTS);
  }
  emitEvent('event', evt);
}

function ensureListenersBound() {
  if (listenersBound) return;
  listenersBound = true;
  socketBus.onSocketEvent('activity:event', (evt) => {
    // Defensive: drop events with no id (server bug or replay attack).
    if (!evt || !evt.id || !evt.type) return;
    // Defensive: drop if we already have this id (server may
    // double-send on reconnect race). Linear scan over a bounded buffer
    // is fine.
    if (events.some(e => e.id === evt.id)) return;
    pushEvent(evt);
  });
}

async function fetchRecent(limit = 50) {
  const token = localStorage.getItem('star-shipper-token');
  if (!token) return [];
  const res = await fetch(`${API_URL}/activity/recent?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn('activity: hydrate failed', res.status);
    return [];
  }
  const data = await res.json();
  return data.events || [];
}

// ----- public API -----

// Hydrate the recent events buffer + start listening for live ones.
// Idempotent -- second call no-ops. Safe to call from multiple
// consumers; only the first triggers the REST round trip.
export async function loadEvents() {
  if (!ENABLED) return;
  ensureListenersBound();
  socketBus.ensureSocket();
  if (hydrated || hydrating) return;
  hydrating = true;
  try {
    const recent = await fetchRecent(50);
    // Server returns newest-first; reverse so the buffer ends up
    // oldest-first (matching live event order).
    const arr = recent.slice().reverse();
    // Splice into the live buffer; preserve any live events that
    // arrived while we were waiting (rare but possible).
    const liveSinceLoad = events.slice();
    events.length = 0;
    events.push(...arr);
    for (const live of liveSinceLoad) {
      if (!events.some(e => e.id === live.id)) events.push(live);
    }
    hydrated = true;
    emitEvent('hydrated', { count: events.length });
  } catch (err) {
    console.warn('activity loadEvents failed', err);
  } finally {
    hydrating = false;
  }
}

// Live, append-ordered buffer. Consumers MUST NOT mutate. Latest event
// is at the END of the array.
export function getEvents() { return events; }

// Most-recent event or null if none.
export function getLatest() {
  return events.length > 0 ? events[events.length - 1] : null;
}

export function on(event, fn) {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event).add(fn);
  return () => eventListeners.get(event)?.delete(fn);
}

export function isEnabled() { return ENABLED; }

// Browser-console debug handle.
if (typeof window !== 'undefined' && ENABLED) {
  window.__activity = { getEvents, getLatest, loadEvents };
}

export default { loadEvents, getEvents, getLatest, on, isEnabled };
