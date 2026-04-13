// fleetStats.js — Aggregates a fleet's collective combat stats from
// individual ship hulls and fitted modules.
//
// Per the locked design (session 12):
//   - Fleet HP, shields, armor, ECM are COLLECTIVE pools shared by the fleet
//   - Fleet speed/maneuver are penalized by total fleet mass
//   - Individual ships do not die in combat; they share the fleet HP pool
//
// This module is defensive about the exact shape of fitted_modules. It
// inspects module fields by name and pattern-matches against keywords,
// the same way weapons.js does. As real module metadata lands on the
// server, this can become stricter.

import { getShipWeapons } from './weapons';

// ============================================
// MODULE TYPE KEYWORDS
// ============================================

const SHIELD_KEYWORDS  = ['shield', 'deflector', 'barrier', 'screen'];
const ARMOR_KEYWORDS   = ['armor', 'plate', 'plating', 'hull_reinforce', 'ablative'];
const ENGINE_KEYWORDS  = ['engine', 'thruster', 'drive', 'propulsion', 'maneuver'];
const REACTOR_KEYWORDS = ['reactor', 'powerplant', 'core', 'capacitor'];
const CARGO_KEYWORDS   = ['cargo', 'hold', 'bay', 'storage'];
const ECM_KEYWORDS     = ['ecm', 'jammer', 'cloak', 'stealth', 'disruptor'];
const SENSOR_KEYWORDS  = ['sensor', 'scanner', 'radar', 'probe', 'targeting'];
const REPAIR_KEYWORDS  = ['repair', 'nanobot', 'patch', 'mender', 'medic'];

const matchesAny = (text, keywords) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
};

// Read all the name-like fields off a fitted module value (defensive
// about the unknown server-side shape).
const readModuleFields = (fittedValue) => {
  if (!fittedValue) return [];
  if (typeof fittedValue === 'string') return [fittedValue];
  const fields = [];
  if (fittedValue.item_id)         fields.push(fittedValue.item_id);
  if (fittedValue.name)            fields.push(fittedValue.name);
  if (fittedValue.module_id)       fields.push(fittedValue.module_id);
  if (fittedValue.type)            fields.push(fittedValue.type);
  if (fittedValue.module_name)     fields.push(fittedValue.module_name);
  if (fittedValue.item_data?.name)    fields.push(fittedValue.item_data.name);
  if (fittedValue.item_data?.item_id) fields.push(fittedValue.item_data.item_id);
  return fields;
};

// Quality multiplier (Q50 = 1.0×, Q100 = 2.0×, Q25 = 0.5×). Mirrors
// the same formula used in weapons.js so module quality matters
// uniformly across all stat contributions.
const getQualityMultiplier = (fittedValue) => {
  const stats = fittedValue?.stats || fittedValue?.item_data?.stats;
  if (!stats) return 1.0;
  const avg = ((stats.purity || 0) + (stats.stability || 0) +
               (stats.potency || 0) + (stats.density || 0)) / 4;
  if (avg <= 0) return 1.0;
  return Math.max(0.4, Math.min(2.5, avg / 50));
};

// ============================================
// MODULE BONUS TABLE
// ============================================
// Each detected module type contributes a fixed base bonus, scaled by
// quality. These are starter values — tune as needed.

const MODULE_BONUSES = {
  shield:  { shield: 40 },
  armor:   { armor: 25, mass: 8 },
  engine:  { speed: 15, maneuver: 10 },
  reactor: { shield: 15, repair: 0.5 },
  cargo:   { cargo: 50, mass: 4 },
  ecm:     { ecm: 20 },
  sensor:  { sensor_range: 50 },
  repair:  { repair: 1.5 },
};

// Detect the role of a fitted module by inspecting its name fields.
// Returns one of the bonus-table keys, or null if it can't be classified.
const detectModuleRole = (fittedValue) => {
  const fields = readModuleFields(fittedValue);
  for (const field of fields) {
    if (matchesAny(field, SHIELD_KEYWORDS))  return 'shield';
    if (matchesAny(field, ARMOR_KEYWORDS))   return 'armor';
    if (matchesAny(field, ENGINE_KEYWORDS))  return 'engine';
    if (matchesAny(field, REACTOR_KEYWORDS)) return 'reactor';
    if (matchesAny(field, CARGO_KEYWORDS))   return 'cargo';
    if (matchesAny(field, ECM_KEYWORDS))     return 'ecm';
    if (matchesAny(field, SENSOR_KEYWORDS))  return 'sensor';
    if (matchesAny(field, REPAIR_KEYWORDS))  return 'repair';
  }
  return null;
};

// ============================================
// PER-SHIP STAT EXTRACTION
// ============================================

// Read the base hull stats off a ship object. Falls back to sensible
// defaults so a brand-new player without server-provided fields doesn't
// end up with a zero-HP fleet.
const getShipBaseStats = (ship) => {
  const hullSize = ship?.hull_size || 30;
  return {
    hull:      ship?.base_hull      ?? Math.round(hullSize * 4),  // ~120 for size 30
    shield:    ship?.base_shield    ?? Math.round(hullSize * 1.6),// ~50  for size 30
    armor:     ship?.base_armor     ?? 0,
    speed:     ship?.base_speed     ?? 50,
    maneuver:  ship?.base_maneuver  ?? 50,
    cargo:     ship?.cargo_capacity ?? 100,
    warpSpeed: ship?.warp_speed     ?? 1.0,
    // Hull mass proxy: hull_size scaled. The design doc has explicit
    // hull_mass; we approximate from hull_size until that field exists.
    mass:      ship?.hull_mass      ?? Math.round(hullSize * 1.2),
  };
};

// Walk a ship's fitted modules and accumulate bonuses by stat.
const getShipModuleBonuses = (ship) => {
  const bonuses = {
    hull: 0, shield: 0, armor: 0, ecm: 0,
    speed: 0, maneuver: 0, cargo: 0,
    sensor_range: 0, repair: 0, mass: 0,
  };
  const slots = ship?.hull_slots || [];
  const fitted = ship?.fitted_modules || {};
  for (const slot of slots) {
    const fittedValue = fitted[slot.id];
    if (!fittedValue) continue;
    // Don't double-count weapons (they're handled by weapons.js)
    if (slot.type === 'weapon') continue;

    const role = detectModuleRole(fittedValue);
    if (!role) continue;
    const bonus = MODULE_BONUSES[role];
    if (!bonus) continue;
    const qMult = getQualityMultiplier(fittedValue);
    for (const [k, v] of Object.entries(bonus)) {
      bonuses[k] = (bonuses[k] || 0) + v * qMult;
    }
  }
  return bonuses;
};

// ============================================
// MAIN: aggregate the fleet
// ============================================

// Returns a stats object representing the entire fleet's collective
// combat capabilities. Pass in the array of fleet ships.
//
// Output shape:
//   {
//     // pools (collective)
//     totalHull, totalShield, totalArmor, totalECM,
//     // per-frame
//     repairRate,
//     // mobility (already mass-adjusted)
//     fleetSpeed, fleetManeuver, fleetWarpSpeed,
//     // logistics
//     totalCargo, totalSensorRange,
//     // damage (from weapons.js, broken down by type)
//     dpsLaser, dpsKinetic, dpsMissile, dpsTotal,
//     // raw mass (informational)
//     fleetMass,
//     // counts
//     shipCount, weaponCount,
//   }
export const computeFleetStats = (ships) => {
  const result = {
    totalHull: 0, totalShield: 0, totalArmor: 0, totalECM: 0,
    repairRate: 0,
    fleetSpeed: 50, fleetManeuver: 50, fleetWarpSpeed: 1.0,
    totalCargo: 0, totalSensorRange: 0,
    dpsLaser: 0, dpsKinetic: 0, dpsMissile: 0, dpsTotal: 0,
    fleetMass: 0,
    shipCount: 0, weaponCount: 0,
  };

  if (!ships || ships.length === 0) return result;

  // Sum base stats + module bonuses
  let speedSum = 0, maneuverSum = 0, warpSum = 0;
  for (const ship of ships) {
    const base = getShipBaseStats(ship);
    const mods = getShipModuleBonuses(ship);

    result.totalHull       += base.hull   + mods.hull;
    result.totalShield     += base.shield + mods.shield;
    result.totalArmor      += base.armor  + mods.armor;
    result.totalECM        += mods.ecm;
    result.repairRate      += mods.repair;
    result.totalCargo      += base.cargo  + mods.cargo;
    result.totalSensorRange += mods.sensor_range;
    result.fleetMass       += base.mass + mods.mass;

    speedSum    += base.speed    + mods.speed;
    maneuverSum += base.maneuver + mods.maneuver;
    warpSum     += base.warpSpeed;

    // Weapons (defer to weapons.js for breakdown)
    const weapons = getShipWeapons(ship);
    for (const w of weapons) {
      const dps = w.damage / w.fire_rate;
      result.dpsTotal += dps;
      if (w.type === 'laser')   result.dpsLaser   += dps;
      if (w.type === 'kinetic') result.dpsKinetic += dps;
      if (w.type === 'missile') result.dpsMissile += dps;
      result.weaponCount += 1;
    }

    result.shipCount += 1;
  }

  // Average speed/maneuver across the fleet, then apply mass penalty.
  // Per the locked design:
  //   speed   = base − (mass × 0.02)
  //   maneuver = base − (mass × 0.015)
  // The fleet moves at the speed of the SLOWEST common denominator,
  // so we average rather than sum.
  const n = result.shipCount;
  const avgSpeed    = speedSum / n;
  const avgManeuver = maneuverSum / n;
  const avgWarp     = warpSum / n;

  result.fleetSpeed    = Math.max(10, avgSpeed    - result.fleetMass * 0.02);
  result.fleetManeuver = Math.max(10, avgManeuver - result.fleetMass * 0.015);
  result.fleetWarpSpeed = avgWarp;

  // Round display values
  result.totalHull       = Math.round(result.totalHull);
  result.totalShield     = Math.round(result.totalShield);
  result.totalArmor      = Math.round(result.totalArmor);
  result.totalECM        = Math.round(result.totalECM);
  result.totalCargo      = Math.round(result.totalCargo);
  result.totalSensorRange = Math.round(result.totalSensorRange);
  result.fleetMass       = Math.round(result.fleetMass);
  result.fleetSpeed      = Math.round(result.fleetSpeed);
  result.fleetManeuver   = Math.round(result.fleetManeuver);
  result.fleetWarpSpeed  = Math.round(result.fleetWarpSpeed * 10) / 10;
  result.dpsLaser   = Math.round(result.dpsLaser);
  result.dpsKinetic = Math.round(result.dpsKinetic);
  result.dpsMissile = Math.round(result.dpsMissile);
  result.dpsTotal   = Math.round(result.dpsTotal);
  result.repairRate = Math.round(result.repairRate * 10) / 10;

  return result;
};
