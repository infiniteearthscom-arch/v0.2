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

import { qualityMultiplier } from './quality';

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
    damage: 22,        // high damage, slow cycle
    fire_rate: 1.4,
    range: 500,        // matches basic scanner sensor_range -- "what you see is what you shoot"
    projectile_speed: 180,
    turn_rate: 4.0,    // radians/sec, how fast missile can curve
    lock_time: 2,      // seconds the launcher must hold target before firing
    ammo_capacity: 40, // max loaded warheads per launcher
    color: '#22c55e',
    description: 'Tracking projectile, requires lock-on + ammo',
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

// Quality multiplier moved to utils/quality.js (Phase 2 quality pass).
// All quality math now flows through that single helper.
const getQualityMultiplier = (fittedValue) => qualityMultiplier(fittedValue);

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
    // Quality scales different stats by different powers (Phase 3 spec):
    //   damage ×Q       -- linear, biggest payoff for high-q crafts
    //   range  ×sqrt(Q) -- soft; q100 = 1.41x reach, not 2x
    //   fire_rate /sqrt(Q) -- inverted because lower = faster cycle
    const qMult       = qualityMultiplier(fittedValue);
    const qRangeMult  = qualityMultiplier(fittedValue, { power: 0.5 });
    const qCycleMult  = qualityMultiplier(fittedValue, { power: 0.5, invert: true });

    // Server-authoritative ammo count (`loaded`) for missile launchers;
    // server module_types.stats.ammo_capacity / lock_time override the
    // WEAPON_DEFAULTS so the migration row is source of truth. These
    // are type-level defaults so they stay on `.stats`, NOT `.quality`.
    const serverStats = fittedValue?.stats || fittedValue?.module_data?.stats;
    const loaded = fittedValue?.loaded;
    weapons.push({
      ...base,
      damage:    Math.round(base.damage * qMult),
      range:     Math.round((serverStats?.range ?? base.range) * qRangeMult),
      fire_rate: base.fire_rate * qCycleMult,
      slot_id: slot.id,
      quality_mult: qMult,
      // Pass through server-overrides for missile-only fields if present
      lock_time: (serverStats?.lock_time ?? base.lock_time) * qCycleMult,
      ammo_capacity: serverStats?.ammo_capacity ?? base.ammo_capacity,
      loaded,  // server's last-known loaded count (number) or undefined
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
