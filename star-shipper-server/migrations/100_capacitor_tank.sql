-- 100: Combat profession Phase B -- capacitor, active tank, resists,
-- overheat; every Engineering skill wired. Spec: docs/combat-profession-spec.md §4.5.
--
-- CAPACITOR: a fleet-wide energy pool (like shields). Reactors set it:
--   stats.capacitor    capacity contributed (× quality)
--   stats.cap_recharge units per second (× quality)
-- Spenders: energy turrets (damage × 0.25 per shot), hybrid turrets
-- (× 0.15), projectile / missiles free; active modules per cycle;
-- Overheat on activation. Empty capacitor = turrets cycle at HALF rate
-- and active modules stop. Skills: Capacitor Management +5 % capacity,
-- Power Management +5 % recharge, Power Grid Management −4 % active-
-- module cost, Controlled Bursts −5 % turret cost (from 099).
--
-- ACTIVE TANK (utility slot, hotbar toggles, cost per cycle):
--   Shield Booster (T2) / Capital Shield Booster (T4): stats.shield_boost
--   per stats.cycle seconds for stats.cap_cost. Armor Repairer (T2) /
--   Heavy Armor Repairer (T4): stats.armor_repair. The strongest fitted
--   one of each kind runs (fleet-wide, × quality); Electronics raises the
--   number of active modules that may run at once (base 2).
-- RESISTS: Shield / Armor Compensation −4 %/level of damage the layer is
-- WEAK to (kinetic on shields, laser on armor) -- softens the triangle.
-- OVERHEAT (Exotic Defenses research + Thermodynamics I): 10 s of +30 %
-- turret damage / rate and +30 % booster / repairer, then heat damage of
-- 6 % max hull (−10 %/level Thermodynamics); 45 s cooldown; 40 capacitor.

-- ---- reactors: capacitor + recharge ----
UPDATE module_types SET stats = stats || '{"capacitor":60,"cap_recharge":2.0}'::jsonb   WHERE id = 'reactor_basic';
UPDATE module_types SET stats = stats || '{"capacitor":110,"cap_recharge":3.2}'::jsonb  WHERE id = 'reactor_advanced';
UPDATE module_types SET stats = stats || '{"capacitor":190,"cap_recharge":5.4}'::jsonb  WHERE id = 'reactor_helium_3';
UPDATE module_types SET stats = stats || '{"capacitor":330,"cap_recharge":9.6}'::jsonb  WHERE id = 'reactor_singularity_5';

-- ---- active tank modules ----
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('utility_shield_booster_2', 'Shield Booster', 'utility', 2,
   'Active shield emitter. Restores shield every cycle while running, at a capacitor cost. Toggle it from the hotbar.',
   '{"active":"shield_booster","shield_boost":60,"cycle":3,"cap_cost":24,"combat_tuned":true}'::jsonb, 5000, 'tech_shield_theory'),
  ('utility_armor_repairer_2', 'Armor Repairer', 'utility', 2,
   'Nanite armor repairer. Restores armor every cycle while running, at a capacitor cost. Slower and cheaper than a shield booster.',
   '{"active":"armor_repairer","armor_repair":40,"cycle":4,"cap_cost":20,"combat_tuned":true}'::jsonb, 4500, 'tech_armor_eng'),
  ('utility_shield_booster_4', 'Capital Shield Booster', 'utility', 4,
   'Capital-grade shield emitter. Three times the boost of a Shield Booster for twice the capacitor.',
   '{"active":"shield_booster","shield_boost":180,"cycle":3,"cap_cost":50,"combat_tuned":true}'::jsonb, NULL, 'tech_capital_def'),
  ('utility_armor_repairer_4', 'Heavy Armor Repairer', 'utility', 4,
   'Heavy nanite repairer for capital plating. Three times the repair of an Armor Repairer for twice the capacitor.',
   '{"active":"armor_repairer","armor_repair":120,"cycle":4,"cap_cost":42,"combat_tuned":true}'::jsonb, NULL, 'tech_capital_def')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech, tier = EXCLUDED.tier;

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_shield_booster_2',  'Shield Booster',         'Active shield emitter; restores shield each cycle for capacitor.',  'module', '🛡️', 5, '{"slot_type":"utility"}'),
  ('utility_armor_repairer_2',  'Armor Repairer',         'Nanite armor repairer; restores armor each cycle for capacitor.',   'module', '🛡️', 5, '{"slot_type":"utility"}'),
  ('utility_shield_booster_4',  'Capital Shield Booster', 'Capital-grade active shield emitter.',                               'module', '🛡️', 5, '{"slot_type":"utility"}'),
  ('utility_armor_repairer_4',  'Heavy Armor Repairer',   'Heavy nanite armor repairer.',                                       'module', '🛡️', 5, '{"slot_type":"utility"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, item_data_defaults = EXCLUDED.item_data_defaults;

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech, station_required) VALUES
  ('craft_utility_shield_booster_2', 'Shield Booster', 'Craft an active shield emitter.', 'utility_shield_booster_2', 1,
   '[{"resource_name":"Copper Ingot","quantity":8},{"resource_name":"Crystite Lattice","quantity":6},{"resource_name":"Energy Cell","quantity":3}]'::jsonb, 'module', 'tech_shield_theory', 'base_machine_shop'),
  ('craft_utility_armor_repairer_2', 'Armor Repairer', 'Craft a nanite armor repairer.', 'utility_armor_repairer_2', 1,
   '[{"resource_name":"Iron Ingot","quantity":10},{"resource_name":"Titanium Ingot","quantity":4},{"resource_name":"Nanite Culture","quantity":2}]'::jsonb, 'module', 'tech_armor_eng', 'base_machine_shop'),
  ('craft_utility_shield_booster_4', 'Capital Shield Booster', 'Craft a capital-grade shield emitter.', 'utility_shield_booster_4', 1,
   '[{"resource_name":"Energy Cell","quantity":10},{"resource_name":"Crystite Lattice","quantity":10},{"resource_name":"Contained Plasma","quantity":4},{"resource_name":"Titanium Ingot","quantity":8}]'::jsonb, 'module', 'tech_capital_def', 'base_nano_assembler'),
  ('craft_utility_armor_repairer_4', 'Heavy Armor Repairer', 'Craft a heavy nanite repairer.', 'utility_armor_repairer_4', 1,
   '[{"resource_name":"Titanium Ingot","quantity":14},{"resource_name":"Nanite Culture","quantity":6},{"resource_name":"Ceramic Composite","quantity":6},{"resource_name":"Energy Cell","quantity":4}]'::jsonb, 'module', 'tech_capital_def', 'base_nano_assembler')
ON CONFLICT (id) DO UPDATE SET ingredients = EXCLUDED.ingredients, requires_tech = EXCLUDED.requires_tech, station_required = EXCLUDED.station_required, description = EXCLUDED.description;

-- ---- research: placeholders become real ----
UPDATE tech_definitions SET
  description = 'Enhanced shield emitter geometry. Unlocks the Barrier Web (T2 shield) and the Shield Booster (T2 active shield module).',
  unlocks = jsonb_set(unlocks - 'placeholder', '{modules}', COALESCE(unlocks->'modules', '[]'::jsonb) || '["utility_shield_booster_2"]'::jsonb)
 WHERE id = 'tech_shield_theory';
UPDATE tech_definitions SET
  description = 'Composite plating compositions. Unlocks Composite Plating (T2 armor) and the Armor Repairer (T2 active armor module).',
  unlocks = jsonb_set(unlocks - 'placeholder', '{modules}', COALESCE(unlocks->'modules', '[]'::jsonb) || '["utility_armor_repairer_2"]'::jsonb)
 WHERE id = 'tech_armor_eng';
UPDATE tech_definitions SET
  description = 'Capital-grade active defenses. Unlocks the Capital Shield Booster and Heavy Armor Repairer (T4).',
  unlocks = '{"modules":["utility_shield_booster_4","utility_armor_repairer_4"]}'::jsonb
 WHERE id = 'tech_capital_def';
UPDATE tech_definitions SET
  description = 'Crystal-resonant shield envelopes. Unlocks the Solar Barrier Array (T3). Shield and Armor Compensation skills soften the damage triangle against your fleet.'
 WHERE id = 'tech_reactive_defense';
UPDATE tech_definitions SET
  description = 'Void Essence lattices + Ancient Alloy metallurgy. Unlocks the Void Barrier, Alloy Lattice, Ancient Plate (T4-T5) and the Overheat ability (Thermodynamics I).',
  unlocks = jsonb_set(unlocks, '{abilities}', '["overheat"]'::jsonb)
 WHERE id = 'tech_exotic_defense';

-- ---- skills: Engineering wired ----
UPDATE skill_definitions SET bonus_per_level = '{"type":"shield_max_pct","value":5}'::jsonb,
  description = 'Fleet maximum shield +5% per level.' WHERE id = 'eng_shield_ops';
UPDATE skill_definitions SET bonus_per_level = '{"type":"hull_max_pct","value":3}'::jsonb,
  description = 'Fleet maximum hull +3% per level (stacks with Hull Upgrades).' WHERE id = 'eng_armor';
UPDATE skill_definitions SET bonus_per_level = '{"type":"hull_max_pct","value":3}'::jsonb,
  description = 'Fleet maximum hull +3% per level (stacks with Hull Reinforcement).' WHERE id = 'eng_hull_upgrades';
UPDATE skill_definitions SET bonus_per_level = '{"type":"shield_boost_pct","value":4}'::jsonb,
  description = 'Fit T2+ shield modules (tier − 1) and boost harder: Shield Booster amount +4% per level.' WHERE id = 'eng_shield_upgrades';
UPDATE skill_definitions SET bonus_per_level = '{"type":"armor_max_pct","value":5}'::jsonb,
  description = 'Fit T2+ armor plating (tier − 1); fleet maximum armor +5% per level.' WHERE id = 'eng_armor_layering';
UPDATE skill_definitions SET bonus_per_level = '{"type":"shield_resist_pct","value":4}'::jsonb,
  description = 'Shields take 4% less per level from kinetic weapons (the type they are weak to).' WHERE id = 'eng_shield_compensation';
UPDATE skill_definitions SET bonus_per_level = '{"type":"armor_resist_pct","value":4}'::jsonb,
  description = 'Armor takes 4% less per level from energy weapons (the type it is weak to).' WHERE id = 'eng_armor_compensation';
UPDATE skill_definitions SET bonus_per_level = '{"type":"active_cap_cost_pct","value":-4}'::jsonb,
  description = 'Active modules (boosters, repairers, and later EWAR / cloaks) cost 4% less capacitor per level.' WHERE id = 'eng_capacitor';
UPDATE skill_definitions SET bonus_per_level = '{"type":"capacitor_pct","value":5}'::jsonb,
  description = 'Fleet capacitor capacity +5% per level.' WHERE id = 'eng_capacitor_mgmt';
UPDATE skill_definitions SET bonus_per_level = '{"type":"cap_recharge_pct","value":5}'::jsonb,
  description = 'Fleet capacitor recharge +5% per level.' WHERE id = 'eng_power_management';
UPDATE skill_definitions SET bonus_per_level = '{"type":"cpu_flat","value":1}'::jsonb,
  description = 'One more active module may run at once per level (base 2: a booster and a repairer).' WHERE id = 'eng_electronics';
UPDATE skill_definitions SET bonus_per_level = '{"type":"overheat_damage_pct","value":-10}'::jsonb,
  description = 'Enables Overheat at level I (with Exotic Defenses research): 10 s of +30% turret output and +30% boosting, then heat damage to the hull. Heat damage −10% per level.' WHERE id = 'eng_thermodynamics';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_cap_cost_pct","value":-5}'::jsonb,
  description = 'Energy and hybrid turrets cost 5% less capacitor per shot per level.' WHERE id = 'gun_controlled_bursts';
