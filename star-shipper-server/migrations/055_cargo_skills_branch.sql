-- Migration 055: Cargo skills + bulk cargo module, locked behind a new
-- Industry research subbranch.
-- ============================================
-- What this adds:
--   1. `tech_bulk_process` (Industry T2) flips from placeholder to
--      actually unlocking the new Bulk Cargo Bay module + recipe.
--   2. Two NEW Industry research nodes branching off `tech_adv_mining`:
--        - `tech_cargo_handling`   (T2) -> unlocks ind_cargo_handling skill
--        - `tech_cargo_compression`(T3, prereq cargo_handling)
--                                       -> unlocks log_cargo_compression skill
--   3. `cargo_large_2` Bulk Cargo Bay module (T3 cargo slot, 500 cap,
--      requires tech_bulk_process) + buy + craft entries.
--   4. New gating column `requires_tech` on `skill_definitions`. NULL =
--      no gate (every existing skill). Two new skills below set it so
--      they can't be trained until the corresponding tech is researched.
--   5. Two skills, both wired contracts (the bonuses get read at cargo
--      read-time so training propagates instantly):
--        - ind_cargo_handling     Industry rank 4, +3%/lvl cargo_capacity_pct
--        - log_cargo_compression  Logistics rank 4, -2%/lvl cargo_volume_pct
-- ============================================

-- 1. Schema -----------------------------------------------------------
ALTER TABLE skill_definitions ADD COLUMN IF NOT EXISTS requires_tech VARCHAR(64);

-- 2. Bulk Cargo Bay module + recipe ----------------------------------
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, recipe, requires_tech) VALUES
  ('cargo_large_2',
   'Bulk Cargo Bay',
   'cargo',
   3,
   'Industrial-grade modular cargo bay. Requires Bulk Processing research.',
   '{"cargo_capacity":500}'::jsonb,
   6000,
   NULL,
   'tech_bulk_process')
ON CONFLICT (id) DO UPDATE SET
  name          = EXCLUDED.name,
  description   = EXCLUDED.description,
  stats         = EXCLUDED.stats,
  buy_price     = EXCLUDED.buy_price,
  tier          = EXCLUDED.tier,
  requires_tech = EXCLUDED.requires_tech;

-- Item definition (required by crafting_recipes.output_item_id FK and
-- by the inventory system to render the module as a cargo item).
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('cargo_large_2', 'Bulk Cargo Bay', 'Industrial-grade modular cargo bay. Requires Bulk Processing research.',
   'module', '📦', 5, '{"slot_type":"cargo"}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  item_data_defaults = EXCLUDED.item_data_defaults;

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_cargo_large_2',
   'Bulk Cargo Bay',
   'Industrial-grade modular cargo bay. Requires Bulk Processing research.',
   'cargo_large_2', 1,
   '[{"resource_name":"Titanium","quantity":30},{"resource_name":"Iron","quantity":40},{"resource_name":"Copper","quantity":15}]'::jsonb,
   'module',
   'tech_bulk_process')
ON CONFLICT (id) DO UPDATE SET
  description    = EXCLUDED.description,
  ingredients    = EXCLUDED.ingredients,
  requires_tech  = EXCLUDED.requires_tech;

-- 3. Re-point tech_bulk_process unlock JSON to the new module --------
-- (Was placeholder=true; now actually unlocks the Bulk Cargo Bay.)
UPDATE tech_definitions
   SET description = 'High-capacity cargo bay design. Unlocks the Bulk Cargo Bay module (T3 cargo, 500 capacity).',
       unlocks     = '{"modules":["cargo_large_2"]}'::jsonb
 WHERE id = 'tech_bulk_process';

-- 4. New Industry research subbranch ---------------------------------
INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_cargo_handling',
   'industry', 2,
   'Cargo Handling',
   'Standardized stowage + loadmaster training. Unlocks the Cargo Handling skill (+3% fleet cargo capacity per level).',
   600,
   '["tech_adv_mining"]'::jsonb,
   '{"skills":["ind_cargo_handling"]}'::jsonb,
   411),
  ('tech_cargo_compression',
   'industry', 3,
   'Cargo Compression',
   'Compressed-state material handling. Unlocks the Cargo Compression skill (-2% cargo volume per level, applies to all stacks).',
   1800,
   '["tech_cargo_handling"]'::jsonb,
   '{"skills":["log_cargo_compression"]}'::jsonb,
   412)
ON CONFLICT (id) DO UPDATE SET
  description   = EXCLUDED.description,
  rp_cost       = EXCLUDED.rp_cost,
  prerequisites = EXCLUDED.prerequisites,
  unlocks       = EXCLUDED.unlocks,
  sort_order    = EXCLUDED.sort_order;

-- 5. New skills ------------------------------------------------------
INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order, requires_tech) VALUES
  ('ind_cargo_handling',
   'Industry',
   'Cargo Handling',
   'Disciplined stowage + load distribution. +3% fleet cargo capacity per level (applies across all fitted cargo modules).',
   4,
   '{"type":"cargo_capacity_pct","value":3}'::jsonb,
   612,
   'tech_cargo_handling'),
  ('log_cargo_compression',
   'Logistics',
   'Cargo Compression',
   'Compressed-state stowage techniques. -2% cargo volume per level (all stacks take less space; applies fleet-wide).',
   4,
   '{"type":"cargo_volume_pct","value":-2}'::jsonb,
   1902,
   'tech_cargo_compression')
ON CONFLICT (id) DO UPDATE SET
  description     = EXCLUDED.description,
  rank_multiplier = EXCLUDED.rank_multiplier,
  bonus_per_level = EXCLUDED.bonus_per_level,
  sort_order      = EXCLUDED.sort_order,
  requires_tech   = EXCLUDED.requires_tech;
