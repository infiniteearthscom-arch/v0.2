// powerPips.js — Starfield-style fleet power allocation (combat P2a).
//
// The captain distributes a fleet-wide pool of power "pips" across five
// subsystems. Pool size scales with fitted reactors (P2a derives it from
// reactor COUNT in fleetStats; P2b will make it server-authoritative +
// quality-scaled). All effect math lives here so SystemView (engine) and
// the PowerPanel (UI) agree.
//
// MODEL: effects are normalized to "share" = pips / evenShare, where
// evenShare = pool/5. So an EVEN allocation (share 1.0 on everything) is
// exactly neutral == pre-pip behavior — players who ignore the panel are
// unaffected. Concentrating pips pushes one subsystem up while the others
// drop below 1.0. Per the locked design, weapons use a SOFT FLOOR: a
// starved weapon family still fires, just slowly (never fully offline).

export const PIP_SUBSYSTEMS = ['LAS', 'BAL', 'MIS', 'SHD', 'ENG'];

export const PIP_SUBSYSTEM_META = {
  LAS: { label: 'Lasers',  kind: 'weapon', color: '#ff4466' },
  BAL: { label: 'Ballistic', kind: 'weapon', color: '#fbbf24' },
  MIS: { label: 'Missiles', kind: 'weapon', color: '#22c55e' },
  SHD: { label: 'Shields', kind: 'defense', color: '#818cf8' },
  ENG: { label: 'Engines', kind: 'mobility', color: '#34d399' },
};

// Map a weapon descriptor's type to its pip subsystem.
export const WEAPON_PIP_KEY = { laser: 'LAS', kinetic: 'BAL', missile: 'MIS' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// share = 1.0 at even allocation (neutral). 0 = nothing here; >1 = boosted.
export const pipShare = (pips, pool) => {
  const even = (pool || 5) / PIP_SUBSYSTEMS.length;
  return even > 0 ? (pips || 0) / even : 0;
};

// --- Effect curves (tunable; neutral at share 1.0) ---
// Weapon fire-rate multiplier (>1 = faster cycle). SOFT FLOOR at 0.5×.
export const weaponFireMult  = (pips, pool) => clamp(0.5 + 0.5 * pipShare(pips, pool), 0.5, 2.0);
// Shield regen multiplier (applied to SHIELD_REGEN_RATE).
export const shieldRegenMult = (pips, pool) => clamp(0.4 + 0.6 * pipShare(pips, pool), 0.4, 2.2);
// Incoming-damage resist (0..0.30). Only kicks in ABOVE even allocation.
export const shieldResist    = (pips, pool) => clamp((pipShare(pips, pool) - 1) * 0.08, 0, 0.30);
// Engine top-speed multiplier (neutral 1.0, capped 1.5, floor 0.85).
export const engineSpeedMult = (pips, pool) => clamp(0.85 + 0.15 * pipShare(pips, pool), 0.85, 1.5);

export const allocTotal = (alloc) =>
  PIP_SUBSYSTEMS.reduce((s, k) => s + (alloc?.[k] || 0), 0);

// Even-ish default spread for a given pool (remainder lands on the first
// subsystems). Used to seed + to reconcile when the pool changes.
export const defaultAllocation = (pool) => {
  const n = PIP_SUBSYSTEMS.length;
  const total = Math.max(n, pool || n);
  const base = Math.floor(total / n);
  let rem = total - base * n;
  const a = {};
  for (const s of PIP_SUBSYSTEMS) { a[s] = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
  return a;
};

// Add one pip to `target`. If the pool isn't full, use a free pip;
// otherwise pull from the largest OTHER subsystem so the total stays
// pinned at `pool`. Returns a NEW allocation object.
export const addPip = (alloc, target, pool) => {
  const a = { ...alloc };
  if (allocTotal(a) < pool) { a[target] = (a[target] || 0) + 1; return a; }
  let donor = null, max = 0;
  for (const s of PIP_SUBSYSTEMS) {
    if (s !== target && (a[s] || 0) > max) { max = a[s]; donor = s; }
  }
  if (donor) { a[donor] -= 1; a[target] = (a[target] || 0) + 1; }
  return a;
};

export const removePip = (alloc, target) => {
  const a = { ...alloc };
  if ((a[target] || 0) > 0) a[target] -= 1;
  return a;
};
