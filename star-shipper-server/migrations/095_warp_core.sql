-- 095: Warp Core + travel skills (docs/jump-gates-spec.md §6-§7, 2026-10-07).
--
-- Free galaxy flight now requires a Warp Core fitted anywhere in the active
-- fleet (the pod always counts as having one). The module is CRAFT-ONLY
-- outside island regions (buy_price NULL); island stations sell it at the
-- prohibitive ISLAND_CORE_PRICE in code (api/fitting.js /buy-module).
-- Code is safe before this runs: the server probes module_types for the
-- row and treats warp as ungated until it exists (fit_gates.warp_core.live).
--
-- Also: Warp Theory stops being a placeholder; the two "Warp Drive
-- Operation" skill rows become Fleet Alignment (-8 % align time / level)
-- and Warp Core Tuning (+4 % free-warp range / level).

-- 1. Module (three rows, pitfall #19)
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('utility_warp_core_3', 'Warp Core', 'utility', 3,
   'Folds subspace for free galaxy flight. One fitted anywhere in the active fleet lets the fleet leave a system by its warp point instead of a gate lane; range follows the fleet''s drive class. Craft-only; island stations sell it at a steep price.',
   '{"warp_core":true}'::jsonb, NULL, 'tech_warp_theory')
ON CONFLICT (id) DO NOTHING;

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_warp_core_3', 'Warp Core', 'Enables free galaxy flight for the whole active fleet. Fits a utility slot.', 'module', '🌀', 5, '{"slot_type":"utility"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech, station_required) VALUES
  ('craft_utility_warp_core_3', 'Warp Core', 'Assemble a subspace fold core.', 'utility_warp_core_3', 1,
   '[{"resource_name":"Titanium Ingot","quantity":8},{"resource_name":"Lattice Processor","quantity":2},{"resource_name":"Energy Cell","quantity":4},{"resource_name":"Plasma","quantity":6}]'::jsonb,
   'module', 'tech_warp_theory', 'base_fabricator')
ON CONFLICT (id) DO NOTHING;

-- 2. Warp Theory becomes a real unlock
UPDATE tech_definitions
   SET description = 'Subspace folding fundamentals. Unlocks the Warp Core (T3 utility): free galaxy flight for the whole fleet, no gate lane needed.',
       unlocks = '{"modules":["utility_warp_core_3"]}'::jsonb
 WHERE id = 'tech_warp_theory';

-- 3. Travel skills (text + bonus rewrites; same ids, no SP change)
UPDATE skill_definitions
   SET name = 'Fleet Alignment',
       description = 'Gate approach drill. -8% fleet alignment time per level (the wait before a jump-gate jump).',
       bonus_per_level = '{"type":"align_time_pct","value":-8}'::jsonb
 WHERE id = 'nav_warp_drive';

UPDATE skill_definitions
   SET name = 'Warp Core Tuning',
       description = 'Fold-field tuning. +4% free-warp range per level (stacks with Jump Drive Calibration).',
       bonus_per_level = '{"type":"jump_range_pct","value":4}'::jsonb
 WHERE id = 'nav_warp_efficiency';
