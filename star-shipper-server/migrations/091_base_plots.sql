-- 091: Base plots -- 8 per area, +1 per area per Command Center Upgrades level (2026-09-27).
--
-- Text only. Plot counts are code (game/foundryTree.js BASE_TIERS,
-- api/bases.js plotLayout). Slot keys are stable: b1..b40 are the base
-- plots (8 per area x 5 areas), b41..b65 the skill bonus plots (5 per area).
-- Existing fitted buildings keep their keys; an old tier-2 base's b5..b8
-- now show in area 1 (it has 8 plots) -- nothing is lost.

UPDATE tech_definitions SET description = 'Upgrade bases to Outpost and Station tiers (16 and 24 plots).' WHERE id = 'tech_base_expansion';
UPDATE tech_definitions SET description = 'Upgrade bases to Hub and Citadel tiers (32 and 40 plots).' WHERE id = 'tech_base_citadel';
UPDATE skill_definitions SET description = 'Base command. Level 1 lets you build a base; each level adds +1 plot to every base area and +1 harvester slot per planet.' WHERE id = 'pln_cc_upgrades';
