// api/bases.js -- player bases, Phase 1 (2026-09-22). docs/bases-spec.md
//
// A base is a modular structure the pilot owns on a planet: SURFACE
// (planetary base) or ORBITAL (star base). Tiers add module slots; modules
// are module_types rows with slot_type 'base' carried in cargo and fitted
// here. Everything is managed while DOCKED at the planet (presence is the
// authority for "where are you", same as market / contracts / refinery).

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import { resolveBodyId, getPlayerCargoInfo, getNextSlotIndex } from './resources.js';
import { addResourceStack } from '../lib/wrecks.js';
import { logActivity } from '../lib/activity.js';
import { completeQuestInTx } from './quests.js';
import { generateGalaxy, generateSystemContent } from '../game/galaxyGenerator.js';
import { BASE_TIERS, PLOTS_PER_AREA } from '../game/foundryTree.js';
import { consumeMaterials } from '../lib/materials.js';

// ---- public visibility (2026-09-25) ----
// Planets that already have a station in orbit can't take an ORBITAL
// base (a starbase). Sol's Earth has Luna Station; procedural systems
// come from the generator (station bodies carry parentBody).
let _galaxy = null;
const galaxy = () => (_galaxy ||= generateGalaxy(12345, 200));
const SOL_STATION_PLANETS = new Set(['earth']);
function planetHasStation(systemId, planetName) {
  const key = String(planetName || '').toLowerCase();
  if (systemId === 'sol') return SOL_STATION_PLANETS.has(key);
  const sys = galaxy().systemMap[systemId];
  const content = sys ? generateSystemContent(sys) : null;
  const bodies = content?.bodies || [];
  const planet = bodies.find(b => String(b.name || '').toLowerCase() === key);
  if (!planet) return false;
  return bodies.some(b => b.type === 'station' && b.parentBody === planet.id);
}
// What everyone may see about a base.
const publicBase = (b) => ({
  id: b.id, owner_id: b.user_id, owner_name: b.owner_name, name: b.name, kind: b.kind, tier: b.tier,
  tier_name: (TIERS[b.tier] || TIERS[1]).name, body_name: b.body_name, celestial_body_id: b.celestial_body_id,
  system_procedural_id: b.system_procedural_id,
  building: new Date(b.build_completes_at).getTime() > Date.now(),
  modules: Object.values(b.fitted_modules || {}).map(m => m.name).filter(Boolean),
});

// Base tiers (Foundry, 2026-09-26): 4 plots per tier, upgrades paid in the
// previous tier's assembly parts. Table lives in game/foundryTree.js.
export const TIERS = BASE_TIERS;
export const MAX_TIER = 5;
export const BUILD_SKILL = 'pln_cc_upgrades';       // level >= 1 to build
export const EXTRA_BASE_SKILL = 'pln_interplanetary'; // +1 base per level
export const BASE_SLOT_TYPE = 'base';

const router = express.Router();
router.use(authMiddleware);

const AVG = (s) => ((Number(s.stat_purity ?? 50) + Number(s.stat_stability ?? 50) + Number(s.stat_potency ?? 50) + Number(s.stat_density ?? 50)) / 4);
const slotKey = (i) => `b${i + 1}`;

async function dockedBody(req, userId) {
  const presence = req.app.get('io')?.presence;
  const raw = presence?.getUserDockedBody?.(userId) || null;
  if (!raw) return null;
  const bodyId = await resolveBodyId(String(raw));
  if (!bodyId) return null;
  return await queryOne(`
    SELECT cb.id, cb.name, cb.body_type, cb.planet_type, cb.has_city, cb.harvester_slots, ss.procedural_id, ss.name AS system_name
      FROM celestial_bodies cb JOIN star_systems ss ON ss.id = cb.system_id
     WHERE cb.id = $1`, [bodyId]);
}
async function skillLevel(userId, skillId, q = query) {
  const r = await q(`SELECT level FROM player_skills WHERE user_id = $1 AND skill_id = $2`, [userId, skillId]);
  return Number((r.rows || r)[0]?.level || 0);
}
async function techSet(userId, q = query) {
  const r = await q(`SELECT tech_id FROM player_research WHERE user_id = $1`, [userId]);
  return new Set((r.rows || r).map(x => x.tech_id));
}

// ---- shared with research.js / refining.js ----
export async function baseModules(userId) {
  const rows = await queryAll(`SELECT id, fitted_modules, build_completes_at FROM player_bases WHERE user_id = $1`, [userId]);
  const out = [];
  for (const b of rows) {
    if (new Date(b.build_completes_at).getTime() > Date.now()) continue;
    for (const m of Object.values(b.fitted_modules || {})) out.push({ base_id: b.id, ...m });
  }
  return out;
}
export async function baseRpPerMin(userId) {
  const mods = await baseModules(userId);
  return mods.reduce((a, m) => a + (Number(m.stats?.rp_per_min) || 0), 0);
}
// The pilot's own built base at this body, with its refinery bonus if any.
export async function baseAtBody(userId, bodyId) {
  const b = await queryOne(`SELECT * FROM player_bases WHERE user_id = $1 AND celestial_body_id = $2`, [userId, bodyId]);
  if (!b || new Date(b.build_completes_at).getTime() > Date.now()) return null;
  const refinery = Object.values(b.fitted_modules || {}).find(m => m.stats?.refinery);
  return { ...b, refinery: refinery ? { yield_pct: Number(refinery.stats.refine_yield_pct) || 0 } : null };
}

async function depotFor(base, q = query) {
  const capacity = Object.values(base.fitted_modules || {}).reduce((a, m) => a + (Number(m.stats?.depot_capacity) || 0), 0);
  const r = await q(`
    SELECT bi.*, rt.name AS resource_name, rt.category, rt.rarity
      FROM player_base_inventory bi JOIN resource_types rt ON rt.id = bi.resource_type_id
     WHERE bi.base_id = $1 ORDER BY rt.name`, [base.id]);
  const rows = r.rows || r;
  const used = rows.reduce((a, s) => a + Number(s.quantity) * Math.max(1, Number(s.stat_density ?? 50)) / 100, 0);
  return {
    capacity, used: Math.round(used * 10) / 10,
    stacks: rows.map(s => ({ id: s.id, resource_type_id: s.resource_type_id, resource_name: s.resource_name, quantity: Number(s.quantity),
      stats: { purity: s.stat_purity, stability: s.stat_stability, potency: s.stat_potency, density: s.stat_density }, avg_quality: Math.round(AVG(s)) })),
  };
}

async function shapeBase(b, q = query) {
  const t = TIERS[b.tier] || TIERS[1];
  const building = new Date(b.build_completes_at).getTime() > Date.now();
  const sys = await (q === query ? queryOne : (sql, p) => q(sql, p).then(r => (r.rows || r)[0]))(
    `SELECT name FROM star_systems WHERE procedural_id = $1`, [b.system_procedural_id]);
  return {
    id: b.id, kind: b.kind, name: b.name, tier: b.tier, tier_name: t.name, slots: t.slots,
    plots_per_area: PLOTS_PER_AREA, max_tier: MAX_TIER,
    areas: Object.entries(TIERS).map(([tier, def]) => ({ tier: Number(tier), name: def.name, unlocked: Number(tier) <= b.tier, first_slot: (Number(tier) - 1) * PLOTS_PER_AREA + 1 })),
    building, build_completes_at: b.build_completes_at,
    system_procedural_id: b.system_procedural_id, system_name: sys?.name || b.system_procedural_id,
    body_name: b.body_name, celestial_body_id: b.celestial_body_id,
    modules: b.fitted_modules || {},
    depot: await depotFor(b, q),
    next_tier: b.tier < MAX_TIER ? { tier: b.tier + 1, ...TIERS[b.tier + 1] } : null,
  };
}

// Consume `resources` ({ Name: qty }) from the base depot (if any) then
// cargo, lowest quality first. Throws if short. (lib/materials.js)
async function consumeResources(client, userId, resources, baseId = null) {
  await consumeMaterials(client, userId, baseId, resources);
}
async function consumeResourcesLegacy(client, userId, resources) {
  for (const [name, need] of Object.entries(resources)) {
    const rt = await client.query(`SELECT id FROM resource_types WHERE name = $1`, [name]);
    const rid = rt.rows[0]?.id;
    if (!rid) throw Object.assign(new Error(`Unknown resource ${name}`), { statusCode: 500 });
    const st = await client.query(`
      SELECT id, quantity FROM player_resource_inventory
       WHERE user_id = $1 AND item_type = 'resource' AND resource_type_id = $2
       ORDER BY (COALESCE(stat_purity,50)+COALESCE(stat_stability,50)+COALESCE(stat_potency,50)+COALESCE(stat_density,50)) ASC
       FOR UPDATE`, [userId, rid]);
    const have = st.rows.reduce((a, s) => a + Number(s.quantity), 0);
    if (have < need) throw Object.assign(new Error(`Needs ${need} ${name} (you have ${have})`), { statusCode: 400 });
    let left = need;
    for (const s of st.rows) {
      if (left <= 0) break;
      const take = Math.min(left, Number(s.quantity));
      if (take >= Number(s.quantity)) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
      else await client.query(`UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`, [take, s.id]);
      left -= take;
    }
  }
}

async function buildEligibility(userId, body, existingCount) {
  const reasons = [];
  const techs = await techSet(userId);
  if (!techs.has(TIERS[1].tech)) reasons.push('Research Base Construction (Industry)');
  if ((await skillLevel(userId, BUILD_SKILL)) < 1) reasons.push('Train Command Center Upgrades I');
  const cap = 1 + (await skillLevel(userId, EXTRA_BASE_SKILL));
  if (existingCount >= cap) reasons.push(`Base limit ${cap} (train Interplanetary Consolidation)`);
  if (body.body_type === 'station') reasons.push('Bases anchor to planets, not stations');
  return { ok: reasons.length === 0, reasons, base_cap: cap, base_count: existingCount,
    orbital_blocked: body.body_type !== 'station' && planetHasStation(body.procedural_id || 'sol', body.name) ? 'This planet already has a station in orbit -- build a surface base instead' : null };
}

// GET /bases/system/:id -- every base in a system (public projection)
router.get('/system/:id', async (req, res) => {
  try {
    const rows = await queryAll(`SELECT b.*, u.username AS owner_name FROM player_bases b JOIN users u ON u.id = b.user_id WHERE b.system_procedural_id = $1 ORDER BY b.created_at`, [String(req.params.id)]);
    res.json({ bases: rows.map(publicBase) });
  } catch (e) { console.error('bases/system:', e); res.status(500).json({ error: 'Failed to load bases' }); }
});

// GET /bases/galaxy -- mine (full) + everyone else's (public) for the galaxy map
router.get('/galaxy', async (req, res) => {
  try {
    const mineRows = await queryAll(`SELECT * FROM player_bases WHERE user_id = $1 ORDER BY created_at`, [req.user.id]);
    const mine = [];
    for (const b of mineRows) mine.push(await shapeBase(b));
    const others = await queryAll(`SELECT b.*, u.username AS owner_name FROM player_bases b JOIN users u ON u.id = b.user_id WHERE b.user_id <> $1`, [req.user.id]);
    res.json({ mine, others: others.map(publicBase) });
  } catch (e) { console.error('bases/galaxy:', e); res.status(500).json({ error: 'Failed to load bases' }); }
});

// GET /bases/mine
router.get('/mine', async (req, res) => {
  try {
    const rows = await queryAll(`SELECT * FROM player_bases WHERE user_id = $1 ORDER BY created_at`, [req.user.id]);
    const bases = [];
    for (const b of rows) bases.push(await shapeBase(b));
    res.json({ bases });
  } catch (e) { console.error('bases/mine:', e); res.status(500).json({ error: 'Failed to load bases' }); }
});

// GET /bases/here -- the docked body: my base here (if any) + build eligibility
router.get('/here', async (req, res) => {
  try {
    const userId = req.user.id;
    const body = await dockedBody(req, userId);
    if (!body) return res.status(400).json({ error: 'Dock at a planet to manage a base' });
    const mine = await queryOne(`SELECT * FROM player_bases WHERE user_id = $1 AND celestial_body_id = $2`, [userId, body.id]);
    const count = (await queryOne(`SELECT COUNT(*)::int AS n FROM player_bases WHERE user_id = $1`, [userId]))?.n || 0;
    const techs = await techSet(userId);
    const cargoMods = await queryAll(`
      SELECT pri.id, pri.item_id, pri.item_data, mt.name, mt.stats, mt.tier
        FROM player_resource_inventory pri JOIN module_types mt ON mt.id = pri.item_id
       WHERE pri.user_id = $1 AND pri.item_type = 'item' AND mt.slot_type = $2 AND pri.quantity > 0`, [userId, BASE_SLOT_TYPE]);
    const cargoRes = await queryAll(`
      SELECT pri.id, pri.quantity, pri.stat_purity, pri.stat_stability, pri.stat_potency, pri.stat_density, rt.name AS resource_name
        FROM player_resource_inventory pri JOIN resource_types rt ON rt.id = pri.resource_type_id
       WHERE pri.user_id = $1 AND pri.item_type = 'resource' AND pri.quantity > 0 ORDER BY rt.name`, [userId]);
    const othersHere = await queryAll(`SELECT b.*, u.username AS owner_name FROM player_bases b JOIN users u ON u.id = b.user_id WHERE b.celestial_body_id = $1 AND b.user_id <> $2 ORDER BY b.created_at`, [body.id, userId]);
    // Everything that can stand on a plot, with the pilot's research state and cargo count.
    const allBase = await queryAll(`SELECT id, name, tier, description, stats, requires_tech, buy_price FROM module_types WHERE slot_type = $1 ORDER BY tier, name`, [BASE_SLOT_TYPE]);
    const inCargo = {};
    for (const m of cargoMods) inCargo[m.item_id] = (inCargo[m.item_id] || 0) + 1;
    const buildables = allBase.map(m => ({ id: m.id, name: m.name, tier: m.tier, description: m.description, stats: m.stats, requires_tech: m.requires_tech, unlocked: !m.requires_tech || techs.has(m.requires_tech), buy_price: m.buy_price, in_cargo: inCargo[m.id] || 0, foundry: m.stats?.foundry || null }));
    res.json({
      buildables,
      body: { id: body.id, name: body.name, body_type: body.body_type, planet_type: body.planet_type, system_procedural_id: body.procedural_id, system_name: body.system_name },
      others: othersHere.map(publicBase),
      base: mine ? await shapeBase(mine) : null,
      can_build: mine ? null : await buildEligibility(userId, body, count),
      can_expand: techs.has('tech_base_expansion'),
      tiers: TIERS,
      cargo_modules: cargoMods.map(m => ({ inventory_id: m.id, module_type_id: m.item_id, name: m.name, tier: m.tier, stats: m.stats, quality: m.item_data?.quality || null })),
      cargo_resources: cargoRes.map(s => ({ id: s.id, resource_name: s.resource_name, quantity: Number(s.quantity), avg_quality: Math.round(AVG(s)) })),
    });
  } catch (e) { console.error('bases/here:', e); res.status(500).json({ error: 'Failed to load base' }); }
});

// POST /bases/build { kind, name }
router.post('/build', async (req, res) => {
  try {
    const userId = req.user.id;
    const kind = req.body?.kind === 'orbital' ? 'orbital' : 'surface';
    const name = String(req.body?.name || '').trim().slice(0, 64) || `${kind === 'orbital' ? 'Orbital' : 'Surface'} Base`;
    const body = await dockedBody(req, userId);
    if (!body) return res.status(400).json({ error: 'Dock at a planet to build a base' });
    const result = await transaction(async (client) => {
      const existing = await client.query(`SELECT id FROM player_bases WHERE user_id = $1 FOR UPDATE`, [userId]);
      const here = await client.query(`SELECT id FROM player_bases WHERE user_id = $1 AND celestial_body_id = $2`, [userId, body.id]);
      if (here.rows[0]) throw Object.assign(new Error('You already have a base here'), { statusCode: 409 });
      const elig = await buildEligibility(userId, body, existing.rows.length);
      if (!elig.ok) throw Object.assign(new Error(elig.reasons[0]), { statusCode: 403 });
      if (kind === 'orbital' && elig.orbital_blocked) throw Object.assign(new Error(elig.orbital_blocked), { statusCode: 403 });
      const t = TIERS[1];
      const u = await client.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (parseInt(u.rows[0]?.credits || 0) < t.credits) throw Object.assign(new Error(`Needs ${t.credits.toLocaleString()} CR`), { statusCode: 400 });
      await consumeResources(client, userId, t.resources);
      await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [t.credits, userId]);
      const ins = await client.query(`
        INSERT INTO player_bases (user_id, celestial_body_id, system_procedural_id, body_name, kind, name, tier, build_completes_at)
        VALUES ($1, $2, $3, $4, $5, $6, 1, NOW() + ($7 || ' minutes')::interval) RETURNING *`,
        [userId, body.id, body.procedural_id || 'sol', body.name, kind, name, String(t.build_minutes)]);
      await completeQuestInTx(client, userId, 'tutorial_first_base'); // onboarding (085)
      return ins.rows[0];
    });
    logActivity({ userId, senderName: req.user.username, type: 'base_founded', systemId: body.procedural_id, payload: { name, kind, body_name: body.name } });
    res.json({ success: true, base: await shapeBase(result) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('bases/build:', e); res.status(500).json({ error: 'Failed to build base' });
  }
});

async function loadOwnBase(client, userId, id) {
  const r = await client.query(`SELECT * FROM player_bases WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
  const b = r.rows[0];
  if (!b) throw Object.assign(new Error('Base not found'), { statusCode: 404 });
  return b;
}
async function mustBeDockedAt(req, userId, base) {
  const body = await dockedBody(req, userId);
  if (!body || body.id !== base.celestial_body_id) throw Object.assign(new Error(`Dock at ${base.body_name} to manage this base`), { statusCode: 400 });
}

// POST /bases/:id/upgrade
router.post('/:id/upgrade', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await transaction(async (client) => {
      const b = await loadOwnBase(client, userId, String(req.params.id));
      await mustBeDockedAt(req, userId, b);
      if (new Date(b.build_completes_at).getTime() > Date.now()) throw Object.assign(new Error('Still under construction'), { statusCode: 409 });
      if (b.tier >= MAX_TIER) throw Object.assign(new Error('Already at the top tier'), { statusCode: 400 });
      const t = TIERS[b.tier + 1];
      const techs = await techSet(userId, client.query.bind(client));
      if (!techs.has(t.tech)) throw Object.assign(new Error(t.tech === 'tech_base_citadel' ? 'Research Citadel Engineering (Industry) first' : 'Research Base Expansion (Industry) first'), { statusCode: 403 });
      const u = await client.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (parseInt(u.rows[0]?.credits || 0) < t.credits) throw Object.assign(new Error(`Needs ${t.credits.toLocaleString()} CR`), { statusCode: 400 });
      await consumeResources(client, userId, t.resources, b.id);
      await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [t.credits, userId]);
      const up = await client.query(`
        UPDATE player_bases SET tier = tier + 1, build_completes_at = NOW() + ($2 || ' minutes')::interval, updated_at = NOW()
         WHERE id = $1 RETURNING *`, [b.id, String(t.build_minutes)]);
      return up.rows[0];
    });
    res.json({ success: true, base: await shapeBase(result) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('bases/upgrade:', e); res.status(500).json({ error: 'Failed to upgrade base' });
  }
});

// POST /bases/:id/fit { slot, inventory_id }
router.post('/:id/fit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { slot, inventory_id } = req.body || {};
    const result = await transaction(async (client) => {
      const b = await loadOwnBase(client, userId, String(req.params.id));
      await mustBeDockedAt(req, userId, b);
      if (new Date(b.build_completes_at).getTime() > Date.now()) throw Object.assign(new Error('Still under construction'), { statusCode: 409 });
      const t = TIERS[b.tier];
      const idx = Number(String(slot || '').replace(/^b/, '')) - 1;
      if (!(idx >= 0 && idx < t.slots)) throw Object.assign(new Error('No such slot'), { statusCode: 400 });
      const key = slotKey(idx);
      const fitted = b.fitted_modules || {};
      if (fitted[key]) throw Object.assign(new Error('Slot occupied -- unfit it first'), { statusCode: 409 });
      const item = await client.query(`
        SELECT pri.id, pri.item_id, pri.quantity, pri.item_data, mt.name, mt.stats, mt.slot_type, mt.tier
          FROM player_resource_inventory pri JOIN module_types mt ON mt.id = pri.item_id
         WHERE pri.id = $1 AND pri.user_id = $2 AND pri.item_type = 'item' FOR UPDATE OF pri`, [inventory_id, userId]);
      const it = item.rows[0];
      if (!it) throw Object.assign(new Error('Module not in cargo'), { statusCode: 404 });
      if (it.slot_type !== BASE_SLOT_TYPE) throw Object.assign(new Error('That module does not fit a base'), { statusCode: 400 });
      // Foundry stations need a base of their tier (T2 stations at an Outpost, ...). Service
      // buildings (depot, refinery, lab, repair shop) fit any tier so onboarding is untouched.
      const ft = Number(it.stats?.foundry?.tier) || 0;
      if (ft > b.tier) throw Object.assign(new Error(`${it.name} needs a ${TIERS[ft]?.name || 'higher-tier'} base (this one is a ${TIERS[b.tier].name})`), { statusCode: 403 });
      if (Number(it.quantity) > 1) await client.query(`UPDATE player_resource_inventory SET quantity = quantity - 1 WHERE id = $1`, [it.id]);
      else await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [it.id]);
      fitted[key] = { module_type_id: it.item_id, name: it.name, stats: it.stats || {}, tier: it.tier, quality: it.item_data?.quality || null, source: it.item_data?.source || null };
      const up = await client.query(`UPDATE player_bases SET fitted_modules = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [b.id, JSON.stringify(fitted)]);
      return up.rows[0];
    });
    res.json({ success: true, base: await shapeBase(result) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('bases/fit:', e); res.status(500).json({ error: 'Failed to fit module' });
  }
});

// POST /bases/:id/unfit { slot }
router.post('/:id/unfit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { slot } = req.body || {};
    const result = await transaction(async (client) => {
      const b = await loadOwnBase(client, userId, String(req.params.id));
      await mustBeDockedAt(req, userId, b);
      const fitted = b.fitted_modules || {};
      const m = fitted[slot];
      if (!m) throw Object.assign(new Error('Slot is empty'), { statusCode: 400 });
      if (m.stats?.depot_capacity) {
        const d = await depotFor(b, client.query.bind(client));
        const remaining = d.capacity - Number(m.stats.depot_capacity);
        if (d.used > remaining) throw Object.assign(new Error('Withdraw the depot contents first'), { statusCode: 409 });
      }
      const slotIdx = await getNextSlotIndex(userId, client);
      const itemData = { slot_type: BASE_SLOT_TYPE, quality: m.quality || { purity: 50, stability: 50, potency: 50, density: 50 }, ...(m.source ? { source: m.source } : {}) };
      await client.query(`
        INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
        VALUES ($1, 'item', $2, 1, $3, $4)`, [userId, m.module_type_id, slotIdx, JSON.stringify(itemData)]);
      delete fitted[slot];
      const up = await client.query(`UPDATE player_bases SET fitted_modules = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [b.id, JSON.stringify(fitted)]);
      return up.rows[0];
    });
    res.json({ success: true, base: await shapeBase(result) });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('bases/unfit:', e); res.status(500).json({ error: 'Failed to unfit module' });
  }
});

// POST /bases/:id/depot/deposit { inventory_id, quantity }
router.post('/:id/depot/deposit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, quantity } = req.body || {};
    if (!inventory_id || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'inventory_id and a positive integer quantity are required' });
    const result = await transaction(async (client) => {
      const b = await loadOwnBase(client, userId, String(req.params.id));
      await mustBeDockedAt(req, userId, b);
      const d = await depotFor(b, client.query.bind(client));
      if (d.capacity <= 0) throw Object.assign(new Error('Fit a Cargo Depot first'), { statusCode: 400 });
      const st = await client.query(`SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2 AND item_type = 'resource' FOR UPDATE`, [inventory_id, userId]);
      const s = st.rows[0];
      if (!s) throw Object.assign(new Error('Resource stack not found'), { statusCode: 404 });
      const take = Math.min(quantity, Number(s.quantity));
      const vol = take * Math.max(1, Number(s.stat_density ?? 50)) / 100;
      if (d.used + vol > d.capacity) throw Object.assign(new Error(`Depot full (${Math.floor(d.capacity - d.used)} units of room)`), { statusCode: 400 });
      if (take >= Number(s.quantity)) await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
      else await client.query(`UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`, [take, s.id]);
      const ex = await client.query(`
        SELECT id FROM player_base_inventory WHERE base_id = $1 AND resource_type_id = $2
           AND stat_purity IS NOT DISTINCT FROM $3 AND stat_stability IS NOT DISTINCT FROM $4
           AND stat_potency IS NOT DISTINCT FROM $5 AND stat_density IS NOT DISTINCT FROM $6`,
        [b.id, s.resource_type_id, s.stat_purity, s.stat_stability, s.stat_potency, s.stat_density]);
      if (ex.rows[0]) await client.query(`UPDATE player_base_inventory SET quantity = quantity + $1 WHERE id = $2`, [take, ex.rows[0].id]);
      else await client.query(`
        INSERT INTO player_base_inventory (base_id, resource_type_id, quantity, stat_purity, stat_stability, stat_potency, stat_density)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [b.id, s.resource_type_id, take, s.stat_purity, s.stat_stability, s.stat_potency, s.stat_density]);
      return { base: await shapeBase(b, client.query.bind(client)), deposited: take };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('bases/deposit:', e); res.status(500).json({ error: 'Failed to deposit' });
  }
});

// POST /bases/:id/depot/withdraw { stack_id, quantity }
router.post('/:id/depot/withdraw', async (req, res) => {
  try {
    const userId = req.user.id;
    const { stack_id, quantity } = req.body || {};
    if (!stack_id || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'stack_id and a positive integer quantity are required' });
    const result = await transaction(async (client) => {
      const b = await loadOwnBase(client, userId, String(req.params.id));
      await mustBeDockedAt(req, userId, b);
      const st = await client.query(`SELECT * FROM player_base_inventory WHERE id = $1 AND base_id = $2 FOR UPDATE`, [stack_id, b.id]);
      const s = st.rows[0];
      if (!s) throw Object.assign(new Error('Depot stack not found'), { statusCode: 404 });
      const take = Math.min(quantity, Number(s.quantity));
      const cargo = await getPlayerCargoInfo(userId, client);
      const vol = take * Math.max(1, Number(s.stat_density ?? 50)) / 100;
      if (vol > cargo.remaining) throw Object.assign(new Error(`Not enough cargo room (${Math.floor(cargo.remaining)} free)`), { statusCode: 400 });
      if (take >= Number(s.quantity)) await client.query(`DELETE FROM player_base_inventory WHERE id = $1`, [s.id]);
      else await client.query(`UPDATE player_base_inventory SET quantity = quantity - $1 WHERE id = $2`, [take, s.id]);
      await addResourceStack(client, userId, s.resource_type_id, take, { stat_purity: s.stat_purity, stat_stability: s.stat_stability, stat_potency: s.stat_potency, stat_density: s.stat_density });
      return { base: await shapeBase(b, client.query.bind(client)), withdrawn: take };
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('bases/withdraw:', e); res.status(500).json({ error: 'Failed to withdraw' });
  }
});

export default router;
