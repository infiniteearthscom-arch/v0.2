// Bounty REST API -- Social Multiplayer Step 8.
// =============================================================
// Thin HTTP layer over lib/bounty.js.
//
//   GET  /api/bounty?system_id=<id>       -- open bounties (optional system filter)
//   GET  /api/bounty/mine                 -- my open/claimed bounties
//   POST /api/bounty/post                 { target_hull_class, target_system_id?, reward_credits, description? }
//   POST /api/bounty/:id/cancel
//   POST /api/bounty/:id/claim            { killed_hull_class, kill_system_id }

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import {
  postBounty, cancelBounty, claimBounty,
  listOpenBounties, listMyBounties,
} from '../lib/bounty.js';

const router = express.Router();
router.use(authMiddleware);

function sendErr(res, err) {
  const sc = err?.statusCode || 500;
  if (sc >= 500) console.error('bounty api error', err);
  res.status(sc).json({ error: err?.message || 'Bounty operation failed' });
}

router.get('/', async (req, res) => {
  try {
    const bounties = await listOpenBounties({ systemId: req.query.system_id || null });
    res.json({ bounties });
  } catch (err) { sendErr(res, err); }
});

router.get('/mine', async (req, res) => {
  try {
    const bounties = await listMyBounties({ userId: req.user.id });
    res.json({ bounties });
  } catch (err) { sendErr(res, err); }
});

router.post('/post', async (req, res) => {
  try {
    const bounty = await postBounty({
      userId: req.user.id,
      targetHullClass: req.body?.target_hull_class,
      targetSystemId: req.body?.target_system_id || null,
      rewardCredits: req.body?.reward_credits,
      description: req.body?.description || null,
    });
    res.json({ bounty });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    await cancelBounty({ userId: req.user.id, bountyId: req.params.id });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

router.post('/:id/claim', async (req, res) => {
  try {
    const result = await claimBounty({
      userId: req.user.id,
      senderName: req.user.username,
      bountyId: req.params.id,
      killedHullClass: req.body?.killed_hull_class,
      killSystemId: req.body?.kill_system_id || null,
    });
    res.json(result);
  } catch (err) { sendErr(res, err); }
});

export default router;
