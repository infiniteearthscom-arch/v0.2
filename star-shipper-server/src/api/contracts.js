// api/contracts.js -- contract board endpoints (hauling v1, 2026-09-22).
// docs/contracts-spec.md. Board generation + pay math: game/contracts.js.
//
// Docking is the authority for "where are you": the presence module knows
// the body the pilot is docked at (same pattern as market.js); we resolve
// that to (system procedural id, station name) and only then talk contracts.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import { resolveBodyId, getPlayerCargoInfo, getNextSlotIndex } from './resources.js';
import { getPlayerBonuses } from '../util/playerBonuses.js';
import { logActivity } from '../lib/activity.js';
import {
  generateBoard, offerByKey, capsForLevel, isPort, normName, systemName,
  SEALED_ITEM_ID, currentBucket, bucketEndsAt, setResourceCatalog, hasResourceCatalog,
} from '../game/contracts.js';

// Fetch offers need the resource catalog (079). Load once per process.
async function ensureCatalog() {
  if (hasResourceCatalog()) return;
  setResourceCatalog(await queryAll(`SELECT id, name, base_price FROM resource_types ORDER BY id`));
}
// Units of a resource the pilot holds at avg quality >= minQ.
const AVG_Q = `(COALESCE(stat_purity,50)+COALESCE(stat_stability,50)+COALESCE(stat_potency,50)+COALESCE(stat_density,50))/4.0`;
async function qualifyingUnits(userId, resourceTypeId, minQ, q = query) {
  const r = await q(`SELECT COALESCE(SUM(quantity),0)::int AS n FROM player_resource_inventory
                      WHERE user_id = $1 AND item_type = 'resource' AND resource_type_id = $2 AND ${AVG_Q} >= $3`,
    [userId, resourceTypeId, minQ]);
  return (r.rows || r)[0]?.n || 0;
}

const router = express.Router();
router.use(authMiddleware);

// Docked body -> { bodyId, systemId, station } or null.
async function dockedPort(req, userId) {
  const presence = req.app.get('io')?.presence;
  const raw = presence?.getUserDockedBody?.(userId) || null;
  if (!raw) return null;
  const bodyId = await resolveBodyId(String(raw));
  if (!bodyId) return null;
  const row = await queryOne(`
    SELECT cb.name, cb.body_type, ss.procedural_id
      FROM celestial_bodies cb JOIN star_systems ss ON ss.id = cb.system_id
     WHERE cb.id = $1`, [bodyId]);
  if (!row) return null;
  const systemId = row.procedural_id || 'sol';
  if (!isPort(systemId, row.name)) return null;
  return { bodyId, systemId, station: row.name };
}

async function capsFor(userId) {
  const bonuses = await getPlayerBonuses(userId);
  return { ...capsForLevel(bonuses.contracts_flat || 0), reward_pct: bonuses.mission_reward_pct || 0 };
}

// Mark overdue contracts expired and pull their freight (lazy sweep).
async function expireOverdue(userId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const r = await q(`
    UPDATE player_contracts SET status = 'expired', resolved_at = NOW()
     WHERE user_id = $1 AND status = 'active' AND deadline_at < NOW()
     RETURNING id`, [userId]);
  const rows = r.rows || r;
  for (const c of rows) {
    await q(`DELETE FROM player_resource_inventory
              WHERE user_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data->>'contract_id' = $3`,
      [userId, SEALED_ITEM_ID, String(c.id)]);
  }
  return rows.length;
}

const shapeContract = (c) => ({
  id: c.id,
  contested: !!offerByKey(c.contract_key, { anyBucket: true })?.contested,
  fetch_resource_type_id: c.fetch_resource_type_id, fetch_min_quality: c.fetch_min_quality,
  contract_key: c.contract_key,
  contract_type: c.contract_type,
  tier: c.tier,
  origin_system_id: c.origin_system_id, origin_system_name: systemName(c.origin_system_id), origin_station: c.origin_station,
  dest_system_id: c.dest_system_id, dest_system_name: systemName(c.dest_system_id), dest_station: c.dest_station,
  hops: c.hops, cargo_label: c.cargo_label, cargo_volume: c.cargo_volume,
  reward: c.reward, rush: c.rush, status: c.status,
  accepted_at: c.accepted_at, deadline_at: c.deadline_at, resolved_at: c.resolved_at, payout: c.payout,
});

// GET /contracts/board -- the docked port's board
router.get('/board', async (req, res) => {
  try {
    const userId = req.user.id;
    const port = await dockedPort(req, userId);
    if (!port) return res.status(400).json({ error: 'Dock at a station to see its contract board' });
    await ensureCatalog();
    await expireOverdue(userId);
    const bucket = currentBucket();
    const offers = generateBoard(port.systemId, port.station, bucket) || [];
    for (const o of offers) {
      if (o.contract_type === 'fetch') o.have_qualifying = await qualifyingUnits(userId, o.fetch_resource_type_id, o.fetch_min_quality);
    }
    const held = await queryAll(
      `SELECT contract_key FROM player_contracts WHERE user_id = $1 AND status = 'active'`, [userId]);
    const heldKeys = new Set(held.map(h => h.contract_key));
    const caps = await capsFor(userId);
    const activeCount = held.length;
    const cargo = await getPlayerCargoInfo(userId);
    res.json({
      port: { system_id: port.systemId, system_name: systemName(port.systemId), station: port.station },
      board_expires_at: bucketEndsAt(bucket),
      offers: offers.map(o => ({ ...o, held: heldKeys.has(o.contract_key) })),
      limits: { ...caps, active_count: activeCount, cargo_remaining: Math.floor(cargo.remaining) },
    });
  } catch (e) {
    console.error('contracts/board:', e);
    res.status(500).json({ error: 'Failed to load contract board' });
  }
});

// GET /contracts/mine -- my active (and recently resolved) contracts
router.get('/mine', async (req, res) => {
  try {
    const userId = req.user.id;
    await expireOverdue(userId);
    const rows = await queryAll(`
      SELECT * FROM player_contracts
       WHERE user_id = $1 AND (status = 'active' OR resolved_at > NOW() - INTERVAL '10 minutes')
       ORDER BY status = 'active' DESC, deadline_at ASC`, [userId]);
    const caps = await capsFor(userId);
    const shaped = [];
    for (const r of rows) {
      const c = shapeContract(r);
      if (r.contract_type === 'fetch' && r.status === 'active') c.have_qualifying = await qualifyingUnits(userId, r.fetch_resource_type_id, r.fetch_min_quality);
      if (r.contract_type === 'haul' && r.status === 'active') {
        // Freight on board (it may be sitting in a wreck after a podding).
        const f = await query(`SELECT COALESCE(SUM(quantity),0)::int AS n FROM player_resource_inventory
                                WHERE user_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data->>'contract_id' = $3`,
          [userId, SEALED_ITEM_ID, String(r.id)]);
        c.freight_units = (f.rows || f)[0]?.n || 0;
      }
      shaped.push(c);
    }
    res.json({ contracts: shaped, limits: { ...caps, active_count: rows.filter(r => r.status === 'active').length } });
  } catch (e) {
    console.error('contracts/mine:', e);
    res.status(500).json({ error: 'Failed to load contracts' });
  }
});

// POST /contracts/accept { contract_key }
router.post('/accept', async (req, res) => {
  try {
    const userId = req.user.id;
    const key = String(req.body?.contract_key || '');
    await ensureCatalog();
    const offer = offerByKey(key);
    if (!offer) return res.status(400).json({ error: 'That offer is no longer on the board' });
    const port = await dockedPort(req, userId);
    if (!port || port.systemId !== offer.origin_system_id || normName(port.station) !== normName(offer.origin_station)) {
      return res.status(400).json({ error: `Dock at ${offer.origin_station} to accept this contract` });
    }
    const caps = await capsFor(userId);
    if (offer.tier > caps.tier_cap) {
      return res.status(403).json({ error: `Tier ${offer.tier} contracts need Contracting ${offer.tier - 1}` });
    }
    const result = await transaction(async (client) => {
      await expireOverdue(userId, client);
      const active = await client.query(
        `SELECT contract_key FROM player_contracts WHERE user_id = $1 AND status = 'active' FOR UPDATE`, [userId]);
      if (active.rows.some(r => r.contract_key === key)) throw Object.assign(new Error('You already hold this contract'), { statusCode: 409 });
      if (active.rows.length >= caps.active_cap) throw Object.assign(new Error(`You can hold ${caps.active_cap} contracts (train Contracting for more)`), { statusCode: 403 });
      const isFetch = offer.contract_type === 'fetch';
      if (!isFetch) {
        const cargo = await getPlayerCargoInfo(userId, client);
        if (cargo.remaining < offer.volume) {
          throw Object.assign(new Error(`Needs ${offer.volume} free cargo (you have ${Math.floor(cargo.remaining)})`), { statusCode: 400 });
        }
      }
      const ins = await client.query(`
        INSERT INTO player_contracts
          (user_id, contract_key, contract_type, tier, origin_system_id, origin_station,
           dest_system_id, dest_station, hops, cargo_label, cargo_volume, reward, rush, deadline_at,
           fetch_resource_type_id, fetch_min_quality)
        VALUES ($1,$2,$14,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW() + ($13 || ' minutes')::interval, $15, $16)
        RETURNING *`,
        [userId, key, offer.tier, offer.origin_system_id, offer.origin_station,
         offer.dest_system_id, offer.dest_station, offer.hops, offer.cargo_label, offer.volume,
         offer.reward, offer.rush, String(offer.deadline_minutes), offer.contract_type,
         isFetch ? offer.fetch_resource_type_id : null, isFetch ? offer.fetch_min_quality : null]);
      const contract = ins.rows[0];
      if (isFetch) return contract; // nothing to carry yet -- go find it
      const slot = await getNextSlotIndex(userId, client);
      const itemData = {
        contract_id: contract.id, sealed: true, label: offer.cargo_label,
        dest_system_id: offer.dest_system_id, dest_station: offer.dest_station,
      };
      await client.query(`
        INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
        VALUES ($1, 'item', $2, $3, $4, $5)`,
        [userId, SEALED_ITEM_ID, offer.volume, slot, JSON.stringify(itemData)]);
      return contract;
    });
    res.json({ success: true, contract: shapeContract(result) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('contracts/accept:', e);
    res.status(500).json({ error: 'Failed to accept contract' });
  }
});

// POST /contracts/:id/deliver
router.post('/:id/deliver', async (req, res) => {
  try {
    const userId = req.user.id;
    const id = String(req.params.id);
    const port = await dockedPort(req, userId);
    if (!port) return res.status(400).json({ error: 'Dock at the destination station to deliver' });
    const caps = await capsFor(userId);
    const result = await transaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM player_contracts WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
      const c = r.rows[0];
      if (!c) throw Object.assign(new Error('Contract not found'), { statusCode: 404 });
      if (c.status !== 'active') throw Object.assign(new Error(`Contract is ${c.status}`), { statusCode: 409 });
      if (port.systemId !== c.dest_system_id || normName(port.station) !== normName(c.dest_station)) {
        throw Object.assign(new Error(`Deliver to ${c.dest_station} in ${systemName(c.dest_system_id)}`), { statusCode: 400 });
      }
      const late = new Date(c.deadline_at).getTime() < Date.now();
      if (c.contract_type === 'fetch') {
        // ---- find-resource turn-in (079): consume qualifying stacks, lowest quality first ----
        if (late) {
          await client.query(`UPDATE player_contracts SET status = 'failed', resolved_at = NOW() WHERE id = $1`, [c.id]);
          return { failed: true, why: 'Past the deadline', contract: { ...c, status: 'failed' } };
        }
        const stacks = await client.query(`
          SELECT id, quantity FROM player_resource_inventory
           WHERE user_id = $1 AND item_type = 'resource' AND resource_type_id = $2 AND ${AVG_Q} >= $3
           ORDER BY ${AVG_Q} ASC, quantity DESC FOR UPDATE`, [userId, c.fetch_resource_type_id, c.fetch_min_quality]);
        const have = stacks.rows.reduce((a, s) => a + Number(s.quantity), 0);
        if (have < c.cargo_volume) {
          throw Object.assign(new Error(`Need ${c.cargo_volume} ${c.cargo_label} at Q${c.fetch_min_quality}+ (you have ${have})`), { statusCode: 400 });
        }
        let need = c.cargo_volume;
        for (const s of stacks.rows) {
          if (need <= 0) break;
          const take = Math.min(need, Number(s.quantity));
          if (take >= Number(s.quantity)) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
          else await client.query(`UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`, [take, s.id]);
          need -= take;
        }
        const payout = Math.round(c.reward * (1 + caps.reward_pct / 100));
        await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [payout, userId]);
        await client.query(
          `UPDATE player_contracts SET status = 'delivered', resolved_at = NOW(), payout = $2 WHERE id = $1`, [c.id, payout]);
        const u = await client.query(`SELECT credits FROM users WHERE id = $1`, [userId]);
        return { failed: false, payout, credits: parseInt(u.rows[0].credits), contract: { ...c, status: 'delivered', payout } };
      }
      const stack = await client.query(`
        SELECT id, quantity FROM player_resource_inventory
         WHERE user_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data->>'contract_id' = $3
         FOR UPDATE`, [userId, SEALED_ITEM_ID, String(c.id)]);
      const have = stack.rows.reduce((a, s) => a + Number(s.quantity), 0);
      if (have < c.cargo_volume || late) {
        await client.query(`UPDATE player_contracts SET status = 'failed', resolved_at = NOW() WHERE id = $1`, [c.id]);
        for (const s of stack.rows) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
        const why = late ? 'Past the deadline' : `Freight incomplete (${have}/${c.cargo_volume})`;
        return { failed: true, why, contract: { ...c, status: 'failed' } };
      }
      for (const s of stack.rows) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
      const payout = Math.round(c.reward * (1 + caps.reward_pct / 100));
      await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [payout, userId]);
      await client.query(
        `UPDATE player_contracts SET status = 'delivered', resolved_at = NOW(), payout = $2 WHERE id = $1`, [c.id, payout]);
      const u = await client.query(`SELECT credits FROM users WHERE id = $1`, [userId]);
      return { failed: false, payout, credits: parseInt(u.rows[0].credits), contract: { ...c, status: 'delivered', payout } };
    });
    if (!result.failed) {
      logActivity({
        userId, senderName: req.user.username, type: 'contract_delivered', systemId: port.systemId,
        payload: { cargo_label: result.contract.cargo_label, tier: result.contract.tier, payout: result.payout, dest_station: result.contract.dest_station, contract_type: result.contract.contract_type, quantity: result.contract.cargo_volume },
      });
    }
    res.json({ success: !result.failed, ...result, contract: shapeContract(result.contract) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('contracts/deliver:', e);
    res.status(500).json({ error: 'Failed to deliver contract' });
  }
});

// POST /contracts/:id/abandon -- drop the freight, no penalty (v1)
router.post('/:id/abandon', async (req, res) => {
  try {
    const userId = req.user.id;
    const id = String(req.params.id);
    const result = await transaction(async (client) => {
      const r = await client.query(
        `UPDATE player_contracts SET status = 'abandoned', resolved_at = NOW()
          WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`, [id, userId]);
      if (!r.rows[0]) throw Object.assign(new Error('No active contract with that id'), { statusCode: 404 });
      await client.query(`DELETE FROM player_resource_inventory
                           WHERE user_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data->>'contract_id' = $3`,
        [userId, SEALED_ITEM_ID, String(id)]);
      return r.rows[0];
    });
    res.json({ success: true, contract: shapeContract(result) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('contracts/abandon:', e);
    res.status(500).json({ error: 'Failed to abandon contract' });
  }
});

export default router;
