// Enemy spawn manifest (combat redesign Phase 2 — enemy template system).
//
// THE single source of truth for what pirates exist in a system. Enemies
// are assembled from the player's own catalogs (hull_types + module_types)
// via the enemy_templates / enemy_template_modules tables (migration 069):
// a template names a hull + a list of modules with quality ranges; this
// module rolls each system's fleets deterministically from the system
// seed and hands the client a fully-resolved manifest (positions, HP
// pools, per-weapon stats, loot). The client renders + simulates exactly
// what it is given — it no longer generates pirates itself, so there is
// no RNG stream to keep in sync (the old pirateManifest.js is gone).
//
// Deterministic: same system id → same manifest for every player, so two
// players in one system see the same pirates (presence consistency).
// Cached per system for the process lifetime; the template catalog is
// read from the DB once (templates are seed data — a redeploy restarts
// the process anyway). `invalidateManifests()` exists for admin tooling.
//
// Stat math mirrors the PLAYER's rules so "enemies use the player's
// systems" is literally true:
//   hull      = hull_types.base_hull
//   shield    = Σ shield_hp × Q        (api/fitting.js recalcShipStats)
//   armor     = Σ armor_hp  × Q        (client fleetStats, combat_tuned path)
//   speed     = base_speed + Σ engine (thrust ?? speed ?? speed_bonus) × Q   (api/fitting.js)
//   weapon    = damage × Q, range × √Q, fire_rate flat   (client weapons.js)
// Q = qualityMultiplier over a flat {purity,stability,potency,density} roll.

import { queryAll } from '../db/index.js';
import { qualityMultiplier } from '../lib/quality.js';
import { generateGalaxy, generateSystemContent } from './galaxyGenerator.js';

export const MANIFEST_VERSION = 2;

// ---- galaxy singleton (same seed/count as the client) ----
const GALAXY_SEED = 12345;
const GALAXY_SYSTEM_COUNT = 200;
let _galaxyCache = null;
const getGalaxy = () => {
  if (!_galaxyCache) _galaxyCache = generateGalaxy(GALAXY_SEED, GALAXY_SYSTEM_COUNT);
  return _galaxyCache;
};

// Same LCG the client used for pirate spawns; kept so seeds stay familiar.
class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  weighted(arr, weightOf) {
    const total = arr.reduce((s, x) => s + weightOf(x), 0);
    let r = this.range(0, total);
    for (const x of arr) { r -= weightOf(x); if (r <= 0) return x; }
    return arr[arr.length - 1];
  }
}

// ============================================
// TUNING — every number the spawner uses lives here.
// ============================================
// Loot roll (plan B5): base × hull factor × tier mult × template mult.
// Tier mult is tuned so a full system clear (~15 min incl. travel, 15 min
// respawn) lands near the B5 combat income targets: T1 ~6k/hr · T2 ~15k ·
// T3 ~30k · T4 ~60k · T5 ~105k. Hull factor + flagship/elite template
// multipliers already scale steeply at depth, so this table is flat-ish.
const LOOT_CREDITS_MIN = 35;
const LOOT_CREDITS_MAX = 120;
const LOOT_TIER_MULT = { 0: 1.0 /* Sol */, 1: 4.0, 2: 2.2, 3: 2.8, 4: 3.0, 5: 3.2 };
// Flagship wreck pays its own loot + this fraction of its escorts' loot.
// MUST match FLAGSHIP_FLEET_BONUS_FRAC in star-shipper/src/utils/fleetEntities.js.
const FLAGSHIP_FLEET_BONUS_FRAC = 0.5;
// Fleets per system by danger level (tuning appendix: "counts roughly
// halved from today at d4–5"; fewer, smarter fleets).
const FLEETS_BY_DANGER = { 0: 0, 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 };
// Fleet size [min,max] by REGION tier (appendix: T1 solo/duo · T2 duo/trio
// · T3 trio · T4 trio/quad · T5 quad).
const FLEET_SIZE_BY_TIER = { 1: [1, 2], 2: [2, 3], 3: [3, 3], 4: [3, 4], 5: [4, 4] };
// Chance a fleet's flagship slot is filled by an elite template.
const ELITE_CHANCE_BY_TIER = { 4: 0.2, 5: 0.1 };
// T5 systems always field one named flagship (fleet 0).
const T5_GUARANTEED_ELITE = true;
// Escort picks: this fraction from the region tier, the rest from tier-1.
const SAME_TIER_ESCORT_FRAC = 0.7;

// Per-type fallbacks for any weapon module lacking combat_tuned stats.
// Mirrors client weapons.js WEAPON_DEFAULTS.
const WEAPON_DEFAULTS = {
  laser:   { damage: 6,  fire_rate: 0.45, range: 200 },
  kinetic: { damage: 12, fire_rate: 0.7,  range: 180 },
  missile: { damage: 22, fire_rate: 1.4,  range: 500 },
};

// Sol — hand-placed starter patrols (plan B10: small single/duo T1
// patrols + one armored T2 destroyer as the "come back with a laser"
// fight). Coordinates are Sol world units (SystemView SOL_SYSTEM).
const SOL_SPAWN_ZONES = [
  { name: 'Belt Raiders',           cx: 1400,  cy: 200,   radius: 120, templates: ['reaver_marauder', 'reaver_interceptor'] },
  { name: 'Jupiter Siege Wing',     cx: 2200,  cy: -800,  radius: 120, templates: ['reaver_interceptor'] },
  { name: 'Inner Pickets',          cx: -900,  cy: 900,   radius: 120, templates: ['reaver_interceptor', 'reaver_interceptor'] },
  { name: 'Saturn Corsairs',        cx: -1200, cy: -2600, radius: 140, templates: ['reaver_marauder', 'reaver_interceptor'] },
  { name: 'Outer Dreadnought Wing', cx: -2600, cy: 1400,  radius: 120, templates: ['reaver_destroyer'] },
];

// ============================================
// CATALOG (DB → memory, once)
// ============================================
let _catalog = null;
let _catalogPromise = null;

async function loadCatalog() {
  const [templates, tmods, hulls, modules] = await Promise.all([
    queryAll(`SELECT * FROM enemy_templates ORDER BY id ASC`),
    queryAll(`SELECT * FROM enemy_template_modules ORDER BY template_id ASC, id ASC`),
    queryAll(`SELECT id, name, class, base_hull, base_speed, base_maneuver FROM hull_types`),
    queryAll(`SELECT id, name, slot_type, tier, stats FROM module_types`),
  ]);
  const hullMap = new Map(hulls.map(h => [h.id, h]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));
  const byTemplate = new Map();
  for (const tm of tmods) {
    if (!byTemplate.has(tm.template_id)) byTemplate.set(tm.template_id, []);
    byTemplate.get(tm.template_id).push(tm);
  }
  const list = [];
  for (const t of templates) {
    if (!hullMap.has(t.hull_type_id)) {
      console.warn(`enemyManifest: template ${t.id} references unknown hull ${t.hull_type_id} — skipped`);
      continue;
    }
    const mods = (byTemplate.get(t.id) || []).filter(tm => {
      if (moduleMap.has(tm.module_type_id)) return true;
      console.warn(`enemyManifest: template ${t.id} references unknown module ${tm.module_type_id} — dropped`);
      return false;
    });
    list.push({ ...t, loot_multiplier: Number(t.loot_multiplier) || 1, modules: mods });
  }
  // (tier → role → templates) index for the spawner.
  const byTierRole = {};
  for (const t of list) {
    byTierRole[t.tier] ??= {};
    (byTierRole[t.tier][t.role] ??= []).push(t);
  }
  return { templates: list, byId: new Map(list.map(t => [t.id, t])), byTierRole, hulls: hullMap, modules: moduleMap };
}

// Test hook: inject a catalog shaped like loadCatalog()'s result so the
// spawner can be exercised without a database (no local PG — see CLAUDE.md).
export function _setCatalogForTests(rows) {
  const { templates, tmods, hulls, modules } = rows;
  const hullMap = new Map(hulls.map(h => [h.id, h]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));
  const byTemplate = new Map();
  for (const tm of tmods) {
    if (!byTemplate.has(tm.template_id)) byTemplate.set(tm.template_id, []);
    byTemplate.get(tm.template_id).push(tm);
  }
  const list = templates.map(t => ({ ...t, loot_multiplier: Number(t.loot_multiplier) || 1, modules: byTemplate.get(t.id) || [] }));
  const byTierRole = {};
  for (const t of list) { byTierRole[t.tier] ??= {}; (byTierRole[t.tier][t.role] ??= []).push(t); }
  _catalog = { templates: list, byId: new Map(list.map(t => [t.id, t])), byTierRole, hulls: hullMap, modules: moduleMap };
  _manifestCache.clear();
}

export async function getCatalog() {
  if (_catalog) return _catalog;
  if (!_catalogPromise) {
    _catalogPromise = loadCatalog().then(c => { _catalog = c; return c; })
      .catch(err => { _catalogPromise = null; throw err; });
  }
  return _catalogPromise;
}

// ============================================
// TEMPLATE → CONCRETE ENEMY
// ============================================
const flatQuality = (q) => ({ purity: q, stability: q, potency: q, density: q });

function guessDamageType(moduleId) {
  const id = String(moduleId).toLowerCase();
  if (/missile|torpedo|rocket/.test(id)) return 'missile';
  if (/laser|beam|lance|pulse/.test(id)) return 'laser';
  return 'kinetic';
}

// Roll one template into stats + an inspectable fit. `rng` consumption:
// one int per module (quality), in template module order.
function instantiate(template, rng, catalog) {
  const hull = catalog.hulls.get(template.hull_type_id);
  const fit = [];
  const weapons = [];
  let shield = 0, armor = 0, engineBonus = 0;

  for (const tm of template.modules) {
    const mt = catalog.modules.get(tm.module_type_id);
    const q = rng.int(tm.quality_min, tm.quality_max);
    const quality = flatQuality(q);
    const qMult = qualityMultiplier({ quality });
    const qRange = qualityMultiplier({ quality }, { power: 0.5 });
    const stats = mt.stats || {};
    const entry = {
      slot_type: tm.slot_type,
      module_type_id: mt.id,
      name: mt.name,
      tier: mt.tier || 1,
      quality: q,
    };

    if (tm.slot_type === 'weapon') {
      const type = stats.damage_type || guessDamageType(mt.id);
      const base = WEAPON_DEFAULTS[type] || WEAPON_DEFAULTS.kinetic;
      const tuned = stats.combat_tuned === true;
      const w = {
        module_type_id: mt.id,
        name: mt.name,
        damage_type: type,
        damage: Math.round((tuned ? (stats.damage ?? base.damage) : base.damage) * qMult),
        range: Math.round((tuned ? (stats.range ?? base.range) : base.range) * qRange),
        fire_rate: tuned ? (stats.fire_rate ?? base.fire_rate) : base.fire_rate,
        quality: q,
      };
      weapons.push(w);
      Object.assign(entry, { damage_type: type, damage: w.damage, range: w.range, fire_rate: w.fire_rate });
    } else if (tm.slot_type === 'shield') {
      // Armor modules fit the shield slot (062); the stats key decides
      // which layer. Untuned legacy modules (shield_basic) count for the
      // flat per-role value the player's own HUD uses for them
      // (client fleetStats MODULE_BONUSES: shield 40 / armor 25).
      const tuned = stats.combat_tuned === true;
      if (stats.armor_hp != null) {
        const v = Math.round((tuned ? stats.armor_hp : 25) * qMult);
        armor += v; entry.armor_hp = v;
      } else {
        const v = Math.round((tuned ? (stats.shield_hp ?? 40) : 40) * qMult);
        shield += v; entry.shield_hp = v;
      }
    } else if (tm.slot_type === 'engine') {
      // EXACTLY the player's rule (api/fitting.js recalcShipStats reads
      // `thrust ?? speed ?? speed_bonus`). Fixed together 2026-09-18 --
      // before that both sides ignored speed_bonus and engines added 0.
      // If the player rule changes again, mirror it here in the same
      // commit.
      const thrust = stats.thrust ?? stats.speed ?? stats.speed_bonus ?? 0;
      const v = Math.round(thrust * qMult);
      engineBonus += v; entry.speed_bonus = v;
    }
    fit.push(entry);
  }

  // Primary weapon = highest DPS; drives the legacy single-weapon fields
  // (name suffix, weaponType tint) — the sim fires every weapon.
  const primary = weapons.slice().sort((a, b) => (b.damage / b.fire_rate) - (a.damage / a.fire_rate))[0] || null;

  return {
    template_id: template.id,
    hull_type_id: template.hull_type_id,
    hull_name: hull.name,
    faction: template.faction,
    is_elite: !!template.is_elite,
    behavior_mode: template.behavior_mode,
    max_hull: hull.base_hull,
    max_shield: shield,
    max_armor: armor,
    speed: Math.round((hull.base_speed ?? 50) + engineBonus),
    weapons,
    primary_weapon: primary ? primary.name : null,
    primary_damage_type: primary ? primary.damage_type : 'kinetic',
    range: weapons.reduce((m, w) => Math.max(m, w.range), 0) || 150,
    modules: fit,
  };
}

function displayName(template, inst, tier) {
  if (template.is_elite) return `T${tier} ★ ${template.name}`;
  return inst.primary_weapon
    ? `T${tier} ${template.name} (${inst.primary_weapon})`
    : `T${tier} ${template.name}`;
}

// Loot: hull factor replaces the old displaySize/6 (server has no
// renderer sizes). sqrt keeps a capital from paying 33× an interceptor.
function rollLoot(rng, inst, dangerLevel, tier, template) {
  const hullFactor = Math.max(1, Math.min(4, Math.sqrt((inst.max_hull || 60) / 60)));
  return Math.round(
    rng.range(LOOT_CREDITS_MIN, LOOT_CREDITS_MAX)
    * hullFactor
    * (LOOT_TIER_MULT[tier] ?? 1)
    * template.loot_multiplier
  );
}

// ============================================
// FLEET COMPOSITION
// ============================================
function pickTemplates(catalog, rng, tier, role, fallbackTiers = []) {
  const tiers = [tier, ...fallbackTiers];
  for (const t of tiers) {
    const pool = catalog.byTierRole[t]?.[role];
    if (pool && pool.length) return pool;
  }
  return null;
}

// Returns the list of templates for one fleet; index 0 is the flagship.
function composeFleet(catalog, rng, tier, fleetIdx) {
  const [minSize, maxSize] = FLEET_SIZE_BY_TIER[tier] || FLEET_SIZE_BY_TIER[1];
  const size = rng.int(minSize, maxSize);
  const roster = [];

  // Flagship (or elite).
  let flagPool = null;
  const eliteChance = ELITE_CHANCE_BY_TIER[tier] || 0;
  const forceElite = T5_GUARANTEED_ELITE && tier === 5 && fleetIdx === 0;
  if (forceElite || (eliteChance > 0 && rng.range(0, 1) < eliteChance)) {
    flagPool = pickTemplates(catalog, rng, tier, 'elite');
  }
  if (!flagPool) flagPool = pickTemplates(catalog, rng, tier, 'flagship', [tier - 1, tier - 2, 1]);
  if (!flagPool) flagPool = catalog.templates.filter(t => t.tier <= tier);
  if (!flagPool.length) return roster;
  roster.push(rng.weighted(flagPool, t => t.spawn_weight || 1));

  // Escorts: same-tier escort/line most of the time, tier-1 otherwise.
  for (let i = 1; i < size; i++) {
    const sameTier = rng.range(0, 1) < SAME_TIER_ESCORT_FRAC;
    const t = sameTier ? tier : Math.max(1, tier - 1);
    const pool = [
      ...(catalog.byTierRole[t]?.escort || []),
      ...(catalog.byTierRole[t]?.line || []),
    ];
    const fallback = pool.length ? pool : [
      ...(catalog.byTierRole[tier]?.escort || []),
      ...(catalog.byTierRole[tier]?.line || []),
      ...(catalog.byTierRole[1]?.escort || []),
    ];
    if (!fallback.length) break;
    roster.push(rng.weighted(fallback, x => x.spawn_weight || 1));
  }
  return roster;
}

// ============================================
// SYSTEM BUILDERS
// ============================================
function buildProcedural(systemId, galaxySys, catalog) {
  const dangerLevel = galaxySys.dangerLevel || 0;
  const tier = Math.max(1, Math.min(5, galaxySys.regionTier ?? 1));
  const rng = new SeededRandom((galaxySys.seed || 1) + 7777);
  const enemies = [];
  const fleets = [];
  if (dangerLevel <= 0) return { enemies, fleets, tier, dangerLevel };

  const content = generateSystemContent(galaxySys);
  const bodies = content?.bodies || [];
  const maxOrbit = Math.max(800, ...bodies.filter(b => b.orbitRadius).map(b => b.orbitRadius));

  let fleetCount = FLEETS_BY_DANGER[Math.min(5, dangerLevel)] ?? 2;
  if (dangerLevel >= 2) fleetCount += rng.int(0, 1);

  let nextId = 1;
  for (let f = 0; f < fleetCount; f++) {
    const roster = composeFleet(catalog, rng, tier, f);
    if (!roster.length) continue;
    const fleetId = `fleet_${f}`;
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(maxOrbit * 0.3, maxOrbit * 0.9);
    const patrolCenter = { x: Math.round(Math.cos(angle) * dist), y: Math.round(Math.sin(angle) * dist) };
    const patrolRadius = Math.round(rng.range(80, 180));
    const memberIds = [];
    const baseAngle = rng.range(0, Math.PI * 2);

    roster.forEach((template, m) => {
      const inst = instantiate(template, rng, catalog);
      const memberA = rng.range(0, Math.PI * 2);
      const memberD = rng.range(0, 40);
      const id = `pirate_${nextId++}`;
      memberIds.push(id);
      enemies.push({
        id,
        fleet_id: fleetId,
        ...inst,
        tier,
        name: displayName(template, inst, tier),
        x: Math.round(patrolCenter.x + Math.cos(memberA) * memberD),
        y: Math.round(patrolCenter.y + Math.sin(memberA) * memberD),
        rotation: Math.round(rng.range(-180, 180)),
        patrol_center: patrolCenter,
        patrol_radius: patrolRadius,
        patrol_angle: baseAngle + m * (Math.PI * 2 / roster.length),
        loot_credits: rollLoot(rng, inst, dangerLevel, tier, template),
      });
    });
    fleets.push({ id: fleetId, tier, patrol_center: patrolCenter, patrol_radius: patrolRadius, member_ids: memberIds });
  }
  return { enemies, fleets, tier, dangerLevel };
}

function buildSol(catalog) {
  const rng = new SeededRandom(42);
  const enemies = [];
  const fleets = [];
  let nextId = 1;
  for (const zone of SOL_SPAWN_ZONES) {
    const fleetId = `sol_${zone.name.replace(/\s+/g, '')}`;
    const memberIds = [];
    zone.templates.forEach((templateId, m) => {
      const template = catalog.byId.get(templateId);
      if (!template) { console.warn(`enemyManifest: Sol zone ${zone.name} references unknown template ${templateId}`); return; }
      const inst = instantiate(template, rng, catalog);
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(0, zone.radius);
      const x = Math.round(zone.cx + Math.cos(angle) * dist);
      const y = Math.round(zone.cy + Math.sin(angle) * dist);
      const id = `pirate_${nextId++}`;
      memberIds.push(id);
      enemies.push({
        id,
        fleet_id: fleetId,
        ...inst,
        tier: template.tier,
        name: displayName(template, inst, template.tier),
        x, y,
        rotation: Math.round(rng.range(-180, 180)),
        patrol_center: { x: zone.cx, y: zone.cy },
        patrol_radius: Math.round(rng.range(50, 150)),
        patrol_angle: rng.range(0, Math.PI * 2) + m * (Math.PI * 2 / zone.templates.length),
        // Sol is danger 0 / tier 1: base roll × hull factor only.
        loot_credits: rollLoot(rng, inst, 0, 0, template), // loot tier 0 = Sol newbie rate
      });
    });
    fleets.push({ id: fleetId, tier: 1, name: zone.name, patrol_center: { x: zone.cx, y: zone.cy }, patrol_radius: zone.radius, member_ids: memberIds });
  }
  return { enemies, fleets, tier: 1, dangerLevel: 0 };
}

// enemyId → { credits, isFlagship, fleetId } for /claim-loot. Flagship =
// heaviest max_hull per fleet, first-seen tie-break — the SAME rule the
// client's buildFleets uses, so payouts line up with what the player saw.
function buildClaimIndex(enemies) {
  const flagshipByFleet = new Map();
  const lootByFleet = new Map();
  for (const e of enemies) {
    const cur = flagshipByFleet.get(e.fleet_id);
    if (!cur || e.max_hull > cur.hp) flagshipByFleet.set(e.fleet_id, { id: e.id, hp: e.max_hull });
    lootByFleet.set(e.fleet_id, (lootByFleet.get(e.fleet_id) || 0) + e.loot_credits);
  }
  const index = new Map();
  for (const e of enemies) {
    const isFlagship = flagshipByFleet.get(e.fleet_id)?.id === e.id;
    let credits = e.loot_credits;
    if (isFlagship) {
      const escortLoot = (lootByFleet.get(e.fleet_id) || 0) - e.loot_credits;
      credits += Math.round(FLAGSHIP_FLEET_BONUS_FRAC * escortLoot);
    }
    // templateId lets /combat/claim-loot roll the template's loot_table
    // (Phase 4b elite drops) without a second lookup.
    index.set(e.id, { credits, isFlagship, fleetId: e.fleet_id, templateId: e.template_id, isElite: !!e.is_elite });
  }
  return index;
}

// ============================================
// PUBLIC API
// ============================================
const _manifestCache = new Map(); // systemId → { manifest, claimIndex }

export function invalidateManifests() {
  _manifestCache.clear();
  _catalog = null;
  _catalogPromise = null;
}

// Returns { manifest, claimIndex } or null for an unknown system id.
// `manifest` is the wire shape the client hydrates from.
export async function getSystemManifest(systemId) {
  const cached = _manifestCache.get(systemId);
  if (cached) return cached;

  const catalog = await getCatalog();
  let built;
  if (systemId === 'sol') {
    built = buildSol(catalog);
  } else {
    const galaxySys = getGalaxy().systemMap[systemId];
    if (!galaxySys) return null;
    built = buildProcedural(systemId, galaxySys, catalog);
  }

  const claimIndex = buildClaimIndex(built.enemies);
  const manifest = {
    version: MANIFEST_VERSION,
    system_id: systemId,
    tier: built.tier,
    danger_level: built.dangerLevel,
    fleets: built.fleets,
    enemies: built.enemies.map(e => ({ ...e, is_flagship: claimIndex.get(e.id).isFlagship })),
  };
  const entry = { manifest, claimIndex };
  _manifestCache.set(systemId, entry);
  return entry;
}
