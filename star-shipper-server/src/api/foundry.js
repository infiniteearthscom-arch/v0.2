// api/foundry.js -- the base industry tree (2026-09-26). docs/foundry-spec.md
//
// Stations are base modules (module_types.stats.foundry) fitted to plots.
// Each station runs JOBS from foundry_recipes: N runs of a recipe, timed,
// queued per plot (starts_at / completes_at fixed at enqueue -- no cron).
// Inputs come from the base depot first, then cargo; outputs are collected
// while docked, into the depot (default when fitted) or cargo. Processed
// materials inherit the quantity-weighted quality of their inputs; the
// station's crafted quality sets speed (Q100 = 1.5x Q50), Smelting skill
// trims time further.
//
//   GET  /catalog            public tree: materials, stations, recipes, made-at / used-for
//   GET  /status             docked base: stations, their recipes + jobs, materials on hand
//   POST /queue              { slot, recipe_id, runs }
//   POST /jobs/:id/cancel    not-yet-started only; refunds inputs to cargo
//   POST /jobs/:id/collect   { to: 'depot' | 'cargo' }
//   POST /hopper/put         { slot, source, stack_id, quantity? }  -- feed an automatic station
//   POST /hopper/take        { slot, hopper_stack_id, to }
//
// AUTOMATIC stations (090, stats.foundry.hopper): the Fuel Refinery. The
// pilot drags ingredients into its hopper; whenever the base is read the
// station SETTLES the time since its last tick into product (foundry_recipes
// with auto = TRUE, in sort order, first recipe whose inputs are on hand),
// dropping the product into the depot. No cron; idle time is not banked
// beyond one unit's worth. Stalls (no ingredients, depot full, no depot)
// are reported so the console can say why.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import { resolveBodyId, getPlayerCargoInfo } from './resources.js';
import { getPlayerBonuses } from '../util/playerBonuses.js';
import { addResourceStack } from '../lib/wrecks.js';
import { availableMaterials, consumeMaterials, depotAdd, depotAddItem, addItemStack, depotUsed, loadResourceStackAny, debitStackAny } from '../lib/materials.js';
import { BASE_TIERS } from '../game/foundryTree.js';
import { isOperational } from './bases.js';

export const MAX_RUNS = 20;
export const MAX_QUEUE_PER_STATION = 8;
export const MODULE_SPEED_EXP = 0.6;   // Q100 -> (2)^0.6 = 1.52x
const CATALOG_TTL_MS = 5 * 60 * 1000;

const router = express.Router();

const avgQ = (q) => q == null ? 50 : typeof q === 'number' ? q : ((Number(q.purity ?? 50) + Number(q.stability ?? 50) + Number(q.potency ?? 50) + Number(q.density ?? 50)) / 4);

// ---------------- catalog ----------------
let _catalog = null, _catalogAt = 0;
export async function getFoundryCatalog() {
  if (_catalog && Date.now() - _catalogAt < CATALOG_TTL_MS) return _catalog;
  const materials = await queryAll(`SELECT id, name, category, rarity, base_price, description, tier, is_part, family FROM resource_types WHERE category = 'processed' ORDER BY tier, family, name`);
  const stations = await queryAll(`SELECT id, name, tier, description, stats, requires_tech FROM module_types WHERE slot_type = 'base' ORDER BY tier, name`);
  const recipes = await queryAll(`SELECT * FROM foundry_recipes ORDER BY sort_order`);
  const shipRecipes = await queryAll(`SELECT cr.id, cr.name, cr.ingredients, cr.station_required, cr.output_item_id FROM crafting_recipes cr`);
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  const madeAt = {}, usedFor = {};
  const use = (name, what) => { (usedFor[name] ||= []).push(what); };
  for (const r of recipes) {
    if (r.output?.resource_name) madeAt[r.output.resource_name] = { station: r.station_module_id, station_name: byId[r.station_module_id]?.name || r.station_module_id, recipe: r.id };
    for (const i of r.inputs || []) if (i.resource_name) use(i.resource_name, { kind: 'job', name: r.name, station: byId[r.station_module_id]?.name || r.station_module_id });
  }
  for (const r of shipRecipes) for (const i of r.ingredients || []) if (i.resource_name) use(i.resource_name, { kind: r.output_item_id?.startsWith('base_') ? 'building' : 'craft', name: r.name, station: r.station_required ? (byId[r.station_required]?.name || r.station_required) : null });
  for (const [t, def] of Object.entries(BASE_TIERS)) for (const name of Object.keys(def.resources || {})) use(name, { kind: 'base_tier', name: `${def.name} upgrade`, tier: Number(t) });
  _catalog = {
    materials: materials.map(m => ({ ...m, made_at: madeAt[m.name] || null, used_for: (usedFor[m.name] || []).slice(0, 12) })),
    stations: stations.map(s => ({ ...s, foundry: s.stats?.foundry || null })),
    recipes,
    base_tiers: BASE_TIERS,
    used_for_raw: Object.fromEntries(Object.entries(usedFor).filter(([n]) => !materials.some(m => m.name === n)).map(([n, v]) => [n, v.slice(0, 8)])),
  };
  _catalogAt = Date.now();
  return _catalog;
}
export const resetFoundryCatalog = () => { _catalog = null; };

router.get('/catalog', async (req, res) => {
  try { res.json(await getFoundryCatalog()); }
  catch (e) { console.error('foundry/catalog:', e); res.status(500).json({ error: 'Failed to load catalog' }); }
});

router.use(authMiddleware);

// ---------------- helpers ----------------
async function dockedOwnBase(req, userId, client = null) {
  const q = client ? (sql, p) => client.query(sql, p).then(r => r.rows) : queryAll;
  const presence = req.app.get('io')?.presence;
  const raw = presence?.getUserDockedBody?.(userId) || null;
  if (!raw) return { error: 'Dock at a planet where you own a base' };
  const bodyId = await resolveBodyId(String(raw));
  if (!bodyId) return { error: 'Dock at a planet where you own a base' };
  const rows = await q(`SELECT * FROM player_bases WHERE user_id = $1 AND celestial_body_id = $2 ${client ? 'FOR UPDATE' : ''}`, [userId, bodyId]);
  const base = rows[0];
  if (!base) return { error: 'No base of yours here' };
  if (!isOperational(base)) return { error: 'Your base is still under construction' };
  return { base };
}
const stationsOf = (base) => Object.entries(base.fitted_modules || {})
  .filter(([, m]) => m?.stats?.foundry)
  .map(([slot, m]) => ({ slot, module_type_id: m.module_type_id, name: m.name, family: m.stats.foundry.family, tier: m.stats.foundry.tier, bench: !!m.stats.foundry.bench, hopper: !!m.stats.foundry.hopper, hopper_capacity: Number(m.stats.hopper_capacity) || 0, quality: Math.round(avgQ(m.quality)), speed: Number(m.stats.speed) || 1 }));

// ---------------- automatic stations (hoppers) ----------------
const AVG4 = (s) => ((Number(s.stat_purity ?? 50) + Number(s.stat_stability ?? 50) + Number(s.stat_potency ?? 50) + Number(s.stat_density ?? 50)) / 4);
async function hopperStacks(client, baseId, slot) {
  const r = await client.query(`SELECT h.*, rt.name AS resource_name, rt.category, rt.rarity FROM player_base_hoppers h JOIN resource_types rt ON rt.id = h.resource_type_id WHERE h.base_id = $1 AND h.slot = $2 ORDER BY h.slot_index NULLS LAST, h.created_at`, [baseId, slot]);
  return r.rows.map(s => ({ id: s.id, source: 'hopper', item_type: 'resource', resource_type_id: s.resource_type_id, resource_name: s.resource_name, category: s.category, rarity: s.rarity, quantity: Number(s.quantity), slot_index: s.slot_index, avg_quality: Math.round(AVG4(s)), stats: { purity: s.stat_purity, stability: s.stat_stability, potency: s.stat_potency, density: s.stat_density } }));
}
// Settle an automatic station: turn elapsed time + hopper contents into product in the depot.
export async function settleHopperStation(client, base, station, bonuses) {
  const recipes = (await client.query(`SELECT * FROM foundry_recipes WHERE station_module_id = $1 AND auto = TRUE ORDER BY sort_order`, [station.module_type_id])).rows;
  let st = (await client.query(`SELECT * FROM player_base_station_state WHERE base_id = $1 AND slot = $2 FOR UPDATE`, [base.id, station.slot])).rows[0];
  if (!st) {
    await client.query(`INSERT INTO player_base_station_state (base_id, slot) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [base.id, station.slot]);
    st = { last_tick_at: new Date(), carry_seconds: 0, produced_total: 0, stalled: null };
  }
  const hopper = (await client.query(`SELECT * FROM player_base_hoppers WHERE base_id = $1 AND slot = $2 ORDER BY (COALESCE(stat_purity,50)+COALESCE(stat_stability,50)+COALESCE(stat_potency,50)+COALESCE(stat_density,50)) ASC FOR UPDATE`, [base.id, station.slot])).rows;
  const names = Object.fromEntries((await client.query(`SELECT id, name FROM resource_types WHERE id = ANY($1::int[])`, [hopper.map(h => h.resource_type_id)])).rows.map(r => [r.id, r.name]));
  const have = {};
  for (const h of hopper) have[names[h.resource_type_id]] = (have[names[h.resource_type_id]] || 0) + Number(h.quantity);
  const speed = Math.pow(Math.max(1, station.quality) / 50, MODULE_SPEED_EXP) * (station.speed || 1) / (1 + (Number(bonuses?.smelting_time_pct) || 0) / 100);
  const cap = depotCapacity(base);
  const room = cap > 0 ? Math.max(0, Math.floor(cap - await depotUsed(client, base.id))) : 0;
  let budget = Math.max(0, (Date.now() - new Date(st.last_tick_at).getTime()) / 1000) + Number(st.carry_seconds || 0);
  const consume = {}; const produce = {}; let units = 0, stalled = null, maxCost = 0, steps = 0;
  const fits = (r) => (r.inputs || []).every(i => i.resource_name && (have[i.resource_name] || 0) >= i.quantity);
  while (steps++ < 2000) {
    const r = recipes.find(fits);
    if (!r) { stalled = hopper.length ? 'no usable ingredients' : 'hopper empty'; break; }
    const cost = r.seconds / speed; maxCost = Math.max(maxCost, cost);
    if (budget < cost) break;
    const out = Number(r.output?.quantity) || 1;
    if (cap <= 0) { stalled = 'no depot fitted'; break; }
    if (units + out > room) { stalled = 'depot full'; break; }
    for (const i of r.inputs) { have[i.resource_name] -= i.quantity; consume[i.resource_name] = (consume[i.resource_name] || 0) + i.quantity; }
    produce[r.output.item_id] = (produce[r.output.item_id] || 0) + out; units += out; budget -= cost;
  }
  // apply: debit hopper stacks (lowest quality first), credit the depot
  for (const [name, qty] of Object.entries(consume)) {
    let left = qty;
    for (const h of hopper) {
      if (left <= 0) break; if (names[h.resource_type_id] !== name) continue;
      const take = Math.min(left, Number(h.quantity));
      if (take >= Number(h.quantity)) await client.query(`DELETE FROM player_base_hoppers WHERE id = $1`, [h.id]);
      else await client.query(`UPDATE player_base_hoppers SET quantity = quantity - $1 WHERE id = $2`, [take, h.id]);
      h.quantity = Number(h.quantity) - take; left -= take;
    }
  }
  for (const [itemId, qty] of Object.entries(produce)) await depotAddItem(client, base.id, itemId, qty, {}, cap);
  // bank at most one unit's worth of time; a stalled station banks nothing (idle time is not saved up)
  const carry = stalled ? 0 : Math.min(budget, maxCost || 0);
  await client.query(`UPDATE player_base_station_state SET last_tick_at = NOW(), carry_seconds = $3, produced_total = produced_total + $4, stalled = $5 WHERE base_id = $1 AND slot = $2`, [base.id, station.slot, carry, units, stalled]);
  return { produced: units, stalled, carry, produced_total: Number(st.produced_total || 0) + units, rate_per_min: recipes.length ? Math.round(60 / (recipes[0].seconds / speed) * (Number(recipes[0].output?.quantity) || 1) * 10) / 10 : 0 };
}
async function hopperView(client, base, station, bonuses) {
  const settled = await settleHopperStation(client, base, station, bonuses);
  const stacks = await hopperStacks(client, base.id, station.slot);
  const recipes = (await client.query(`SELECT * FROM foundry_recipes WHERE station_module_id = $1 AND auto = TRUE ORDER BY sort_order`, [station.module_type_id])).rows;
  const speed = Math.pow(Math.max(1, station.quality) / 50, MODULE_SPEED_EXP) * (station.speed || 1) / (1 + (Number(bonuses?.smelting_time_pct) || 0) / 100);
  return {
    stacks, used: stacks.reduce((a, s) => a + s.quantity, 0), capacity: station.hopper_capacity,
    accepts: [...new Set(recipes.flatMap(r => (r.inputs || []).map(i => i.resource_name)))],
    recipes: recipes.map(r => ({ id: r.id, name: r.name, inputs: r.inputs, output: r.output, seconds_here: Math.round(r.seconds / speed * 10) / 10 })),
    ...settled,
  };
}
const depotCapacity = (base) => Object.values(base.fitted_modules || {}).reduce((a, m) => a + (Number(m.stats?.depot_capacity) || 0), 0);

const shapeJob = (j, now = Date.now()) => {
  const s = new Date(j.starts_at).getTime(), e = new Date(j.completes_at).getTime();
  const phase = j.status !== 'queued' ? j.status : now < s ? 'waiting' : now < e ? 'running' : 'done';
  return {
    id: j.id, slot: j.slot, recipe_id: j.recipe_id, name: j.recipe_name, runs: j.runs,
    output_name: j.output_name, output_quantity: j.output_quantity, output_is_item: !!j.output_item_id,
    quality_out: j.output_item_id ? null : Math.round((Number(j.out_purity) + Number(j.out_stability) + Number(j.out_potency) + Number(j.out_density)) / 4),
    starts_at: j.starts_at, completes_at: j.completes_at, status: phase,
    progress: phase === 'running' ? Math.max(0, Math.min(1, (now - s) / Math.max(1, e - s))) : phase === 'done' ? 1 : 0,
  };
};
async function jobsForBase(baseId, q = queryAll) {
  return q(`SELECT j.*, fr.name AS recipe_name,
                   COALESCE(rt.name, idef.name) AS output_name
              FROM player_foundry_jobs j
              JOIN foundry_recipes fr ON fr.id = j.recipe_id
              LEFT JOIN resource_types rt ON rt.id = j.output_resource_type_id
              LEFT JOIN item_definitions idef ON idef.id = j.output_item_id
             WHERE j.base_id = $1 AND j.status = 'queued' ORDER BY j.starts_at ASC`, [baseId]);
}
export function jobSeconds(recipe, runs, station, bonuses) {
  const speed = Math.pow(Math.max(1, station.quality) / 50, MODULE_SPEED_EXP) * (station.speed || 1);
  const skill = 1 + (Number(bonuses?.smelting_time_pct) || 0) / 100;
  return Math.max(5, Math.round(recipe.seconds * runs / speed * skill));
}

// ---------------- status ----------------
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const ctx = await dockedOwnBase(req, userId);
    if (ctx.error) return res.json({ available: false, reason: ctx.error });
    const base = ctx.base;
    const stations = stationsOf(base);
    const recipes = await queryAll(`SELECT * FROM foundry_recipes ORDER BY sort_order`);
    const jobs = (await jobsForBase(base.id)).map(j => shapeJob(j));
    const materials = await transaction(async (client) => availableMaterials(client, userId, base.id));
    const depotCap = depotCapacity(base);
    const bonuses = await getPlayerBonuses(userId);
    res.json({
      available: true,
      base: { id: base.id, name: base.name, tier: base.tier, depot_capacity: depotCap },
      stations: await Promise.all(stations.map(async s => ({
        ...s,
        hopper_state: s.hopper ? await transaction(async (client) => hopperView(client, base, s, bonuses)) : null,
        recipes: recipes.filter(r => r.station_module_id === s.module_type_id && !r.auto).map(r => ({
          id: r.id, name: r.name, inputs: r.inputs, output: r.output, seconds: r.seconds,
          seconds_here: jobSeconds(r, 1, s, bonuses),
          can_run: Math.min(...(r.inputs || []).map(i => i.resource_name ? Math.floor((materials[i.resource_name]?.quantity || 0) / i.quantity) : 0), MAX_RUNS),
        })),
        jobs: jobs.filter(j => j.slot === s.slot),
      }))),
      materials,
      max_runs: MAX_RUNS, max_queue: MAX_QUEUE_PER_STATION,
    });
  } catch (e) { console.error('foundry/status:', e); res.status(500).json({ error: 'Failed to load foundry' }); }
});

// ---------------- queue ----------------
router.post('/queue', async (req, res) => {
  try {
    const userId = req.user.id;
    const { slot, recipe_id } = req.body || {};
    const runs = Math.max(1, Math.min(MAX_RUNS, Math.floor(Number(req.body?.runs) || 1)));
    if (!slot || !recipe_id) return res.status(400).json({ error: 'slot and recipe_id are required' });
    const bonuses = await getPlayerBonuses(userId);
    const result = await transaction(async (client) => {
      const ctx = await dockedOwnBase(req, userId, client);
      if (ctx.error) throw Object.assign(new Error(ctx.error), { statusCode: 400 });
      const base = ctx.base;
      const station = stationsOf(base).find(s => s.slot === slot);
      if (!station) throw Object.assign(new Error('No station on that plot'), { statusCode: 400 });
      const rr = await client.query(`SELECT * FROM foundry_recipes WHERE id = $1 AND station_module_id = $2`, [recipe_id, station.module_type_id]);
      const recipe = rr.rows[0];
      if (!recipe) throw Object.assign(new Error(`${station.name} cannot run that recipe`), { statusCode: 400 });
      const jobs = await jobsForBase(base.id, (sql, p) => client.query(sql, p).then(r => r.rows));
      const mine = jobs.filter(j => j.slot === slot);
      if (mine.length >= MAX_QUEUE_PER_STATION) throw Object.assign(new Error(`That station's queue is full (${MAX_QUEUE_PER_STATION})`), { statusCode: 409 });
      // inputs
      const needs = {};
      for (const i of recipe.inputs || []) {
        if (i.item_id) throw Object.assign(new Error('Item inputs are not supported yet'), { statusCode: 400 });
        needs[i.resource_name] = (needs[i.resource_name] || 0) + i.quantity * runs;
      }
      const { taken, stats } = await consumeMaterials(client, userId, base.id, needs);
      // output
      const out = recipe.output || {};
      let outRid = null, outItem = null;
      if (out.resource_name) {
        const rt = await client.query(`SELECT id FROM resource_types WHERE name = $1`, [out.resource_name]);
        outRid = rt.rows[0]?.id; if (!outRid) throw Object.assign(new Error('Recipe output missing'), { statusCode: 500 });
      } else outItem = out.item_id;
      const seconds = jobSeconds(recipe, runs, station, bonuses);
      const laneEnd = mine.reduce((m, j) => Math.max(m, new Date(j.completes_at).getTime()), Date.now());
      const startsAt = new Date(laneEnd), completesAt = new Date(laneEnd + seconds * 1000);
      const ins = await client.query(`
        INSERT INTO player_foundry_jobs (user_id, base_id, slot, recipe_id, runs, inputs, output_resource_type_id, output_item_id, output_quantity,
                                         out_purity, out_stability, out_potency, out_density, starts_at, completes_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [userId, base.id, slot, recipe.id, runs, JSON.stringify(taken), outRid, outItem, (Number(out.quantity) || 1) * runs,
         stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density, startsAt, completesAt]);
      return { job: shapeJob({ ...ins.rows[0], recipe_name: recipe.name, output_name: out.resource_name || out.item_id }), seconds };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.code });
    console.error('foundry/queue:', e); res.status(500).json({ error: 'Failed to queue job' });
  }
});

// ---------------- cancel ----------------
router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await transaction(async (client) => {
      const r = await client.query(`SELECT * FROM player_foundry_jobs WHERE id = $1 AND user_id = $2 AND status = 'queued' FOR UPDATE`, [String(req.params.id), userId]);
      const j = r.rows[0];
      if (!j) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
      if (new Date(j.starts_at).getTime() <= Date.now()) throw Object.assign(new Error('Job already started'), { statusCode: 409 });
      await client.query(`UPDATE player_foundry_jobs SET status = 'cancelled' WHERE id = $1`, [j.id]);
      for (const t of (j.inputs || [])) await addResourceStack(client, userId, t.resource_type_id, t.quantity, { stat_purity: t.stat_purity, stat_stability: t.stat_stability, stat_potency: t.stat_potency, stat_density: t.stat_density });
      const dur = new Date(j.completes_at).getTime() - new Date(j.starts_at).getTime();
      await client.query(`UPDATE player_foundry_jobs SET starts_at = starts_at - ($3 || ' milliseconds')::interval, completes_at = completes_at - ($3 || ' milliseconds')::interval
                           WHERE base_id = $1 AND slot = $2 AND status = 'queued' AND starts_at >= $4`, [j.base_id, j.slot, String(dur), j.starts_at]);
      return { cancelled: j.id };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('foundry/cancel:', e); res.status(500).json({ error: 'Failed to cancel' });
  }
});

// ---------------- collect ----------------
router.post('/jobs/:id/collect', async (req, res) => {
  try {
    const userId = req.user.id;
    const toReq = req.body?.to;
    const result = await transaction(async (client) => {
      const r = await client.query(`SELECT * FROM player_foundry_jobs WHERE id = $1 AND user_id = $2 AND status = 'queued' FOR UPDATE`, [String(req.params.id), userId]);
      const j = r.rows[0];
      if (!j) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
      if (new Date(j.completes_at).getTime() > Date.now()) throw Object.assign(new Error('Job not finished yet'), { statusCode: 409 });
      const ctx = await dockedOwnBase(req, userId, client);
      if (ctx.error || ctx.base.id !== j.base_id) throw Object.assign(new Error('Dock at that base to collect'), { statusCode: 400 });
      const base = ctx.base;
      const cap = depotCapacity(base);
      const stats = { stat_purity: j.out_purity, stat_stability: j.out_stability, stat_potency: j.out_potency, stat_density: j.out_density };
      const qty = Number(j.output_quantity);
      const to = toReq === 'cargo' ? 'cargo' : toReq === 'depot' ? 'depot' : (cap > 0 ? 'depot' : 'cargo');
      const itemDataFor = async () => {
        if (!j.output_item_id) return {};
        const idef = await client.query(`SELECT item_data_defaults FROM item_definitions WHERE id = $1`, [j.output_item_id]);
        const defaults = idef.rows[0]?.item_data_defaults || {};
        if (j.output_item_id !== 'basic_harvester') return {};
        const qm = Math.max(0.5, ((Number(j.out_purity) + Number(j.out_stability) + Number(j.out_potency) + Number(j.out_density)) / 4) / 50);
        const d = { ...defaults, quality: { purity: j.out_purity, stability: j.out_stability, potency: j.out_potency, density: j.out_density }, source: 'crafted' };
        if (d.harvest_rate) d.harvest_rate = Math.round(d.harvest_rate * qm);
        if (d.storage_capacity) d.storage_capacity = Math.round(d.storage_capacity * qm);
        return d;
      };
      if (to === 'depot') {
        const ok = j.output_item_id
          ? await depotAddItem(client, base.id, j.output_item_id, qty, await itemDataFor(), cap)
          : await depotAdd(client, base.id, j.output_resource_type_id, qty, stats, cap);
        if (!ok) throw Object.assign(new Error(cap > 0 ? 'Depot full -- collect to cargo instead' : 'No depot fitted -- collect to cargo'), { statusCode: 400 });
      } else if (j.output_resource_type_id) {
        const cargo = await getPlayerCargoInfo(userId, client);
        const vol = qty * Math.max(1, Number(j.out_density ?? 50)) / 100;
        if (vol > cargo.remaining) throw Object.assign(new Error(`Not enough cargo room (${Math.floor(cargo.remaining)} free)${cap > 0 ? ' -- collect to the depot instead' : ''}`), { statusCode: 400 });
        await addResourceStack(client, userId, j.output_resource_type_id, qty, stats);
      } else {
        const cargo = await getPlayerCargoInfo(userId, client);
        if (qty > cargo.remaining) throw Object.assign(new Error(`Not enough cargo room (${Math.floor(cargo.remaining)} free)`), { statusCode: 400 });
        await addItemStack(client, userId, j.output_item_id, qty, await itemDataFor());
      }
      await client.query(`UPDATE player_foundry_jobs SET status = 'collected', collected_at = NOW() WHERE id = $1`, [j.id]);
      return { collected: qty, to };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('foundry/collect:', e); res.status(500).json({ error: 'Failed to collect' });
  }
});

// ---------------- hopper: put / take ----------------
// POST /foundry/hopper/put { slot, source: 'cargo'|'depot', stack_id, quantity? }
router.post('/hopper/put', async (req, res) => {
  try {
    const userId = req.user.id;
    const { slot, source, stack_id, quantity } = req.body || {};
    if (!slot || !stack_id) return res.status(400).json({ error: 'slot and stack_id are required' });
    const bonuses = await getPlayerBonuses(userId);
    const result = await transaction(async (client) => {
      const ctx = await dockedOwnBase(req, userId, client);
      if (ctx.error) throw Object.assign(new Error(ctx.error), { statusCode: 400 });
      const base = ctx.base;
      const station = stationsOf(base).find(s => s.slot === slot && s.hopper);
      if (!station) throw Object.assign(new Error('No hopper on that plot'), { statusCode: 400 });
      await settleHopperStation(client, base, station, bonuses);
      const recipes = (await client.query(`SELECT inputs FROM foundry_recipes WHERE station_module_id = $1 AND auto = TRUE`, [station.module_type_id])).rows;
      const accepts = new Set(recipes.flatMap(r => (r.inputs || []).map(i => i.resource_name)));
      const stack = await loadResourceStackAny(client, userId, base.id, { id: stack_id, source: source === 'depot' ? 'depot' : 'cargo' });
      if (!stack) throw Object.assign(new Error('Stack not found'), { statusCode: 404 });
      if (!accepts.has(stack.resource_name)) throw Object.assign(new Error(`${station.name} does not take ${stack.resource_name} (accepts ${[...accepts].join(', ')})`), { statusCode: 400 });
      const used = (await client.query(`SELECT COALESCE(SUM(quantity),0)::int AS n FROM player_base_hoppers WHERE base_id = $1 AND slot = $2`, [base.id, slot])).rows[0].n;
      const room = Math.max(0, station.hopper_capacity - used);
      if (room <= 0) throw Object.assign(new Error('Hopper full'), { statusCode: 400 });
      const take = Math.min(room, Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, Number(stack.quantity)) : Number(stack.quantity));
      await debitStackAny(client, stack, take);
      const ex = await client.query(`SELECT id FROM player_base_hoppers WHERE base_id = $1 AND slot = $2 AND resource_type_id = $3 AND stat_purity IS NOT DISTINCT FROM $4 AND stat_stability IS NOT DISTINCT FROM $5 AND stat_potency IS NOT DISTINCT FROM $6 AND stat_density IS NOT DISTINCT FROM $7`,
        [base.id, slot, stack.resource_type_id, stack.stat_purity, stack.stat_stability, stack.stat_potency, stack.stat_density]);
      if (ex.rows[0]) await client.query(`UPDATE player_base_hoppers SET quantity = quantity + $1 WHERE id = $2`, [take, ex.rows[0].id]);
      else {
        const next = (await client.query(`SELECT COALESCE(MAX(slot_index), -1) + 1 AS s FROM player_base_hoppers WHERE base_id = $1 AND slot = $2`, [base.id, slot])).rows[0].s;
        await client.query(`INSERT INTO player_base_hoppers (base_id, slot, resource_type_id, quantity, stat_purity, stat_stability, stat_potency, stat_density, slot_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [base.id, slot, stack.resource_type_id, take, stack.stat_purity, stack.stat_stability, stack.stat_potency, stack.stat_density, next]);
      }
      return { fed: take, hopper: await hopperView(client, base, station, bonuses) };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('foundry/hopper/put:', e); res.status(500).json({ error: 'Failed to feed hopper' });
  }
});

// POST /foundry/hopper/take { slot, hopper_stack_id, to: 'cargo'|'depot' }
router.post('/hopper/take', async (req, res) => {
  try {
    const userId = req.user.id;
    const { slot, hopper_stack_id, to } = req.body || {};
    if (!slot || !hopper_stack_id) return res.status(400).json({ error: 'slot and hopper_stack_id are required' });
    const bonuses = await getPlayerBonuses(userId);
    const result = await transaction(async (client) => {
      const ctx = await dockedOwnBase(req, userId, client);
      if (ctx.error) throw Object.assign(new Error(ctx.error), { statusCode: 400 });
      const base = ctx.base;
      const station = stationsOf(base).find(s => s.slot === slot && s.hopper);
      if (!station) throw Object.assign(new Error('No hopper on that plot'), { statusCode: 400 });
      await settleHopperStation(client, base, station, bonuses);
      const h = (await client.query(`SELECT * FROM player_base_hoppers WHERE id = $1 AND base_id = $2 AND slot = $3 FOR UPDATE`, [hopper_stack_id, base.id, slot])).rows[0];
      if (!h) throw Object.assign(new Error('Hopper stack not found'), { statusCode: 404 });
      const stats = { stat_purity: h.stat_purity, stat_stability: h.stat_stability, stat_potency: h.stat_potency, stat_density: h.stat_density };
      const qty = Number(h.quantity);
      if (to === 'depot') {
        const ok = await depotAdd(client, base.id, h.resource_type_id, qty, stats, depotCapacity(base));
        if (!ok) throw Object.assign(new Error('Depot full'), { statusCode: 400 });
      } else {
        const cargo = await getPlayerCargoInfo(userId, client);
        const vol = qty * Math.max(1, Number(h.stat_density ?? 50)) / 100;
        if (vol > cargo.remaining) throw Object.assign(new Error(`Not enough cargo room (${Math.floor(cargo.remaining)} free)`), { statusCode: 400 });
        await addResourceStack(client, userId, h.resource_type_id, qty, stats);
      }
      await client.query(`DELETE FROM player_base_hoppers WHERE id = $1`, [h.id]);
      return { took: qty, hopper: await hopperView(client, base, station, bonuses) };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('foundry/hopper/take:', e); res.status(500).json({ error: 'Failed to empty hopper' });
  }
});

// Does the pilot have a BUILT base with this station fitted at the body they
// are docked at? Used by /resources/craft for station_required recipes.
export async function dockedStationAvailable(req, userId, stationModuleId, client = null) {
  const ctx = await dockedOwnBase(req, userId, client);
  if (ctx.error) return { ok: false, reason: ctx.error };
  const has = Object.values(ctx.base.fitted_modules || {}).some(m => m?.module_type_id === stationModuleId);
  return has ? { ok: true, base: ctx.base } : { ok: false, reason: 'not fitted' };
}

export default router;
