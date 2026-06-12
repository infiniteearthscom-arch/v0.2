-- Migration 062: Unified 5-tier module system + exotic recipe pass
-- ============================================
-- Combat & Progression spec part C (docs/combat-progression-spec.md §6),
-- revised per user direction 2026-06-11: a single 1-5 tier scale shared
-- by modules, resource rarity, galaxy zones (B1's five bands), and
-- (later) enemy fleets / hulls / systems. Gradual ladder, no hard wall:
--
--   T1  commons (Iron/Copper)            zone I    starter / vendor
--   T2  commons + Crystite/Uranium       zone II   current "advanced"
--   T3  rare-driven (He-3/Solar/Plasma)  zone III  craft-only begins
--   T4  rares + first exotics            zone IV
--   T5  exotic-heavy                     zone V    endgame
--
-- T3+ modules are CRAFT-ONLY (buy_price NULL -> vendors skip them).
-- That's the hard gate: deep-zone materials are the only path, which
-- also activates the player market (miners sell exotics to crafters).
--
-- COMBAT STATS CONVENTION ("combat_tuned"): the client's combat code
-- historically used per-TYPE default stats (WEAPON_DEFAULTS in
-- weapons.js; flat keyword bonuses in fleetStats.js) and ignored
-- module_types.stats, whose old rows are in stale pre-rework units.
-- New modules carry stats in the TUNED unit shape plus
-- "combat_tuned": true; the client prefers module stats ONLY when the
-- flag is present. Old modules keep exact current behavior. The fit
-- endpoint now snapshots mod.stats into the fitted slot value so the
-- combat loop can read them.
--
-- Armor modules fit the SHIELD slot (hulls have no armor slot): every
-- defense slot is a shield-vs-armor choice, so a fleet's defense
-- profile emerges from fitting -- same rule the enemy fleets follow.
-- Names matter: fleetStats classifies modules by name keywords
-- (plate/plating=armor, barrier/screen=shield, beam/laser=laser,
-- cannon/railgun=kinetic, torpedo=missile). All names below are
-- chosen to classify correctly. Do not rename without re-checking.

-- ============================================
-- 1. Re-tier existing modules onto the 1-5 scale
-- ============================================
UPDATE module_types SET tier = 3 WHERE id = 'utility_scanner_area';   -- was 2.5
UPDATE module_types SET tier = 4 WHERE id = 'utility_scanner_elite';  -- was 3
UPDATE module_types SET tier = 4 WHERE id = 'utility_systemscan';

-- ============================================
-- 2. New module types (18)
-- ============================================
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  -- ARMOR (defense slot; no regen, the middle combat layer)
  ('armor_plate_1', 'Armor Plating', 'shield', 1,
   'Bolt-on hull plating. Absorbs damage after shields fall; does not regenerate. Lasers cut armor fast — kinetic bounces.',
   '{"armor_hp":30,"mass":8,"combat_tuned":true}'::jsonb, 1200, NULL),
  ('armor_plate_2', 'Composite Plating', 'shield', 2,
   'Layered titanium composite. Denser protection per ton than basic plating.',
   '{"armor_hp":50,"mass":10,"combat_tuned":true}'::jsonb, 5000, 'tech_armor_eng'),
  ('armor_alloy_4', 'Alloy Lattice Plating', 'shield', 4,
   'Ancient Alloy lattice over a titanium substrate. Pre-collapse metallurgy, partially understood.',
   '{"armor_hp":90,"mass":14,"combat_tuned":true}'::jsonb, NULL, 'tech_exotic_defense'),
  ('armor_ancient_5', 'Ancient Plate', 'shield', 5,
   'Solid Ancient Alloy plate bonded with Void Essence. The hardest matter a hull can carry.',
   '{"armor_hp":140,"mass":18,"combat_tuned":true}'::jsonb, NULL, 'tech_exotic_defense'),

  -- SHIELDS (regenerating top layer; kinetic strips it, lasers splash off)
  ('shield_barrier_2', 'Barrier Web', 'shield', 2,
   'Meshed emitter array. Stronger envelope than the Deflector Screen.',
   '{"shield_hp":65,"combat_tuned":true}'::jsonb, 6000, 'tech_shield_theory'),
  ('shield_solar_3', 'Solar Barrier Array', 'shield', 3,
   'Solar Crystal resonators focus the shield envelope. Rare-tier defense.',
   '{"shield_hp":95,"combat_tuned":true}'::jsonb, NULL, 'tech_reactive_defense'),
  ('shield_void_5', 'Void Barrier Matrix', 'shield', 5,
   'A Void Essence lattice that bends incoming fire around the hull.',
   '{"shield_hp":160,"combat_tuned":true}'::jsonb, NULL, 'tech_exotic_defense'),

  -- ENGINES (speed via computed_max_speed; warp_range hook comes with travel gating)
  ('engine_plasma_3', 'Plasma Drive', 'engine', 3,
   'Plasma-injected propulsion. Rare-tier speed.',
   '{"speed_bonus":50,"fuel_efficiency":1.8}'::jsonb, NULL, 'tech_high_energy'),
  ('engine_helion_4', 'Helion Drive', 'engine', 4,
   'Helium-3 torch drive with crystal-focused exhaust.',
   '{"speed_bonus":75,"fuel_efficiency":2.2}'::jsonb, NULL, 'tech_exotic_drives'),
  ('engine_void_5', 'Void Drive', 'engine', 5,
   'Dark Matter displacement drive. The fastest thing in known space.',
   '{"speed_bonus":110,"fuel_efficiency":3.0}'::jsonb, NULL, 'tech_exotic_drives'),

  -- REACTORS
  ('reactor_helium_3', 'Helium Fusion Core', 'reactor', 3,
   'Aneutronic He-3 fusion. Clean, dense power.',
   '{"power_output":45}'::jsonb, NULL, 'tech_high_energy'),
  ('reactor_singularity_5', 'Singularity Core', 'reactor', 5,
   'A contained quantum singularity. Effectively limitless output.',
   '{"power_output":80}'::jsonb, NULL, 'tech_exotic_drives'),

  -- WEAPONS (one per damage type at mid + top tiers; stats in TUNED units:
  -- damage/shot, fire_rate = seconds per cycle, range in world units)
  ('weapon_beam_3', 'Beam Laser', 'weapon', 3,
   'Continuous-focus beam. Cuts armor; weak into shields.',
   '{"damage":9,"fire_rate":0.45,"range":230,"combat_tuned":true}'::jsonb, NULL, 'tech_adv_munitions'),
  ('weapon_railgun_3', 'Railgun', 'weapon', 3,
   'Magnetic-accelerated slugs. Shreds shields; deflected by armor.',
   '{"damage":18,"fire_rate":0.7,"range":210,"combat_tuned":true}'::jsonb, NULL, 'tech_adv_munitions'),
  ('weapon_torpedo_4', 'Quantum Torpedo Launcher', 'weapon', 4,
   'Quantum Dust warhead delivery. Devastating against bare hull. 2s lock; 6-round magazine.',
   '{"damage":34,"fire_rate":1.5,"range":550,"projectile_speed":200,"turn_rate":4.0,"lock_time":2,"ammo_capacity":6,"combat_tuned":true}'::jsonb, NULL, 'tech_exotic_weapons'),
  ('weapon_lance_5', 'Plasma Beam Lance', 'weapon', 5,
   'A Dark Matter-pumped plasma beam. Armor evaporates.',
   '{"damage":15,"fire_rate":0.5,"range":280,"combat_tuned":true}'::jsonb, NULL, 'tech_exotic_weapons'),
  ('weapon_driver_5', 'Mass Driver Cannon', 'weapon', 5,
   'Ancient Alloy slugs at relativistic speed. Shields mean nothing.',
   '{"damage":30,"fire_rate":0.8,"range":240,"combat_tuned":true}'::jsonb, NULL, 'tech_exotic_weapons'),

  -- MINING
  ('mining_laser_3', 'Resonance Mining Laser', 'mining', 3,
   'He-3 resonance beam. Fractures rock along crystal seams for superior yield.',
   '{"mine_yield":18,"mine_cycle":1.6,"mine_range":170}'::jsonb, NULL, 'tech_deep_extraction')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. item_definitions rows (crafting output FK + cargo display)
-- ============================================
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('armor_plate_1',        'Armor Plating',           'Bolt-on hull plating. Fits a defense (shield) slot.', 'module', '🧱', 5, '{"slot_type":"shield"}'),
  ('armor_plate_2',        'Composite Plating',       'Layered titanium composite armor.',                   'module', '🧱', 5, '{"slot_type":"shield"}'),
  ('armor_alloy_4',        'Alloy Lattice Plating',   'Ancient Alloy lattice armor.',                        'module', '🧱', 5, '{"slot_type":"shield"}'),
  ('armor_ancient_5',      'Ancient Plate',           'Solid Ancient Alloy plate.',                          'module', '🧱', 5, '{"slot_type":"shield"}'),
  ('shield_barrier_2',     'Barrier Web',             'Meshed shield emitter array.',                        'module', '🛡️', 5, '{"slot_type":"shield"}'),
  ('shield_solar_3',       'Solar Barrier Array',     'Solar Crystal shield resonators.',                    'module', '🛡️', 5, '{"slot_type":"shield"}'),
  ('shield_void_5',        'Void Barrier Matrix',     'Void Essence shield lattice.',                        'module', '🛡️', 5, '{"slot_type":"shield"}'),
  ('engine_plasma_3',      'Plasma Drive',            'Plasma-injected propulsion.',                         'module', '🔥', 5, '{"slot_type":"engine"}'),
  ('engine_helion_4',      'Helion Drive',            'Helium-3 torch drive.',                               'module', '🔥', 5, '{"slot_type":"engine"}'),
  ('engine_void_5',        'Void Drive',              'Dark Matter displacement drive.',                     'module', '🔥', 5, '{"slot_type":"engine"}'),
  ('reactor_helium_3',     'Helium Fusion Core',      'Aneutronic He-3 fusion reactor.',                     'module', '⚛️', 5, '{"slot_type":"reactor"}'),
  ('reactor_singularity_5','Singularity Core',        'Contained quantum singularity reactor.',              'module', '⚛️', 5, '{"slot_type":"reactor"}'),
  ('weapon_beam_3',        'Beam Laser',              'Continuous-focus laser. Strong vs armor.',            'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('weapon_railgun_3',     'Railgun',                 'Magnetic kinetic weapon. Strong vs shields.',         'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('weapon_torpedo_4',     'Quantum Torpedo Launcher','Guided exotic ordnance. Strong vs hull.',             'module', '🚀', 5, '{"slot_type":"weapon"}'),
  ('weapon_lance_5',       'Plasma Beam Lance',       'Dark Matter-pumped plasma beam.',                     'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('weapon_driver_5',      'Mass Driver Cannon',      'Relativistic kinetic cannon.',                        'module', '🔫', 5, '{"slot_type":"weapon"}'),
  ('mining_laser_3',       'Resonance Mining Laser',  'He-3 resonance mining beam.',                         'module', '⛏️', 5, '{"slot_type":"mining"}')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. Crafting recipes — rarity maps to tier; T4/T5 require exotics
-- ============================================
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_armor_plate_1', 'Armor Plating', 'Craft basic hull plating.', 'armor_plate_1', 1,
   '[{"resource_name":"Iron","quantity":20},{"resource_name":"Titanium","quantity":5}]'::jsonb, 'module', NULL),
  ('craft_armor_plate_2', 'Composite Plating', 'Craft layered composite armor.', 'armor_plate_2', 1,
   '[{"resource_name":"Titanium","quantity":20},{"resource_name":"Crystite","quantity":8}]'::jsonb, 'module', 'tech_armor_eng'),
  ('craft_armor_alloy_4', 'Alloy Lattice Plating', 'Craft Ancient Alloy lattice armor.', 'armor_alloy_4', 1,
   '[{"resource_name":"Ancient Alloy","quantity":3},{"resource_name":"Titanium","quantity":25},{"resource_name":"Uranium","quantity":4}]'::jsonb, 'module', 'tech_exotic_defense'),
  ('craft_armor_ancient_5', 'Ancient Plate', 'Craft solid Ancient Alloy plate.', 'armor_ancient_5', 1,
   '[{"resource_name":"Ancient Alloy","quantity":8},{"resource_name":"Void Essence","quantity":2},{"resource_name":"Titanium","quantity":30}]'::jsonb, 'module', 'tech_exotic_defense'),
  ('craft_shield_barrier_2', 'Barrier Web', 'Craft a meshed shield emitter array.', 'shield_barrier_2', 1,
   '[{"resource_name":"Crystite","quantity":15},{"resource_name":"Solar Crystals","quantity":3},{"resource_name":"Copper","quantity":10}]'::jsonb, 'module', 'tech_shield_theory'),
  ('craft_shield_solar_3', 'Solar Barrier Array', 'Craft Solar Crystal shield resonators.', 'shield_solar_3', 1,
   '[{"resource_name":"Solar Crystals","quantity":12},{"resource_name":"Crystite","quantity":10},{"resource_name":"Titanium","quantity":10}]'::jsonb, 'module', 'tech_reactive_defense'),
  ('craft_shield_void_5', 'Void Barrier Matrix', 'Craft a Void Essence shield lattice.', 'shield_void_5', 1,
   '[{"resource_name":"Void Essence","quantity":4},{"resource_name":"Solar Crystals","quantity":10},{"resource_name":"Plasma","quantity":5}]'::jsonb, 'module', 'tech_exotic_defense'),
  ('craft_engine_plasma_3', 'Plasma Drive', 'Craft a plasma-injected drive.', 'engine_plasma_3', 1,
   '[{"resource_name":"Plasma","quantity":8},{"resource_name":"Titanium","quantity":25},{"resource_name":"Crystite","quantity":10}]'::jsonb, 'module', 'tech_high_energy'),
  ('craft_engine_helion_4', 'Helion Drive', 'Craft a Helium-3 torch drive.', 'engine_helion_4', 1,
   '[{"resource_name":"Helium-3","quantity":15},{"resource_name":"Plasma","quantity":10},{"resource_name":"Solar Crystals","quantity":5}]'::jsonb, 'module', 'tech_exotic_drives'),
  ('craft_engine_void_5', 'Void Drive', 'Craft a Dark Matter displacement drive.', 'engine_void_5', 1,
   '[{"resource_name":"Dark Matter","quantity":4},{"resource_name":"Plasma","quantity":15},{"resource_name":"Helium-3","quantity":10}]'::jsonb, 'module', 'tech_exotic_drives'),
  ('craft_reactor_helium_3', 'Helium Fusion Core', 'Craft an He-3 fusion reactor.', 'reactor_helium_3', 1,
   '[{"resource_name":"Helium-3","quantity":12},{"resource_name":"Uranium","quantity":5},{"resource_name":"Titanium","quantity":15}]'::jsonb, 'module', 'tech_high_energy'),
  ('craft_reactor_singularity_5', 'Singularity Core', 'Craft a contained singularity reactor.', 'reactor_singularity_5', 1,
   '[{"resource_name":"Quantum Dust","quantity":5},{"resource_name":"Dark Matter","quantity":2},{"resource_name":"Uranium","quantity":8}]'::jsonb, 'module', 'tech_exotic_drives'),
  ('craft_weapon_beam_3', 'Beam Laser', 'Craft a continuous-focus beam laser.', 'weapon_beam_3', 1,
   '[{"resource_name":"Solar Crystals","quantity":8},{"resource_name":"Crystite","quantity":12},{"resource_name":"Copper","quantity":20}]'::jsonb, 'module', 'tech_adv_munitions'),
  ('craft_weapon_railgun_3', 'Railgun', 'Craft a magnetic railgun.', 'weapon_railgun_3', 1,
   '[{"resource_name":"Titanium","quantity":30},{"resource_name":"Uranium","quantity":6},{"resource_name":"Iron","quantity":20}]'::jsonb, 'module', 'tech_adv_munitions'),
  ('craft_weapon_torpedo_4', 'Quantum Torpedo Launcher', 'Craft an exotic torpedo launcher.', 'weapon_torpedo_4', 1,
   '[{"resource_name":"Quantum Dust","quantity":3},{"resource_name":"Titanium","quantity":20},{"resource_name":"Crystite","quantity":10}]'::jsonb, 'module', 'tech_exotic_weapons'),
  ('craft_weapon_lance_5', 'Plasma Beam Lance', 'Craft a Dark Matter-pumped beam lance.', 'weapon_lance_5', 1,
   '[{"resource_name":"Plasma","quantity":12},{"resource_name":"Dark Matter","quantity":3},{"resource_name":"Solar Crystals","quantity":8}]'::jsonb, 'module', 'tech_exotic_weapons'),
  ('craft_weapon_driver_5', 'Mass Driver Cannon', 'Craft a relativistic mass driver.', 'weapon_driver_5', 1,
   '[{"resource_name":"Ancient Alloy","quantity":6},{"resource_name":"Plasma","quantity":8},{"resource_name":"Titanium","quantity":25}]'::jsonb, 'module', 'tech_exotic_weapons'),
  ('craft_mining_laser_3', 'Resonance Mining Laser', 'Craft an He-3 resonance mining beam.', 'mining_laser_3', 1,
   '[{"resource_name":"Helium-3","quantity":8},{"resource_name":"Crystite","quantity":15},{"resource_name":"Titanium","quantity":12}]'::jsonb, 'module', 'tech_deep_extraction')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. Research nodes — extend the tree to tier 4 (exotic engineering)
-- ============================================
-- Costs follow the existing 4x curve (200/800/2400) -> tier 4 = 6000.
-- Two existing placeholder nodes become real gates:
--   tech_shield_theory (already "Unlocks Reinforced Shield") -> Barrier Web
--   tech_armor_eng     (already "Unlocks Armor Plating class") -> Composite Plating
INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_high_energy',      'propulsion', 3, 'High-Energy Systems',  'Plasma containment + He-3 fusion. Unlocks the Plasma Drive and Helium Fusion Core (T3).', 2400, '["tech_warp_theory"]',      '{"modules":["engine_plasma_3","reactor_helium_3"]}', 115),
  ('tech_exotic_drives',    'propulsion', 4, 'Exotic Propulsion',    'Dark Matter displacement theory. Unlocks the Helion Drive, Void Drive, and Singularity Core (T4-T5).', 6000, '["tech_high_energy"]',  '{"modules":["engine_helion_4","engine_void_5","reactor_singularity_5"]}', 130),
  ('tech_adv_munitions',    'weapons',    3, 'Advanced Munitions',   'Focused beams + magnetic accelerators. Unlocks the Beam Laser and Railgun (T3).', 2400, '["tech_heavy_ord"]',          '{"modules":["weapon_beam_3","weapon_railgun_3"]}', 215),
  ('tech_exotic_weapons',   'weapons',    4, 'Exotic Weaponization', 'Weaponized exotic matter. Unlocks the Quantum Torpedo, Plasma Beam Lance, and Mass Driver Cannon (T4-T5).', 6000, '["tech_adv_munitions"]', '{"modules":["weapon_torpedo_4","weapon_lance_5","weapon_driver_5"]}', 230),
  ('tech_reactive_defense', 'defense',    3, 'Reactive Defense',     'Crystal-resonant shield envelopes. Unlocks the Solar Barrier Array (T3).', 2400, '["tech_armor_eng"]',         '{"modules":["shield_solar_3"]}', 315),
  ('tech_exotic_defense',   'defense',    4, 'Exotic Defenses',      'Void Essence lattices + Ancient Alloy metallurgy. Unlocks the Void Barrier, Alloy Lattice, and Ancient Plate (T4-T5).', 6000, '["tech_reactive_defense"]', '{"modules":["shield_void_5","armor_alloy_4","armor_ancient_5"]}', 330),
  ('tech_deep_extraction',  'industry',   3, 'Deep Extraction',      'Resonance-fracture mining. Unlocks the Resonance Mining Laser (T3).', 2400, '["tech_bulk_process"]',        '{"modules":["mining_laser_3"]}', 415)
ON CONFLICT (id) DO NOTHING;

-- Make the two existing placeholder unlocks real (display-side; the
-- requires_tech columns above are the actual enforcement).
UPDATE tech_definitions SET unlocks = '{"modules":["shield_barrier_2"]}'
  WHERE id = 'tech_shield_theory' AND (unlocks->>'placeholder') IS NOT NULL;
UPDATE tech_definitions SET unlocks = '{"modules":["armor_plate_2"]}'
  WHERE id = 'tech_armor_eng' AND (unlocks->>'placeholder') IS NOT NULL;
