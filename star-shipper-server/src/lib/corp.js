// Corporation helpers (Social Multiplayer Step 7).
// =============================================================
// All persistent. No in-memory state. Operations are wrapped in
// transactions where multi-row coordination is needed (create + first
// member; accept invite = delete invite + insert member). Single-row
// updates run as raw queries.
//
// Role semantics (v1):
//   founder -- corp creator. Only founder can kick officers.
//              Cannot be kicked (only leaves voluntarily once corp is
//              empty -- v2 adds disband / transfer).
//   officer -- can invite + kick members.
//   member  -- read-only on roster.
//
// v1 omits promote/demote (use SQL if you need it for now) and
// disband. Both are flagged in STATUS.md's open follow-ups.

import { transaction, query, queryOne, queryAll } from '../db/index.js';
import { logActivity } from './activity.js';

// Name + ticker shape rules. Names: 3-64 chars, letters + digits +
// spaces + dash/underscore. Tickers: 2-5 chars, uppercase letters +
// digits. Both validated server-side; the client shows hint text but
// the server is authoritative.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,62}[A-Za-z0-9]$/;
const TICKER_RE = /^[A-Z0-9]{2,5}$/;

function makeErr(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ============================================================
// LOOKUP HELPERS
// Used by other modules (profile, chat, presence) to enrich their
// payloads with the player's corp affiliation. Single-row, indexed.
// ============================================================
export async function getMembershipFor(userId) {
  if (!userId) return null;
  return queryOne(
    `SELECT cm.user_id, cm.corp_id, cm.role, cm.joined_at,
            c.name, c.ticker, c.description, c.founder_id, c.member_count
       FROM corporation_members cm
       JOIN corporations c ON c.id = cm.corp_id
      WHERE cm.user_id = $1`,
    [userId]
  );
}

// All members of a corp, ordered by role then by join date. Drives
// the roster view in CorpWindow.
export async function listMembers(corpId) {
  if (!corpId) return [];
  return queryAll(
    `SELECT cm.user_id, cm.role, cm.joined_at, u.username
       FROM corporation_members cm
       JOIN users u ON u.id = cm.user_id
      WHERE cm.corp_id = $1
      ORDER BY
        CASE cm.role WHEN 'founder' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
        cm.joined_at ASC`,
    [corpId]
  );
}

// All user_ids in a corp -- used by chat fanout (lib/chat.js) so we
// don't need to JOIN through corporations on every send. Tight.
export async function getCorpMemberIds(corpId) {
  if (!corpId) return [];
  const rows = await queryAll(
    `SELECT user_id FROM corporation_members WHERE corp_id = $1`, [corpId]
  );
  return rows.map(r => r.user_id);
}

// Pending invites for a user (their inbox).
export async function listPendingInvitesFor(userId) {
  return queryAll(
    `SELECT ci.id, ci.corp_id, ci.inviter_id, ci.created_at, ci.expires_at,
            c.name AS corp_name, c.ticker AS corp_ticker, c.member_count,
            u.username AS inviter_name
       FROM corporation_invites ci
       JOIN corporations c ON c.id = ci.corp_id
       JOIN users u ON u.id = ci.inviter_id
      WHERE ci.invitee_id = $1
        AND ci.expires_at > NOW()
      ORDER BY ci.created_at DESC`,
    [userId]
  );
}

// ============================================================
// CREATE
// ============================================================
export async function createCorp({ userId, senderName, name, ticker, description }) {
  const trimmedName = (name || '').trim();
  const upperTicker = (ticker || '').trim().toUpperCase();
  if (!NAME_RE.test(trimmedName)) {
    throw makeErr(400, 'Name must be 3-64 alphanumeric chars (spaces, dash, underscore allowed inside)');
  }
  if (!TICKER_RE.test(upperTicker)) {
    throw makeErr(400, 'Ticker must be 2-5 uppercase letters/digits');
  }

  return await transaction(async (client) => {
    // Reject if user is already in a corp.
    const existing = await client.query(
      `SELECT corp_id FROM corporation_members WHERE user_id = $1`, [userId]
    );
    if (existing.rows[0]) throw makeErr(409, 'You are already in a corporation');

    // Unique constraints on name + ticker catch duplicates; surface
    // a friendly error instead of the raw PG message.
    let corpRow;
    try {
      const ins = await client.query(
        `INSERT INTO corporations (name, ticker, description, founder_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [trimmedName, upperTicker, description || null, userId]
      );
      corpRow = ins.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        // Unique violation. Inspect the constraint to tell which collided.
        if (String(err.detail || '').includes('ticker')) {
          throw makeErr(409, `Ticker "${upperTicker}" is taken`);
        }
        throw makeErr(409, `Name "${trimmedName}" is taken`);
      }
      throw err;
    }

    // Add the founder as the first member. Trigger bumps member_count.
    await client.query(
      `INSERT INTO corporation_members (user_id, corp_id, role)
       VALUES ($1, $2, 'founder')`,
      [userId, corpRow.id]
    );

    // Activity ticker: corp founding is rare + interesting.
    logActivity({
      userId, senderName: senderName || 'Pilot',
      type: 'corp_founded', systemId: null,
      payload: { corp_name: trimmedName, corp_ticker: upperTicker },
    });

    return { ...corpRow, member_count: 1 };
  });
}

// ============================================================
// INVITE
// Inviter must be founder or officer of the corp. Invitee must not
// already be in a corp + must not already have a pending invite from
// this corp.
// ============================================================
export async function inviteToCorp({ inviterId, inviteeId }) {
  if (inviterId === inviteeId) throw makeErr(400, "Can't invite yourself");
  return await transaction(async (client) => {
    const mem = await client.query(
      `SELECT corp_id, role FROM corporation_members WHERE user_id = $1`, [inviterId]
    );
    if (!mem.rows[0]) throw makeErr(400, 'You are not in a corporation');
    const { corp_id, role } = mem.rows[0];
    if (role !== 'founder' && role !== 'officer') {
      throw makeErr(403, 'Only founders and officers can invite');
    }
    const existingMembership = await client.query(
      `SELECT corp_id FROM corporation_members WHERE user_id = $1`, [inviteeId]
    );
    if (existingMembership.rows[0]) {
      throw makeErr(400, 'That pilot is already in a corporation');
    }
    try {
      const ins = await client.query(
        `INSERT INTO corporation_invites (corp_id, inviter_id, invitee_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [corp_id, inviterId, inviteeId]
      );
      return ins.rows[0];
    } catch (err) {
      if (err.code === '23505') throw makeErr(409, 'Invite already pending');
      throw err;
    }
  });
}

// ============================================================
// ACCEPT INVITE
// Delete the invite, insert the membership. Single-corp invariant
// enforced by the user_id PK on corporation_members.
// ============================================================
export async function acceptInvite({ userId, inviteId }) {
  return await transaction(async (client) => {
    const inv = await client.query(
      `SELECT * FROM corporation_invites WHERE id = $1 FOR UPDATE`, [inviteId]
    );
    if (!inv.rows[0]) throw makeErr(404, 'Invite not found');
    const invite = inv.rows[0];
    if (invite.invitee_id !== userId) throw makeErr(403, 'Not your invite');
    if (new Date(invite.expires_at) < new Date()) {
      throw makeErr(400, 'Invite has expired');
    }

    // Reject if already in a corp.
    const existing = await client.query(
      `SELECT corp_id FROM corporation_members WHERE user_id = $1`, [userId]
    );
    if (existing.rows[0]) throw makeErr(409, 'You are already in a corporation');

    await client.query(
      `INSERT INTO corporation_members (user_id, corp_id, role)
       VALUES ($1, $2, 'member')`,
      [userId, invite.corp_id]
    );
    // Clean up ALL pending invites for this user across any corp --
    // accepting one membership invalidates the rest.
    await client.query(`DELETE FROM corporation_invites WHERE invitee_id = $1`, [userId]);

    // Return the new membership for the response.
    return queryOne(
      `SELECT cm.user_id, cm.corp_id, cm.role, cm.joined_at,
              c.name, c.ticker, c.member_count
         FROM corporation_members cm
         JOIN corporations c ON c.id = cm.corp_id
        WHERE cm.user_id = $1`,
      [userId]
    );
  });
}

// ============================================================
// REJECT INVITE
// ============================================================
export async function rejectInvite({ userId, inviteId }) {
  const r = await query(
    `DELETE FROM corporation_invites WHERE id = $1 AND invitee_id = $2`,
    [inviteId, userId]
  );
  if (r.rowCount === 0) throw makeErr(404, 'Invite not found');
  return { ok: true };
}

// ============================================================
// LEAVE
// Founder can only leave if they're the last member (no transfer in
// v1). Anyone else can leave at will.
// ============================================================
export async function leaveCorp({ userId }) {
  return await transaction(async (client) => {
    const mem = await client.query(
      `SELECT corp_id, role FROM corporation_members WHERE user_id = $1`, [userId]
    );
    if (!mem.rows[0]) throw makeErr(400, 'You are not in a corporation');
    const { corp_id, role } = mem.rows[0];

    if (role === 'founder') {
      const count = await client.query(
        `SELECT COUNT(*)::INT AS c FROM corporation_members WHERE corp_id = $1`,
        [corp_id]
      );
      if (count.rows[0].c > 1) {
        throw makeErr(400, 'Founder cannot leave while other members remain. Kick them or wait for them to leave.');
      }
      // Last member -- delete the membership AND the corp (cascade
      // cleans up invites).
      await client.query(`DELETE FROM corporation_members WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM corporations WHERE id = $1`, [corp_id]);
      return { ok: true, disbanded: true };
    }

    await client.query(`DELETE FROM corporation_members WHERE user_id = $1`, [userId]);
    return { ok: true };
  });
}

// ============================================================
// KICK MEMBER
// Founder + officer can kick members. Founder can kick officers.
// Founder cannot be kicked.
// ============================================================
export async function kickMember({ actorId, targetId }) {
  if (actorId === targetId) throw makeErr(400, 'Use leave, not kick, to remove yourself');
  return await transaction(async (client) => {
    const actor = await client.query(
      `SELECT corp_id, role FROM corporation_members WHERE user_id = $1`, [actorId]
    );
    if (!actor.rows[0]) throw makeErr(400, 'You are not in a corporation');
    const { corp_id: actorCorp, role: actorRole } = actor.rows[0];
    if (actorRole !== 'founder' && actorRole !== 'officer') {
      throw makeErr(403, 'Only founders and officers can kick members');
    }
    const target = await client.query(
      `SELECT corp_id, role FROM corporation_members WHERE user_id = $1`, [targetId]
    );
    if (!target.rows[0]) throw makeErr(404, 'Member not found');
    const { corp_id: targetCorp, role: targetRole } = target.rows[0];
    if (targetCorp !== actorCorp) throw makeErr(403, 'That pilot is not in your corp');
    if (targetRole === 'founder') throw makeErr(403, 'Cannot kick the founder');
    if (targetRole === 'officer' && actorRole !== 'founder') {
      throw makeErr(403, 'Only the founder can kick officers');
    }

    await client.query(`DELETE FROM corporation_members WHERE user_id = $1`, [targetId]);
    return { ok: true };
  });
}

export default {
  NAME_RE, TICKER_RE,
  getMembershipFor, listMembers, getCorpMemberIds, listPendingInvitesFor,
  createCorp, inviteToCorp, acceptInvite, rejectInvite, leaveCorp, kickMember,
};
