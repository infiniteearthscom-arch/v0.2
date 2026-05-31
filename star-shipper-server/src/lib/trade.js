// Trade session manager (Social Multiplayer Step 5 Phase 2).
// =============================================================
// In-memory two-party trade sessions. No DB table for the session
// itself -- trades are short-lived (minutes) and surviving a server
// restart isn't worth the schema cost. The actual atomic swap on
// completion DOES hit the DB via a single transaction.
//
// LIFECYCLE
//   invite     -> pending  (invitee can accept/reject within 30s)
//   accept     -> active   (both parties can edit offers + confirm)
//   confirm x2 -> completed -> atomic swap -> all parties notified
//   cancel     -> cancelled (either side; or auto on undock/timeout)
//
// INVARIANTS
//   - One active trade per user (enforced at invite time).
//   - Both parties must be docked at the SAME body at every action.
//     Body match revalidated on every endpoint -- not just at invite --
//     because docking state can change during the trade (the trade auto
//     -cancels via the per-action check or via the explicit undock hook).
//   - Either side editing their offer voids BOTH confirms. Prevents the
//     "bait and switch" race where party A confirms, then party B swaps
//     in worse items and confirms before A notices.
//   - Atomic swap runs inside a single DB transaction with FOR UPDATE
//     locks on every offered stack + both users.credits rows. If
//     anything fails (insufficient quantity, cargo overflow, race), the
//     transaction rolls back and the trade is marked failed.
//
// WIRE EVENTS (server -> client, all via the shared io)
//   trade:invite    { trade_id, from_id, from_name, body_id }   to invitee
//   trade:opened    { ...state }                                 to both
//   trade:updated   { ...state }                                 to both
//   trade:completed { trade_id }                                 to both
//   trade:cancelled { trade_id, reason }                         to both

import { transaction } from '../db/index.js';
import { getPlayerCargoInfo, getNextSlotIndex } from '../api/resources.js';
import { logActivity } from './activity.js';

let ioRef = null;
let presenceRef = null; // attachPresence's return object (has isUserDockedAt, getUserSocketId)

// Set at startup by socketHandler.js.
export function setTradeIO(io) { ioRef = io; }
export function setTradePresence(presence) { presenceRef = presence; }

const PENDING_TIMEOUT_MS = 30 * 1000;  // invitee has 30s to accept
const ACTIVE_TIMEOUT_MS  = 5 * 60 * 1000; // active session times out after 5min idle

// id -> session
const sessions = new Map();
// userId -> session id  (one active/pending trade per user)
const userActiveSession = new Map();

function makeId() {
  // Simple non-cryptographic id -- 8 hex chars from random + timestamp.
  // These ids are short-lived in memory; no need for UUID heft.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emitToUser(userId, event, payload) {
  const socketId = presenceRef?.getUserSocketId?.(userId);
  if (!socketId || !ioRef) return;
  ioRef.to(socketId).emit(event, payload);
}

function emitToBoth(session, event, payload) {
  for (const p of session.participants) emitToUser(p.user_id, event, payload);
}

// Public state shape -- safe to send to either party. Both sides see
// the same data (your offer + their offer + confirm flags). For v1
// there's nothing private per-party in the session.
function publicState(session) {
  return {
    id: session.id,
    body_id: session.body_id,
    status: session.status,
    participants: session.participants.map(p => ({
      user_id: p.user_id,
      name: p.name,
      offer: p.offer,
      credits: p.credits,
      confirmed: p.confirmed,
    })),
    expires_at: session.expires_at,
  };
}

function cancelSession(session, reason) {
  if (session.status === 'completed' || session.status === 'cancelled') return;
  session.status = 'cancelled';
  if (session.timer) { clearTimeout(session.timer); session.timer = null; }
  for (const p of session.participants) userActiveSession.delete(p.user_id);
  emitToBoth(session, 'trade:cancelled', { trade_id: session.id, reason });
  // Keep the session in the map for a beat so a late GET returns
  // 'cancelled' rather than 404. Cleanup after 1 minute.
  setTimeout(() => sessions.delete(session.id), 60 * 1000);
}

function bumpActivity(session) {
  if (session.timer) clearTimeout(session.timer);
  session.expires_at = Date.now() + ACTIVE_TIMEOUT_MS;
  session.timer = setTimeout(() => {
    cancelSession(session, 'timeout');
  }, ACTIVE_TIMEOUT_MS);
}

// Cancel any pending OR active trade involving this user. Called from
// presence.js when the user undocks (trades require co-docking) and
// on disconnect.
export function cancelTradesForUser(userId, reason = 'partner_disconnected') {
  const sid = userActiveSession.get(userId);
  if (!sid) return;
  const session = sessions.get(sid);
  if (session) cancelSession(session, reason);
}

// Return the user's active session id (or null).
export function getActiveSessionId(userId) {
  return userActiveSession.get(userId) || null;
}

// Return the session by id (or null).
export function getSession(id) {
  return sessions.get(id) || null;
}

// Body-match guard: returns true iff both participants are still
// docked at the trade's body. Called on every endpoint as defense.
// Returns true if presence isn't wired up (fail-open for testing).
function bothDocked(session) {
  const bid = session.body_id;
  if (!bid || !presenceRef?.isUserDockedAt) return true;
  return session.participants.every(p => presenceRef.isUserDockedAt(p.user_id, bid));
}

// ============================================================
// INVITE
// ============================================================
export function createInvite({ fromId, fromName, partnerId, partnerName, bodyId }) {
  if (fromId === partnerId) throw makeErr(400, 'Cannot trade with yourself');
  if (userActiveSession.has(fromId)) throw makeErr(409, 'You already have an active trade');
  if (userActiveSession.has(partnerId)) throw makeErr(409, 'That pilot is already in a trade');
  if (!bodyId) throw makeErr(400, 'Both pilots must be docked');

  const session = {
    id: makeId(),
    body_id: bodyId,
    status: 'pending',
    participants: [
      { user_id: fromId,    name: fromName,    offer: [], credits: 0, confirmed: false },
      { user_id: partnerId, name: partnerName, offer: [], credits: 0, confirmed: false },
    ],
    created_at: Date.now(),
    expires_at: Date.now() + PENDING_TIMEOUT_MS,
    timer: null,
  };
  sessions.set(session.id, session);
  userActiveSession.set(fromId, session.id);
  userActiveSession.set(partnerId, session.id);

  // Pending sessions auto-cancel if the invitee doesn't accept in time.
  session.timer = setTimeout(() => {
    if (session.status === 'pending') cancelSession(session, 'invite_timeout');
  }, PENDING_TIMEOUT_MS);

  // Notify the invitee.
  emitToUser(partnerId, 'trade:invite', {
    trade_id: session.id,
    from_id: fromId,
    from_name: fromName,
    body_id: bodyId,
  });

  return publicState(session);
}

// ============================================================
// ACCEPT / REJECT (REJECT = cancel from the invitee side)
// ============================================================
export function acceptInvite({ sessionId, userId }) {
  const session = sessions.get(sessionId);
  if (!session) throw makeErr(404, 'Trade session not found');
  if (session.status !== 'pending') throw makeErr(400, `Cannot accept (status=${session.status})`);
  // The invitee is the SECOND participant. Inviter accepting their
  // own invite is a no-op (well, an error).
  const p = session.participants[1];
  if (p.user_id !== userId) throw makeErr(403, 'Only the invitee can accept');

  session.status = 'active';
  bumpActivity(session);
  emitToBoth(session, 'trade:opened', publicState(session));
  return publicState(session);
}

export function cancelByUser({ sessionId, userId, reason = 'user_cancelled' }) {
  const session = sessions.get(sessionId);
  if (!session) throw makeErr(404, 'Trade session not found');
  if (!session.participants.some(p => p.user_id === userId)) {
    throw makeErr(403, 'Not your trade');
  }
  cancelSession(session, reason);
  return { ok: true };
}

// ============================================================
// SET OFFER
// items: [{ stack_id, quantity }]
// credits: integer >= 0
// Replaces the caller's entire offer wholesale -- simpler than
// per-item ops. The client always sends the full current offer state.
// ============================================================
export function setOffer({ sessionId, userId, items, credits }) {
  const session = sessions.get(sessionId);
  if (!session) throw makeErr(404, 'Trade session not found');
  if (session.status !== 'active') throw makeErr(400, `Cannot edit (status=${session.status})`);
  if (!bothDocked(session)) {
    cancelSession(session, 'partner_undocked');
    throw makeErr(409, 'A pilot is no longer docked');
  }
  const p = session.participants.find(x => x.user_id === userId);
  if (!p) throw makeErr(403, 'Not your trade');

  // Validate shape -- we don't trust client payloads.
  const cleanItems = (Array.isArray(items) ? items : []).flatMap(it => {
    if (!it || typeof it.stack_id !== 'string' || typeof it.quantity !== 'number') return [];
    const q = Math.floor(it.quantity);
    if (q <= 0) return [];
    return [{ stack_id: it.stack_id, quantity: q }];
  });
  const cleanCredits = Math.max(0, Math.floor(Number(credits) || 0));

  p.offer = cleanItems;
  p.credits = cleanCredits;
  // Any change voids BOTH confirms -- protects against bait-and-switch.
  session.participants.forEach(x => { x.confirmed = false; });

  bumpActivity(session);
  emitToBoth(session, 'trade:updated', publicState(session));
  return publicState(session);
}

// ============================================================
// CONFIRM
// confirmed: true|false (false = un-confirm)
// When both participants are confirmed=true, executes the swap.
// ============================================================
export async function setConfirmed({ sessionId, userId, confirmed }) {
  const session = sessions.get(sessionId);
  if (!session) throw makeErr(404, 'Trade session not found');
  if (session.status !== 'active') throw makeErr(400, `Cannot confirm (status=${session.status})`);
  if (!bothDocked(session)) {
    cancelSession(session, 'partner_undocked');
    throw makeErr(409, 'A pilot is no longer docked');
  }
  const p = session.participants.find(x => x.user_id === userId);
  if (!p) throw makeErr(403, 'Not your trade');

  p.confirmed = !!confirmed;
  bumpActivity(session);
  emitToBoth(session, 'trade:updated', publicState(session));

  // Both confirmed -> execute the swap. Async (await) so failures
  // surface as 500s to the caller. If the swap fails, the trade is
  // cancelled with reason 'swap_failed'.
  if (session.participants.every(x => x.confirmed)) {
    try {
      await executeSwap(session);
      session.status = 'completed';
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      for (const part of session.participants) userActiveSession.delete(part.user_id);
      emitToBoth(session, 'trade:completed', { trade_id: session.id });
      // Activity log: one event per direction so the ticker shows
      // "X traded with Y" rather than a generic "trade happened".
      const [a, b] = session.participants;
      logActivity({
        userId: a.user_id, senderName: a.name,
        type: 'trade_completed', systemId: null,
        payload: {
          partner_name: b.name,
          your_item_count: a.offer.length, your_credits: a.credits,
          their_item_count: b.offer.length, their_credits: b.credits,
        },
      });
      // Keep session in memory briefly for late GETs.
      setTimeout(() => sessions.delete(session.id), 60 * 1000);
    } catch (err) {
      console.error('trade swap failed', err);
      cancelSession(session, 'swap_failed');
      throw makeErr(500, err.message || 'Trade execution failed');
    }
  }

  return publicState(session);
}

// ============================================================
// ATOMIC SWAP
// Runs in a single DB transaction. FOR UPDATE locks every offered
// stack and both users.credits rows so no concurrent /craft, /mine,
// /sell, /buy etc. can race.
// ============================================================
async function executeSwap(session) {
  const [pA, pB] = session.participants;

  await transaction(async (client) => {
    // Lock + validate both users' credit rows. ORDER BY id avoids
    // deadlocks (consistent lock order regardless of who's A vs B).
    const [uA, uB] = [pA.user_id, pB.user_id].sort();
    const usersLocked = await client.query(
      `SELECT id, credits FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      [[uA, uB]]
    );
    if (usersLocked.rows.length !== 2) throw new Error('User not found');
    const creditsBy = Object.fromEntries(usersLocked.rows.map(r => [r.id, parseInt(r.credits || 0)]));
    if (creditsBy[pA.user_id] < pA.credits) throw new Error(`${pA.name} cannot afford credit offer`);
    if (creditsBy[pB.user_id] < pB.credits) throw new Error(`${pB.name} cannot afford credit offer`);

    // Lock + validate every offered stack. We collect stack rows by
    // (givingUserId, stackId) so we can run the actual transfers next.
    const collectedOffers = []; // { fromUserId, toUserId, stackRow, qty }
    for (const { from, to } of [{ from: pA, to: pB }, { from: pB, to: pA }]) {
      for (const off of from.offer) {
        const stackRes = await client.query(
          `SELECT * FROM player_resource_inventory
            WHERE id = $1 AND user_id = $2
            FOR UPDATE`,
          [off.stack_id, from.user_id]
        );
        const stack = stackRes.rows[0];
        if (!stack) throw new Error(`${from.name} offered a stack that no longer exists`);
        if (stack.quantity < off.quantity) {
          throw new Error(`${from.name} offered ${off.quantity} but stack only has ${stack.quantity}`);
        }
        collectedOffers.push({ fromUserId: from.user_id, toUserId: to.user_id, stack, qty: off.quantity });
      }
    }

    // Cargo capacity check, accounting for what each side gives up too
    // (so a player at 100% capacity can still trade if they're net-zero
    // or net-negative volume). Volume per stack:
    //   resource: quantity * max(stat_density, 1) / 100
    //   item:     quantity * 1 (v1 approximation; idef.volume_per_unit
    //             would be more accurate but requires another lookup)
    const volOf = (stack, qty) => {
      const perUnit = stack.item_type === 'resource'
        ? Math.max(stack.stat_density || 1, 1) / 100
        : 1;
      return qty * perUnit;
    };
    const incomingVolByUser = new Map();
    const outgoingVolByUser = new Map();
    for (const t of collectedOffers) {
      const v = volOf(t.stack, t.qty);
      incomingVolByUser.set(t.toUserId,   (incomingVolByUser.get(t.toUserId)   || 0) + v);
      outgoingVolByUser.set(t.fromUserId, (outgoingVolByUser.get(t.fromUserId) || 0) + v);
    }
    const allUserIds = new Set([...incomingVolByUser.keys(), ...outgoingVolByUser.keys()]);
    for (const userId of allUserIds) {
      const cargo = await getPlayerCargoInfo(userId, client);
      const netDelta = (incomingVolByUser.get(userId) || 0) - (outgoingVolByUser.get(userId) || 0);
      if (cargo.used + netDelta > cargo.capacity) {
        const partyName = session.participants.find(p => p.user_id === userId)?.name || 'Receiver';
        throw new Error(`${partyName} would exceed cargo capacity (need ${(cargo.used + netDelta).toFixed(1)}, max ${cargo.capacity})`);
      }
    }

    // Execute item transfers.
    for (const t of collectedOffers) {
      // Debit sender.
      if (t.qty >= t.stack.quantity) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [t.stack.id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
          [t.qty, t.stack.id]
        );
      }

      // Credit receiver. Try to merge into an existing matching stack
      // first (same item_type + same identity columns), else create a
      // new slot. Matching rules:
      //   - resources: same resource_type_id + identical stat_* fields
      //   - items:     same item_id + identical item_data JSONB
      let mergedTo = null;
      if (t.stack.item_type === 'resource') {
        const matchRes = await client.query(
          `SELECT id FROM player_resource_inventory
            WHERE user_id = $1
              AND item_type = 'resource'
              AND resource_type_id = $2
              AND stat_purity   IS NOT DISTINCT FROM $3
              AND stat_stability IS NOT DISTINCT FROM $4
              AND stat_potency  IS NOT DISTINCT FROM $5
              AND stat_density  IS NOT DISTINCT FROM $6
              AND stat_weight   IS NOT DISTINCT FROM $7
            LIMIT 1`,
          [
            t.toUserId, t.stack.resource_type_id,
            t.stack.stat_purity, t.stack.stat_stability, t.stack.stat_potency,
            t.stack.stat_density, t.stack.stat_weight,
          ]
        );
        mergedTo = matchRes.rows[0]?.id || null;
      } else if (t.stack.item_type === 'item') {
        const matchRes = await client.query(
          `SELECT id FROM player_resource_inventory
            WHERE user_id = $1
              AND item_type = 'item'
              AND item_id = $2
              AND item_data = $3::jsonb
            LIMIT 1`,
          [t.toUserId, t.stack.item_id, JSON.stringify(t.stack.item_data)]
        );
        mergedTo = matchRes.rows[0]?.id || null;
      }

      if (mergedTo) {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
          [t.qty, mergedTo]
        );
      } else {
        const nextSlot = await getNextSlotIndex(t.toUserId, client);
        await client.query(
          `INSERT INTO player_resource_inventory
             (user_id, item_type, resource_type_id, item_id, quantity, slot_index,
              stat_purity, stat_stability, stat_potency, stat_density, stat_weight,
              item_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            t.toUserId, t.stack.item_type, t.stack.resource_type_id, t.stack.item_id,
            t.qty, nextSlot,
            t.stack.stat_purity, t.stack.stat_stability, t.stack.stat_potency,
            t.stack.stat_density, t.stack.stat_weight,
            t.stack.item_data ? JSON.stringify(t.stack.item_data) : null,
          ]
        );
      }
    }

    // Execute credit transfers. Use deltas in one UPDATE per user so
    // both rows get touched atomically inside the transaction.
    const deltaA = pB.credits - pA.credits; // A receives B's credits, pays own
    const deltaB = -deltaA;
    if (deltaA !== 0) {
      await client.query(
        `UPDATE users SET credits = credits + $1 WHERE id = $2`,
        [deltaA, pA.user_id]
      );
    }
    if (deltaB !== 0) {
      await client.query(
        `UPDATE users SET credits = credits + $1 WHERE id = $2`,
        [deltaB, pB.user_id]
      );
    }
  });
}

function makeErr(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export default {
  setTradeIO, setTradePresence, cancelTradesForUser,
  getActiveSessionId, getSession,
  createInvite, acceptInvite, cancelByUser, setOffer, setConfirmed,
};
