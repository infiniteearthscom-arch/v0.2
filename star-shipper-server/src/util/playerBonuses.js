// Active bonus aggregation across a player's skills.
//
// Skills carry their bonus shape in skill_definitions.bonus_per_level
// JSONB. Each row is { type: 'fleet_damage_pct', value: 5 } meaning
// +5% per level (so L5 = +25%). This helper reads the player's actual
// skill levels and returns the summed bonus dictionary, e.g.:
//   { fleet_damage_pct: 25, mining_yield_pct: 10, sensor_range_pct: 15 }
//
// Used server-side by the mining endpoint to multiply yield. The
// client also exposes (via the /api/skills response) what's active so
// it can apply the parallel multipliers for combat damage + sensor
// range on the client side without a round trip.
//
// One row per type today (no stacking weirdness). When tier-2 modules
// or research add their own bonuses of the same type we'll sum them
// here.

import { queryAll } from '../db/index.js';

export async function getPlayerBonuses(userId) {
  const rows = await queryAll(`
    SELECT ps.level, sd.bonus_per_level
    FROM player_skills ps
    JOIN skill_definitions sd ON ps.skill_id = sd.id
    WHERE ps.user_id = $1 AND ps.level > 0
  `, [userId]);

  const out = {};
  for (const r of rows) {
    const b = r.bonus_per_level;
    if (!b || !b.type || typeof b.value !== 'number') continue;
    const total = b.value * r.level;
    out[b.type] = (out[b.type] || 0) + total;
  }
  return out;
}
