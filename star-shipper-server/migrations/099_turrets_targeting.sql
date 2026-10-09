-- 099: Combat profession Phase A -- turret sizes, tracking + falloff, the
-- T1-T5 turret ladder, hull mount limits, locks, and every Gunnery /
-- Targeting skill wired. Spec: docs/combat-profession-spec.md §4.1, §4.4.
--
-- Turret model (EVE Operation -> Specialization ladder):
--   stats.family  'energy' (lasers) | 'projectile' (cannons) | 'hybrid'
--                 (rail / coil -- kinetic damage) | 'missile'
--   stats.size    'small' (T1-T2) | 'medium' (T3) | 'large' (T4-T5)
--   stats.tracking  rad/s of target angular velocity the turret follows at
--                   full hit chance (small ~1.8, medium 1.1, large 0.6; target size scales it: a fighter is harder, a capital easier);
--                   chance = 0.5 ^ ((omega / tracking)^2)
--   stats.optimal   full-damage range; stats.falloff = range - optimal;
--                   chance past optimal = 0.5 ^ (((d - optimal) / falloff)^2)
--   stats.range     stays the hard engagement cap (= optimal + falloff)
-- Hulls mount up to hull_types.max_weapon_size (Fighter / Scout / Shuttle /
-- Freighter / Prospector: small; Frigate / Excavator / Leviathan: medium;
-- Capital: large). Fit gates (game/fitGates.js): small turrets keep the
-- "family Small Operation at tier - 1" rule; medium needs Medium Operation
-- I; large needs Large Operation (T4: I, T5: II).

-- ---- hull mount size ----
ALTER TABLE hull_types ADD COLUMN IF NOT EXISTS max_weapon_size VARCHAR(8) NOT NULL DEFAULT 'small';
UPDATE hull_types SET max_weapon_size = 'medium' WHERE id IN ('frigate', 'excavator', 'leviathan');
UPDATE hull_types SET max_weapon_size = 'large'  WHERE id = 'capital' OR class IN ('Swarm', 'Synod') OR id LIKE 'reaver_%';

-- ---- existing turrets: family / size / tracking / optimal / falloff ----
UPDATE module_types SET stats = stats || '{"family":"energy","size":"small","tracking":1.8,"optimal":150,"falloff":50}'::jsonb      WHERE id = 'weapon_laser';
UPDATE module_types SET stats = stats || '{"family":"projectile","size":"small","tracking":1.7,"optimal":130,"falloff":50}'::jsonb  WHERE id = 'weapon_cannon';
UPDATE module_types SET stats = stats || '{"family":"missile","size":"small"}'::jsonb                                                  WHERE id = 'weapon_missile_basic';
UPDATE module_types SET stats = stats || '{"family":"energy","size":"medium","tracking":1.1,"optimal":220,"falloff":60}'::jsonb     WHERE id = 'weapon_beam_3';
UPDATE module_types SET stats = stats || '{"family":"hybrid","size":"medium","tracking":1.1,"optimal":160,"falloff":50}'::jsonb     WHERE id = 'weapon_railgun_3';
UPDATE module_types SET stats = stats || '{"family":"missile","size":"large"}'::jsonb                                                  WHERE id = 'weapon_torpedo_4';
UPDATE module_types SET stats = stats || '{"family":"energy","size":"large","tracking":0.6,"optimal":190,"falloff":50}'::jsonb      WHERE id = 'weapon_lance_5';
UPDATE module_types SET stats = stats || '{"family":"projectile","size":"large","tracking":0.6,"optimal":180,"falloff":50}'::jsonb  WHERE id = 'weapon_driver_5';

-- ---- the ladder gaps: T1 projectile, T2 energy, T4 energy, T4 hybrid ----
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('weapon_cannon_1', 'Light Cannon', 'weapon', 1,
   'Small projectile turret. Quick-cycling kinetic rounds; strong against shields.',
   '{"damage":5,"fire_rate":0.4,"range":170,"projectile_speed":300,"spread":0.09,"damage_type":"kinetic","family":"projectile","size":"small","tracking":1.9,"optimal":125,"falloff":45,"combat_tuned":true}'::jsonb, 900, NULL),
  ('weapon_laser_2', 'Pulse Laser II', 'weapon', 2,
   'Small energy turret. Tighter energy delivery than the Pulse Laser; strong against armor.',
   '{"damage":9,"fire_rate":0.42,"range":220,"damage_type":"laser","family":"energy","size":"small","tracking":1.8,"optimal":165,"falloff":55,"combat_tuned":true}'::jsonb, 2600, 'tech_pulse_optim'),
  ('weapon_beam_4', 'Focused Beam Array', 'weapon', 4,
   'Large energy turret. A phased beam array for heavy hulls; slow to track, savage against armor.',
   '{"damage":24,"fire_rate":0.55,"range":300,"damage_type":"laser","family":"energy","size":"large","tracking":0.6,"optimal":230,"falloff":70,"combat_tuned":true}'::jsonb, NULL, 'tech_capital_weap'),
  ('weapon_coil_4', 'Coilgun', 'weapon', 4,
   'Large hybrid turret. Magnetic coil accelerator; long reach, punishes shields.',
   '{"damage":28,"fire_rate":0.8,"range":260,"projectile_speed":400,"spread":0.04,"damage_type":"kinetic","family":"hybrid","size":"large","tracking":0.6,"optimal":200,"falloff":60,"combat_tuned":true}'::jsonb, NULL, 'tech_capital_weap')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech, tier = EXCLUDED.tier;

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('weapon_cannon_1', 'Light Cannon',       'Small kinetic turret. Strong vs shields.',        'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('weapon_laser_2',  'Pulse Laser II',     'Small energy turret. Strong vs armor.',           'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('weapon_beam_4',   'Focused Beam Array', 'Large energy turret. Strong vs armor.',           'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('weapon_coil_4',   'Coilgun',            'Large hybrid turret. Strong vs shields.',         'module', '🔫', 5, '{"slot_type":"weapon"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, item_data_defaults = EXCLUDED.item_data_defaults;

-- Recipes follow the 088 convention: T1 from raw ore at any Crafting
-- window; T2+ from processed materials at the tier's bench.
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech, station_required) VALUES
  ('craft_weapon_cannon_1', 'Light Cannon', 'Craft a light kinetic turret.', 'weapon_cannon_1', 1,
   '[{"resource_name":"Iron","quantity":18},{"resource_name":"Copper","quantity":8}]'::jsonb, 'module', NULL, NULL),
  ('craft_weapon_laser_2', 'Pulse Laser II', 'Craft an improved pulse laser.', 'weapon_laser_2', 1,
   '[{"resource_name":"Copper Ingot","quantity":10},{"resource_name":"Crystite Lattice","quantity":4},{"resource_name":"Energy Cell","quantity":2}]'::jsonb, 'module', 'tech_pulse_optim', 'base_machine_shop'),
  ('craft_weapon_beam_4', 'Focused Beam Array', 'Craft a large phased beam array.', 'weapon_beam_4', 1,
   '[{"resource_name":"Titanium Ingot","quantity":15},{"resource_name":"Energy Cell","quantity":6},{"resource_name":"Contained Plasma","quantity":3},{"resource_name":"Crystite Lattice","quantity":6}]'::jsonb, 'module', 'tech_capital_weap', 'base_nano_assembler'),
  ('craft_weapon_coil_4', 'Coilgun', 'Craft a large coil accelerator.', 'weapon_coil_4', 1,
   '[{"resource_name":"Titanium Ingot","quantity":15},{"resource_name":"Uranium Pellet","quantity":4},{"resource_name":"He-3 Fuel Pellet","quantity":3},{"resource_name":"Iron Ingot","quantity":10}]'::jsonb, 'module', 'tech_capital_weap', 'base_nano_assembler')
ON CONFLICT (id) DO UPDATE SET ingredients = EXCLUDED.ingredients, requires_tech = EXCLUDED.requires_tech, station_required = EXCLUDED.station_required, description = EXCLUDED.description;

-- ---- research: the placeholders become real ----
UPDATE tech_definitions SET
  description = 'Tighter energy delivery on pulse lasers. Unlocks Pulse Laser II (T2 small energy turret).',
  unlocks = '{"modules":["weapon_laser_2"]}'::jsonb
 WHERE id = 'tech_pulse_optim';
UPDATE tech_definitions SET
  description = 'Heavy mounts and fire-control for medium turrets. Prerequisite for Advanced Munitions; Medium Turret Operation skills gate the T3 turrets themselves.',
  unlocks = '{"info":"Medium turret fire control"}'::jsonb
 WHERE id = 'tech_heavy_ord';
UPDATE tech_definitions SET
  description = 'Large turret mounts for heavy hulls. Unlocks the Focused Beam Array and Coilgun (T4 large turrets) and the Alpha Volley ability (every large turret fires one salvo at ×2.5).',
  unlocks = '{"modules":["weapon_beam_4","weapon_coil_4"],"abilities":["alpha_volley"]}'::jsonb
 WHERE id = 'tech_capital_weap';

-- ---- skills: Gunnery + Targeting wired ----
-- Damage bonuses are per size × family (EVE Operation = +3 %/level);
-- Specialization stacks on top; Surgical Strike is the all-turret capstone.
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_small_energy_dmg_pct","value":3}'::jsonb,
  description = 'Fit small energy turrets (T2 at level I) and fire them harder: +3% small energy turret damage per level.' WHERE id = 'gun_small_energy';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_small_proj_dmg_pct","value":3}'::jsonb,
  description = 'Fit small projectile turrets (T2 at level I): +3% small projectile turret damage per level.' WHERE id = 'gun_small_projectile';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_small_hybrid_dmg_pct","value":3}'::jsonb,
  description = 'Fit small hybrid turrets (rail and coil weapons): +3% small hybrid turret damage per level. (Was +5% all-weapon damage; that bonus now lives in Surgical Strike.)' WHERE id = 'gun_small_hybrid';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_small_hybrid_dmg_pct","value":2}'::jsonb,
  description = 'Specialist tuning for small hybrid turrets: a further +2% damage per level.' WHERE id = 'gun_small_hybrid_spec';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_medium_energy_dmg_pct","value":3}'::jsonb,
  description = 'Fit medium (T3) energy turrets at level I; +3% medium energy turret damage per level.' WHERE id = 'gun_medium_energy';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_medium_proj_dmg_pct","value":3}'::jsonb,
  description = 'Fit medium (T3) projectile turrets at level I; +3% medium projectile turret damage per level.' WHERE id = 'gun_medium_projectile';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_medium_hybrid_dmg_pct","value":3}'::jsonb,
  description = 'Fit medium (T3) hybrid turrets at level I; +3% medium hybrid turret damage per level.' WHERE id = 'gun_medium_hybrid';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_large_energy_dmg_pct","value":3}'::jsonb,
  description = 'Fit large energy turrets (T4 at level I, T5 at level II); +3% large energy turret damage per level. Large turrets need a hull that mounts them.' WHERE id = 'gun_large_energy';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_large_proj_dmg_pct","value":3}'::jsonb,
  description = 'Fit large projectile turrets (T4 at level I, T5 at level II); +3% large projectile turret damage per level.' WHERE id = 'gun_large_projectile';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_large_hybrid_dmg_pct","value":3}'::jsonb,
  description = 'Fit large hybrid turrets (T4 at level I, T5 at level II); +3% large hybrid turret damage per level.' WHERE id = 'gun_large_hybrid';
UPDATE skill_definitions SET bonus_per_level = '{"type":"fleet_fire_rate_pct","value":3}'::jsonb,
  description = 'Every turret in the fleet cycles 3% faster per level.' WHERE id = 'gun_rapid_fire';
UPDATE skill_definitions SET bonus_per_level = '{"type":"fleet_weapon_range_pct","value":4}'::jsonb,
  description = 'Turret optimal range and falloff both +4% per level.' WHERE id = 'gun_precision';
UPDATE skill_definitions SET bonus_per_level = '{"type":"fleet_tracking_pct","value":5}'::jsonb,
  description = 'Turret tracking +5% per level: fast or close targets are hit more often.' WHERE id = 'gun_motion';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_optimal_range_pct","value":4}'::jsonb,
  description = 'Turret optimal range +4% per level (full damage reaches further).' WHERE id = 'gun_sharpshooter';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_falloff_pct","value":5}'::jsonb,
  description = 'Turret falloff +5% per level: damage holds up further past optimal range.' WHERE id = 'gun_trajectory_analysis';
UPDATE skill_definitions SET bonus_per_level = '{"type":"weapon_all_turret_dmg_pct","value":4}'::jsonb,
  description = 'Gunnery capstone: every turret in the fleet +4% damage per level, on top of size and family bonuses. Level I enables Alpha Volley with large turrets (Capital Weapons research).' WHERE id = 'gun_surgical_strike';
UPDATE skill_definitions SET description = 'Turret capacitor cost −5% per level. Wired when the capacitor arrives (combat profession Phase B).' WHERE id = 'gun_controlled_bursts';

UPDATE skill_definitions SET bonus_per_level = '{"type":"max_locked_targets_flat","value":1}'::jsonb,
  description = 'Hold one more target lock per level (fleet maximum 5). Locked targets draw your weapons first; missiles only fire at locked targets.' WHERE id = 'tar_targeting';
UPDATE skill_definitions SET bonus_per_level = '{"type":"max_locked_targets_flat","value":1}'::jsonb,
  description = 'One more simultaneous lock per level (fleet maximum 5).' WHERE id = 'tar_multitasking';
UPDATE skill_definitions SET bonus_per_level = '{"type":"locked_target_dmg_pct","value":2}'::jsonb,
  description = 'Targeting capstone: +2% damage per level against targets you hold a lock on.' WHERE id = 'tar_advanced_target';
UPDATE skill_definitions SET bonus_per_level = '{"type":"targeting_range_pct","value":10}'::jsonb,
  description = 'Lock range +10% per level beyond your longest weapon.' WHERE id = 'tar_long_range';
UPDATE skill_definitions SET bonus_per_level = '{"type":"lock_time_pct","value":-4}'::jsonb,
  description = 'Lock time −4% per level.' WHERE id = 'tar_signature_radius';
UPDATE skill_definitions SET bonus_per_level = '{"type":"lock_speed_pct","value":5}'::jsonb,
  description = 'Lock speed +5% per level (Navigation and Targeting both shorten the lock).' WHERE id = 'nav_signature_analysis';
