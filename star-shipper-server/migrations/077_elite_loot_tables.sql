-- Migration 077: elite guaranteed drops (combat Phase 4b, 2026-09-21)
-- enemy_templates.loot_table (added empty in 069) is now read by
-- /combat/claim-loot: each entry rolls independently on salvage and the
-- module lands in cargo at the rolled quality.
--   [{ "module_type_id": ..., "chance": 0-1, "quality": [min, max] }]
-- Named elites always drop their signature module at high quality; the
-- T5 Titan has a modest chance at a T5 piece so T5 fleets stay worth
-- hunting after the admiral is down.

UPDATE enemy_templates SET loot_table = '[
  {"module_type_id":"weapon_torpedo_4", "chance":1.0, "quality":[70,85]},
  {"module_type_id":"armor_alloy_4",    "chance":0.5, "quality":[65,80]}
]'::jsonb WHERE id = 'reaver_dread_captain';

UPDATE enemy_templates SET loot_table = '[
  {"module_type_id":"weapon_lance_5",   "chance":1.0, "quality":[80,95]},
  {"module_type_id":"shield_void_5",    "chance":0.5, "quality":[75,90]},
  {"module_type_id":"engine_void_5",    "chance":0.35, "quality":[75,90]}
]'::jsonb WHERE id = 'reaver_admiral_vask';

UPDATE enemy_templates SET loot_table = '[
  {"module_type_id":"weapon_driver_5",  "chance":0.15, "quality":[60,80]}
]'::jsonb WHERE id = 'reaver_titan';
