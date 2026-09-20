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

const moduleSubFamily = (slotType, stats, moduleId) => {
  if (slotType === 'weapon') return stats?.damage_type || guessDamageType(moduleId);
  if (slotType === 'shield') return stats?.armor_hp != null ? 'armor' : 'shield';
  return null;
};

// Cargo inventory items carry item_data.{slot_type, tier, base_stats};
// pass the raw inventory row. Returns { skill, level } or null.
export const moduleGateForItem = (item, gates) => {
  const data = item?.item_data || {};
  const tier = Number(data.tier) || 1;
  if (tier <= 1 || !gates?.module_gates) return null;
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
