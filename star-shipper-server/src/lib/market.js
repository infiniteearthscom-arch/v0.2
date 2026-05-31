// Market order book (Social Multiplayer Step 6).
// =============================================================
// Per-station async order book. The market_orders table IS the
// escrow -- sell-side items leave the seller's inventory at post
// time; buy-side credits leave the buyer's account at post time.
// Cancel returns escrow; fulfill transfers escrow + the counter side.
//
// v1 is manual-fulfill-only -- a player browses the book and clicks
// to fulfill a specific order (possibly partial). Auto-cross is a v2
// feature; the wire shape is forward-compatible.
//
// All mutating ops run inside a single transaction with FOR UPDATE
// locks on the order row, the relevant inventory stacks, and both
// users.credits rows.

import { transaction, queryAll, queryOne } from '../db/index.js';
import { getPlayerCargoInfo, getNextSlotIndex } from '../api/resources.js';

// ============================================================
// HELPERS
// ============================================================

// Merge a quantity of resource (with specific stats) into the user's
// inventory. Tries to find a matching stack first; falls back to a
// new slot. Returns the row id of the resulting stack.
async function depositResource(client, userId, resourceTypeId, qty, stats) {
  const match = await client.query(
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
    [userId, resourceTypeId, stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density, stats.stat_weight]
  );
  if (match.rows[0]) {
    await client.query(
      `UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
      [qty, match.rows[0].id]
    );
    return match.rows[0].id;
  }
  const slot = await getNextSlotIndex(userId, client);
  const ins = await client.query(
    `INSERT INTO player_resource_inventory
       (user_id, item_type, resource_type_id, quantity, slot_index,
        stat_purity, stat_stability, stat_potency, stat_density, stat_weight)
     VALUES ($1, 'resource', $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [userId, resourceTypeId, qty, slot,
     stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density, stats.stat_weight]
  );
  return ins.rows[0].id;
}

async function depositItem(client, userId, itemId, qty, itemData) {
  const match = await client.query(
    `SELECT id FROM player_resource_inventory
      WHERE user_id = $1
        AND item_type = 'item'
        AND item_id = $2
        AND item_data = $3::jsonb
      LIMIT 1`,
    [userId, itemId, JSON.stringify(itemData)]
  );
  if (match.rows[0]) {
    await client.query(
      `UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
      [qty, match.rows[0].id]
    );
    return match.rows[0].id;
  }
  const slot = await getNextSlotIndex(userId, client);
  const ins = await client.query(
    `INSERT INTO player_resource_inventory
       (user_id, item_type, item_id, quantity, slot_index, item_data)
     VALUES ($1, 'item', $2, $3, $4, $5)
     RETURNING id`,
    [userId, itemId, qty, slot, itemData ? JSON.stringify(itemData) : null]
  );
  return ins.rows[0].id;
}

function makeErr(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ============================================================
// POST ORDER
// ============================================================
export async function postOrder({
  userId, stationBodyId, side,
  itemType, resourceTypeId, itemId,
  sourceStackId, // sell-side only
  pricePerUnit, quantity,
}) {
  if (!stationBodyId) throw makeErr(400, 'You must be docked to post orders');
  if (side !== 'buy' && side !== 'sell') throw makeErr(400, 'side must be buy or sell');
  if (itemType !== 'resource' && itemType !== 'item') throw makeErr(400, 'item_type must be resource or item');
  if (!(quantity > 0) || !Number.isInteger(quantity)) throw makeErr(400, 'quantity must be a positive integer');
  if (!(pricePerUnit > 0) || !Number.isInteger(pricePerUnit)) throw makeErr(400, 'price_per_unit must be a positive integer');
  if (itemType === 'resource' && !resourceTypeId) throw makeErr(400, 'resource_type_id required for resource orders');
  if (itemType === 'item' && !itemId) throw makeErr(400, 'item_id required for item orders');

  return await transaction(async (client) => {
    if (side === 'sell') {
      if (!sourceStackId) throw makeErr(400, 'source_stack_id required for sell orders');
      // Lock + validate the source stack.
      const stackRes = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sourceStackId, userId]
      );
      const stack = stackRes.rows[0];
      if (!stack) throw makeErr(404, 'Stack not found');
      if (stack.item_type !== itemType) throw makeErr(400, 'Stack item_type does not match');
      if (itemType === 'resource' && stack.resource_type_id !== resourceTypeId) {
        throw makeErr(400, 'Stack does not match the requested resource type');
      }
      if (itemType === 'item' && stack.item_id !== itemId) {
        throw makeErr(400, 'Stack does not match the requested item id');
      }
      if (stack.quantity < quantity) throw makeErr(400, `Stack only has ${stack.quantity}, cannot offer ${quantity}`);

      // Debit the stack. The market_orders row holds the escrow.
      if (stack.quantity === quantity) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [stack.id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
          [quantity, stack.id]
        );
      }

      // Insert the order with snapshotted stats / item_data.
      const orderRes = await client.query(
        `INSERT INTO market_orders
           (user_id, station_body_id, side, item_type, resource_type_id, item_id,
            stat_purity, stat_stability, stat_potency, stat_density, stat_weight, item_data,
            price_per_unit, quantity_remaining, quantity_initial)
         VALUES ($1, $2, 'sell', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
         RETURNING *`,
        [userId, stationBodyId, itemType, resourceTypeId, itemId,
         stack.stat_purity, stack.stat_stability, stack.stat_potency, stack.stat_density, stack.stat_weight,
         stack.item_data ? JSON.stringify(stack.item_data) : null,
         pricePerUnit, quantity]
      );
      return orderRes.rows[0];
    }

    // ----- BUY -----
    // Lock + validate buyer's credits.
    const totalEscrow = pricePerUnit * quantity;
    const userRow = await client.query(
      `SELECT credits FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const credits = parseInt(userRow.rows[0]?.credits || 0);
    if (credits < totalEscrow) {
      throw makeErr(400, `Insufficient credits (need ${totalEscrow}, have ${credits})`);
    }
    await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [totalEscrow, userId]);

    const orderRes = await client.query(
      `INSERT INTO market_orders
         (user_id, station_body_id, side, item_type, resource_type_id, item_id,
          price_per_unit, quantity_remaining, quantity_initial)
       VALUES ($1, $2, 'buy', $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [userId, stationBodyId, itemType, resourceTypeId, itemId, pricePerUnit, quantity]
    );
    return orderRes.rows[0];
  });
}

// ============================================================
// CANCEL ORDER
// Returns escrow to the owner. Items rejoin inventory (merging into a
// matching stack if any); credits return to users.credits.
// ============================================================
export async function cancelOrder({ userId, orderId }) {
  return await transaction(async (client) => {
    const orderRes = await client.query(
      `SELECT * FROM market_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) throw makeErr(404, 'Order not found');
    if (order.user_id !== userId) throw makeErr(403, 'Not your order');
    if (order.status !== 'open') throw makeErr(400, `Cannot cancel (status=${order.status})`);

    if (order.side === 'sell') {
      // Return the items.
      if (order.quantity_remaining > 0) {
        if (order.item_type === 'resource') {
          await depositResource(client, userId, order.resource_type_id, order.quantity_remaining, order);
        } else {
          await depositItem(client, userId, order.item_id, order.quantity_remaining, order.item_data || {});
        }
      }
    } else {
      // Return remaining credit escrow.
      const refund = order.price_per_unit * order.quantity_remaining;
      if (refund > 0) {
        await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [refund, userId]);
      }
    }

    await client.query(
      `UPDATE market_orders SET status = 'cancelled', quantity_remaining = 0 WHERE id = $1`,
      [orderId]
    );
    return { ok: true };
  });
}

// ============================================================
// FULFILL ORDER
// Manually fulfill a counter-party's order. Partial fulfill OK.
//
// Fulfilling a SELL order means the caller is BUYING from it -- they
// pay credits, they receive items. No source_stack_id needed; the
// items come from the order's escrow.
//
// Fulfilling a BUY order means the caller is SELLING to it -- they
// give up items from a specific source stack, they receive credits.
// The caller must specify source_stack_id.
// ============================================================
export async function fulfillOrder({ userId, orderId, quantity, sourceStackId, callerStationBodyId }) {
  if (!(quantity > 0) || !Number.isInteger(quantity)) {
    throw makeErr(400, 'quantity must be a positive integer');
  }

  return await transaction(async (client) => {
    const orderRes = await client.query(
      `SELECT * FROM market_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) throw makeErr(404, 'Order not found');
    if (order.status !== 'open') throw makeErr(400, `Order is not open (status=${order.status})`);
    if (order.user_id === userId) throw makeErr(400, "You can't fulfill your own order");
    // Must be docked at the order's station (passed through from the
    // API layer's presence lookup). Without this guard, remote
    // fulfillment would defeat the local-market mechanic.
    if (callerStationBodyId && callerStationBodyId !== order.station_body_id) {
      throw makeErr(400, 'You must be docked at this station to fulfill its orders');
    }

    const fillQty = Math.min(quantity, order.quantity_remaining);
    if (fillQty <= 0) throw makeErr(400, 'Order has no remaining quantity');

    const totalPrice = order.price_per_unit * fillQty;

    if (order.side === 'sell') {
      // Caller is BUYING. Charge them, pay the seller, give the items.
      const [uA, uB] = [userId, order.user_id].sort();
      const usersLocked = await client.query(
        `SELECT id, credits FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
        [[uA, uB]]
      );
      const creditsBy = Object.fromEntries(usersLocked.rows.map(r => [r.id, parseInt(r.credits || 0)]));
      if (creditsBy[userId] < totalPrice) {
        throw makeErr(400, `Insufficient credits (need ${totalPrice}, have ${creditsBy[userId]})`);
      }

      // Cargo capacity check for the buyer using the order's snapshot.
      const perUnit = order.item_type === 'resource'
        ? Math.max(order.stat_density || 1, 1) / 100
        : 1;
      const incomingVol = fillQty * perUnit;
      const cargo = await getPlayerCargoInfo(userId, client);
      if (cargo.used + incomingVol > cargo.capacity) {
        throw makeErr(400, `Insufficient cargo (need ${incomingVol.toFixed(1)}, have ${cargo.remaining.toFixed(1)} free)`);
      }

      // Move credits + items.
      await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [totalPrice, userId]);
      await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [totalPrice, order.user_id]);
      if (order.item_type === 'resource') {
        await depositResource(client, userId, order.resource_type_id, fillQty, order);
      } else {
        await depositItem(client, userId, order.item_id, fillQty, order.item_data || {});
      }
    } else {
      // Caller is SELLING into a BUY order. They give up items from a
      // specific stack; seller gets the escrowed credits.
      if (!sourceStackId) throw makeErr(400, 'source_stack_id required to fulfill a buy order');
      const stackRes = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sourceStackId, userId]
      );
      const stack = stackRes.rows[0];
      if (!stack) throw makeErr(404, 'Source stack not found');
      if (stack.item_type !== order.item_type) throw makeErr(400, 'Stack type does not match order');
      if (order.item_type === 'resource' && stack.resource_type_id !== order.resource_type_id) {
        throw makeErr(400, 'Stack resource type does not match order');
      }
      if (order.item_type === 'item' && stack.item_id !== order.item_id) {
        throw makeErr(400, 'Stack item id does not match order');
      }
      if (stack.quantity < fillQty) throw makeErr(400, `Stack only has ${stack.quantity}`);

      // Debit the seller's stack. Credit the buyer (order owner).
      if (stack.quantity === fillQty) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [stack.id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
          [fillQty, stack.id]
        );
      }
      // Cargo capacity check for the BUY-order owner before depositing.
      const perUnit = stack.item_type === 'resource'
        ? Math.max(stack.stat_density || 1, 1) / 100
        : 1;
      const incomingVol = fillQty * perUnit;
      const cargo = await getPlayerCargoInfo(order.user_id, client);
      if (cargo.used + incomingVol > cargo.capacity) {
        throw makeErr(400, `Buyer cannot accept ${incomingVol.toFixed(1)} more cargo`);
      }
      if (stack.item_type === 'resource') {
        await depositResource(client, order.user_id, stack.resource_type_id, fillQty, {
          stat_purity: stack.stat_purity, stat_stability: stack.stat_stability,
          stat_potency: stack.stat_potency, stat_density: stack.stat_density, stat_weight: stack.stat_weight,
        });
      } else {
        await depositItem(client, order.user_id, stack.item_id, fillQty, stack.item_data || {});
      }
      // Credits: the buy-order escrow already deducted the buyer's
      // credits at post time, so we ONLY need to pay the seller. No
      // additional withdrawal from the buyer.
      await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [totalPrice, userId]);
    }

    // Update the order. If filled to zero, status->filled.
    const newRemaining = order.quantity_remaining - fillQty;
    const newStatus = newRemaining === 0 ? 'filled' : 'open';
    await client.query(
      `UPDATE market_orders SET quantity_remaining = $1, status = $2 WHERE id = $3`,
      [newRemaining, newStatus, orderId]
    );

    return { ok: true, fill_quantity: fillQty, total_price: totalPrice, order_status: newStatus };
  });
}

// ============================================================
// LIST: orders at a station, filtered by item identity.
// ============================================================
export async function listStationOrders({ stationBodyId, itemType, resourceTypeId, itemId, side }) {
  if (!stationBodyId) return [];
  const conds = ['station_body_id = $1', `status = 'open'`];
  const params = [stationBodyId];
  if (itemType) { params.push(itemType); conds.push(`item_type = $${params.length}`); }
  if (resourceTypeId) { params.push(resourceTypeId); conds.push(`resource_type_id = $${params.length}`); }
  if (itemId) { params.push(itemId); conds.push(`item_id = $${params.length}`); }
  if (side) { params.push(side); conds.push(`side = $${params.length}`); }
  // Sort: buys descending by price (highest bid first), sells ascending
  // (lowest ask first). Same SQL handles both via the CASE.
  const sql = `
    SELECT mo.*, u.username AS poster_name
      FROM market_orders mo
      JOIN users u ON u.id = mo.user_id
     WHERE ${conds.join(' AND ')}
     ORDER BY
       CASE WHEN mo.side = 'buy' THEN mo.price_per_unit END DESC,
       CASE WHEN mo.side = 'sell' THEN mo.price_per_unit END ASC,
       mo.created_at ASC
     LIMIT 200`;
  return queryAll(sql, params);
}

// ============================================================
// LIST: distinct item summaries at a station (the "ticker tape" view).
// Returns one row per (item_type, resource_type_id|item_id) with best
// bid + best ask + total bid/ask volume. Drives the market overview
// before the player drills into a specific item's book.
// ============================================================
export async function listStationItemSummary({ stationBodyId }) {
  if (!stationBodyId) return [];
  return queryAll(
    `SELECT
        item_type,
        resource_type_id,
        item_id,
        MAX(CASE WHEN side = 'buy'  THEN price_per_unit END) AS best_bid,
        MIN(CASE WHEN side = 'sell' THEN price_per_unit END) AS best_ask,
        COALESCE(SUM(CASE WHEN side = 'buy'  THEN quantity_remaining END), 0)::BIGINT AS bid_volume,
        COALESCE(SUM(CASE WHEN side = 'sell' THEN quantity_remaining END), 0)::BIGINT AS ask_volume
       FROM market_orders
      WHERE station_body_id = $1 AND status = 'open'
      GROUP BY item_type, resource_type_id, item_id
      ORDER BY (COALESCE(SUM(quantity_remaining), 0))::BIGINT DESC
      LIMIT 100`,
    [stationBodyId]
  );
}

// ============================================================
// LIST: the user's own open orders.
// ============================================================
export async function listMyOrders({ userId }) {
  return queryAll(
    `SELECT mo.*, b.name AS station_name
       FROM market_orders mo
       LEFT JOIN bodies b ON b.id = mo.station_body_id
      WHERE mo.user_id = $1 AND mo.status = 'open'
      ORDER BY mo.created_at DESC
      LIMIT 100`,
    [userId]
  );
}

export default {
  postOrder, cancelOrder, fulfillOrder,
  listStationOrders, listStationItemSummary, listMyOrders,
};
