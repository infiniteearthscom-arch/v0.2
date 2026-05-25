-- Migration 053: wire actual obtain paths for the T2+ scanners + the
-- gating scaffolding so research / skill nodes can ACTUALLY block
-- buying / crafting (not just visually unlock a tree node).
-- ============================================
-- The bug: migrations 031 + 050 added the T2/T2.5/T3/sweep scanner
-- modules + their research nodes, but never set buy_price and never
-- added crafting recipes. So researching Sensor Refinement "unlocked"
-- the Advanced Sensor Suite cosmetically but the player could not
-- actually obtain one anywhere.
--
-- This migration:
--   1. Adds `requires_tech` (nullable VARCHAR) to module_types and to
--      crafting_recipes -- the canonical gate. Server's /buy-module
--      and /craft check player_research before allowing the action.
--      NULL = no gate (everything that exists today is buyable/craftable
--      with no research, matches current behavior).
--   2. Sets buy_price on the 5 higher-tier scanners (escalating cost
--      so the player has a real credit sink even after research is
--      done -- T2=5k, T2.5=10k, sweep=20k, T3=25k).
--   3. Adds 5 new crafting recipes for the same modules (escalating
--      Titanium / Crystite / Uranium ingredients).
--   4. Sets requires_tech on all 5 modules AND their recipes so the
--      server enforces the gate from both directions.
--
-- After this migration the obtain ladder reads end-to-end:
--   research tech -> buy at vendor (5k+) OR craft (ingredients) -> fit.
-- Future "craftable-only" modules can have buy_price = NULL + a
-- requires_tech recipe; the vendor will skip them, the crafting window
-- will show them, and the gate enforces "you need this research."
-- ============================================

-- 1. Schema: gating column on both tables ----------------------------
ALTER TABLE module_types     ADD COLUMN IF NOT EXISTS requires_tech VARCHAR(64);
ALTER TABLE crafting_recipes ADD COLUMN IF NOT EXISTS requires_tech VARCHAR(64);

-- 2. Set buy_price + requires_tech on the 5 higher-tier scanners -----
UPDATE module_types SET buy_price =  5000, requires_tech = 'tech_sensor_refine'     WHERE id = 'utility_scanner_adv';
UPDATE module_types SET buy_price = 10000, requires_tech = 'tech_sensor_array'      WHERE id = 'utility_scanner_area';
UPDATE module_types SET buy_price = 25000, requires_tech = 'tech_sensor_grid'       WHERE id = 'utility_scanner_elite';
UPDATE module_types SET buy_price = 20000, requires_tech = 'tech_system_telemetry'  WHERE id = 'utility_systemscan';

-- 3. Crafting recipes for the 5 (escalating ingredient cost) ---------
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_utility_scanner_adv',
   'Advanced Sensor Suite',
   'Higher-tier scanner. Requires Sensor Refinement research.',
   'utility_scanner_adv', 1,
   '[{"resource_name":"Copper","quantity":20},{"resource_name":"Crystite","quantity":10},{"resource_name":"Titanium","quantity":5}]'::jsonb,
   'module',
   'tech_sensor_refine'),
  ('craft_utility_scanner_area',
   'Wide-Field Sensor Array',
   'Mid-tier area scanner. Requires Sensor Array Networking research.',
   'utility_scanner_area', 1,
   '[{"resource_name":"Copper","quantity":35},{"resource_name":"Crystite","quantity":20},{"resource_name":"Titanium","quantity":15}]'::jsonb,
   'module',
   'tech_sensor_array'),
  ('craft_utility_scanner_elite',
   'Elite Survey Grid',
   'Top-tier scanner with bulk-belt scan. Requires Sensor Grid Mastery research.',
   'utility_scanner_elite', 1,
   '[{"resource_name":"Titanium","quantity":40},{"resource_name":"Crystite","quantity":30},{"resource_name":"Uranium","quantity":5}]'::jsonb,
   'module',
   'tech_sensor_grid'),
  ('craft_utility_systemscan',
   'System Telemetry Array',
   'Active sensor sweep ability. Requires System Telemetry research.',
   'utility_systemscan', 1,
   '[{"resource_name":"Titanium","quantity":30},{"resource_name":"Crystite","quantity":40},{"resource_name":"Uranium","quantity":3}]'::jsonb,
   'module',
   'tech_system_telemetry')
ON CONFLICT (id) DO UPDATE SET
  description    = EXCLUDED.description,
  ingredients    = EXCLUDED.ingredients,
  requires_tech  = EXCLUDED.requires_tech;
