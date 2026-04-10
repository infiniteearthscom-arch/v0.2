// weapons.js — Derives weapon descriptors from a ship's fitted modules.
//
// This is the foundation for per-ship combat. Each fitted weapon module
// becomes a weapon descriptor with:
//   type:      'laser' | 'kinetic' | 'missile'
//   damage:    base damage per hit
//   fire_rate: seconds between shots
//   range:     max engagement distance (game units)
//   color:     primary render color
//
// Detection of weapon type from module data is heuristic: it inspects
// the module's name / item_id for keywords. This will be replaced with
// proper module metadata once the server-side blueprint chain lands.

// ============================================
// DEFAULTS — base stats per weapon type
// ============================================

export const WEAPON_DEFAULTS = {
  laser: {
    type: 'laser',
    damage: 6,        // lower per-hit, fast cycle
    fire_rate: 0.45,  // shots per cycle (seconds)
    range: 200,
    color: '#ff4466',
    description: 'Instant beam, strong vs armor',
  },
  kinetic: {
    type: 'kinetic',
    damage: 12,       // medium damage, medium cycle
    fire_rate: 0.7,
    range: 180,
    projectile_speed: 320,
    spread: 0.08,     // radians of aim spread
    color: '#fbbf24',
    description: 'Bullet projectile, strong vs shield',
  },
  missile: {
    type: 'missile',
    damage: 22,       // high damage, slow cycle
    fire_rate: 1.4,
    range: 260,
    projectile_speed: 180,
    turn_rate: 4.0,   // radians/sec, how fast missile can curve
    color: '#22c55e',
    description: 'Tracking projectile, strong vs ECM',
  },
};

// ============================================
// HEURISTIC: detect weapon type from a module
// ============================================

const LASER_KEYWORDS   = ['laser', 'beam', 'pulse', 'burst_laser', 'mining_laser'];
const KINETIC_KEYWORDS = ['kinetic', 'gauss', 'autocannon', 'railgun', 'gatling', 'projectile', 'cannon'];
const MISSILE_KEYWORDS = ['missile', 'torpedo', 'rocket', 'warhead'];

const matchesAny = (text, keywords) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
};

// Try to read a name-like field from a fitted module value.
// fitted_modules values may be strings, objects with item_id, name, type,
// or even nested data. Be defensive.
const readModuleNameFields = (fittedValue) => {
  if (!fittedValue) return [];
  if (typeof fittedValue === 'string') return [fittedValue];

  const fields = [];
  if (fittedValue.item_id)     fields.push(fittedValue.item_id);
  if (fittedValue.name)        fields.push(fittedValue.name);
  if (fittedValue.module_id)   fields.push(fittedValue.module_id);
  if (fittedValue.type)        fields.push(fittedValue.type);
  if (fittedValue.weapon_type) fields.push(fittedValue.weapon_type);
  if (fittedValue.module_name) fields.push(fittedValue.module_name);
  // Sometimes the recipe info is nested:
  if (fittedValue.item_data?.name) fields.push(fittedValue.item_data.name);
  if (fittedValue.item_data?.item_id) fields.push(fittedValue.item_data.item_id);
  return fields;
};

export const detectWeaponType = (fittedValue) => {
  const fields = readModuleNameFields(fittedValue);
  for (const field of fields) {
    if (matchesAny(field, MISSILE_KEYWORDS)) return 'missile';
    if (matchesAny(field, LASER_KEYWORDS))   return 'laser';
    if (matchesAny(field, KINETIC_KEYWORDS)) return 'kinetic';
  }
  // Default: kinetic. Players who fit any weapon will at least get
  // visible firing even if we couldn't pattern-match the name.
  return 'kinetic';
};

// ============================================
// QUALITY MODIFIER
// ============================================

// Module quality (avg of purity/stability/potency/density, 0-100)
// becomes a damage multiplier: Q50 = 1.0×, Q100 = 2.0×, Q25 = 0.5×.
// If no quality data is available, returns 1.0.
const getQualityMultiplier = (fittedValue) => {
  const stats = fittedValue?.stats || fittedValue?.item_data?.stats;
  if (!stats) return 1.0;
  const avg = ((stats.purity || 0) + (stats.stability || 0) +
               (stats.potency || 0) + (stats.density || 0)) / 4;
  if (avg <= 0) return 1.0;
  return Math.max(0.4, Math.min(2.5, avg / 50));
};

// ============================================
// MAIN: build weapon descriptors for a ship
// ============================================

// Returns an array of weapon descriptors based on the ship's fitted
// weapon-slot modules. Empty array if no weapons fitted.
export const getShipWeapons = (ship) => {
  if (!ship) return [];
  const slots = ship.hull_slots || [];
  const fitted = ship.fitted_modules || {};
  const weapons = [];

  for (const slot of slots) {
    if (slot.type !== 'weapon') continue;
    const fittedValue = fitted[slot.id];
    if (!fittedValue) continue; // empty slot

    const type = detectWeaponType(fittedValue);
    const base = WEAPON_DEFAULTS[type];
    const qMult = getQualityMultiplier(fittedValue);

    weapons.push({
      ...base,
      damage: Math.round(base.damage * qMult),
      slot_id: slot.id,
      quality_mult: qMult,
    });
  }
  return weapons;
};

// ============================================
// FLEET-LEVEL DPS HELPER (for HUD/preview)
// ============================================

// Sums DPS across all ships in a fleet, broken down by damage type.
// Used by future HUD readouts and the right outliner panel.
export const getFleetWeaponSummary = (ships) => {
  const summary = { laser: 0, kinetic: 0, missile: 0, totalDps: 0, weaponCount: 0 };
  for (const ship of (ships || [])) {
    const weapons = getShipWeapons(ship);
    for (const w of weapons) {
      const dps = w.damage / w.fire_rate;
      summary[w.type] = (summary[w.type] || 0) + dps;
      summary.totalDps += dps;
      summary.weaponCount += 1;
    }
  }
  // Round the totals for display
  summary.laser   = Math.round(summary.laser);
  summary.kinetic = Math.round(summary.kinetic);
  summary.missile = Math.round(summary.missile);
  summary.totalDps = Math.round(summary.totalDps);
  return summary;
};
