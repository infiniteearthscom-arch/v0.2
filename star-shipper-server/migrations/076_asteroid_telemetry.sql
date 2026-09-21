-- Migration 076: Asteroid telemetry scanners (2026-09-20)
-- Owner design: telemetry decides which asteroids APPEAR in the System
-- Map's Bodies list (click-to-fly like planets); SCANNING still decides
-- what you know about them (quality / minerals stay scan-gated at the
-- data layer -- /resources/asteroids only sends contents for rocks THIS
-- player has scanned). The two endgame scanners pair: the telemetry grid
-- tells you where to go, the survey grid scans the belt when you arrive.
--
--   T2 utility_ast_telemetry       tier 1: lists rocks you've scanned (quality + distance)
--   T3 utility_ast_telemetry_deep  tier 2: + every rock inside fleet sensor range,
--                                          minerals column for scanned rocks
--   T4 utility_ast_telemetry_grid  tier 3: every rock in the system, sort/filter by mineral
--
-- Gates: research (Astrometrics/"society" tree off Sensor Array
-- Networking), the Survey skill for fitting (tier-1 rule, see
-- src/game/fitGates.js), T3+ craft-only per the tier convention.

INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech)
VALUES
  ('utility_ast_telemetry', 'Asteroid Telemetry Array', 'utility', 2,
   'Catalogues every asteroid your fleet has scanned in the current system and lists them in the System Map with quality and distance. Click a rock to fly to it.',
   '{"telemetry_tier":1}'::jsonb, 6000, 'tech_ast_telemetry'),
  ('utility_ast_telemetry_deep', 'Deep Telemetry Array', 'utility', 3,
   'Extends telemetry to every asteroid inside the fleet''s sensor range, scanned or not, and shows the minerals of scanned rocks. Unscanned rocks still need a scan before mining.',
   '{"telemetry_tier":2}'::jsonb, NULL, 'tech_ast_telemetry_deep'),
  ('utility_ast_telemetry_grid', 'Systemwide Telemetry Grid', 'utility', 4,
   'System-wide asteroid catalogue: every rock in the system, sortable and filterable by mineral. Pair it with the Elite Survey Grid to scan a belt the moment you arrive.',
   '{"telemetry_tier":3}'::jsonb, NULL, 'tech_ast_telemetry_grid')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, stats = EXCLUDED.stats,
  buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech;

-- Research: chained off Sensor Array Networking. Costs follow the 068
-- ladder's sensor side-branch scaling (T2 400 / T3 900) and the T4 tier
-- cost with an exotic material toll (plan B6).
INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_ast_telemetry', 'society', 2, 'Asteroid Telemetry',
   'Catalogue scanned asteroids on the System Map. Unlocks the Asteroid Telemetry Array.',
   400, '["tech_sensor_array"]', '{"modules":["utility_ast_telemetry"]}', 533),
  ('tech_ast_telemetry_deep', 'society', 3, 'Deep Telemetry',
   'Passive asteroid detection across the fleet''s full sensor range. Unlocks the Deep Telemetry Array.',
   900, '["tech_ast_telemetry"]', '{"modules":["utility_ast_telemetry_deep"]}', 534),
  ('tech_ast_telemetry_grid', 'society', 4, 'Systemwide Telemetry',
   'System-wide asteroid cataloguing with mineral indexing. Unlocks the Systemwide Telemetry Grid.',
   15000, '["tech_ast_telemetry_deep"]', '{"modules":["utility_ast_telemetry_grid"]}', 535)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description, rp_cost = EXCLUDED.rp_cost,
  prerequisites = EXCLUDED.prerequisites, unlocks = EXCLUDED.unlocks, sort_order = EXCLUDED.sort_order;

UPDATE tech_definitions SET material_cost = '[{"resource_name":"Crystite","quantity":10}]' WHERE id = 'tech_ast_telemetry_deep';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Quantum Dust","quantity":4},{"resource_name":"Crystite","quantity":20}]' WHERE id = 'tech_ast_telemetry_grid';

-- Cargo item definitions. Every module needs a row here too: the
-- inventory JOINs item_definitions (slot_type from item_data_defaults
-- drives the Fittable Modules pane) and crafting_recipes.output_item_id
-- FKs it. First run of this file failed on that FK. Also backfills the
-- Repair Nanite Hive from 075, which had the same gap.
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_repair_nanites',    'Repair Nanite Hive',        'Out-of-combat fleet hull/armor repair. Fits a utility slot.', 'module', '⚕️', 5, '{"slot_type":"utility"}'),
  ('utility_ast_telemetry',     'Asteroid Telemetry Array',  'Lists scanned asteroids in the System Map. Fits a utility slot.', 'module', '📡', 5, '{"slot_type":"utility"}'),
  ('utility_ast_telemetry_deep','Deep Telemetry Array',      'Lists every asteroid in sensor range. Fits a utility slot.', 'module', '📡', 5, '{"slot_type":"utility"}'),
  ('utility_ast_telemetry_grid','Systemwide Telemetry Grid', 'Lists every asteroid in the system. Fits a utility slot.', 'module', '📡', 5, '{"slot_type":"utility"}')
ON CONFLICT (id) DO NOTHING;

-- Recipes: T2 is also craftable; T3/T4 craft-only.
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_ast_telemetry', 'Asteroid Telemetry Array', 'Assemble a telemetry array from sensor components.', 'utility_ast_telemetry', 1,
   '[{"resource_name":"Copper","quantity":25},{"resource_name":"Iron","quantity":30}]'::jsonb, 'module', 'tech_ast_telemetry'),
  ('craft_ast_telemetry_deep', 'Deep Telemetry Array', 'Assemble a deep-range telemetry array.', 'utility_ast_telemetry_deep', 1,
   '[{"resource_name":"Copper","quantity":30},{"resource_name":"Crystite","quantity":10},{"resource_name":"Titanium","quantity":10}]'::jsonb, 'module', 'tech_ast_telemetry_deep'),
  ('craft_ast_telemetry_grid', 'Systemwide Telemetry Grid', 'Assemble a system-wide telemetry grid.', 'utility_ast_telemetry_grid', 1,
   '[{"resource_name":"Quantum Dust","quantity":3},{"resource_name":"Crystite","quantity":20},{"resource_name":"Titanium","quantity":20}]'::jsonb, 'module', 'tech_ast_telemetry_grid')
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description, ingredients = EXCLUDED.ingredients, requires_tech = EXCLUDED.requires_tech;
