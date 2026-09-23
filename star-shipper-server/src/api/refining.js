// api/refining.js -- station refinery: quality refining (2026-09-22).
// docs/refining-spec.md.
//
//   in:  N units of ONE resource stack at average quality Qin
//   out: floor(N x yield) units at Qout = min(cap, Qin + gain), each stat
//        shifted by the same delta; fee = N x base_price x FEE_RATE credits.
//
// Tuning constants are up top. Yield and cap read the Processing skills
// (catalog contracts that were inert before this): reprocessing_yield_pct,
// metal_refining_pct (ore only), common_ore_refining_pct (common only).
// Research: tech_refining unlocks the service, tech_deep_refining raises
// gain and cap. The fee + the unit loss keep "refine and vendor" a loss
// even at max skills (see the spec's arithmetic) -- refining is for
// crafting quality and contract quality floors, not for credits.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import { resolveBodyId } from './resources.js';
import { getPlayerBonuses } from '../util/playerBonuses.js';
import { addResourceStack } from '../lib/wrecks.js';

export const REFINE_GAIN = 8;          // quality per pass
export const DEEP_GAIN_BONUS = 4;      // with tech_deep_refining
export const BASE_CAP = 75, DEEP_CAP = 95;
export const BASE_YIELD = 0.65, MAX_YIELD = 0.92;
export const FEE_RATE = 0.15;          // x base_price x units in
export const MIN_INPUT = 5;

const router = express.Router();
router.use(authMiddleware);

const AVG = (s) => ((Number(s.stat_purity ?? 50) + Number(s.stat_stability ?? 50) + Number(s.stat_potency ?? 50) + Number(s.stat_density ?? 50)) / 4);

async function dockedRefineryBody(req, userId) {
  const presence = req.app.get('io')?.presence;
  const raw = presence?.getUserDockedBody?.(userId) || null;
  if (!raw) return null;
  const bodyId = await resolveBodyId(String(raw));
  if (!bodyId) return null;
  const row = await queryOne(`SELECT id, name, body_type, has_city FROM celestial_bodies WHERE id = $1`, [bodyId]);
  if (!row) return null;
  if (row.body_type !== 'station' && !row.has_city) return null;
  return row;
}

async function techState(userId) {
  const rows = await queryAll(`SELECT tech_id FROM player_research WHERE user_id = $1 AND tech_id IN ('tech_refining','tech_deep_refining')`, [userId]);
  const have = new Set(rows.map(r => r.tech_id));
  return { unlocked: have.has('tech_refining'), deep: have.has('tech_deep_refining') };
}

// Pure quote from the stack row + bonuses + tech.
export function computeQuote(stack, quantity, bonuses, tech) {
  const n = Math.max(0, Math.min(Number(stack.quantity), Math.floor(Number(quantity) || 0)));
  const isOre = stack.category === 'ore';
  const isCommon = stack.rarity === 'common';
  const metalLevel = isOre ? Math.round((bonuses.metal_refining_pct || 0) / 2) : 0;
  const yieldPct = (bonuses.reprocessing_yield_pct || 0)
    + (isOre ? (bonuses.metal_refining_pct || 0) : 0)
    + (isCommon ? (bonuses.common_ore_refining_pct || 0) : 0);
  const yieldFrac = Math.min(MAX_YIELD, BASE_YIELD + yieldPct / 100);
  const cap = Math.min(100, (tech.deep ? DEEP_CAP : BASE_CAP) + metalLevel);
  const gain = REFINE_GAIN + (tech.deep ? DEEP_GAIN_BONUS : 0);
  const qIn = AVG(stack);
  const qOut = Math.min(cap, qIn + gain);
  const delta = Math.round((qOut - qIn) * 10) / 10;
  const outQty = Math.floor(n * yieldFrac);
  const fee = Math.ceil(n * Number(stack.base_price) * FEE_RATE);
  const stats = {
    stat_purity: Math.max(0, Math.min(100, Math.round(Number(stack.stat_purity ?? 50) + delta))),
    stat_stability: Math.max(0, Math.min(100, Math.round(Number(stack.stat_stability ?? 50) + delta))),
    stat_potency: Math.max(0, Math.min(100, Math.round(Number(stack.stat_potency ?? 50) + delta))),
    stat_density: Math.max(0, Math.min(100, Math.round(Number(stack.stat_density ?? 50) + delta))),
  };
  let reason = null;
  if (n < MIN_INPUT) reason = `Minimum ${MIN_INPUT} units`;
  else if (qIn >= cap) reason = `Already at this refinery's cap (Q${cap})`;
  else if (outQty < 1) reason = 'Yield would be 0 units';
  return { units_in: n, units_out: outQty, yield_pct: Math.round(yieldFrac * 100), fee, quality_in: Math.round(qIn), quality_out: Math.round(Math.min(cap, qIn + delta)), cap, gain, out_stats: stats, reason };
}

async function loadStack(userId, inventoryId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const r = await q(`
    SELECT pri.id, pri.quantity, pri.resource_type_id, pri.stat_purity, pri.stat_stability, pri.stat_potency, pri.stat_density,
           rt.name AS resource_name, rt.category, rt.rarity, rt.base_price
      FROM player_resource_inventory pri JOIN resource_types rt ON rt.id = pri.resource_type_id
     WHERE pri.id = $1 AND pri.user_id = $2 AND pri.item_type = 'resource'
     ${client ? 'FOR UPDATE OF pri' : ''}`, [inventoryId, userId]);
  return (r.rows || r)[0] || null;
}

// GET /refining/quote?inventory_id=&quantity=
router.get('/quote', async (req, res) => {
  try {
    const userId = req.user.id;
    const body = await dockedRefineryBody(req, userId);
    if (!body) return res.status(400).json({ error: 'Dock at a station or city to use a refinery' });
    const tech = await techState(userId);
    if (!tech.unlocked) return res.json({ unlocked: false, requires_tech: 'tech_refining', tech_name: 'Ore Refining' });
    const stack = await loadStack(userId, String(req.query.inventory_id || ''));
    if (!stack) return res.status(404).json({ error: 'Resource stack not found' });
    const bonuses = await getPlayerBonuses(userId);
    const quote = computeQuote(stack, req.query.quantity ?? stack.quantity, bonuses, tech);
    res.json({ unlocked: true, deep: tech.deep, stack: { id: stack.id, resource_name: stack.resource_name, quantity: Number(stack.quantity), category: stack.category, rarity: stack.rarity }, quote });
  } catch (e) {
    console.error('refining/quote:', e);
    res.status(500).json({ error: 'Failed to quote' });
  }
});

// POST /refining/run { inventory_id, quantity }
router.post('/run', async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, quantity } = req.body || {};
    if (!inventory_id || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'inventory_id and a positive integer quantity are required' });
    }
    const body = await dockedRefineryBody(req, userId);
    if (!body) return res.status(400).json({ error: 'Dock at a station or city to use a refinery' });
    const tech = await techState(userId);
    if (!tech.unlocked) return res.status(403).json({ error: 'Research Ore Refining to use a refinery', requires_tech: 'tech_refining' });
    const bonuses = await getPlayerBonuses(userId);
    const result = await transaction(async (client) => {
      const stack = await loadStack(userId, String(inventory_id), client);
      if (!stack) throw Object.assign(new Error('Resource stack not found'), { statusCode: 404 });
      const quote = computeQuote(stack, quantity, bonuses, tech);
      if (quote.reason) throw Object.assign(new Error(quote.reason), { statusCode: 400 });
      const u = await client.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const credits = parseInt(u.rows[0]?.credits || 0);
      if (credits < quote.fee) throw Object.assign(new Error(`Refinery fee is ${quote.fee} CR (you have ${credits})`), { statusCode: 400 });
      // consume input
      if (quote.units_in >= Number(stack.quantity)) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [stack.id]);
      else await client.query(`UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`, [quote.units_in, stack.id]);
      await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [quote.fee, userId]);
      await addResourceStack(client, userId, stack.resource_type_id, quote.units_out, quote.out_stats);
      const after = await client.query(`SELECT credits FROM users WHERE id = $1`, [userId]);
      return { quote, resource_name: stack.resource_name, credits: parseInt(after.rows[0].credits) };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('refining/run:', e);
    res.status(500).json({ error: 'Refining failed' });
  }
});

export default router;
