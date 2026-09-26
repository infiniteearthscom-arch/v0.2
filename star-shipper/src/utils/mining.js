// mining.js -- mining laser reach (2026-09-25).
//
// Range = the laser's mine_range stat x sqrt(quality) x (1 + Beam Focusing
// skill %). Fleet-wide best laser wins (pitfall #15: a wingman's laser
// reaches for the whole fleet). The server applies the same formula in
// /resources/asteroids/mine, so keep the two in step.
//
// Older fits made before module stats were snapshotted onto the slot
// carry no `stats`; RANGE_BY_ID mirrors module_types.stats.mine_range
// for those.
import { qualityMultiplier } from '@/utils/quality';

export const MINE_RANGE_DEFAULT = 120;
const RANGE_BY_ID = { mining_basic: 120, mining_laser_2: 150, mining_laser_3: 170 };

export const isMiningLaserId = (id) => !!id && (id === 'mining_basic' || String(id).startsWith('mining_'));

export function laserMineRange(slot, bonuses) {
  const base = Number(slot?.stats?.mine_range) || RANGE_BY_ID[slot?.module_type_id] || MINE_RANGE_DEFAULT;
  const pct = Number(bonuses?.mining_range_pct) || 0;
  return Math.round(base * qualityMultiplier(slot, { power: 0.5 }) * (1 + pct / 100));
}

// Best reach across every flying ship's fitted lasers. Falls back to the
// basic laser's range when nothing is fitted so callers never divide by 0.
export function getFleetMineRange(ships, bonuses) {
  let best = 0;
  for (const s of ships || []) {
    if (s?.storage_body_id != null) continue;
    for (const slot of Object.values(s?.fitted_modules || {})) {
      if (isMiningLaserId(slot?.module_type_id)) best = Math.max(best, laserMineRange(slot, bonuses));
    }
  }
  return best || MINE_RANGE_DEFAULT;
}
