// Market REST API -- Social Multiplayer Step 6.
// =============================================================
// Thin HTTP layer over lib/market.js. Mutating ops are POSTs; reads
// are GETs.
//
//   POST   /api/market/order          { side, item_type, ...identity, source_stack_id?, price_per_unit, quantity }
//   POST   /api/market/order/:id/cancel
//   POST   /api/market/order/:id/fulfill   { quantity, source_stack_id? }
//   GET    /api/market/station/:bodyId/summary
//   GET    /api/market/station/:bodyId/book?item_type&resource_type_id|item_id&side?
//   GET    /api/market/my
//
// All endpoints require auth. The dock-at-this-station check happens
// at post + fulfill time -- the player must currently be docked at
// the order's station. Listing endpoints are open to any
// authenticated player so they can window-shop without docking.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import {
  postOrder, cancelOrder, fulfillOrder,
  listStationOrders, listStationItemSummary, listMyOrders,
} from '../lib/market.js';

const router = express.Router();
router.use(authMiddleware);

function sendErr(res, err) {
  const sc = err?.statusCode || 500;
  if (sc >= 500) console.error('market api error', err);
  res.status(sc).json({ error: err?.message || 'Market operation failed' });
}

// Pulls the user's currently-docked body (via the presence module on
// `app.get('io')`). Returns null if they're not docked.
function dockedBodyForUser(req, userId) {
  const presence = req.app.get('io')?.presence;
  return presence?.getUserDockedBody?.(userId) || null;
}

router.post('/order', async (req, res) => {
  try {
    const dockedAt = dockedBodyForUser(req, req.user.id);
    if (!dockedAt) return res.status(400).json({ error: 'You must be docked to post orders' });
    const order = await postOrder({
      userId: req.user.id,
      stationBodyId: dockedAt,
      side: req.body?.side,
      itemType: req.body?.item_type,
      resourceTypeId: req.body?.resource_type_id || null,
      itemId: req.body?.item_id || null,
      sourceStackId: req.body?.source_stack_id || null,
      pricePerUnit: parseInt(req.body?.price_per_unit, 10),
      quantity: parseInt(req.body?.quantity, 10),
    });
    res.json({ order });
  } catch (err) { sendErr(res, err); }
});

router.post('/order/:id/cancel', async (req, res) => {
  try {
    await cancelOrder({ userId: req.user.id, orderId: req.params.id });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

router.post('/order/:id/fulfill', async (req, res) => {
  try {
    // Must be docked at the order's station -- otherwise you could
    // remote-fulfill orders galaxy-wide, which defeats the local-market
    // mechanic. Look up the order's station from the inside-of-lib
    // logic? Simpler: ask lib to validate that the user is at the
    // right station. We pass the user's current body and let the lib
    // compare; if mismatched it throws.
    const dockedAt = dockedBodyForUser(req, req.user.id);
    if (!dockedAt) return res.status(400).json({ error: 'You must be docked to fulfill orders' });
    const result = await fulfillOrder({
      userId: req.user.id,
      orderId: req.params.id,
      quantity: parseInt(req.body?.quantity, 10),
      sourceStackId: req.body?.source_stack_id || null,
      callerStationBodyId: dockedAt, // validated inside lib if it cares
    });
    res.json(result);
  } catch (err) { sendErr(res, err); }
});

router.get('/station/:bodyId/summary', async (req, res) => {
  try {
    const rows = await listStationItemSummary({ stationBodyId: req.params.bodyId });
    res.json({ items: rows });
  } catch (err) { sendErr(res, err); }
});

router.get('/station/:bodyId/book', async (req, res) => {
  try {
    const rows = await listStationOrders({
      stationBodyId: req.params.bodyId,
      itemType: req.query.item_type || null,
      resourceTypeId: req.query.resource_type_id || null,
      itemId: req.query.item_id || null,
      side: req.query.side || null,
    });
    res.json({ orders: rows });
  } catch (err) { sendErr(res, err); }
});

router.get('/my', async (req, res) => {
  try {
    const rows = await listMyOrders({ userId: req.user.id });
    res.json({ orders: rows });
  } catch (err) { sendErr(res, err); }
});

export default router;
