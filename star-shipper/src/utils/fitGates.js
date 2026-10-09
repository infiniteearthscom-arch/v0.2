// fitGates.js -- client mirror of the server's capability gates (Phase 3,
// plan B3). The TABLE comes from the server (GET /api/skills →
// fit_gates, stored in gameStore.fitGates); this file only holds the
// lookup logic so the Ship Builder can show locks + requirement text
// before the server rejects a fit/buy. Server is authoritative.

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const roman = (n) => ROMAN[n] || String(n);

const guessDamageType = (id) => {
  const s = String(id || '').toLowerCase();
  if (/missile|torpedo|rocket/.test(s)) return 'missile';
  if (/laser|beam|lance|pulse/.test(s)) return 'laser';
  return 'kinetic';
};

// Turret family / size (099). Mirrors server game/fitGates.js.
export const SIZE_RANK = { small: 1, medium: 2, large: 3 };
export const weaponFamily = (stats, moduleId) => {
  if (stats?.family) return stats.family;
  const dt = stats?.damage_type || guessDamageType(moduleId);
  if (dt === 'laser') return 'energy';
  if (dt === 'missile') return 'missile';
  return /rail|coil/.test(String(moduleId || '')) ? 'hybrid' : 'projectile';
};
export const weaponSize = (stats, tier) => {
  if (stats?.size && SIZE_RANK[stats.size]) return stats.size;
  const t = Number(tier) || 1;
  return t <= 2 ? 'small' : t === 3 ? 'medium' : 'large';
};
const weaponGate = (stats, moduleId, tier, gates) => {
  const fam = weaponFamily(stats, moduleId);
  const size = weaponSize(stats, tier);
  if (fam === 'missile' || size === 'small') {
    const skill = gates.module_gates.weapon?.[fam] || gates.module_gates.weapon?.[stats?.damage_type || guessDamageType(moduleId)];
    return skill ? { skill, level: tier - 1 } : null;
  }
  const skill = gates.module_gates.weapon_size?.[size]?.[fam];
  return skill ? { skill, level: size === 'medium' ? 1 : Math.max(1, tier - 3) } : null;
};

const moduleSubFamily = (slotType, stats, moduleId) => {
  if (slotType === 'weapon') return weaponFamily(stats, moduleId);
  if (slotType === 'shield') return stats?.armor_hp != null ? 'armor' : 'shield';
  if (slotType === 'utility') return stats?.telemetry_tier != null ? 'telemetry' : null;
  return null;
};

// Cargo inventory items carry item_data.{slot_type, tier, base_stats};
// pass the raw inventory row. Returns { skill, level } or null.
export const moduleGateForItem = (item, gates) => {
  const data = item?.item_data || {};
  const tier = Number(data.tier) || 1;
  if (tier <= 1 || !gates?.module_gates) return null;
  if (data.slot_type === 'weapon') return weaponGate(data.base_stats, item?.item_id, tier, gates);
  const sub = moduleSubFamily(data.slot_type, data.base_stats, item?.item_id);
  const skill = sub && gates.module_gates[data.slot_type]?.[sub];
  return skill ? { skill, level: tier - 1 } : null;
};

// Same lookup for a NORMALIZED item (utils/itemShape.js -- carries
// slotType / tier / baseStats / moduleTypeId). Used by the shared
// tooltip so the requirement shows on every module surface.
export const moduleGateForModule = (norm, gates) => {
  if (!norm || norm.kind !== 'module') return null;
  const tier = Number(norm.tier) || 1;
  if (tier <= 1 || !gates?.module_gates) return null;
  if (norm.slotType === 'weapon') return weaponGate(norm.baseStats, norm.moduleTypeId, tier, gates);
  const sub = moduleSubFamily(norm.slotType, norm.baseStats, norm.moduleTypeId);
  const skill = sub && gates.module_gates[norm.slotType]?.[sub];
  return skill ? { skill, level: tier - 1 } : null;
};

export const hullGateFor = (hullId, gates) => gates?.hull_gates?.[hullId] || null;

// Resolve a gate against the player's skill list (gameStore.skills).
// Returns { ok, have, need, skillName, text } -- `text` is the
// requirement line to show ("Frigate Command I").
export const gateStatus = (gate, skills) => {
  if (!gate) return { ok: true, have: 0, need: 0, skillName: null, text: null };
  const s = (skills || []).find(x => x.id === gate.skill);
  const have = s?.level || 0;
  const skillName = s?.name || gate.skill;
  return {
    ok: have >= gate.level,
    have,
    need: gate.level,
    skillName,
    text: `${skillName} ${roman(gate.level)}`,
  };
};
