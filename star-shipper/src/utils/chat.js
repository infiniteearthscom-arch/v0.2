// Chat singleton (multiplayer Phase 2 step 1).
// =============================================================
// Two channels for v1: 'system' (everyone in your current procedural
// system) and 'global' (everyone online). 'fleet' is reserved for
// when corps land. Rides the shared socket bus (utils/socket.js) so
// chat and presence share a single authenticated connection per
// user.
//
// PROTOCOL  (mirrors realtime/chat.js on the server)
//   Client -> Server:
//     'chat:send'  { channel: 'system'|'global'|'fleet', text }
//
//   Server -> Client:
//     'chat:message' { id, channel, channel_id, sender_id,
//                      sender_name, text, ts }
//     'chat:error'   { message }
//
// MESSAGE BUFFER
// --------------
//   messages: Map<channelKey, Message[]>     bounded to MAX_MEMORY_MSGS
//   channelKey = `${channel}:${channel_id || ''}`
// Consumers (ChatPanel) read via getMessages(channelKey) and subscribe
// to 'message' / 'channel_loaded' events for re-render triggers.
//
// HISTORY HYDRATION
// -----------------
// On enterSystem() / module load, the client fetches recent history
// via REST `/api/chat/history?channel=system&channel_id=<id>&limit=50`
// and seeds the buffer. Subsequent live messages append.

import socketBus from './socket.js';

const ENABLED = import.meta.env.VITE_PRESENCE_ENABLED === 'true';
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
const MAX_MEMORY_MSGS = 200;  // keep last N per channel in memory; rest stays in DB

let currentSystemId = null;
let listenersBound = false;
const messages = new Map(); // channelKey -> Message[]
const loadedChannels = new Set(); // channelKey strings that have been hydrated from REST

const eventListeners = new Map();
function emitEvent(event, payload) {
  const set = eventListeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (err) { console.error('chat listener error', event, err); }
  }
}

const channelKey = (channel, channelId) => `${channel}:${channelId || ''}`;

function pushMessage(msg) {
  const k = channelKey(msg.channel, msg.channel_id);
  if (!messages.has(k)) messages.set(k, []);
  const arr = messages.get(k);
  arr.push(msg);
  // Trim from the head if we're over budget. Keep history bounded so
  // a long-lived session doesn't grow memory forever.
  if (arr.length > MAX_MEMORY_MSGS) arr.splice(0, arr.length - MAX_MEMORY_MSGS);
  emitEvent('message', { channel: msg.channel, channel_id: msg.channel_id, msg });
}

function ensureListenersBound() {
  if (listenersBound) return;
  listenersBound = true;
  socketBus.onSocketEvent('chat:message', (msg) => {
    pushMessage(msg);
  });
  socketBus.onSocketEvent('chat:error', (payload) => {
    emitEvent('error', payload);
  });
}

async function fetchHistory(channel, channelId) {
  const token = localStorage.getItem('star-shipper-token');
  if (!token) return [];
  const qs = new URLSearchParams({ channel, limit: '50' });
  if (channelId) qs.set('channel_id', channelId);
  const res = await fetch(`${API_URL}/chat/history?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn('chat: history fetch failed', res.status);
    return [];
  }
  const data = await res.json();
  return data.messages || [];
}

// ----- public API -----

// Tell chat which system we're in so loadChannel('system') hits the
// right channel_id. Called from SystemView's enterSystem hook.
export function setSystemId(systemId) {
  currentSystemId = systemId || null;
}

// Hydrate a channel's history from the REST endpoint + seed the
// in-memory buffer. Idempotent per channelKey -- second call no-ops.
// For 'system' channel, uses the systemId set via setSystemId.
export async function loadChannel(channel) {
  if (!ENABLED) return;
  ensureListenersBound();
  socketBus.ensureSocket();
  const channelId = channel === 'system' ? currentSystemId : null;
  if (channel === 'system' && !channelId) return; // not in a system yet
  const k = channelKey(channel, channelId);
  if (loadedChannels.has(k)) return;
  loadedChannels.add(k);
  try {
    const hist = await fetchHistory(channel, channelId);
    // Server returns newest-first; reverse so the buffer ends up
    // oldest-first (matching live message order).
    const arr = hist.slice().reverse();
    messages.set(k, arr.slice(-MAX_MEMORY_MSGS));
    emitEvent('channel_loaded', { channel, channel_id: channelId, count: arr.length });
  } catch (err) {
    console.warn('chat loadChannel failed', channel, err);
    loadedChannels.delete(k); // allow retry
  }
}

// Reset a channel's loaded flag so the next loadChannel() refetches.
// Called when the user changes systems -- new system_id means new
// channel scope, even though the same 'system' key is reused.
export function resetSystemChannel() {
  for (const k of Array.from(loadedChannels)) {
    if (k.startsWith('system:')) loadedChannels.delete(k);
  }
}

export function send(channel, text) {
  if (!ENABLED) return;
  ensureListenersBound();
  socketBus.ensureSocket();
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const s = socketBus.getSocket();
  if (!s?.connected) {
    emitEvent('error', { message: 'Not connected' });
    return;
  }
  s.emit('chat:send', { channel, text: trimmed.slice(0, 500) });
}

export function getMessages(channel, channelId) {
  const k = channelKey(channel, channelId ?? (channel === 'system' ? currentSystemId : null));
  return messages.get(k) || [];
}

export function on(event, fn) {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event).add(fn);
  return () => eventListeners.get(event)?.delete(fn);
}

export function isEnabled() { return ENABLED; }

// Browser-console debug handle.
if (typeof window !== 'undefined' && ENABLED) {
  window.__chat = { send, getMessages, loadChannel, setSystemId };
}

export default { setSystemId, loadChannel, resetSystemChannel, send, getMessages, on, isEnabled };
