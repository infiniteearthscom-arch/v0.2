-- Migration 072: harvester slots on procedural planets (2026-09-19)
-- Player report: "none of the other systems I explored had planets that
-- could accept harvesters." Cause: /ensure-body inserted procedural
-- bodies without harvester_slots (NULL → 0 slots). Migration 011 only
-- backfilled the Sol rows that existed at the time. ensure-body now sets
-- harvester_slots = deposit_slots (one harvester per deposit); this
-- backfills every body created since.

UPDATE celestial_bodies
   SET harvester_slots = COALESCE(deposit_slots, CASE WHEN size > 50 THEN 6 WHEN size > 25 THEN 4 ELSE 3 END)
 WHERE harvester_slots IS NULL
   AND body_type NOT IN ('station', 'jump_gate', 'warp_point', 'star');

UPDATE celestial_bodies
   SET harvester_slots = 0
 WHERE harvester_slots IS NULL;
