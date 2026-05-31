// Corporation REST API -- Social Multiplayer Step 7.
// =============================================================
// Thin HTTP layer over lib/corp.js.
//
//   GET  /api/corp/mine                  -- my membership + corp info (or null)
//   GET  /api/corp/invites               -- my pending invites
//   GET  /api/corp/:corpId               -- corp info (no membership data)
//   GET  /api/corp/:corpId/members       -- roster
//
//   POST /api/corp/create                { name, ticker, description? }
//   POST /api/corp/invite                { invitee_id }
//   POST /api/corp/invite/:id/accept
//   POST /api/corp/invite/:id/reject
//   POST /api/corp/leave
//   POST /api/corp/member/:userId/kick
//
// All endpoints require auth.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { queryOne } from '../db/index.js';
import {
  getMembershipFor, listMembers, listPendingInvitesFor,
  createCorp, inviteToCorp, acceptInvite, rejectInvite,
  leaveCorp, kickMember,
} from '../lib/corp.js';

const router = express.Router();
router.use(authMiddleware);

function sendErr(res, err) {
  const sc = err?.statusCode || 500;
  if (sc >= 500) console.error('corp api error', err);
  res.status(sc).json({ error: err?.message || 'Corporation operation failed' });
}

router.get('/mine', async (req, res) => {
  try {
    const membership = await getMembershipFor(req.user.id);
    res.json({ membership });
  } catch (err) { sendErr(res, err); }
});

router.get('/invites', async (req, res) => {
  try {
    const invites = await listPendingInvitesFor(req.user.id);
    res.json({ invites });
  } catch (err) { sendErr(res, err); }
});

router.get('/:corpId', async (req, res) => {
  try {
    const corp = await queryOne(
      `SELECT id, name, ticker, description, founder_id, founded_at, member_count
         FROM corporations WHERE id = $1`,
      [req.params.corpId]
    );
    if (!corp) return res.status(404).json({ error: 'Corporation not found' });
    res.json({ corp });
  } catch (err) { sendErr(res, err); }
});

router.get('/:corpId/members', async (req, res) => {
  try {
    const members = await listMembers(req.params.corpId);
    res.json({ members });
  } catch (err) { sendErr(res, err); }
});

router.post('/create', async (req, res) => {
  try {
    const corp = await createCorp({
      userId: req.user.id,
      senderName: req.user.username,
      name: req.body?.name || '',
      ticker: req.body?.ticker || '',
      description: req.body?.description || null,
    });
    res.json({ corp });
  } catch (err) { sendErr(res, err); }
});

router.post('/invite', async (req, res) => {
  try {
    const inviteeId = String(req.body?.invitee_id || '');
    if (!inviteeId) return res.status(400).json({ error: 'invitee_id required' });
    const invite = await inviteToCorp({
      inviterId: req.user.id,
      inviteeId,
    });
    res.json({ invite });
  } catch (err) { sendErr(res, err); }
});

router.post('/invite/:id/accept', async (req, res) => {
  try {
    const membership = await acceptInvite({ userId: req.user.id, inviteId: req.params.id });
    res.json({ membership });
  } catch (err) { sendErr(res, err); }
});

router.post('/invite/:id/reject', async (req, res) => {
  try {
    await rejectInvite({ userId: req.user.id, inviteId: req.params.id });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

router.post('/leave', async (req, res) => {
  try {
    const result = await leaveCorp({ userId: req.user.id });
    res.json(result);
  } catch (err) { sendErr(res, err); }
});

router.post('/member/:userId/kick', async (req, res) => {
  try {
    await kickMember({ actorId: req.user.id, targetId: req.params.userId });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

export default router;
