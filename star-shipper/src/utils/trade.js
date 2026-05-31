// Trade singleton (Social Multiplayer Step 5 Phase 2).
// =============================================================
// Mirrors the chat / activity singleton pattern: lazy-connects via
// the shared socket bus, listens for live trade events, and exposes
// a small reactive API for components.
//
// STATE
//   pendingInvite -- {trade_id, from_id, from_name, body_id} | null
//                    Set when we receive 'trade:invite'. Cleared on
//                    accept / reject / timeout. Drives the
//                    TradeInviteToast component.
//   activeTrade   -- full trade state object | null
//                    Set when 'trade:opened' arrives or we accept an
//                    invite. Mutated in place by 'trade:updated'.
//                    Cleared on 'trade:completed' / 'trade:cancelled'.
//   lastResult    -- { status: 'completed'|'cancelled', reason? } | null
//                    Brief terminal-state snapshot the TradeWindow
//                    can use to show "trade complete" / "cancelled
//                    because X" before unmounting.
//
// EVENTS (trade.on)
//   'invite'          -- new pending invite arrived
//   'invite_cleared'  -- invite was accepted, rejected, or timed out
//   'opened'          -- a trade went active (we now have an activeTrade)
//   'updated'         -- activeTrade was mutated (offers / confirms changed)
//   'completed'       -- the trade swap ran successfully
//   'cancelled'       -- the trade was cancelled (with reason)

import socketBus from './socket.js';
import { tradeAPI } from './api.js';

const ENABLED = import.meta.env.VITE_PRESENCE_ENABLED === 'true';

let listenersBound = false;
let pendingInvite = null;
let activeTrade = null;
let lastResult = null;

const eventListeners = new Map();
function emitEvent(event, payload) {
  const set = eventListeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (err) { console.error('trade listener error', event, err); }
  }
}

function ensureListenersBound() {
  if (listenersBound) return;
  listenersBound = true;

  socketBus.onSocketEvent('trade:invite', (payload) => {
    // Defensive: drop if we already have a pending invite or are mid-trade.
    // Server should enforce one-at-a-time but client guards too.
    if (activeTrade || pendingInvite) return;
    pendingInvite = payload;
    emitEvent('invite', payload);
  });

  socketBus.onSocketEvent('trade:opened', (state) => {
    pendingInvite = null;
    activeTrade = state;
    lastResult = null;
    emitEvent('invite_cleared', { reason: 'accepted' });
    emitEvent('opened', state);
  });

  socketBus.onSocketEvent('trade:updated', (state) => {
    activeTrade = state;
    emitEvent('updated', state);
  });

  socketBus.onSocketEvent('trade:completed', ({ trade_id }) => {
    lastResult = { status: 'completed', trade_id };
    activeTrade = null;
    pendingInvite = null;
    emitEvent('completed', lastResult);
  });

  socketBus.onSocketEvent('trade:cancelled', ({ trade_id, reason }) => {
    lastResult = { status: 'cancelled', reason, trade_id };
    activeTrade = null;
    pendingInvite = null;
    emitEvent('invite_cleared', { reason: 'cancelled' });
    emitEvent('cancelled', lastResult);
  });
}

// ----- public API -----

// Idempotent boot: ensures socket + listeners. Called by components
// that mount the trade UI surfaces (toast + window).
export function ensureReady() {
  if (!ENABLED) return;
  socketBus.ensureSocket();
  ensureListenersBound();
}

// Page-reload recovery: if the server has us in an active trade,
// re-hydrate so the window can re-open without the user noticing
// that we lost in-memory state.
export async function recoverActive() {
  if (!ENABLED) return null;
  try {
    const { trade } = await tradeAPI.active();
    if (trade && (trade.status === 'pending' || trade.status === 'active')) {
      if (trade.status === 'active') {
        activeTrade = trade;
        emitEvent('opened', trade);
      }
      // Pending recovery is rarer; the 30s timeout typically fires
      // first. If we land in pending state, just leave it -- the
      // invitee already has a live socket and their toast will be
      // shown via the broadcast channel.
    }
    return trade;
  } catch {
    return null;
  }
}

export async function invite(partnerId) {
  ensureReady();
  return tradeAPI.invite(partnerId);
}

export async function accept(tradeId) {
  ensureReady();
  return tradeAPI.accept(tradeId);
}

export async function reject(tradeId) {
  // "Reject" is a cancel from the invitee's side. Server forwards a
  // trade:cancelled to the inviter so they know.
  ensureReady();
  const out = await tradeAPI.cancel(tradeId, 'invitee_rejected');
  // Don't wait for the broadcast -- clear locally immediately so the
  // toast disappears on click.
  pendingInvite = null;
  emitEvent('invite_cleared', { reason: 'rejected' });
  return out;
}

export async function cancelActive(reason) {
  if (!activeTrade) return;
  ensureReady();
  return tradeAPI.cancel(activeTrade.id, reason || 'user_cancelled');
}

export async function setOffer(items, credits) {
  if (!activeTrade) return;
  ensureReady();
  return tradeAPI.setOffer(activeTrade.id, items, credits);
}

export async function setConfirmed(confirmed) {
  if (!activeTrade) return;
  ensureReady();
  return tradeAPI.confirm(activeTrade.id, confirmed);
}

export function getPendingInvite() { return pendingInvite; }
export function getActiveTrade()   { return activeTrade; }
export function getLastResult()    { return lastResult; }
export function clearLastResult()  { lastResult = null; }

export function on(event, fn) {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event).add(fn);
  return () => eventListeners.get(event)?.delete(fn);
}

export function isEnabled() { return ENABLED; }

// Browser-console debug handle.
if (typeof window !== 'undefined' && ENABLED) {
  window.__trade = {
    invite, accept, reject, cancelActive, setOffer, setConfirmed,
    getPendingInvite, getActiveTrade, getLastResult,
  };
}

export default {
  ensureReady, recoverActive,
  invite, accept, reject, cancelActive, setOffer, setConfirmed,
  getPendingInvite, getActiveTrade, getLastResult, clearLastResult,
  on, isEnabled,
};
