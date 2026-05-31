// Trade REST API -- Social Multiplayer Step 5 Phase 2.
// =============================================================
// Thin layer over lib/trade.js. All business logic + state mgmt lives
// there; this file is just HTTP plumbing + auth + a hand-off to the
// session manager.
//
//   POST /api/trade/invite          { partner_id }
//   POST /api/trade/:id/accept
//   POST /api/trade/:id/cancel
//   POST /api/trade/:id/set-offer   { items: [{stack_id, quantity}], credits }
//   POST /api/trade/:id/confirm     { confirmed: true|false }
//   GET  /api/trade/active                       -- recover after page reload
//   GET  /api/trade/:id                          -- poll-fallback state read
//
// All endpoints require auth. The partner_id on invite is validated
// to be a real user; the body-match check (both pilots co-docked at
// the same body) happens inside lib/trade.js via the presence module.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { queryOne } from '../db/index.js';
import {
  createInvite, acceptInvite, cancelByUser, setOffer, setConfirmed,
  getActiveSessionId, getSession,
} from '../lib/trade.js';

const router = express.Router();
router.use(authMiddleware);

// Tiny helper -- catches thrown errors that carry a statusCode (the
// trade module's makeErr) and forwards them as proper HTTP responses.
function sendErr(res, err) {
  const sc = err?.statusCode || 500;
  if (sc >= 500) console.error('trade api error', err);
  res.status(sc).json({ error: err?.message || 'Trade operation failed' });
}

// Pull the user's currently-docked body via presence. Same
// approach as the body-match guard inside lib/trade.js -- but
// invite-time we need the body explicitly to pin the session to it.
// `req.app.get('io')?.presence` is set by setupSocketIO so we can
// reach the presence module from here without circular imports.
function dockedBodyForUser(req, userId) {
  const presence = req.app.get('io')?.presence;
  return presence?.getUserDockedBody?.(userId) || null;
}

router.post('/invite', async (req, res) => {
  try {
    const partnerId = String(req.body?.partner_id || '');
    if (!partnerId) return res.status(400).json({ error: 'partner_id required' });

    const myBodyId = dockedBodyForUser(req, req.user.id);
    if (!myBodyId) return res.status(400).json({ error: 'You must be docked to trade' });
    const partnerBodyId = dockedBodyForUser(req, partnerId);
    if (partnerBodyId !== myBodyId) {
      return res.status(400).json({ error: 'That pilot is not docked here' });
    }

    // Resolve partner's username for the wire payload.
    const partner = await queryOne(
      `SELECT id, username FROM users WHERE id = $1`, [partnerId]
    );
    if (!partner) return res.status(404).json({ error: 'Pilot not found' });

    const state = createInvite({
      fromId: req.user.id,
      fromName: req.user.username,
      partnerId: partner.id,
      partnerName: partner.username,
      bodyId: myBodyId,
    });
    res.json({ trade: state });
  } catch (err) {
    sendErr(res, err);
  }
});

router.post('/:id/accept', async (req, res) => {
  try {
    const state = acceptInvite({ sessionId: req.params.id, userId: req.user.id });
    res.json({ trade: state });
  } catch (err) {
    sendErr(res, err);
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    cancelByUser({
      sessionId: req.params.id,
      userId: req.user.id,
      reason: req.body?.reason || 'user_cancelled',
    });
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err);
  }
});

router.post('/:id/set-offer', async (req, res) => {
  try {
    const state = setOffer({
      sessionId: req.params.id,
      userId: req.user.id,
      items: req.body?.items || [],
      credits: req.body?.credits || 0,
    });
    res.json({ trade: state });
  } catch (err) {
    sendErr(res, err);
  }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const state = await setConfirmed({
      sessionId: req.params.id,
      userId: req.user.id,
      confirmed: !!req.body?.confirmed,
    });
    res.json({ trade: state });
  } catch (err) {
    sendErr(res, err);
  }
});

router.get('/active', async (req, res) => {
  const sid = getActiveSessionId(req.user.id);
  if (!sid) return res.json({ trade: null });
  const state = getSession(sid);
  res.json({ trade: state ? publicView(state) : null });
});

router.get('/:id', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Trade not found' });
  if (!session.participants.some(p => p.user_id === req.user.id)) {
    return res.status(403).json({ error: 'Not your trade' });
  }
  res.json({ trade: publicView(session) });
});

// Re-implement the publicState shape here too, for the GET paths
// where lib/trade.js's internal version isn't exported.
function publicView(session) {
  return {
    id: session.id,
    body_id: session.body_id,
    status: session.status,
    participants: session.participants.map(p => ({
      user_id: p.user_id, name: p.name,
      offer: p.offer, credits: p.credits, confirmed: p.confirmed,
    })),
    expires_at: session.expires_at,
  };
}

export default router;
