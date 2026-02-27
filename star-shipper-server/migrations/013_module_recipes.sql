-- Migration 013: Module Crafting Recipes
-- Adds crafting recipes for all ship modules so players can craft them from resources

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category) VALUES
  -- Engines
  ('craft_engine_basic', 'Basic Thruster', 'Craft a standard propulsion system.',
   'engine_basic', 1,
   '[{"resource_name": "Iron", "quantity": 15}, {"resource_name": "Copper", "quantity": 5}]',
   'module'),
  ('craft_engine_advanced', 'Ion Drive', 'Craft a high-efficiency ion propulsion system.',
   'engine_advanced', 1,
   '[{"resource_name": "Titanium", "quantity": 20}, {"resource_name": "Copper", "quantity": 10}, {"resource_name": "Crystite", "quantity": 5}]',
   'module'),

  -- Reactors
  ('craft_reactor_basic', 'Fusion Core', 'Craft a standard power reactor.',
   'reactor_basic', 1,
   '[{"resource_name": "Iron", "quantity": 20}, {"resource_name": "Copper", "quantity": 8}]',
   'module'),
  ('craft_reactor_advanced', 'Quantum Reactor', 'Craft a high-output quantum power reactor.',
   'reactor_advanced', 1,
   '[{"resource_name": "Titanium", "quantity": 15}, {"resource_name": "Crystite", "quantity": 10}, {"resource_name": "Uranium", "quantity": 3}]',
   'module'),

  -- Cargo
  ('craft_cargo_basic', 'Cargo Pod', 'Craft a standard cargo storage module.',
   'cargo_basic', 1,
   '[{"resource_name": "Iron", "quantity": 10}, {"resource_name": "Copper", "quantity": 3}]',
   'module'),
  ('craft_cargo_large', 'Reinforced Hold', 'Craft an expanded reinforced cargo hold.',
   'cargo_large', 1,
   '[{"resource_name": "Titanium", "quantity": 15}, {"resource_name": "Iron", "quantity": 20}]',
   'module'),

  -- Weapons
  ('craft_weapon_laser', 'Pulse Laser', 'Craft a light energy weapon system.',
   'weapon_laser', 1,
   '[{"resource_name": "Copper", "quantity": 15}, {"resource_name": "Crystite", "quantity": 5}]',
   'module'),
  ('craft_weapon_cannon', 'Autocannon', 'Craft a heavy kinetic weapon system.',
   'weapon_cannon', 1,
   '[{"resource_name": "Titanium", "quantity": 20}, {"resource_name": "Iron", "quantity": 15}]',
   'module'),

  -- Shields
  ('craft_shield_basic', 'Deflector Screen', 'Craft a basic energy shield generator.',
   'shield_basic', 1,
   '[{"resource_name": "Copper", "quantity": 10}, {"resource_name": "Crystite", "quantity": 8}]',
   'module'),

  -- Utility
  ('craft_utility_scanner', 'Sensor Suite', 'Craft an enhanced sensor detection suite.',
   'utility_scanner', 1,
   '[{"resource_name": "Copper", "quantity": 8}, {"resource_name": "Crystite", "quantity": 3}]',
   'module'),
  ('craft_utility_autopilot', 'Nav Computer', 'Craft an autopilot navigation computer.',
   'utility_autopilot', 1,
   '[{"resource_name": "Copper", "quantity": 5}, {"resource_name": "Iron", "quantity": 5}]',
   'module'),

  -- Mining
  ('craft_mining_basic', 'Mining Laser', 'Craft a mining extraction laser system.',
   'mining_basic', 1,
   '[{"resource_name": "Iron", "quantity": 15}, {"resource_name": "Copper", "quantity": 10}, {"resource_name": "Crystite", "quantity": 3}]',
   'module')
ON CONFLICT (id) DO NOTHING;
