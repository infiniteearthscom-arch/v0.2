// quality.js -- single source of truth for module quality math (client).
// Mirror of star-shipper-server/src/lib/quality.js. See that file for
// the full conventions doc.
//
// Crafted module instances carry `.quality = {purity, stability,
// potency, density}` (0-100, q50 baseline). This helper turns that into
// a multiplier so weapons.js / fleetStats.js / future stat aggregators
// all apply quality the same way.

export const qualityMultiplier = (fittedValue, opts = {}) => {
  const q = fittedValue?.quality || fittedValue?.item_data?.quality;
  if (!q) return 1.0;
  const avg = ((q.purity || 0) + (q.stability || 0) +
               (q.potency || 0) + (q.density || 0)) / 4;
  if (avg <= 0) return 1.0;
  let mult = avg / 50;
  if (opts.power && opts.power !== 1) mult = Math.pow(mult, opts.power);
  mult = Math.max(0.4, Math.min(2.5, mult));
  if (opts.invert) mult = 1 / mult;
  return mult;
};

export const qualityAverage = (fittedValue) => {
  const q = fittedValue?.quality || fittedValue?.item_data?.quality;
  if (!q) return null;
  return ((q.purity || 0) + (q.stability || 0) +
          (q.potency || 0) + (q.density || 0)) / 4;
};

// ============================================
// STAT META -- per-key scaling rules + display formatting.
// Used by ShipBuilderWindow's per-slot effective-stats panel AND the
// CraftingWindow output projection, so what the player sees in the
// preview matches what they see in fitting matches what combat does.
// Mirrors the scaling in weapons.js + recalcShipStats:
//   power: 1.0   -> linear x Q
//   power: 0.5   -> sqrt(Q) (soft scaling for range/maneuver)
//   invert: true -> "less is better" (cycle/lock/scan times divide)
// Unknown keys fall through to {power:1, invert:false}.
// ============================================
export const STAT_META = {
  // Linear "more is better"
  damage:           { label: 'Damage',          power: 1 },
  shield_hp:        { label: 'Shield HP',       power: 1 },
  cargo_capacity:   { label: 'Cargo',           power: 1 },
  thrust:           { label: 'Thrust',          power: 1 },
  speed:            { label: 'Speed',           power: 1 },
  sensor_range:     { label: 'Sensor Range',    power: 1 },
  mine_yield:       { label: 'Mining Yield',    power: 1 },
  ammo_capacity:    { label: 'Ammo Capacity',   power: 1, integer: true },
  harvest_rate:     { label: 'Harvest Rate',    power: 1, unit: '/hr' },
  storage_capacity: { label: 'Storage',         power: 1, integer: true },
  fuel_hours:       { label: 'Duration',        power: 1, decimals: 1, unit: 'h' },
  // Soft (sqrt) -- big bonuses don't double range
  range:            { label: 'Range',           power: 0.5 },
  maneuver:         { label: 'Maneuver',        power: 0.5 },
  // Inverted (lower is better)
  fire_rate:        { label: 'Cycle Time',      power: 0.5, invert: true, unit: 's', decimals: 2 },
  lock_time:        { label: 'Lock Time',       power: 1,   invert: true, unit: 's', decimals: 2 },
  scan_time:        { label: 'Scan Time',       power: 1,   invert: true, unit: 's', decimals: 1 },
};

// Format a stat value for display. Honors integer / decimals / unit
// hints from STAT_META; falls back to "integer for >=10, 1dp under."
export const fmtStatValue = (val, meta) => {
  if (val == null) return '—';
  if (meta?.integer) return `${Math.round(val)}${meta?.unit || ''}`;
  if (meta?.decimals != null) return `${val.toFixed(meta.decimals)}${meta?.unit || ''}`;
  if (Math.abs(val) >= 10) return `${Math.round(val)}${meta?.unit || ''}`;
  return `${val.toFixed(1)}${meta?.unit || ''}`;
};

// Color a stat-modifier badge by whether the effective value is BETTER
// than the base, accounting for inverted (less-is-better) stats.
//   #4ade80 green-400 -- better
//   #f87171 red-400 -- worse
//   #94a3b8 slate-400 -- equal (return value also signals "show no badge")
export const statModifierColor = (scaled, base, meta) => {
  if (Math.abs(scaled - base) < 0.005) return '#94a3b8';
  const better = meta?.invert ? scaled < base : scaled > base;
  return better ? '#4ade80' : '#f87171';
};
