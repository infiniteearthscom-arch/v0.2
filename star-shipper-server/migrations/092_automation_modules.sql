-- 092: Endgame mining automation -- three modules (2026-09-27).
--
--   Station-Keeping Array   (utility T2)  orbit_lock : hold the fleet in orbit around a body
--   Autonomous Survey Array (utility T4)  auto_scan  : area-scan every unscanned rock in range on its own
--   Autonomous Mining Array (mining  T5)  auto_mine  : assigns every idle laser in the fleet to the nearest
--                                                       scanned rock in reach, re-targets on depletion
-- Lock into orbit beside a belt, and the fleet surveys and mines it by itself.
-- Behaviour is client-side (SystemView automation tick); the server only
-- validates the fits and the existing scan / mine endpoints as before.
-- T4/T5 are craft-only at their benches (processed materials, pitfall #19 rows).

INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('utility_orbit_lock', 'Station-Keeping Array', 'utility', 2,
   'Holds the whole fleet in orbit around the nearest planet, moon or station, riding along with it. Any thrust input releases the lock. Hotbar ability.',
   '{"orbit_lock":true,"lock_range":400}'::jsonb, 4500, NULL),
  ('utility_auto_survey', 'Autonomous Survey Array', 'utility', 4,
   'A survey computer that runs the scanners for you: every unscanned asteroid in scan range is area-scanned automatically, over and over. Also a full area-scan sensor in its own right.',
   '{"sensor_range":1000,"scan_range":260,"scan_time":3,"area_scan":true,"auto_scan":true}'::jsonb, NULL, 'tech_auto_survey'),
  ('mining_auto_5', 'Autonomous Mining Array', 'mining', 5,
   'The endgame mining beam. Picks its own targets and coordinates every other laser in the fleet: idle lasers lock the nearest scanned rock in reach and move on when it is mined out. Pauses when cargo is full.',
   '{"mine_yield":24,"mine_cycle":1.4,"mine_range":220,"auto_mine":true}'::jsonb, NULL, 'tech_auto_mining')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slot_type = EXCLUDED.slot_type, tier = EXCLUDED.tier, description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech;

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_orbit_lock',  'Station-Keeping Array',   'Utility module: hold the fleet in orbit around a body.',            'module', '⚓', 5, '{"slot_type":"utility"}'),
  ('utility_auto_survey', 'Autonomous Survey Array', 'Utility module: scans every asteroid in range automatically.',      'module', '📡', 5, '{"slot_type":"utility"}'),
  ('mining_auto_5',       'Autonomous Mining Array', 'Mining module: self-targeting beam that coordinates the fleet.',    'module', '⛏️', 5, '{"slot_type":"mining"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category, item_data_defaults = EXCLUDED.item_data_defaults;

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech, station_required) VALUES
  ('craft_utility_orbit_lock', 'Station-Keeping Array', 'Assemble a station-keeping thruster array.', 'utility_orbit_lock', 1,
   '[{"resource_name":"Titanium Ingot","quantity":6},{"resource_name":"Printed Board","quantity":2},{"resource_name":"Xenon Propellant","quantity":4}]'::jsonb, 'module', NULL, 'base_machine_shop'),
  ('craft_utility_auto_survey', 'Autonomous Survey Array', 'Assemble an autonomous survey computer.', 'utility_auto_survey', 1,
   '[{"resource_name":"Lattice Processor","quantity":4},{"resource_name":"Energy Cell","quantity":6},{"resource_name":"Smart Actuator","quantity":2},{"resource_name":"Dark Capacitor","quantity":1}]'::jsonb, 'module', 'tech_auto_survey', 'base_nano_assembler'),
  ('craft_mining_auto_5', 'Autonomous Mining Array', 'Assemble the autonomous mining array.', 'mining_auto_5', 1,
   '[{"resource_name":"Void-Tempered Alloy","quantity":3},{"resource_name":"Quantum Board","quantity":2},{"resource_name":"Smart Actuator","quantity":4},{"resource_name":"Crystite Lattice","quantity":10}]'::jsonb, 'module', 'tech_auto_mining', 'base_quantum_forge')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, ingredients = EXCLUDED.ingredients, requires_tech = EXCLUDED.requires_tech, station_required = EXCLUDED.station_required;

INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_auto_survey', 'society', 4, 'Autonomous Surveying',
   'Unlocks the Autonomous Survey Array: the fleet area-scans every asteroid in range on its own. Crafted at a Nano-Assembler.',
   6000, '["tech_sensor_grid"]', '{"modules":["utility_auto_survey"]}', 70),
  ('tech_auto_mining', 'industry', 4, 'Autonomous Mining',
   'Unlocks the Autonomous Mining Array: a self-targeting T5 beam that coordinates every laser in the fleet. Crafted at a Quantum Forge.',
   9000, '["tech_deep_extraction"]', '{"modules":["mining_auto_5"]}', 416)
ON CONFLICT (id) DO UPDATE SET tree = EXCLUDED.tree, tier = EXCLUDED.tier, name = EXCLUDED.name, description = EXCLUDED.description, rp_cost = EXCLUDED.rp_cost, prerequisites = EXCLUDED.prerequisites, unlocks = EXCLUDED.unlocks, sort_order = EXCLUDED.sort_order;
