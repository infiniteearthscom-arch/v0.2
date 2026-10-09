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

// Turret hit chance (099): EVE-style tracking + falloff, one roll per shot.
//   omega   = target angular velocity around the shooter (rad/s)
//   chance  = 0.5 ^ ((omega / tracking)^2) × (d <= optimal ? 1 : 0.5 ^ (((d - optimal) / falloff)^2))
// Missiles never roll here (they have no tracking stat).
export const turretHitChance = (w, dist, omega, mults = {}) => {
  if (!w || w.type === 'missile' || w.tracking == null) return 1;
  const tracking = Math.max(0.01, w.tracking * (mults.tracking || 1));
  const optimal = w.optimal * (mults.optimal || 1);
  const falloff = Math.max(1, w.falloff * (mults.falloff || 1));
  // Signature (target size) factor: a fighter is harder to track than a
  // capital. mults.signature = clamp(14 / displaySize, 0.5, 1.6).
  const track = Math.pow(0.5, ((omega * (mults.signature || 1)) / tracking) ** 2);
  const fall = dist <= optimal ? 1 : Math.pow(0.5, ((dist - optimal) / falloff) ** 2);
  return Math.max(0, Math.min(1, track * fall));
};
// Angular velocity of the target as seen from the shooter (rad/s).
export const signatureFactor = (displaySize) => Math.max(0.5, Math.min(1.6, 14 / Math.max(1, displaySize || 12)));
export const angularVelocity = (sx, sy, svx, svy, tx, ty, tvx, tvy) => {
  const rx = tx - sx, ry = ty - sy;
  const d2 = rx * rx + ry * ry;
  if (d2 < 1) return 0;
  const vx = (tvx || 0) - (svx || 0), vy = (tvy || 0) - (svy || 0);
  return Math.abs(rx * vy - ry * vx) / d2;
};

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
  // Explicit damage_type wins (Phase 0, migration 067): module stats
  // now carry `damage_type: 'laser'|'kinetic'|'missile'` and fit-module
  // snapshots it. The keyword heuristic below survives only as the
  // fallback for modules fitted before the migration.
  const explicit = fittedValue?.stats?.damage_type;
  if (explicit === 'laser' || explicit === 'kinetic' || explicit === 'missile') {
    return explicit;
  }
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
    // Quality scales different stats by different powers:
    //   damage ×Q       -- linear, biggest payoff for high-q crafts
    //   range  ×sqrt(Q) -- soft; q100 = 1.41x reach, not 2x
    //   fire_rate       -- NOT quality-scaled (Phase 1 / plan B7,
    //     2026-09-04). It used to be ÷sqrt(Q), making DPS scale ×Q^1.5
    //     (Q100 = ×2.83) — a stealth tier system that rivaled two whole
    //     module tiers. DPS now scales linearly ×Q (Q100 = ×2.0).
    //   lock_time ÷sqrt(Q) still applies (lock speed isn't DPS).
    const qMult       = qualityMultiplier(fittedValue);
    const qRangeMult  = qualityMultiplier(fittedValue, { power: 0.5 });
    const qLockMult   = qualityMultiplier(fittedValue, { power: 0.5, invert: true });

    // Server-authoritative ammo count (`loaded`) for missile launchers;
    // server module_types.stats.ammo_capacity / lock_time override the
    // WEAPON_DEFAULTS so the migration row is source of truth. These
    // are type-level defaults so they stay on `.stats`, NOT `.quality`.
    const serverStats = fittedValue?.stats || fittedValue?.module_data?.stats;
    // 5-tier system (migration 062): modules whose stats carry
    // "combat_tuned": true define their OWN damage/fire_rate/range in
    // the tuned unit shape, so a T5 weapon actually outhits a T2.
    // Old module types have stale pre-rework stats in different units —
    // without the flag we keep the per-TYPE defaults, exactly as before.
    const tuned = serverStats?.combat_tuned === true;
    const loaded = fittedValue?.loaded;
    const range = Math.round((tuned ? (serverStats.range ?? base.range) : base.range) * qRangeMult);
    // Turret model (combat profession Phase A, 099): size / family /
    // tracking / optimal / falloff. Rows fitted before 099 carry none of
    // these, so derive them the same way the server manifest does.
    const tier = Number(fittedValue?.tier ?? serverStats?.tier) || 1;
    const size = serverStats?.size || (tier <= 2 ? 'small' : tier === 3 ? 'medium' : 'large');
    const idText = String(fittedValue?.module_type_id || fittedValue?.item_id || '');
    const family = serverStats?.family || (type === 'laser' ? 'energy' : type === 'missile' ? 'missile' : (/rail|coil/.test(idText) ? 'hybrid' : 'projectile'));
    const trackDefault = size === 'small' ? 1.8 : size === 'medium' ? 1.1 : 0.6;
    const optimal = type === 'missile' ? range : Math.round(serverStats?.optimal != null ? serverStats.optimal * qRangeMult : range * 0.75);
    weapons.push({
      ...base,
      damage:    Math.round((tuned ? (serverStats.damage ?? base.damage) : base.damage) * qMult),
      range,
      fire_rate: (tuned ? (serverStats.fire_rate ?? base.fire_rate) : base.fire_rate),
      size, family, tier,
      tracking: type === 'missile' ? null : (serverStats?.tracking ?? trackDefault),
      optimal,
      falloff: type === 'missile' ? 0 : Math.max(1, range - optimal),
      slot_id: slot.id,
      quality_mult: qMult,
      // Pass through server-overrides for missile-only fields if present
      lock_time: (serverStats?.lock_time ?? base.lock_time) * qLockMult,
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
