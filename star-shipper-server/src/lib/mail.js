// Mail helpers (Social Multiplayer Step 9).
// =============================================================
// Async player-to-player messages. Persistent (no in-memory state)
// and not realtime in v1 -- the InboxWindow polls + refreshes on
// open. v2 could push 'mail:received' over socket for live unread
// badge updates.
//
// System-generated mail support is in the schema (sender_id NULL +
// system_sent flag) but no internal callers yet. Wired up so future
// callers (market.js order-filled notifications, bounty payouts,
// corp invites that survive a re-login, etc.) can just call
// sendSystemMail() without further plumbing.

import { query, queryAll, queryOne } from '../db/index.js';

const MAX_SUBJECT = 128;
const MAX_BODY = 4000;

function makeErr(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ============================================================
// SEND (player -> player)
// ============================================================
export async function sendMail({ senderId, recipientId, subject, body }) {
  if (!recipientId) throw makeErr(400, 'recipient_id required');
  if (senderId === recipientId) throw makeErr(400, "Can't send mail to yourself");
  const trimmedSubject = (subject || '').trim();
  const trimmedBody = (body || '').trim();
  if (!trimmedSubject) throw makeErr(400, 'subject required');
  if (trimmedSubject.length > MAX_SUBJECT) throw makeErr(400, `subject too long (max ${MAX_SUBJECT})`);
  if (!trimmedBody) throw makeErr(400, 'body required');
  if (trimmedBody.length > MAX_BODY) throw makeErr(400, `body too long (max ${MAX_BODY})`);

  // Validate the recipient exists -- prevents typo'd UUIDs from
  // creating orphan rows the recipient never sees.
  const r = await queryOne(`SELECT id FROM users WHERE id = $1`, [recipientId]);
  if (!r) throw makeErr(404, 'Recipient not found');

  const ins = await queryOne(
    `INSERT INTO mail_messages (sender_id, recipient_id, subject, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [senderId, recipientId, trimmedSubject, trimmedBody]
  );
  return ins;
}

// ============================================================
// SEND (system -> player)
// Internal helper -- future callers like market.js can fire this
// when an order completes. NOT exposed via the REST API.
// ============================================================
export async function sendSystemMail({ recipientId, subject, body }) {
  if (!recipientId || !subject || !body) return null;
  const ins = await queryOne(
    `INSERT INTO mail_messages (sender_id, recipient_id, subject, body, system_sent)
     VALUES (NULL, $1, $2, $3, true)
     RETURNING *`,
    [recipientId, subject, body]
  );
  return ins;
}

// ============================================================
// LIST INBOX
// ============================================================
export async function listInbox({ userId, limit = 50 }) {
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  return queryAll(
    `SELECT m.id, m.sender_id, m.recipient_id, m.subject, m.body,
            m.sent_at, m.read_at, m.system_sent,
            u.username AS sender_name
       FROM mail_messages m
       LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.recipient_id = $1
      ORDER BY m.sent_at DESC
      LIMIT $2`,
    [userId, lim]
  );
}

// ============================================================
// UNREAD COUNT (for badge polling)
// ============================================================
export async function getUnreadCount({ userId }) {
  const r = await queryOne(
    `SELECT COUNT(*)::INT AS c
       FROM mail_messages
      WHERE recipient_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return r?.c || 0;
}

// ============================================================
// MARK READ
// Idempotent -- second call doesn't bump read_at again.
// ============================================================
export async function markRead({ userId, messageId }) {
  const r = await query(
    `UPDATE mail_messages
        SET read_at = COALESCE(read_at, NOW())
      WHERE id = $1 AND recipient_id = $2`,
    [messageId, userId]
  );
  if (r.rowCount === 0) throw makeErr(404, 'Mail not found');
  return { ok: true };
}

// ============================================================
// DELETE (recipient-side only)
// ============================================================
export async function deleteMail({ userId, messageId }) {
  const r = await query(
    `DELETE FROM mail_messages WHERE id = $1 AND recipient_id = $2`,
    [messageId, userId]
  );
  if (r.rowCount === 0) throw makeErr(404, 'Mail not found');
  return { ok: true };
}

export default {
  sendMail, sendSystemMail,
  listInbox, getUnreadCount,
  markRead, deleteMail,
};
