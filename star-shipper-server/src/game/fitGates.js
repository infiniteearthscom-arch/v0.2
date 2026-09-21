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
//   * Fleet size: active fleet cap = 2 + Fleet Command level, max 5.
//     Migration 071 granted the skill retroactively to anyone already
//     flying more than 2 ships.
//
// The GATE_CONFIG object is sent to the client in GET /api/skills so
// the Ship Builder can show locks + requirement text from the same
// table the server enforces. Edit here, nowhere else.

export const FLEET_COMMAND_SKILL = 'cmd_fleet_command';
export const BASE_FLEET_CAP = 2;
export const MAX_FLEET_CAP = 5;
export const fleetCapForLevel = (level) => Math.min(MAX_FLEET_CAP, BASE_FLEET_CAP + (level || 0));

// Slot family → sub-family → gating skill id. Required level = tier - 1.
export const MODULE_GATES = {
  weapon: {
    laser:   'gun_small_energy',       // Small Energy Turret Operation
    kinetic: 'gun_small_projectile',   // Small Projectile Turret Operation
    missile: 'mis_missile_launcher',   // Missile Launcher Operation
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

export const GATE_CONFIG = {
  module_gates: MODULE_GATES,
  hull_gates: HULL_GATES,
  fleet: { skill: FLEET_COMMAND_SKILL, base_cap: BASE_FLEET_CAP, max_cap: MAX_FLEET_CAP },
};

const guessDamageType = (id) => {
  const s = String(id || '').toLowerCase();
  if (/missile|torpedo|rocket/.test(s)) return 'missile';
  if (/laser|beam|lance|pulse/.test(s)) return 'laser';
  return 'kinetic';
};

// Which sub-family a module belongs to (mirrors the client's copy in
// star-shipper/src/utils/fitGates.js).
export function moduleSubFamily(slotType, stats, moduleId) {
  if (slotType === 'weapon') return stats?.damage_type || guessDamageType(moduleId);
  if (slotType === 'shield') return stats?.armor_hp != null ? 'armor' : 'shield';
  if (slotType === 'utility') return stats?.telemetry_tier != null ? 'telemetry' : null;
  return null;
}

// { skill, level } or null when the module is ungated.
export function moduleGateFor({ id, slot_type, tier, stats }) {
  const t = Number(tier) || 1;
  if (t <= 1) return null;
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
    new Error(`${what} requires ${name} ${roman(gate.level)} (you have ${have ? roman(have) : 'none'})`),
    { statusCode: 403, requires_skill: gate.skill, requires_level: gate.level }
  );
}

export async function getFleetCap(db, userId) {
  const { levels } = await getSkillLevels(db, userId, [FLEET_COMMAND_SKILL]);
  return fleetCapForLevel(levels[FLEET_COMMAND_SKILL] || 0);
}
