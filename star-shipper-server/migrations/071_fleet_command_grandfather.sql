-- Migration 071: Phase 3 capability gating — Fleet Command grandfather (2026-09-18)
-- Active fleet cap is now 2 + level(cmd_fleet_command), max 5 (was a flat 5).
-- Anyone already flying more than 2 non-pod ships gets the skill granted at
-- the level that covers their current fleet, so nobody loses a ship.
-- SP values are the server's cumulative spAtLevel for rank 4:
--   L1 = round(250 * 4)          = 1000
--   L2 = L1 + round(250*5.66*4)  = 6660
--   L3 = L2 + round(250*32.0356*4) = 38696
-- Module tier gates + hull class gates need no data change (config lives
-- in src/game/fitGates.js); already-fitted modules / owned hulls are
-- grandfathered by only checking at fit / buy time.

INSERT INTO player_skills (user_id, skill_id, sp, level)
SELECT f.user_id,
       'cmd_fleet_command',
       CASE f.lvl WHEN 1 THEN 1000 WHEN 2 THEN 6660 ELSE 38696 END,
       f.lvl
  FROM (
    SELECT user_id, LEAST(3, COUNT(*) - 2)::int AS lvl
      FROM ships
     WHERE storage_body_id IS NULL AND hull_type_id <> 'pod'
     GROUP BY user_id
    HAVING COUNT(*) > 2
  ) f
ON CONFLICT (user_id, skill_id) DO UPDATE
   SET level = GREATEST(player_skills.level, EXCLUDED.level),
       sp    = GREATEST(player_skills.sp,    EXCLUDED.sp);
