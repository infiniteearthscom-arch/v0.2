-- 090: Fuel Refinery -- an automatic base station with a hopper (2026-09-26).
--
-- The Fuel Refinery (Gas Works, tier 1) has a HOPPER: a small cargo grid
-- the pilot drags fuel ingredients into. It turns them into Fuel Cells on
-- its own and drops the cells into the base depot; production settles
-- lazily whenever the base is read (like harvesters -- no cron). Fuel
-- consumers at the base (the grade refinery's jobs) pull Fuel Cells from
-- the depot first, then cargo, so a stocked hopper keeps the base running.

ALTER TABLE foundry_recipes ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT FALSE;

-- hopper contents: resource stacks per station plot
CREATE TABLE IF NOT EXISTS player_base_hoppers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES player_bases(id) ON DELETE CASCADE,
  slot VARCHAR(8) NOT NULL,
  resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  stat_purity INTEGER, stat_stability INTEGER, stat_potency INTEGER, stat_density INTEGER,
  slot_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_base_hoppers_plot ON player_base_hoppers(base_id, slot);

-- automatic-station state: when it last settled, banked fraction of a unit
CREATE TABLE IF NOT EXISTS player_base_station_state (
  base_id UUID NOT NULL REFERENCES player_bases(id) ON DELETE CASCADE,
  slot VARCHAR(8) NOT NULL,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  carry_seconds NUMERIC NOT NULL DEFAULT 0,
  produced_total INTEGER NOT NULL DEFAULT 0,
  stalled VARCHAR(32),
  PRIMARY KEY (base_id, slot)
);

-- the station (three rows, pitfall #19)
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('base_fuel_refinery', 'Fuel Refinery', 'base', 1,
   'Automatic fuel plant. Drop hydrogen, hydrogen cells, xenon or helium-3 into its hopper and it presses Fuel Cells into the base depot on its own. Base refineries burn fuel from the depot first.',
   '{"foundry":{"family":"gas","tier":1,"bench":false,"gate":false,"hopper":true},"speed":1.0,"hopper_capacity":400}'::jsonb, NULL, 'tech_foundry_1')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slot_type = EXCLUDED.slot_type, tier = EXCLUDED.tier, description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech;
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('base_fuel_refinery', 'Fuel Refinery', 'Gas Works building for a base. Fit it to a plot; keep its hopper fed.', 'module', '🏭', 5, '{"slot_type":"base"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category, item_data_defaults = EXCLUDED.item_data_defaults;
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_base_fuel_refinery', 'Fuel Refinery', 'Build a Fuel Refinery for your base.', 'base_fuel_refinery', 1,
   '[{"resource_name":"Iron Ingot","quantity":8},{"resource_name":"Copper Ingot","quantity":4},{"resource_name":"Hydrogen Cell","quantity":6},{"resource_name":"Polymer","quantity":4}]'::jsonb, 'module', 'tech_foundry_1')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, ingredients = EXCLUDED.ingredients, requires_tech = EXCLUDED.requires_tech;

-- hopper recipes: several ingredients, one product, different yields
INSERT INTO foundry_recipes (id, station_module_id, name, tier, inputs, output, seconds, sort_order, auto) VALUES
  ('fj_fuel_from_hydrogen',      'base_fuel_refinery', 'Fuel Cell from Hydrogen',      1, '[{"resource_name":"Hydrogen","quantity":3}]'::jsonb,      '{"item_id":"fuel_cell","quantity":1}'::jsonb, 12, 100, TRUE),
  ('fj_fuel_from_hydrogen_cell', 'base_fuel_refinery', 'Fuel Cell from Hydrogen Cell', 1, '[{"resource_name":"Hydrogen Cell","quantity":2}]'::jsonb, '{"item_id":"fuel_cell","quantity":1}'::jsonb, 8,  101, TRUE),
  ('fj_fuel_from_xenon',         'base_fuel_refinery', 'Fuel Cells from Xenon',        2, '[{"resource_name":"Xenon","quantity":2}]'::jsonb,         '{"item_id":"fuel_cell","quantity":2}'::jsonb, 14, 102, TRUE),
  ('fj_fuel_from_helium3',       'base_fuel_refinery', 'Fuel Cells from Helium-3',     3, '[{"resource_name":"Helium-3","quantity":1}]'::jsonb,      '{"item_id":"fuel_cell","quantity":4}'::jsonb, 20, 103, TRUE)
ON CONFLICT (id) DO UPDATE SET station_module_id = EXCLUDED.station_module_id, name = EXCLUDED.name, tier = EXCLUDED.tier, inputs = EXCLUDED.inputs, output = EXCLUDED.output, seconds = EXCLUDED.seconds, sort_order = EXCLUDED.sort_order, auto = EXCLUDED.auto;

UPDATE tech_definitions SET unlocks = jsonb_set(unlocks, '{modules}', (COALESCE(unlocks->'modules', '[]'::jsonb) || '["base_fuel_refinery"]'::jsonb))
 WHERE id = 'tech_foundry_1' AND NOT (COALESCE(unlocks->'modules', '[]'::jsonb) ? 'base_fuel_refinery');
