// warp.js -- warp-range travel gating (combat redesign Phase 3b, plan B9).
//
// THE RULES (mirrored verbatim in star-shipper-server/src/game/warp.js --
// edit both or the server rejects legitimate jumps):
//
//   drive class  = the fleet's WEAKEST best-engine tier (a fleet warps
//                  together; the slowest drive sets the limit). No engine
//                  fitted on any active ship = class 0.
//   free warp    = flying through galaxy space from the system you left.
//                  Allowed to a target when BOTH:
//                    distance <= WARP_RANGE_BY_CLASS[class] × (1 + jump_range_pct/100)
//                    target.regionTier <= class + 1   ("one tier above your drive")
//   jump gate    = instant, always allowed to a gate-connected system.
//                  Gates only link systems whose tiers differ by <= 1
//                  (galaxyGenerator), so deep space is reached by
//                  chaining gates through frontier hubs -- the chokepoints.
//
// Skill: nav_jump_calibration (+5% jump range / level, bonus type
// `jump_range_pct`) stretches the free-warp ring.

export const WARP_RANGE_BY_CLASS = { 0: 600, 1: 800, 2: 1050, 3: 1350, 4: 1700, 5: 2100 };
export const MAX_TIER = 5;
// Free warp reaches one tier above your drive class; a jump gate reaches
// two ("the gate takes you one step deeper than you could fly").
export const maxFreeWarpTier = (driveClass) => Math.min(MAX_TIER, (driveClass || 0) + 1);
export const maxGateTier = (driveClass) => Math.min(MAX_TIER, (driveClass || 0) + 2);

// Engine module tier from a fitted slot value. fit-module snapshots
// `tier` since 2026-09-19; older fits fall back to the id convention
// (engine_basic=1, engine_advanced=2, engine_<name>_N=N).
export const engineTierFromFitted = (fv) => {
  if (!fv) return 0;
  if (Number.isFinite(fv.tier)) return fv.tier;
  const id = String(fv.module_type_id || fv.module_id || fv.item_id || '').toLowerCase();
  if (!id.startsWith('engine')) return 0;
  const m = id.match(/_(\d)$/);
  if (m) return Number(m[1]);
  if (id.includes('advanced')) return 2;
  return 1;
};

// Best engine tier on one ship (0 when no engine is fitted).
export const shipDriveClass = (ship) => {
  const fitted = ship?.fitted_modules || {};
  let best = 0;
  for (const slot of ship?.hull_slots || []) {
    if (slot.type !== 'engine') continue;
    best = Math.max(best, engineTierFromFitted(fitted[slot.id]));
  }
  if (best === 0) {
    // Ships without hull_slots in the payload: scan every fitted value.
    for (const fv of Object.values(fitted)) {
      const id = String(fv?.module_type_id || '').toLowerCase();
      if (id.startsWith('engine')) best = Math.max(best, engineTierFromFitted(fv));
    }
  }
  return best;
};

// ships: the store's ships array (stored ships excluded here).
// bonuses: gameStore.activeBonuses ({ jump_range_pct }).
export const fleetWarpProfile = (ships, bonuses = {}) => {
  const active = (ships || []).filter(s => s.storage_body_id == null && s.hull_type_id !== 'pod');
  let driveClass = active.length ? MAX_TIER : 0;
  let limitingShip = null;
  for (const s of active) {
    const c = shipDriveClass(s);
    if (c < driveClass) { driveClass = c; limitingShip = s; }
  }
  const pct = Number(bonuses?.jump_range_pct) || 0;
  const range = Math.round((WARP_RANGE_BY_CLASS[driveClass] ?? WARP_RANGE_BY_CLASS[0]) * (1 + pct / 100));
  return { driveClass, range, maxTier: maxFreeWarpTier(driveClass), maxGateTier: maxGateTier(driveClass), limitingShip, jumpRangePct: pct };
};

export const isGateConnected = (origin, target) =>
  !!(origin?.hasJumpGate && target?.hasJumpGate && origin.jumpConnections?.includes(target.id));

export const galaxyDistance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

// { ok, via: 'here'|'gate'|'warp'|null, reason: null|'range'|'tier', distance }
export const warpCheck = (origin, target, profile) => {
  if (!origin || !target) return { ok: false, via: null, reason: 'range', distance: Infinity };
  if (origin.id === target.id) return { ok: true, via: 'here', reason: null, distance: 0 };
  const distance = galaxyDistance(origin, target);
  const tier = target.regionTier ?? 1;
  if (isGateConnected(origin, target)) {
    if (tier > (profile.maxGateTier ?? maxGateTier(profile.driveClass))) {
      return { ok: false, via: 'gate', reason: 'tier', distance };
    }
    return { ok: true, via: 'gate', reason: null, distance };
  }
  if (tier > profile.maxTier) return { ok: false, via: null, reason: 'tier', distance };
  if (distance > profile.range) return { ok: false, via: null, reason: 'range', distance };
  return { ok: true, via: 'warp', reason: null, distance };
};

// Free-warp only (ignores gates): used by the galaxy-flight views, where
// the fleet is PHYSICALLY flying -- a gate-connected system is still
// only flyable if it sits inside the ring at an allowed tier. (Gates
// are instant jumps taken from inside the origin system.)
export const freeWarpCheck = (origin, target, profile) => {
  if (!origin || !target) return { ok: false, via: null, reason: 'range', distance: Infinity };
  if (origin.id === target.id) return { ok: true, via: 'here', reason: null, distance: 0 };
  const distance = galaxyDistance(origin, target);
  const tier = target.regionTier ?? 1;
  if (tier > profile.maxTier) return { ok: false, via: null, reason: 'tier', distance };
  if (distance > profile.range) return { ok: false, via: null, reason: 'range', distance };
  return { ok: true, via: 'warp', reason: null, distance };
};

// Player-facing explanation for a failed check.
export const warpBlockText = (check, target, profile) => {
  if (!check || check.ok) return null;
  const t = target?.regionTier ?? 1;
  if (check.reason === 'tier' && check.via === 'gate') {
    return `T${t} space needs drive class ${Math.max(1, t - 2)}+ to gate into (fleet is class ${profile.driveClass})`;
  }
  if (check.reason === 'tier') {
    return `T${t} space needs drive class ${Math.max(1, t - 1)}+ to warp into (fleet is class ${profile.driveClass}) — or reach it by jump gate`;
  }
  return `Out of warp range (${Math.round(check.distance)} / ${profile.range}) — fit a better drive or use jump gates`;
};
