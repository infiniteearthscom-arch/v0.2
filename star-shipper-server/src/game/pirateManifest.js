// Pirate loot manifest (combat F4 / spec A3 "server-validated loot").
//
// Reproduces the client's deterministic per-system pirate spawn to compute
// the authoritative loot table: enemyId → { credits, isFlagship, fleetId }.
// /api/combat/claim-loot validates every salvage claim against this, so the
// client can no longer mint credits — a claim only pays if the enemy id is
// in the real spawn for that system and hasn't been claimed this visit.
//
// ⚠ SYNC WARNING: the RNG call sequence below MUST match the client spawn
// code EXACTLY (star-shipper/src/components/system/SystemView.jsx —
// generatePiratesForSystem + the Sol PIRATE_SPAWN_ZONES block). Every
// rng.range/int call is replicated in order, even where the value is unused
// here (positions, rotations), because skipping one desyncs the stream and
// every loot roll after it. Same for the data tables (hull pools, loadout
// tiers, spawn zones, displaySize/HP numbers) — they're copied from
// SystemView.jsx + shipRenderer.js. Edit either side → mirror it here.

import { generateGalaxy } from './galaxyGenerator.js';

// Same seed/count as the client's galaxy singleton (SystemView + GalaxyMapWindow).
const GALAXY_SEED = 12345;
const GALAXY_SYSTEM_COUNT = 200;
let _galaxyCache = null;
const getGalaxy = () => {
  if (!_galaxyCache) _galaxyCache = generateGalaxy(GALAXY_SEED, GALAXY_SYSTEM_COUNT);
  return _galaxyCache;
};

// Client SystemView's SeededRandom (NOT the galaxy generator's SRng —
// different LCG; pirate spawns use this one).
class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
}

const LOOT_CREDITS_MIN = 20;
const LOOT_CREDITS_MAX = 80;

// Flagship payout: the flagship wreck pays its own loot + this fraction of
// its escorts' combined loot (the "fleet bounty"). MUST match
// FLAGSHIP_FLEET_BONUS_FRAC in star-shipper/src/utils/fleetEntities.js.
const FLAGSHIP_FLEET_BONUS_FRAC = 0.5;

// displaySize per hull id — from shipRenderer.js (PIRATE_HULLS + HULL_SHAPES).
// Only the pool hulls the spawner can pick are needed. Feeds the loot roll
// (displaySize / 6 multiplier) and Sol armor fractions.
const HULL_DISPLAY_SIZE = {
  pirate_interceptor: 6,
  pirate_marauder: 8,
  pirate_destroyer: 11,
  fighter: 5,
  scout: 7,
  frigate: 10,
  capital: 14,
};

// Sol pirate hulls' base stats (shipRenderer.js PIRATE_HULLS[..].stats.maxHull)
// — needed for flagship determination in Sol zones (heaviest member leads).
const SOL_HULL_MAX_HULL = {
  pirate_interceptor: 40,
  pirate_marauder: 80,
  pirate_destroyer: 150,
};

// --- Tables copied from SystemView.jsx (procedural spawner) ---
const PIRATE_LOADOUT_TIERS = {
  1: [
    { weapon: 'laser_t1', shield: 'shield_t1', engine: 'engine_t1' },
    { weapon: 'kinetic_t1', shield: 'shield_t1', engine: 'engine_t1' },
  ],
  2: [
    { weapon: 'laser_t2', shield: 'shield_t2', engine: 'engine_t2' },
    { weapon: 'kinetic_t1', shield: 'shield_t2', engine: 'engine_t2' },
    { weapon: 'missile_t1', shield: 'shield_t2', engine: 'engine_t2' },
  ],
  3: [
    { weapon: 'kinetic_t2', shield: 'shield_t3', engine: 'engine_t3' },
    { weapon: 'missile_t2', shield: 'shield_t3', engine: 'engine_t3' },
    { weapon: 'laser_t2', shield: 'shield_t3', engine: 'engine_t3' },
  ],
};
const PIRATE_HULL_POOL = {
  light: ['pirate_interceptor', 'fighter', 'scout'],
  medium: ['pirate_marauder', 'frigate'],
  heavy: ['pirate_destroyer', 'capital'],
};
const PIRATE_HULL_BASE_HP = { light: 60, medium: 140, heavy: 280 };

function pickLoadoutTier(rng, dangerLevel) {
  if (dangerLevel <= 2) return 1; // NOTE: no rng call on this branch
  if (dangerLevel <= 4) return rng.range(0, 1) < 0.5 ? 1 : 2;
  return rng.range(0, 1) < 0.25 ? 2 : 3;
}

function pickHullClass(rng, tier) {
  if (tier === 3) return rng.range(0, 1) < 0.6 ? 'heavy' : 'medium';
  if (tier === 2) return rng.range(0, 1) < 0.6 ? 'medium' : 'light';
  return rng.range(0, 1) < 0.7 ? 'light' : 'medium';
}

// --- Sol spawn zones (SystemView.jsx PIRATE_SPAWN_ZONES) ---
const PIRATE_SPAWN_ZONES = [
  { name: 'Belt Raiders', radius: 220, count: 5,
    types: ['pirate_marauder', 'pirate_marauder', 'pirate_marauder', 'pirate_interceptor', 'pirate_interceptor'] },
  { name: 'Jupiter Siege Wing', radius: 220, count: 4,
    types: ['pirate_destroyer', 'pirate_destroyer', 'pirate_destroyer', 'pirate_destroyer'] },
  { name: 'Inner Pickets', radius: 200, count: 6,
    types: ['pirate_interceptor', 'pirate_interceptor', 'pirate_interceptor', 'pirate_interceptor', 'pirate_interceptor', 'pirate_interceptor'] },
  { name: 'Saturn Corsairs', radius: 260, count: 6,
    types: ['pirate_destroyer', 'pirate_marauder', 'pirate_marauder', 'pirate_marauder', 'pirate_interceptor', 'pirate_interceptor'] },
  { name: 'Outer Dreadnought Wing', radius: 240, count: 5,
    types: ['pirate_destroyer', 'pirate_marauder', 'pirate_marauder', 'pirate_marauder', 'pirate_interceptor'] },
];

// Sol members — mirrors the `currentSystemId === 'sol'` branch of the
// client's pirate-spawn effect. Only id / fleetId / loot / hull matter here,
// but every rng call is kept so the loot rolls line up.
function buildSolMembers() {
  const rng = new SeededRandom(42);
  const members = [];
  let nextId = 1;
  for (const zone of PIRATE_SPAWN_ZONES) {
    for (let i = 0; i < zone.count; i++) {
      const hullId = zone.types[i % zone.types.length];
      const maxHull = SOL_HULL_MAX_HULL[hullId];
      if (maxHull == null) continue; // client: if (!hull) continue — before any rng call
      const displaySize = HULL_DISPLAY_SIZE[hullId];
      rng.range(0, Math.PI * 2);        // angle
      rng.range(0, zone.radius);        // dist
      const solArmorFrac = displaySize > 9 ? 0.35 : displaySize > 7 ? 0.2 : 0;
      const solArmor = Math.round(maxHull * solArmorFrac);
      const solHull = maxHull - solArmor;
      const id = `pirate_${nextId++}`;
      rng.range(-180, 180);             // rotation
      rng.range(0, Math.PI * 2);        // patrolAngle
      rng.range(50, 150);               // patrolRadius
      const lootCredits = Math.round(rng.range(LOOT_CREDITS_MIN, LOOT_CREDITS_MAX) * (displaySize / 6));
      members.push({
        id,
        fleetId: `sol_${zone.name.replace(/\s+/g, '')}`,
        lootCredits,
        memberHull: solHull, // client member.maxHull — drives flagship pick
      });
    }
  }
  return members;
}

// Procedural members — mirrors generatePiratesForSystem(seed, danger, bodies,
// tier). `bodies` only shapes patrol positions (values, not call count), so
// the server doesn't need them.
function buildProceduralMembers(systemSeed, dangerLevel, systemTier) {
  const rng = new SeededRandom(systemSeed + 7777);
  const members = [];
  let nextId = 1;

  const pirateCount = Math.floor(dangerLevel * 5 + rng.range(0, dangerLevel * 3));
  if (pirateCount <= 0) return members;

  let remaining = pirateCount;
  let fleetIdx = 0;
  while (remaining > 0) {
    const fleetSize = Math.min(
      remaining,
      dangerLevel >= 5 ? rng.int(3, 4)
        : dangerLevel >= 3 ? rng.int(2, 3)
        : rng.int(1, 2)
    );
    const fleetId = `fleet_${fleetIdx++}`;
    rng.range(0, Math.PI * 2);                    // fleet angle
    rng.range(800 * 0.3, 800 * 0.9);              // fleet dist (maxOrbit value irrelevant to the stream)
    rng.range(80, 180);                           // patrolRadius
    for (let m = 0; m < fleetSize; m++) {
      const tier = pickLoadoutTier(rng, dangerLevel);
      const hullClass = pickHullClass(rng, tier);
      const hullChoices = PIRATE_HULL_POOL[hullClass];
      const hullId = hullChoices[rng.int(0, hullChoices.length - 1)];
      const displaySize = HULL_DISPLAY_SIZE[hullId];
      if (displaySize == null) continue;          // client: if (!hull) continue
      const loadoutPool = PIRATE_LOADOUT_TIERS[tier];
      loadoutPool[rng.int(0, loadoutPool.length - 1)]; // loadout pick (consumes 1 roll)
      const baseHp = PIRATE_HULL_BASE_HP[hullClass];
      rng.range(0, Math.PI * 2);                  // memberA
      rng.range(0, 40);                           // memberD
      const id = `pirate_${nextId++}`;
      rng.range(-180, 180);                       // rotation
      const armorFrac = hullClass === 'heavy' ? 0.35 : hullClass === 'medium' ? 0.2 : 0;
      const enemyArmor = Math.round(baseHp * armorFrac);
      const enemyHull = baseHp - enemyArmor;
      rng.range(0, Math.PI * 2);                  // patrolAngle
      const lootCredits = Math.round(
        rng.range(LOOT_CREDITS_MIN, LOOT_CREDITS_MAX)
        * (displaySize / 6)
        * (1 + dangerLevel * 0.3)
        * tier
      );
      members.push({ id, fleetId, lootCredits, memberHull: enemyHull });
    }
    remaining -= fleetSize;
  }

  return members;
}

// members → Map(enemyId → { credits, isFlagship, fleetId }). Flagship =
// heaviest memberHull per fleet, first-seen tie-break (same rule as the
// client's buildFleets), and its payout adds the fleet bounty.
function buildManifestFromMembers(members) {
  const flagshipByFleet = new Map();  // fleetId → { id, hp }
  const escortLootByFleet = new Map(); // fleetId → total loot of ALL members
  for (const m of members) {
    const cur = flagshipByFleet.get(m.fleetId);
    if (!cur || m.memberHull > cur.hp) flagshipByFleet.set(m.fleetId, { id: m.id, hp: m.memberHull });
    escortLootByFleet.set(m.fleetId, (escortLootByFleet.get(m.fleetId) || 0) + m.lootCredits);
  }

  const manifest = new Map();
  for (const m of members) {
    const isFlagship = flagshipByFleet.get(m.fleetId)?.id === m.id;
    let credits = m.lootCredits;
    if (isFlagship) {
      const escortLoot = (escortLootByFleet.get(m.fleetId) || 0) - m.lootCredits;
      credits += Math.round(FLAGSHIP_FLEET_BONUS_FRAC * escortLoot);
    }
    manifest.set(m.id, { credits, isFlagship, fleetId: m.fleetId });
  }
  return manifest;
}

// Public API — manifest per system, cached (deterministic, ≤201 systems).
const _manifestCache = new Map();

export function getSystemManifest(systemId) {
  let manifest = _manifestCache.get(systemId);
  if (manifest) return manifest;

  let members;
  if (systemId === 'sol') {
    members = buildSolMembers();
  } else {
    const galaxySys = getGalaxy().systemMap[systemId];
    if (!galaxySys) return null; // unknown system id — reject claims
    members = buildProceduralMembers(
      galaxySys.seed || 1,
      galaxySys.dangerLevel || 0,
      galaxySys.regionTier ?? 1
    );
  }

  manifest = buildManifestFromMembers(members);
  _manifestCache.set(systemId, manifest);
  return manifest;
}
