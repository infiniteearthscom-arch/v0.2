// api/refining.js -- base refining: crafted Refinery lanes, timed + queued
// jobs (v2, 2026-09-25). docs/refining-spec.md.
//
// Rules
//   * Only at YOUR base, docked, with >= 1 Base Refinery fitted. Each
//     fitted refinery is a lane running one job at a time; new jobs queue
//     behind the lane's last job (times are fixed at enqueue -- no cron).
//   * A job: N units of ONE cargo stack -> floor(N x yield) units at
//     min(cap, Q + gain), every stat shifted by the same delta.
//   * Yield / cap / speed come from skills, research AND the refinery
//     module's crafted quality. Jobs burn Fuel Cells from cargo.
//   * Collect while docked: output to cargo or the base depot.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import { resolveBodyId, getPlayerCargoInfo } from './resources.js';
import { getPlayerBonuses } from '../util/playerBonuses.js';
import { addResourceStack } from '../lib/wrecks.js';
import { completeQuestInTx } from './quests.js';
import { loadResourceStackAny, debitStackAny, depotAdd, depotCapacityOf, depotStacks } from '../lib/materials.js';

export const REFINE_GAIN = 8;          // quality per job
export const DEEP_GAIN_BONUS = 4;      // with tech_deep_refining
export const BASE_CAP = 75, DEEP_CAP = 95;
export const BASE_YIELD = 0.65, MAX_YIELD = 0.92;
export const MIN_INPUT = 5;
export const FUEL_PER_100_UNITS = 1;   // fuel cells per job, ceil(units/100)
export const JOB_BASE_SECONDS = 30, JOB_SECONDS_PER_UNIT = 0.8;
// Module crafted quality: Q50 = baseline; Q100 -> +10% yield, +10 cap, 1.5x speed
export const MODULE_YIELD_PER_Q = 0.10 / 50, MODULE_CAP_PER_Q = 1 / 5, MODULE_SPEED_EXP = 0.6;
export const MAX_QUEUE_PER_LANE = 6;

const router = express.Router();
router.use(authMiddleware);

const AVG = (s) => ((Number(s.stat_purity ?? 50) + Number(s.stat_stability ?? 50) + Number(s.stat_potency ?? 50) + Number(s.stat_density ?? 50)) / 4);
const avgQ = (q) => q == null ? 50 : typeof q === 'number' ? q : ((Number(q.purity ?? 50) + Number(q.stability ?? 50) + Number(q.potency ?? 50) + Number(q.density ?? 50)) / 4);

// The pilot's OWN built base at the docked body, with its refinery lanes.
async function dockedBaseLanes(req, userId, client = null) {
  const q = client ? (sql, p) => client.query(sql, p).then(r => r.rows) : queryAll;
  const presence = req.app.get('io')?.presence;
  const raw = presence?.getUserDockedBody?.(userId) || null;
  if (!raw) return { error: 'Dock at a planet where you own a base' };
  const bodyId = await resolveBodyId(String(raw));
  if (!bodyId) return { error: 'Dock at a planet where you own a base' };
  const rows = await q(`SELECT * FROM player_bases WHERE user_id = $1 AND celestial_body_id = $2`, [userId, bodyId]);
  const base = rows[0];
  if (!base) return { error: 'No base of yours here -- refining happens at your base' };
  if (new Date(base.build_completes_at).getTime() > Date.now()) return { error: 'Your base is still under construction' };
  const lanes = Object.entries(base.fitted_modules || {})
    .filter(([, m]) => m?.stats?.refinery)
    .map(([slot, m]) => ({ slot, name: m.name, quality: Math.round(avgQ(m.quality)), speed: Number(m.stats.refine_speed) || 1 }));
  if (!lanes.length) return { error: 'Craft a Base Refinery and fit it to this base first' };
  return { base, lanes };
}
async function techState(userId, q = queryAll) {
  const rows = await q(`SELECT tech_id FROM player_research WHERE user_id = $1 AND tech_id IN ('tech_refining','tech_deep_refining')`, [userId]);
  const have = new Set(rows.map(r => r.tech_id));
  return { unlocked: have.has('tech_refining'), deep: have.has('tech_deep_refining') };
}

// Pure quote for a stack on a lane.
export function computeQuote(stack, quantity, bonuses, tech, lane) {
  const n = Math.max(0, Math.min(Number(stack.quantity), Math.floor(Number(quantity) || 0)));
  const isOre = stack.category === 'ore', isCommon = stack.rarity === 'common';
  const mq = lane?.quality ?? 50;
  const metalLevel = isOre ? Math.round((bonuses.metal_refining_pct || 0) / 2) : 0;
  const yieldPct = (bonuses.reprocessing_yield_pct || 0) + (isOre ? (bonuses.metal_refining_pct || 0) : 0) + (isCommon ? (bonuses.common_ore_refining_pct || 0) : 0);
  const yieldFrac = Math.min(MAX_YIELD, BASE_YIELD + yieldPct / 100 + (mq - 50) * MODULE_YIELD_PER_Q);
  const cap = Math.min(100, (tech.deep ? DEEP_CAP : BASE_CAP) + metalLevel + Math.round((mq - 50) * MODULE_CAP_PER_Q));
  const gain = REFINE_GAIN + (tech.deep ? DEEP_GAIN_BONUS : 0);
  const qIn = AVG(stack);
  const qOut = Math.min(cap, qIn + gain);
  const delta = Math.round((qOut - qIn) * 10) / 10;
  const outQty = Math.floor(n * yieldFrac);
  const speed = Math.pow(Math.max(1, mq) / 50, MODULE_SPEED_EXP) * (lane?.speed || 1);
  const seconds = Math.max(10, Math.round((JOB_BASE_SECONDS + n * JOB_SECONDS_PER_UNIT) / speed * (1 + (bonuses.smelting_time_pct || 0) / 100)));
  const fuel = Math.ceil(n / 100) * FUEL_PER_100_UNITS;
  const stats = {};
  for (const k of ['purity', 'stability', 'potency', 'density']) stats[`stat_${k}`] = Math.max(0, Math.min(100, Math.round(Number(stack[`stat_${k}`] ?? 50) + delta)));
  let reason = null;
  if (n < MIN_INPUT) reason = `Minimum ${MIN_INPUT} units`;
  else if (qIn >= cap) reason = `Already at this refinery's cap (Q${cap})`;
  else if (outQty < 1) reason = 'Yield would be 0 units';
  return { units_in: n, units_out: outQty, yield_pct: Math.round(yieldFrac * 100), fee: 0, fuel_cells: fuel, seconds, quality_in: Math.round(qIn), quality_out: Math.round(Math.min(cap, qIn + delta)), cap, gain, out_stats: stats, reason, module_quality: mq };
}

// 089: a stack may live in the base depot (source 'depot').
async function loadStackAny(userId, baseId, id, source, client = null) {
  if (source !== 'depot') return loadStack(userId, id, client);
  if (!client) {
    const r = await query(`
      SELECT bi.id, bi.quantity, bi.resource_type_id, bi.stat_purity, bi.stat_stability, bi.stat_potency, bi.stat_density,
             rt.name AS resource_name, rt.category, rt.rarity, rt.base_price
        FROM player_base_inventory bi JOIN resource_types rt ON rt.id = bi.resource_type_id
       WHERE bi.id = $1 AND bi.base_id = $2 AND bi.item_type = 'resource'`, [id, baseId]);
    return (r.rows || r)[0] ? { ...(r.rows || r)[0], source: 'depot' } : null;
  }
  return loadResourceStackAny(client, userId, baseId, { id, source: 'depot' });
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
async function fuelCellsInCargo(userId, q = query) {
  const r = await q(`SELECT COALESCE(SUM(quantity),0)::int AS n FROM player_resource_inventory WHERE user_id = $1 AND item_type = 'item' AND item_id = 'fuel_cell'`, [userId]);
  return (r.rows || r)[0]?.n || 0;
}
async function consumeFuel(client, userId, n) {
  let left = n;
  const st = await client.query(`SELECT id, quantity FROM player_resource_inventory WHERE user_id = $1 AND item_type = 'item' AND item_id = 'fuel_cell' ORDER BY quantity DESC FOR UPDATE`, [userId]);
  for (const s of st.rows) {
    if (left <= 0) break;
    const take = Math.min(left, Number(s.quantity));
    if (take >= Number(s.quantity)) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
    else await client.query(`UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`, [take, s.id]);
    left -= take;
  }
  if (left > 0) throw Object.assign(new Error(`Needs ${n} Fuel Cell${n === 1 ? '' : 's'} in cargo`), { statusCode: 400 });
}
async function refundFuel(client, userId, n) {
  if (n <= 0) return;
  const ex = await client.query(`SELECT id FROM player_resource_inventory WHERE user_id = $1 AND item_type = 'item' AND item_id = 'fuel_cell' LIMIT 1`, [userId]);
  if (ex.rows[0]) await client.query(`UPDATE player_resource_inventory SET quantity = quantity + $1 WHERE id = $2`, [n, ex.rows[0].id]);
  else {
    const slot = await client.query(`SELECT COALESCE(MAX(slot_index), -1) + 1 AS s FROM player_resource_inventory WHERE user_id = $1`, [userId]);
    await client.query(`INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data) VALUES ($1, 'item', 'fuel_cell', $2, $3, '{}')`, [userId, n, slot.rows[0].s]);
  }
}

const shapeJob = (j, now = Date.now()) => {
  const s = new Date(j.starts_at).getTime(), e = new Date(j.completes_at).getTime();
  const phase = j.status !== 'queued' ? j.status : now < s ? 'waiting' : now < e ? 'running' : 'done';
  return {
    id: j.id, lane: j.lane, resource_type_id: j.resource_type_id, resource_name: j.resource_name,
    units_in: j.units_in, units_out: j.units_out, fuel_cells: j.fuel_cells,
    quality_in: Math.round((Number(j.in_purity) + Number(j.in_stability) + Number(j.in_potency) + Number(j.in_density)) / 4),
    quality_out: Math.round((Number(j.out_purity) + Number(j.out_stability) + Number(j.out_potency) + Number(j.out_density)) / 4),
    starts_at: j.starts_at, completes_at: j.completes_at, status: phase,
    progress: phase === 'running' ? Math.max(0, Math.min(1, (now - s) / Math.max(1, e - s))) : phase === 'done' ? 1 : 0,
  };
};
async function jobsForBase(baseId, q = queryAll) {
  return q(`SELECT j.*, rt.name AS resource_name FROM player_refine_jobs j JOIN resource_types rt ON rt.id = j.resource_type_id
             WHERE j.base_id = $1 AND j.status = 'queued' ORDER BY j.starts_at ASC`, [baseId]);
}

// GET /refining/status -- the docked base's lanes + jobs
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const tech = await techState(userId);
    const ctx = await dockedBaseLanes(req, userId);
    if (ctx.error) return res.json({ available: false, reason: ctx.error, unlocked: tech.unlocked, requires_tech: tech.unlocked ? null : 'tech_refining' });
    const jobs = (await jobsForBase(ctx.base.id)).map(j => shapeJob(j));
    res.json({
      available: true, unlocked: tech.unlocked, deep: tech.deep, requires_tech: tech.unlocked ? null : 'tech_refining',
      base: { id: ctx.base.id, name: ctx.base.name },
      lanes: ctx.lanes.map(l => ({ ...l, jobs: jobs.filter(j => j.lane === l.slot) })),
      fuel_cells: await fuelCellsInCargo(userId),
      depot_stacks: (await depotStacks({ query: (sql, p) => query(sql, p).then(r => ({ rows: r.rows || r })) }, ctx.base.id)).filter(s => s.item_type === 'resource'),
      max_queue_per_lane: MAX_QUEUE_PER_LANE,
    });
  } catch (e) { console.error('refining/status:', e); res.status(500).json({ error: 'Failed to load refinery' }); }
});

// GET /refining/quote?inventory_id=&quantity=&lane=
router.get('/quote', async (req, res) => {
  try {
    const userId = req.user.id;
    const tech = await techState(userId);
    if (!tech.unlocked) return res.json({ unlocked: false, requires_tech: 'tech_refining', tech_name: 'Ore Refining' });
    const ctx = await dockedBaseLanes(req, userId);
    if (ctx.error) return res.status(400).json({ error: ctx.error });
    const stack = await loadStackAny(userId, ctx.base.id, String(req.query.inventory_id || ''), req.query.source);
    if (!stack) return res.status(404).json({ error: 'Resource stack not found' });
    const lane = ctx.lanes.find(l => l.slot === req.query.lane) || ctx.lanes[0];
    const bonuses = await getPlayerBonuses(userId);
    res.json({ unlocked: true, deep: tech.deep, lane: lane.slot, quote: computeQuote(stack, req.query.quantity ?? stack.quantity, bonuses, tech, lane) });
  } catch (e) { console.error('refining/quote:', e); res.status(500).json({ error: 'Failed to quote' }); }
});

// POST /refining/queue { inventory_id, quantity, lane? }
router.post('/queue', async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, quantity, lane: laneReq, source } = req.body || {};
    if (!inventory_id || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'inventory_id and a positive integer quantity are required' });
    const tech = await techState(userId);
    if (!tech.unlocked) return res.status(403).json({ error: 'Research Ore Refining first', requires_tech: 'tech_refining' });
    const bonuses = await getPlayerBonuses(userId);
    const result = await transaction(async (client) => {
      const ctx = await dockedBaseLanes(req, userId, client);
      if (ctx.error) throw Object.assign(new Error(ctx.error), { statusCode: 400 });
      const stack = await loadStackAny(userId, ctx.base.id, String(inventory_id), source, client);
      if (!stack) throw Object.assign(new Error('Resource stack not found'), { statusCode: 404 });
      const jobs = await jobsForBase(ctx.base.id, (sql, p) => client.query(sql, p).then(r => r.rows));
      // lane: requested, else the one that frees up soonest
      const laneEnd = (slot) => jobs.filter(j => j.lane === slot).reduce((m, j) => Math.max(m, new Date(j.completes_at).getTime()), Date.now());
      let lane = ctx.lanes.find(l => l.slot === laneReq);
      if (!lane) lane = ctx.lanes.slice().sort((a, b) => laneEnd(a.slot) - laneEnd(b.slot))[0];
      if (jobs.filter(j => j.lane === lane.slot).length >= MAX_QUEUE_PER_LANE) throw Object.assign(new Error(`That lane's queue is full (${MAX_QUEUE_PER_LANE})`), { statusCode: 409 });
      const quote = computeQuote(stack, quantity, bonuses, tech, lane);
      if (quote.reason) throw Object.assign(new Error(quote.reason), { statusCode: 400 });
      await consumeFuel(client, userId, quote.fuel_cells);
      await debitStackAny(client, stack, quote.units_in);
      const startsAt = new Date(laneEnd(lane.slot));
      const completesAt = new Date(startsAt.getTime() + quote.seconds * 1000);
      const ins = await client.query(`
        INSERT INTO player_refine_jobs (user_id, base_id, lane, resource_type_id, units_in, in_purity, in_stability, in_potency, in_density,
                                        units_out, out_purity, out_stability, out_potency, out_density, fuel_cells, starts_at, completes_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [userId, ctx.base.id, lane.slot, stack.resource_type_id, quote.units_in, stack.stat_purity ?? 50, stack.stat_stability ?? 50, stack.stat_potency ?? 50, stack.stat_density ?? 50,
         quote.units_out, quote.out_stats.stat_purity, quote.out_stats.stat_stability, quote.out_stats.stat_potency, quote.out_stats.stat_density, quote.fuel_cells, startsAt, completesAt]);
      return { job: shapeJob({ ...ins.rows[0], resource_name: stack.resource_name }), quote };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('refining/queue:', e); res.status(500).json({ error: 'Failed to queue job' });
  }
});

// POST /refining/jobs/:id/cancel -- only jobs that have not started; refunds input + fuel
router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await transaction(async (client) => {
      const r = await client.query(`SELECT * FROM player_refine_jobs WHERE id = $1 AND user_id = $2 AND status = 'queued' FOR UPDATE`, [String(req.params.id), userId]);
      const j = r.rows[0];
      if (!j) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
      if (new Date(j.starts_at).getTime() <= Date.now()) throw Object.assign(new Error('Job already started'), { statusCode: 409 });
      await client.query(`UPDATE player_refine_jobs SET status = 'cancelled' WHERE id = $1`, [j.id]);
      await addResourceStack(client, userId, j.resource_type_id, j.units_in, { stat_purity: j.in_purity, stat_stability: j.in_stability, stat_potency: j.in_potency, stat_density: j.in_density });
      await refundFuel(client, userId, j.fuel_cells);
      // pull later jobs in that lane forward by this job's duration
      const dur = new Date(j.completes_at).getTime() - new Date(j.starts_at).getTime();
      await client.query(`UPDATE player_refine_jobs SET starts_at = starts_at - ($3 || ' milliseconds')::interval, completes_at = completes_at - ($3 || ' milliseconds')::interval
                           WHERE base_id = $1 AND lane = $2 AND status = 'queued' AND starts_at >= $4`, [j.base_id, j.lane, String(dur), j.starts_at]);
      return { cancelled: j.id };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('refining/cancel:', e); res.status(500).json({ error: 'Failed to cancel' });
  }
});

// POST /refining/jobs/:id/collect { to: 'cargo' | 'depot' }
router.post('/jobs/:id/collect', async (req, res) => {
  try {
    const userId = req.user.id;
    const to = req.body?.to === 'depot' ? 'depot' : 'cargo';
    const result = await transaction(async (client) => {
      const r = await client.query(`SELECT * FROM player_refine_jobs WHERE id = $1 AND user_id = $2 AND status = 'queued' FOR UPDATE`, [String(req.params.id), userId]);
      const j = r.rows[0];
      if (!j) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
      if (new Date(j.completes_at).getTime() > Date.now()) throw Object.assign(new Error('Job not finished yet'), { statusCode: 409 });
      const ctx = await dockedBaseLanes(req, userId, client);
      if (ctx.error || ctx.base.id !== j.base_id) throw Object.assign(new Error('Dock at that base to collect'), { statusCode: 400 });
      const stats = { stat_purity: j.out_purity, stat_stability: j.out_stability, stat_potency: j.out_potency, stat_density: j.out_density };
      if (to === 'depot') {
        const cap = depotCapacityOf(ctx.base);
        if (cap <= 0) throw Object.assign(new Error('No depot fitted'), { statusCode: 400 });
        const ok = await depotAdd(client, j.base_id, j.resource_type_id, j.units_out, stats, cap);
        if (!ok) throw Object.assign(new Error('Depot full'), { statusCode: 400 });
      } else {
        const cargo = await getPlayerCargoInfo(userId, client);
        const vol = j.units_out * Math.max(1, Number(j.out_density ?? 50)) / 100;
        if (vol > cargo.remaining) throw Object.assign(new Error(`Not enough cargo room (${Math.floor(cargo.remaining)} free) -- collect to the depot instead`), { statusCode: 400 });
        await addResourceStack(client, userId, j.resource_type_id, j.units_out, stats);
      }
      await client.query(`UPDATE player_refine_jobs SET status = 'collected', collected_at = NOW() WHERE id = $1`, [j.id]);
      await completeQuestInTx(client, userId, 'tutorial_first_refine'); // onboarding (085/086)
      return { collected: j.units_out, to };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('refining/collect:', e); res.status(500).json({ error: 'Failed to collect' });
  }
});

export default router;
