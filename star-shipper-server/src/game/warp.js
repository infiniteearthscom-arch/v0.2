// warp.js -- SERVER copy of the warp-range travel rules (Phase 3b, plan B9).
// ⚠ Tables + warpCheck MUST match star-shipper/src/utils/warp.js exactly.
// The client gates travel in the galaxy views; this validates every
// system entry in POST /galaxy/visit so a modified client can't skip
// the progression map.
//
//   drive class = fleet's weakest best-engine tier (0 = no engine)
//   free warp   = distance <= range(class) × (1 + jump_range_pct/100)
//                 AND target.regionTier <= class + 1
//   jump gate   = always allowed to a gate-connected system

import { generateGalaxy } from './galaxyGenerator.js';

export const WARP_RANGE_BY_CLASS = { 0: 600, 1: 800, 2: 1050, 3: 1350, 4: 1700, 5: 2100 };
export const MAX_TIER = 5;
export const maxFreeWarpTier = (driveClass) => Math.min(MAX_TIER, (driveClass || 0) + 1);
export const maxGateTier = (driveClass) => Math.min(MAX_TIER, (driveClass || 0) + 2);

const GALAXY_SEED = 12345;
const GALAXY_SYSTEM_COUNT = 200;
let _galaxyCache = null;
export const getGalaxy = () => {
  if (!_galaxyCache) _galaxyCache = generateGalaxy(GALAXY_SEED, GALAXY_SYSTEM_COUNT);
  return _galaxyCache;
};

// Fleet warp profile from the DB: every active non-pod ship's best
// engine tier (module_types.tier -- exact, unlike the client's id
// fallback) + the Jump Drive Calibration skill.
export async function getFleetWarpProfile(db, userId) {
  const ships = await db.query(
    `SELECT id, fitted_modules FROM ships
      WHERE user_id = $1 AND storage_body_id IS NULL AND hull_type_id <> 'pod'`,
    [userId]
  );
  const engineIds = new Set();
  for (const s of ships.rows) {
    for (const fv of Object.values(s.fitted_modules || {})) {
      if (fv?.module_type_id) engineIds.add(fv.module_type_id);
    }
  }
  const tiers = new Map();
  if (engineIds.size) {
    const rows = await db.query(
      `SELECT id, tier FROM module_types WHERE slot_type = 'engine' AND id = ANY($1::text[])`,
      [[...engineIds]]
    );
    for (const r of rows.rows) tiers.set(r.id, r.tier || 1);
  }
  let driveClass = ships.rows.length ? MAX_TIER : 0;
  for (const s of ships.rows) {
    let best = 0;
    for (const fv of Object.values(s.fitted_modules || {})) {
      const t = tiers.get(fv?.module_type_id);
      if (t) best = Math.max(best, t);
    }
    driveClass = Math.min(driveClass, best);
  }
  const skill = await db.query(
    `SELECT level FROM player_skills WHERE user_id = $1 AND skill_id = 'nav_jump_calibration'`,
    [userId]
  );
  const pct = (skill.rows[0]?.level || 0) * 5; // +5% / level (skill_definitions bonus_per_level)
  const range = Math.round((WARP_RANGE_BY_CLASS[driveClass] ?? WARP_RANGE_BY_CLASS[0]) * (1 + pct / 100));
  return { driveClass, range, maxTier: maxFreeWarpTier(driveClass), maxGateTier: maxGateTier(driveClass), jumpRangePct: pct };
}

export const isGateConnected = (origin, target) =>
  !!(origin?.hasJumpGate && target?.hasJumpGate && origin.jumpConnections?.includes(target.id));

export const galaxyDistance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

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
