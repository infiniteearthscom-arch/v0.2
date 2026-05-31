// Mail REST API -- Social Multiplayer Step 9.
// =============================================================
// Thin HTTP layer over lib/mail.js.
//
//   GET  /api/mail/inbox?limit=N
//   GET  /api/mail/unread-count
//   POST /api/mail/send            { recipient_id, subject, body }
//   POST /api/mail/:id/mark-read
//   POST /api/mail/:id/delete

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import {
  sendMail, listInbox, getUnreadCount, markRead, deleteMail,
} from '../lib/mail.js';

const router = express.Router();
router.use(authMiddleware);

function sendErr(res, err) {
  const sc = err?.statusCode || 500;
  if (sc >= 500) console.error('mail api error', err);
  res.status(sc).json({ error: err?.message || 'Mail operation failed' });
}

router.get('/inbox', async (req, res) => {
  try {
    const messages = await listInbox({ userId: req.user.id, limit: req.query.limit });
    res.json({ messages });
  } catch (err) { sendErr(res, err); }
});

router.get('/unread-count', async (req, res) => {
  try {
    const count = await getUnreadCount({ userId: req.user.id });
    res.json({ count });
  } catch (err) { sendErr(res, err); }
});

router.post('/send', async (req, res) => {
  try {
    const mail = await sendMail({
      senderId: req.user.id,
      recipientId: req.body?.recipient_id,
      subject: req.body?.subject,
      body: req.body?.body,
    });
    res.json({ mail });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/mark-read', async (req, res) => {
  try {
    await markRead({ userId: req.user.id, messageId: req.params.id });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/delete', async (req, res) => {
  try {
    await deleteMail({ userId: req.user.id, messageId: req.params.id });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

export default router;
