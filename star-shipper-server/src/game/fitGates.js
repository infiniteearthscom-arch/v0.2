// fitGates.js -- capability gating (combat redesign Phase 3, plan B3).
//
// Research gates what you can CRAFT/BUY; skills gate what you can FLY.
//   * Module tier gates: fitting a T2+ weapon or defense module requires
//     the family's operation skill at level (tier - 1). T1 is always free
//     so a fresh pilot's starter kit never locks. Already-fitted modules
//     are grandfathered (only /fit-module checks).
//   * Hull class gates: buying a Medium/Heavy/Industrial hull requires the
//     matching Spaceship Command skill. Hulls already owned are
//     grandfathered (only /buy-hull checks).
//   * Fleet size: active fleet cap = 2 + Fleet Command level (max 5 from
//     that ladder) + 1 at Fleet Discipline V, hard max 6 (2026-10-05).
//     Migration 071 granted Fleet Command retroactively to anyone already
//     flying more than 2 ships.
//
// The GATE_CONFIG object is sent to the client in GET /api/skills so
// the Ship Builder can show locks + requirement text from the same
// table the server enforces. Edit here, nowhere else.

import { skillLink } from '../lib/textLinks.js';

export const FLEET_COMMAND_SKILL = 'cmd_fleet_command';
export const FLEET_DISCIPLINE_SKILL = 'cmd_fleet_disc';
export const FLEET_DISCIPLINE_LEVEL = 5;          // the level that grants the sixth ship
export const BASE_FLEET_CAP = 2;
export const COMMAND_FLEET_CAP = 5;               // ceiling of the Fleet Command ladder alone
export const MAX_FLEET_CAP = 6;                   // mirrors client MAX_FLEET_SIZE (shipRenderer.js)
export const fleetCapForLevel = (level, disciplineLevel = 0) => {
  const fromCommand = Math.min(COMMAND_FLEET_CAP, BASE_FLEET_CAP + (level || 0));
  const bonus = (disciplineLevel || 0) >= FLEET_DISCIPLINE_LEVEL ? 1 : 0;
  return Math.min(MAX_FLEET_CAP, fromCommand + bonus);
};
// What to train next for a bigger fleet, or '' at the hard max.
export const fleetCapHint = (level, disciplineLevel = 0) => {
  if ((level || 0) < COMMAND_FLEET_CAP - BASE_FLEET_CAP) return `train ${skillLink(FLEET_COMMAND_SKILL, 'Fleet Command')} (Spaceship Command) for +1 ship per level`;
  if ((disciplineLevel || 0) < FLEET_DISCIPLINE_LEVEL) return `train ${skillLink(FLEET_DISCIPLINE_SKILL, 'Fleet Discipline')} (Spaceship Command) to V for a sixth ship`;
  return '';
};

// Slot family → sub-family → gating skill id. Required level = tier - 1.
export const MODULE_GATES = {
  // Small turrets (T1-T2) by FAMILY (combat profession Phase A, 099):
  // energy = lasers, projectile = cannons, hybrid = rail / coil, missile.
  // The damage_type keys stay for clients that predate the family stat.
  weapon: {
    energy:     'gun_small_energy',       // Small Energy Turret Operation
    projectile: 'gun_small_projectile',   // Small Projectile Turret Operation
    hybrid:     'gun_small_hybrid',       // Small Hybrid Turret Operation
    missile:    'mis_missile_launcher',   // Missile Launcher Operation
    laser:   'gun_small_energy',
    kinetic: 'gun_small_projectile',
  },
  // Medium (T3) and large (T4-T5) turrets: the size's Operation skill.
  // Medium: level I. Large: T4 level I, T5 level II. Missiles keep the
  // tier-1 rule on Missile Launcher Operation whatever their size.
  weapon_size: {
    medium: { energy: 'gun_medium_energy', projectile: 'gun_medium_projectile', hybrid: 'gun_medium_hybrid', missile: 'mis_missile_launcher' },
    large:  { energy: 'gun_large_energy',  projectile: 'gun_large_projectile',  hybrid: 'gun_large_hybrid',  missile: 'mis_missile_launcher' },
  },
  shield: {
    shield: 'eng_shield_upgrades',     // Shield Upgrades
    armor:  'eng_armor_layering',      // Armor Layering
  },
  utility: {
    telemetry: 'ast_survey',           // Survey (Astrometrics) -- asteroid telemetry arrays (076)
  },
};

// Hull id → { skill, level }. Anything not listed is free to buy.
export const HULL_GATES = {
  frigate:    { skill: 'cmd_frigate',    level: 1 },
  freighter:  { skill: 'cmd_frigate',    level: 1 },
  prospector: { skill: 'cmd_industrial', level: 1 },
  excavator:  { skill: 'cmd_industrial', level: 2 },
  leviathan:  { skill: 'cmd_industrial', level: 3 },
  capital:    { skill: 'cmd_capital',    level: 2 },
};

// Warp Core (jump-gates-spec §6): craft-only outside islands; island
// stations sell it at this price. `live` is filled per request in
// api/skills.js from the module-row probe so clients gate free warp only
// once migration 095 has run.
export const WARP_CORE_MODULE_ID = 'utility_warp_core_3';
export const ISLAND_CORE_PRICE = 250000;

export const GATE_CONFIG = {
  module_gates: MODULE_GATES,
  hull_gates: HULL_GATES,
  fleet: {
    skill: FLEET_COMMAND_SKILL, base_cap: BASE_FLEET_CAP, command_cap: COMMAND_FLEET_CAP, max_cap: MAX_FLEET_CAP,
    bonus_skill: FLEET_DISCIPLINE_SKILL, bonus_level: FLEET_DISCIPLINE_LEVEL,
  },
};

const guessDamageType = (id) => {
  const s = String(id || '').toLowerCase();
  if (/missile|torpedo|rocket/.test(s)) return 'missile';
  if (/laser|beam|lance|pulse/.test(s)) return 'laser';
  return 'kinetic';
};

// Turret family / size (099). Mirrored in the client's utils/fitGates.js.
export const SIZE_RANK = { small: 1, medium: 2, large: 3 };
export function weaponFamily(stats, moduleId) {
  if (stats?.family) return stats.family;
  const dt = stats?.damage_type || guessDamageType(moduleId);
  if (dt === 'laser') return 'energy';
  if (dt === 'missile') return 'missile';
  return /rail|coil/.test(String(moduleId || '')) ? 'hybrid' : 'projectile';
}
export function weaponSize(stats, tier) {
  if (stats?.size && SIZE_RANK[stats.size]) return stats.size;
  const t = Number(tier) || 1;
  return t <= 2 ? 'small' : t === 3 ? 'medium' : 'large';
}

// Which sub-family a module belongs to (mirrors the client's copy in
// star-shipper/src/utils/fitGates.js).
export function moduleSubFamily(slotType, stats, moduleId) {
  if (slotType === 'weapon') return weaponFamily(stats, moduleId);
  if (slotType === 'shield') return stats?.armor_hp != null ? 'armor' : 'shield';
  if (slotType === 'utility') return stats?.telemetry_tier != null ? 'telemetry' : null;
  return null;
}

// { skill, level } or null when the module is ungated.
export function moduleGateFor({ id, slot_type, tier, stats }) {
  const t = Number(tier) || 1;
  if (t <= 1) return null;
  if (slot_type === 'weapon') {
    const fam = weaponFamily(stats, id);
    const size = weaponSize(stats, t);
    if (fam === 'missile' || size === 'small') {
      const skill = MODULE_GATES.weapon[fam];
      return skill ? { skill, level: t - 1 } : null;
    }
    const skill = MODULE_GATES.weapon_size[size]?.[fam];
    if (!skill) return null;
    return { skill, level: size === 'medium' ? 1 : Math.max(1, t - 3) };
  }
  const sub = moduleSubFamily(slot_type, stats, id);
  const skill = sub && MODULE_GATES[slot_type]?.[sub];
  if (!skill) return null;
  return { skill, level: t - 1 };
}

export const hullGateFor = (hullId) => HULL_GATES[hullId] || null;

// Player's levels + display names for a set of skill ids, using any
// object with .query (pool or transaction client).
export async function getSkillLevels(db, userId, skillIds) {
  const ids = [...new Set(skillIds)].filter(Boolean);
  if (!ids.length) return { levels: {}, names: {} };
  const defs = await db.query(`SELECT id, name FROM skill_definitions WHERE id = ANY($1::text[])`, [ids]);
  const rows = await db.query(
    `SELECT skill_id, level FROM player_skills WHERE user_id = $1 AND skill_id = ANY($2::text[])`,
    [userId, ids]
  );
  const levels = {};
  for (const r of rows.rows) levels[r.skill_id] = r.level;
  const names = {};
  for (const d of defs.rows) names[d.id] = d.name;
  return { levels, names };
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const roman = (n) => ROMAN[n] || String(n);

// Throws a 403 with a player-readable message when the gate isn't met.
export async function assertGate(db, userId, gate, what) {
  if (!gate) return;
  const { levels, names } = await getSkillLevels(db, userId, [gate.skill]);
  const have = levels[gate.skill] || 0;
  if (have >= gate.level) return;
  const name = names[gate.skill] || gate.skill;
  throw Object.assign(
    new Error(`${what} requires ${skillLink(gate.skill, name)} ${roman(gate.level)} (you have ${have ? roman(have) : 'none'})`),
    { statusCode: 403, requires_skill: gate.skill, requires_level: gate.level }
  );
}

export async function getFleetCapInfo(db, userId) {
  const { levels } = await getSkillLevels(db, userId, [FLEET_COMMAND_SKILL, FLEET_DISCIPLINE_SKILL]);
  const cmd = levels[FLEET_COMMAND_SKILL] || 0;
  const disc = levels[FLEET_DISCIPLINE_SKILL] || 0;
  return { cap: fleetCapForLevel(cmd, disc), hint: fleetCapHint(cmd, disc) };
}

export async function getFleetCap(db, userId) {
  return (await getFleetCapInfo(db, userId)).cap;
}
