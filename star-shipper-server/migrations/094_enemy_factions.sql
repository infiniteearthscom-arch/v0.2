-- 094: Enemy factions -- the Swarm (bio) and the Synod (machine). Phase A of
-- docs/enemy-factions-spec.md (2026-10-07).
--
-- Adds 18 hull_types rows (price NULL = never sold; nine per faction, each
-- mirroring a player hull by role and scale), 36 enemy_templates with their
-- module fits (existing module_types only), and loot tables. Territory,
-- fleet-size modifiers and the resource-drop loot entries live in code
-- (src/game/factions.js, src/game/enemyManifest.js, api/combat.js).
--
-- Stat rules (spec §4.1): Swarm base_hull = player x1.35, speed x1.25;
-- Synod base_hull = player x0.85, speed x0.85. grid_w/grid_h copy the
-- mirrored hull (the client uses them for displaySize). Slot lists are
-- nominal -- enemy fits are template rows, not slot-validated.
--
-- Faction flavour through the existing damage triangle:
--   Swarm  = armor plates in the shield slot, no shields, missiles + kinetics,
--            fast engines. Bring LASERS.
--   Synod  = shields, lasers (one railgun per flagship), reactors, slow
--            engines, quality bands one step above the Reavers. Bring KINETICS.
-- Original names only (no Warhammer 40,000 terms).

-- ============================================
-- 1. Hulls
-- ============================================
INSERT INTO hull_types (id, name, class, description, price, base_hull, base_speed, base_maneuver, base_sensors, grid_w, grid_h, slots)
VALUES
  -- Swarm (bio): x1.35 hull, x1.25 speed
  ('swarm_needle',    'Needle',    'Swarm', 'A dart of chitin with a single spore sac. Fast, fragile, everywhere.',          NULL, 108,  200, 95, 200,  5,  9,  '[{"id":"wpn1","type":"weapon","x":2,"y":2,"w":1,"h":2},{"id":"def1","type":"shield","x":2,"y":4,"w":1,"h":2},{"id":"eng1","type":"engine","x":2,"y":7,"w":1,"h":2,"required":true}]'::jsonb),
  ('swarm_stalk',     'Stalk',     'Swarm', 'Long-bodied hunter with feeler tendrils. Finds prey before prey finds it.',     NULL, 270,  150, 85, 500,  7,  18, '[{"id":"wpn1","type":"weapon","x":2,"y":4,"w":3,"h":2},{"id":"def1","type":"shield","x":2,"y":8,"w":3,"h":2},{"id":"eng1","type":"engine","x":3,"y":15,"w":1,"h":2,"required":true}]'::jsonb),
  ('swarm_grub',      'Grub',      'Swarm', 'Squat, armoured larva. Slow to kill, slow to care.',                           NULL, 472,  112, 70, 350,  11, 14, '[{"id":"wpn1","type":"weapon","x":4,"y":3,"w":3,"h":2},{"id":"def1","type":"shield","x":4,"y":6,"w":3,"h":2},{"id":"def2","type":"shield","x":4,"y":8,"w":3,"h":2},{"id":"eng1","type":"engine","x":4,"y":11,"w":3,"h":2,"required":true}]'::jsonb),
  ('swarm_bloat',     'Bloat',     'Swarm', 'A swollen abdomen on stubby fins. Carries the brood''s stores -- and drops them.', NULL, 810,  69,  35, 250,  13, 22, '[{"id":"wpn1","type":"weapon","x":5,"y":4,"w":3,"h":2},{"id":"def1","type":"shield","x":5,"y":8,"w":3,"h":2},{"id":"def2","type":"shield","x":5,"y":11,"w":3,"h":2},{"id":"eng1","type":"engine","x":5,"y":19,"w":3,"h":2,"required":true}]'::jsonb),
  ('swarm_mantis',    'Mantis',    'Swarm', 'Winged line-beast with pincer claws. Leads the smaller broods.',               NULL, 675,  94,  55, 400,  17, 11, '[{"id":"wpn1","type":"weapon","x":3,"y":5,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":11,"y":5,"w":3,"h":2},{"id":"def1","type":"shield","x":7,"y":4,"w":3,"h":2},{"id":"eng1","type":"engine","x":7,"y":8,"w":3,"h":2,"required":true}]'::jsonb),
  ('swarm_matriarch', 'Matriarch', 'Swarm', 'Capital-mass brood mother. Spawns Needles mid-fight.',                        NULL, 2700, 31,  10, 800,  19, 32, '[{"id":"wpn1","type":"weapon","x":5,"y":8,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":11,"y":8,"w":3,"h":2},{"id":"wpn3","type":"weapon","x":8,"y":12,"w":3,"h":2},{"id":"def1","type":"shield","x":8,"y":16,"w":3,"h":2},{"id":"def2","type":"shield","x":8,"y":19,"w":3,"h":2},{"id":"eng1","type":"engine","x":8,"y":28,"w":3,"h":2,"required":true}]'::jsonb),
  ('swarm_borer',     'Borer',     'Swarm', 'Belt-grazer with a drill maw. Eats rock, defends the brood''s feeding grounds.', NULL, 540,  75,  35, 250,  9,  12, '[{"id":"wpn1","type":"weapon","x":3,"y":3,"w":3,"h":2},{"id":"def1","type":"shield","x":3,"y":6,"w":3,"h":2},{"id":"eng1","type":"engine","x":3,"y":9,"w":3,"h":2,"required":true}]'::jsonb),
  ('swarm_gnasher',   'Gnasher',   'Swarm', 'Twin-drill excavator-beast. Chews through plating.',                          NULL, 1080, 62,  25, 350,  13, 18, '[{"id":"wpn1","type":"weapon","x":3,"y":4,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":7,"y":4,"w":3,"h":2},{"id":"def1","type":"shield","x":5,"y":8,"w":3,"h":2},{"id":"def2","type":"shield","x":5,"y":11,"w":3,"h":2},{"id":"eng1","type":"engine","x":5,"y":15,"w":3,"h":2,"required":true}]'::jsonb),
  ('swarm_mawqueen',  'Mawqueen',  'Swarm', 'The elder brood. Three drill maws, a forest of spines.',                      NULL, 2025, 37,  12, 500,  17, 24, '[{"id":"wpn1","type":"weapon","x":3,"y":5,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":7,"y":5,"w":3,"h":2},{"id":"wpn3","type":"weapon","x":11,"y":5,"w":3,"h":2},{"id":"def1","type":"shield","x":7,"y":10,"w":3,"h":2},{"id":"def2","type":"shield","x":7,"y":13,"w":3,"h":2},{"id":"eng1","type":"engine","x":7,"y":20,"w":3,"h":2,"required":true}]'::jsonb),
  -- Synod (machine): x0.85 hull, x0.85 speed
  ('synod_sprocket',  'Sprocket',  'Synod', 'A reactor on a spindle with a single laser. The Synod''s smallest voice.',     NULL, 68,   136, 95, 200,  5,  9,  '[{"id":"wpn1","type":"weapon","x":2,"y":2,"w":1,"h":2},{"id":"def1","type":"shield","x":2,"y":4,"w":1,"h":2},{"id":"rct1","type":"reactor","x":2,"y":6,"w":1,"h":1},{"id":"eng1","type":"engine","x":2,"y":7,"w":1,"h":2,"required":true}]'::jsonb),
  ('synod_dowser',    'Dowser',    'Synod', 'Dish-headed scout. Sees you three systems away, tells everyone.',             NULL, 170,  102, 85, 500,  7,  18, '[{"id":"wpn1","type":"weapon","x":2,"y":4,"w":3,"h":2},{"id":"def1","type":"shield","x":2,"y":8,"w":3,"h":2},{"id":"rct1","type":"reactor","x":2,"y":11,"w":3,"h":2},{"id":"eng1","type":"engine","x":3,"y":15,"w":1,"h":2,"required":true}]'::jsonb),
  ('synod_tender',    'Tender',    'Synod', 'Repair boat with four manipulator arms. Keeps the choir''s shields up.',      NULL, 298,  77,  70, 350,  11, 14, '[{"id":"wpn1","type":"weapon","x":4,"y":3,"w":3,"h":2},{"id":"def1","type":"shield","x":4,"y":6,"w":3,"h":2},{"id":"rct1","type":"reactor","x":4,"y":9,"w":3,"h":2},{"id":"eng1","type":"engine","x":4,"y":11,"w":3,"h":2,"required":true}]'::jsonb),
  ('synod_ledger',    'Ledger',    'Synod', 'Armoured archive hull. Thick shields, slow, patient.',                         NULL, 510,  47,  35, 250,  13, 22, '[{"id":"wpn1","type":"weapon","x":5,"y":4,"w":3,"h":2},{"id":"def1","type":"shield","x":5,"y":8,"w":3,"h":2},{"id":"def2","type":"shield","x":5,"y":11,"w":3,"h":2},{"id":"rct1","type":"reactor","x":5,"y":15,"w":3,"h":2},{"id":"eng1","type":"engine","x":5,"y":19,"w":3,"h":2,"required":true}]'::jsonb),
  ('synod_caliper',   'Caliper',   'Synod', 'Wide-armed line ship. Measures you, then cuts.',                              NULL, 425,  64,  55, 400,  17, 11, '[{"id":"wpn1","type":"weapon","x":3,"y":5,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":11,"y":5,"w":3,"h":2},{"id":"def1","type":"shield","x":7,"y":4,"w":3,"h":2},{"id":"rct1","type":"reactor","x":7,"y":6,"w":3,"h":2},{"id":"eng1","type":"engine","x":7,"y":8,"w":3,"h":2,"required":true}]'::jsonb),
  ('synod_orrery',    'Orrery',    'Synod', 'Capital-mass congregation hull. A reactor the size of a station.',           NULL, 1700, 21,  10, 800,  19, 32, '[{"id":"wpn1","type":"weapon","x":5,"y":8,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":11,"y":8,"w":3,"h":2},{"id":"wpn3","type":"weapon","x":8,"y":12,"w":3,"h":2},{"id":"def1","type":"shield","x":8,"y":16,"w":3,"h":2},{"id":"def2","type":"shield","x":8,"y":19,"w":3,"h":2},{"id":"rct1","type":"reactor","x":8,"y":23,"w":3,"h":2},{"id":"eng1","type":"engine","x":8,"y":28,"w":3,"h":2,"required":true}]'::jsonb),
  ('synod_auger',     'Auger',     'Synod', 'Drill-nosed prospector. Guards the Synod''s claims.',                          NULL, 340,  51,  35, 250,  9,  12, '[{"id":"wpn1","type":"weapon","x":3,"y":3,"w":3,"h":2},{"id":"def1","type":"shield","x":3,"y":6,"w":3,"h":2},{"id":"rct1","type":"reactor","x":3,"y":8,"w":3,"h":1},{"id":"eng1","type":"engine","x":3,"y":9,"w":3,"h":2,"required":true}]'::jsonb),
  ('synod_mattock',   'Mattock',   'Synod', 'Heavy excavator frame with three arms. Breaks rock and hulls alike.',          NULL, 680,  42,  25, 350,  13, 18, '[{"id":"wpn1","type":"weapon","x":3,"y":4,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":7,"y":4,"w":3,"h":2},{"id":"def1","type":"shield","x":5,"y":8,"w":3,"h":2},{"id":"rct1","type":"reactor","x":5,"y":11,"w":3,"h":2},{"id":"eng1","type":"engine","x":5,"y":15,"w":3,"h":2,"required":true}]'::jsonb),
  ('synod_anvilcrown','Anvilcrown','Synod', 'The Synod''s cathedral hull. Masts, dishes, and a crown of arms.',           NULL, 1275, 25,  12, 500,  17, 24, '[{"id":"wpn1","type":"weapon","x":3,"y":5,"w":3,"h":2},{"id":"wpn2","type":"weapon","x":7,"y":5,"w":3,"h":2},{"id":"wpn3","type":"weapon","x":11,"y":5,"w":3,"h":2},{"id":"def1","type":"shield","x":7,"y":10,"w":3,"h":2},{"id":"def2","type":"shield","x":7,"y":13,"w":3,"h":2},{"id":"rct1","type":"reactor","x":7,"y":17,"w":3,"h":2},{"id":"eng1","type":"engine","x":7,"y":20,"w":3,"h":2,"required":true}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. Templates
-- ============================================
INSERT INTO enemy_templates (id, name, tier, faction, hull_type_id, role, behavior_mode, spawn_weight, loot_multiplier, is_elite, description) VALUES
  -- ---- SWARM ----
  ('swarm_needle_t1',     'Needle',            1, 'swarm', 'swarm_needle',    'escort',   'swarm', 12, 1.0, FALSE, 'Spore-dart. Plate and a cannon-maw.'),
  ('swarm_grub_t1',       'Grub',              1, 'swarm', 'swarm_grub',      'escort',   'swarm', 8,  1.0, FALSE, 'Armoured larva. Takes a while to crack.'),
  ('swarm_stalk_t1',      'Stalk',             1, 'swarm', 'swarm_stalk',     'flagship', 'swarm', 10, 1.2, FALSE, 'Brood leader at T1. Fast, finds you first.'),
  ('swarm_needle_t2',     'Barbed Needle',     2, 'swarm', 'swarm_needle',    'escort',   'swarm', 10, 1.0, FALSE, 'Needle with a missile sac.'),
  ('swarm_borer_t2',      'Borer',             2, 'swarm', 'swarm_borer',     'escort',   'swarm', 8,  1.0, FALSE, 'Belt-grazer. Drill maw hits like a cannon.'),
  ('swarm_grub_t2',       'Fat Grub',          2, 'swarm', 'swarm_grub',      'line',     'swarm', 10, 1.1, FALSE, 'Two plates deep. Kill the Needles first.'),
  ('swarm_mantis_t2',     'Mantis',            2, 'swarm', 'swarm_mantis',    'flagship', 'swarm', 10, 1.3, FALSE, 'Winged brood leader. Missiles and claws.'),
  ('swarm_stalk_t3',      'Long Stalk',        3, 'swarm', 'swarm_stalk',     'escort',   'swarm', 10, 1.0, FALSE, 'Railgun-maw hunter.'),
  ('swarm_gnasher_t3',    'Gnasher',           3, 'swarm', 'swarm_gnasher',   'line',     'swarm', 10, 1.2, FALSE, 'Twin drills, double plate.'),
  ('swarm_bloat_t3',      'Bloat',             3, 'swarm', 'swarm_bloat',     'line',     'swarm', 8,  1.2, FALSE, 'The brood''s stores. Pops into resources.'),
  ('swarm_mantis_t3',     'Mantis Alpha',      3, 'swarm', 'swarm_mantis',    'flagship', 'swarm', 10, 1.5, FALSE, 'Rail and missile flagship under thick chitin.'),
  ('swarm_gnasher_t4',    'Gnasher Prime',     4, 'swarm', 'swarm_gnasher',   'escort',   'swarm', 10, 1.0, FALSE, 'Alloy-hard chitin, twin rails.'),
  ('swarm_bloat_t4',      'Great Bloat',       4, 'swarm', 'swarm_bloat',     'line',     'swarm', 8,  1.2, FALSE, 'Torpedo sacs. Shields mean nothing to it.'),
  ('swarm_matriarch_t4',  'Matriarch',         4, 'swarm', 'swarm_matriarch', 'flagship', 'swarm', 10, 1.6, FALSE, 'Capital brood mother. Rails, torpedoes, alloy chitin.'),
  ('swarm_brood_sovereign','Brood Sovereign',  4, 'swarm', 'swarm_matriarch', 'elite',    'swarm', 3,  3.0, TRUE,  'Named T4 elite. Guaranteed exotic drops.'),
  ('swarm_mantis_t5',     'Mantis Omega',      5, 'swarm', 'swarm_mantis',    'escort',   'swarm', 10, 1.0, FALSE, 'Mass-driver maw in ancient chitin.'),
  ('swarm_bloat_t5',      'Carrion Bloat',     5, 'swarm', 'swarm_bloat',     'line',     'swarm', 6,  1.3, FALSE, 'Torpedo stores. Drops Void Essence.'),
  ('swarm_matriarch_t5',  'Elder Matriarch',   5, 'swarm', 'swarm_matriarch', 'flagship', 'swarm', 10, 1.8, FALSE, 'Driver, torpedoes, ancient plate twice over.'),
  ('swarm_hollow_mother', 'The Hollow Mother', 5, 'swarm', 'swarm_mawqueen',  'elite',    'swarm', 3,  4.0, TRUE,  'Named T5 elite. The Hive Nest''s heart.'),
  -- ---- SYNOD ----
  ('synod_sprocket_t1',   'Sprocket',          1, 'synod', 'synod_sprocket',  'escort',   'synod', 12, 1.0, FALSE, 'Pulse laser on a reactor spindle.'),
  ('synod_dowser_t1',     'Dowser',            1, 'synod', 'synod_dowser',    'escort',   'synod', 8,  1.0, FALSE, 'Scout dish. Calls the others.'),
  ('synod_tender_t1',     'Tender',            1, 'synod', 'synod_tender',    'flagship', 'synod', 10, 1.2, FALSE, 'Repair boat leading a picket.'),
  ('synod_sprocket_t2',   'Geared Sprocket',   2, 'synod', 'synod_sprocket',  'escort',   'synod', 10, 1.0, FALSE, 'Barrier web, pulse laser, better reactor.'),
  ('synod_auger_t2',      'Auger',             2, 'synod', 'synod_auger',     'escort',   'synod', 8,  1.0, FALSE, 'Claim-guard prospector.'),
  ('synod_tender_t2',     'Choir Tender',      2, 'synod', 'synod_tender',    'line',     'synod', 10, 1.1, FALSE, 'Keeps the pool''s shield up. Kill it first.'),
  ('synod_caliper_t2',    'Caliper',           2, 'synod', 'synod_caliper',   'flagship', 'synod', 10, 1.3, FALSE, 'Laser + railgun flagship behind a barrier web.'),
  ('synod_dowser_t3',     'Deep Dowser',       3, 'synod', 'synod_dowser',    'escort',   'synod', 10, 1.0, FALSE, 'Beam-laser scout.'),
  ('synod_mattock_t3',    'Mattock',           3, 'synod', 'synod_mattock',   'line',     'synod', 10, 1.2, FALSE, 'Two beams under a solar barrier.'),
  ('synod_ledger_t3',     'Ledger',            3, 'synod', 'synod_ledger',    'line',     'synod', 8,  1.2, FALSE, 'Double solar barrier. Drops modules.'),
  ('synod_caliper_t3',    'Caliper Prime',     3, 'synod', 'synod_caliper',   'flagship', 'synod', 10, 1.5, FALSE, 'Beam + rail flagship, solar barrier, helium core.'),
  ('synod_mattock_t4',    'Great Mattock',     4, 'synod', 'synod_mattock',   'escort',   'synod', 10, 1.0, FALSE, 'Twin beams, doubled barriers.'),
  ('synod_ledger_t4',     'Sealed Ledger',     4, 'synod', 'synod_ledger',    'line',     'synod', 8,  1.2, FALSE, 'Three barriers deep. Bring kinetics.'),
  ('synod_orrery_t4',     'Orrery',            4, 'synod', 'synod_orrery',    'flagship', 'synod', 10, 1.6, FALSE, 'Capital congregation. Beams, a railgun, layered barriers.'),
  ('synod_choir_primus',  'Choir Primus',      4, 'synod', 'synod_orrery',    'elite',    'synod', 3,  3.0, TRUE,  'Named T4 elite. Guaranteed module drops.'),
  ('synod_caliper_t5',    'Caliper Omega',     5, 'synod', 'synod_caliper',   'escort',   'synod', 10, 1.0, FALSE, 'Plasma lance under a void barrier.'),
  ('synod_ledger_t5',     'Iron Ledger',       5, 'synod', 'synod_ledger',    'line',     'synod', 6,  1.3, FALSE, 'Void barriers, singularity core.'),
  ('synod_orrery_t5',     'Grand Orrery',      5, 'synod', 'synod_orrery',    'flagship', 'synod', 10, 1.8, FALSE, 'Lances, a mass driver, void barriers.'),
  ('synod_calibrant_nine','Calibrant Nine',    5, 'synod', 'synod_anvilcrown','elite',    'synod', 3,  4.0, TRUE,  'Named T5 elite. The Forge Choir''s conductor.')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. Fits (existing module_types only)
--    Swarm bands match the Reavers; Synod bands sit one step higher.
-- ============================================
INSERT INTO enemy_template_modules (template_id, slot_type, module_type_id, quality_min, quality_max) VALUES
  -- SWARM T1
  ('swarm_needle_t1',     'weapon', 'weapon_cannon',        30, 55),
  ('swarm_needle_t1',     'shield', 'armor_plate_1',        30, 55),
  ('swarm_needle_t1',     'engine', 'engine_advanced',      30, 55),
  ('swarm_grub_t1',       'weapon', 'weapon_cannon',        30, 55),
  ('swarm_grub_t1',       'shield', 'armor_plate_1',        30, 55),
  ('swarm_grub_t1',       'shield', 'armor_plate_1',        30, 55),
  ('swarm_grub_t1',       'engine', 'engine_basic',         30, 55),
  ('swarm_stalk_t1',      'weapon', 'weapon_cannon',        35, 60),
  ('swarm_stalk_t1',      'weapon', 'weapon_missile_basic', 35, 60),
  ('swarm_stalk_t1',      'shield', 'armor_plate_1',        35, 60),
  ('swarm_stalk_t1',      'engine', 'engine_advanced',      35, 60),
  -- SWARM T2
  ('swarm_needle_t2',     'weapon', 'weapon_missile_basic', 40, 65),
  ('swarm_needle_t2',     'shield', 'armor_plate_2',        40, 65),
  ('swarm_needle_t2',     'engine', 'engine_advanced',      40, 65),
  ('swarm_borer_t2',      'weapon', 'weapon_cannon',        40, 65),
  ('swarm_borer_t2',      'shield', 'armor_plate_2',        40, 65),
  ('swarm_borer_t2',      'engine', 'engine_advanced',      40, 65),
  ('swarm_grub_t2',       'weapon', 'weapon_cannon',        40, 65),
  ('swarm_grub_t2',       'shield', 'armor_plate_2',        40, 65),
  ('swarm_grub_t2',       'shield', 'armor_plate_2',        40, 65),
  ('swarm_grub_t2',       'engine', 'engine_advanced',      40, 65),
  ('swarm_mantis_t2',     'weapon', 'weapon_missile_basic', 45, 70),
  ('swarm_mantis_t2',     'weapon', 'weapon_cannon',        45, 70),
  ('swarm_mantis_t2',     'shield', 'armor_plate_2',        45, 70),
  ('swarm_mantis_t2',     'engine', 'engine_plasma_3',      45, 70),
  -- SWARM T3
  ('swarm_stalk_t3',      'weapon', 'weapon_railgun_3',     45, 70),
  ('swarm_stalk_t3',      'shield', 'armor_plate_2',        45, 70),
  ('swarm_stalk_t3',      'engine', 'engine_plasma_3',      45, 70),
  ('swarm_gnasher_t3',    'weapon', 'weapon_railgun_3',     45, 70),
  ('swarm_gnasher_t3',    'weapon', 'weapon_cannon',        45, 70),
  ('swarm_gnasher_t3',    'shield', 'armor_plate_2',        45, 70),
  ('swarm_gnasher_t3',    'shield', 'armor_plate_2',        45, 70),
  ('swarm_gnasher_t3',    'engine', 'engine_plasma_3',      45, 70),
  ('swarm_bloat_t3',      'weapon', 'weapon_missile_basic', 45, 70),
  ('swarm_bloat_t3',      'shield', 'armor_plate_2',        45, 70),
  ('swarm_bloat_t3',      'shield', 'armor_plate_2',        45, 70),
  ('swarm_bloat_t3',      'engine', 'engine_advanced',      45, 70),
  ('swarm_mantis_t3',     'weapon', 'weapon_railgun_3',     50, 75),
  ('swarm_mantis_t3',     'weapon', 'weapon_missile_basic', 50, 75),
  ('swarm_mantis_t3',     'shield', 'armor_plate_2',        50, 75),
  ('swarm_mantis_t3',     'shield', 'armor_plate_2',        50, 75),
  ('swarm_mantis_t3',     'engine', 'engine_plasma_3',      50, 75),
  -- SWARM T4
  ('swarm_gnasher_t4',    'weapon', 'weapon_railgun_3',     55, 80),
  ('swarm_gnasher_t4',    'weapon', 'weapon_railgun_3',     55, 80),
  ('swarm_gnasher_t4',    'shield', 'armor_alloy_4',        55, 80),
  ('swarm_gnasher_t4',    'engine', 'engine_helion_4',      55, 80),
  ('swarm_bloat_t4',      'weapon', 'weapon_torpedo_4',     55, 80),
  ('swarm_bloat_t4',      'shield', 'armor_alloy_4',        55, 80),
  ('swarm_bloat_t4',      'shield', 'armor_plate_2',        55, 80),
  ('swarm_bloat_t4',      'engine', 'engine_plasma_3',      55, 80),
  ('swarm_matriarch_t4',  'weapon', 'weapon_torpedo_4',     60, 85),
  ('swarm_matriarch_t4',  'weapon', 'weapon_railgun_3',     60, 85),
  ('swarm_matriarch_t4',  'weapon', 'weapon_cannon',        60, 85),
  ('swarm_matriarch_t4',  'shield', 'armor_alloy_4',        60, 85),
  ('swarm_matriarch_t4',  'shield', 'armor_alloy_4',        60, 85),
  ('swarm_matriarch_t4',  'engine', 'engine_helion_4',      60, 85),
  ('swarm_brood_sovereign','weapon','weapon_torpedo_4',     75, 90),
  ('swarm_brood_sovereign','weapon','weapon_railgun_3',     75, 90),
  ('swarm_brood_sovereign','weapon','weapon_railgun_3',     75, 90),
  ('swarm_brood_sovereign','shield','armor_alloy_4',        75, 90),
  ('swarm_brood_sovereign','shield','armor_alloy_4',        75, 90),
  ('swarm_brood_sovereign','engine','engine_helion_4',      75, 90),
  -- SWARM T5
  ('swarm_mantis_t5',     'weapon', 'weapon_driver_5',      60, 85),
  ('swarm_mantis_t5',     'shield', 'armor_ancient_5',      60, 85),
  ('swarm_mantis_t5',     'engine', 'engine_void_5',        60, 85),
  ('swarm_bloat_t5',      'weapon', 'weapon_torpedo_4',     60, 85),
  ('swarm_bloat_t5',      'weapon', 'weapon_torpedo_4',     60, 85),
  ('swarm_bloat_t5',      'shield', 'armor_ancient_5',      60, 85),
  ('swarm_bloat_t5',      'shield', 'armor_alloy_4',        60, 85),
  ('swarm_bloat_t5',      'engine', 'engine_helion_4',      60, 85),
  ('swarm_matriarch_t5',  'weapon', 'weapon_driver_5',      65, 90),
  ('swarm_matriarch_t5',  'weapon', 'weapon_torpedo_4',     65, 90),
  ('swarm_matriarch_t5',  'weapon', 'weapon_torpedo_4',     65, 90),
  ('swarm_matriarch_t5',  'shield', 'armor_ancient_5',      65, 90),
  ('swarm_matriarch_t5',  'shield', 'armor_ancient_5',      65, 90),
  ('swarm_matriarch_t5',  'engine', 'engine_void_5',        65, 90),
  ('swarm_hollow_mother', 'weapon', 'weapon_driver_5',      80, 95),
  ('swarm_hollow_mother', 'weapon', 'weapon_driver_5',      80, 95),
  ('swarm_hollow_mother', 'weapon', 'weapon_torpedo_4',     80, 95),
  ('swarm_hollow_mother', 'shield', 'armor_ancient_5',      80, 95),
  ('swarm_hollow_mother', 'shield', 'armor_ancient_5',      80, 95),
  ('swarm_hollow_mother', 'shield', 'armor_alloy_4',        80, 95),
  ('swarm_hollow_mother', 'engine', 'engine_void_5',        80, 95),
  -- SYNOD T1 (bands +1 step)
  ('synod_sprocket_t1',   'weapon', 'weapon_laser',         35, 60),
  ('synod_sprocket_t1',   'shield', 'shield_basic',         35, 60),
  ('synod_sprocket_t1',   'reactor','reactor_basic',        35, 60),
  ('synod_sprocket_t1',   'engine', 'engine_basic',         35, 60),
  ('synod_dowser_t1',     'weapon', 'weapon_laser',         35, 60),
  ('synod_dowser_t1',     'shield', 'shield_basic',         35, 60),
  ('synod_dowser_t1',     'reactor','reactor_basic',        35, 60),
  ('synod_dowser_t1',     'engine', 'engine_basic',         35, 60),
  ('synod_tender_t1',     'weapon', 'weapon_laser',         40, 65),
  ('synod_tender_t1',     'shield', 'shield_basic',         40, 65),
  ('synod_tender_t1',     'shield', 'shield_basic',         40, 65),
  ('synod_tender_t1',     'reactor','reactor_advanced',     40, 65),
  ('synod_tender_t1',     'engine', 'engine_basic',         40, 65),
  -- SYNOD T2
  ('synod_sprocket_t2',   'weapon', 'weapon_laser',         45, 70),
  ('synod_sprocket_t2',   'shield', 'shield_barrier_2',     45, 70),
  ('synod_sprocket_t2',   'reactor','reactor_advanced',     45, 70),
  ('synod_sprocket_t2',   'engine', 'engine_basic',         45, 70),
  ('synod_auger_t2',      'weapon', 'weapon_laser',         45, 70),
  ('synod_auger_t2',      'shield', 'shield_barrier_2',     45, 70),
  ('synod_auger_t2',      'reactor','reactor_advanced',     45, 70),
  ('synod_auger_t2',      'engine', 'engine_basic',         45, 70),
  ('synod_tender_t2',     'weapon', 'weapon_laser',         45, 70),
  ('synod_tender_t2',     'shield', 'shield_barrier_2',     45, 70),
  ('synod_tender_t2',     'shield', 'shield_barrier_2',     45, 70),
  ('synod_tender_t2',     'reactor','reactor_advanced',     45, 70),
  ('synod_tender_t2',     'engine', 'engine_basic',         45, 70),
  ('synod_caliper_t2',    'weapon', 'weapon_laser',         50, 75),
  ('synod_caliper_t2',    'weapon', 'weapon_railgun_3',     50, 75),
  ('synod_caliper_t2',    'shield', 'shield_barrier_2',     50, 75),
  ('synod_caliper_t2',    'reactor','reactor_advanced',     50, 75),
  ('synod_caliper_t2',    'engine', 'engine_advanced',      50, 75),
  -- SYNOD T3
  ('synod_dowser_t3',     'weapon', 'weapon_beam_3',        55, 80),
  ('synod_dowser_t3',     'shield', 'shield_solar_3',       55, 80),
  ('synod_dowser_t3',     'reactor','reactor_helium_3',     55, 80),
  ('synod_dowser_t3',     'engine', 'engine_advanced',      55, 80),
  ('synod_mattock_t3',    'weapon', 'weapon_beam_3',        55, 80),
  ('synod_mattock_t3',    'weapon', 'weapon_beam_3',        55, 80),
  ('synod_mattock_t3',    'shield', 'shield_solar_3',       55, 80),
  ('synod_mattock_t3',    'reactor','reactor_helium_3',     55, 80),
  ('synod_mattock_t3',    'engine', 'engine_advanced',      55, 80),
  ('synod_ledger_t3',     'weapon', 'weapon_beam_3',        55, 80),
  ('synod_ledger_t3',     'shield', 'shield_solar_3',       55, 80),
  ('synod_ledger_t3',     'shield', 'shield_solar_3',       55, 80),
  ('synod_ledger_t3',     'reactor','reactor_helium_3',     55, 80),
  ('synod_ledger_t3',     'engine', 'engine_basic',         55, 80),
  ('synod_caliper_t3',    'weapon', 'weapon_beam_3',        60, 85),
  ('synod_caliper_t3',    'weapon', 'weapon_railgun_3',     60, 85),
  ('synod_caliper_t3',    'shield', 'shield_solar_3',       60, 85),
  ('synod_caliper_t3',    'shield', 'shield_barrier_2',     60, 85),
  ('synod_caliper_t3',    'reactor','reactor_helium_3',     60, 85),
  ('synod_caliper_t3',    'engine', 'engine_advanced',      60, 85),
  -- SYNOD T4
  ('synod_mattock_t4',    'weapon', 'weapon_beam_3',        65, 85),
  ('synod_mattock_t4',    'weapon', 'weapon_beam_3',        65, 85),
  ('synod_mattock_t4',    'shield', 'shield_solar_3',       65, 85),
  ('synod_mattock_t4',    'shield', 'shield_solar_3',       65, 85),
  ('synod_mattock_t4',    'reactor','reactor_helium_3',     65, 85),
  ('synod_mattock_t4',    'engine', 'engine_advanced',      65, 85),
  ('synod_ledger_t4',     'weapon', 'weapon_beam_3',        65, 85),
  ('synod_ledger_t4',     'shield', 'shield_solar_3',       65, 85),
  ('synod_ledger_t4',     'shield', 'shield_solar_3',       65, 85),
  ('synod_ledger_t4',     'shield', 'shield_barrier_2',     65, 85),
  ('synod_ledger_t4',     'reactor','reactor_helium_3',     65, 85),
  ('synod_ledger_t4',     'engine', 'engine_basic',         65, 85),
  ('synod_orrery_t4',     'weapon', 'weapon_beam_3',        70, 88),
  ('synod_orrery_t4',     'weapon', 'weapon_beam_3',        70, 88),
  ('synod_orrery_t4',     'weapon', 'weapon_railgun_3',     70, 88),
  ('synod_orrery_t4',     'shield', 'shield_solar_3',       70, 88),
  ('synod_orrery_t4',     'shield', 'shield_solar_3',       70, 88),
  ('synod_orrery_t4',     'reactor','reactor_helium_3',     70, 88),
  ('synod_orrery_t4',     'engine', 'engine_advanced',      70, 88),
  ('synod_choir_primus',  'weapon', 'weapon_lance_5',       80, 92),
  ('synod_choir_primus',  'weapon', 'weapon_beam_3',        80, 92),
  ('synod_choir_primus',  'weapon', 'weapon_railgun_3',     80, 92),
  ('synod_choir_primus',  'shield', 'shield_void_5',        80, 92),
  ('synod_choir_primus',  'shield', 'shield_solar_3',       80, 92),
  ('synod_choir_primus',  'reactor','reactor_singularity_5',80, 92),
  ('synod_choir_primus',  'engine', 'engine_plasma_3',      80, 92),
  -- SYNOD T5
  ('synod_caliper_t5',    'weapon', 'weapon_lance_5',       70, 90),
  ('synod_caliper_t5',    'shield', 'shield_void_5',        70, 90),
  ('synod_caliper_t5',    'reactor','reactor_singularity_5',70, 90),
  ('synod_caliper_t5',    'engine', 'engine_advanced',      70, 90),
  ('synod_ledger_t5',     'weapon', 'weapon_beam_3',        70, 90),
  ('synod_ledger_t5',     'weapon', 'weapon_lance_5',       70, 90),
  ('synod_ledger_t5',     'shield', 'shield_void_5',        70, 90),
  ('synod_ledger_t5',     'shield', 'shield_void_5',        70, 90),
  ('synod_ledger_t5',     'reactor','reactor_singularity_5',70, 90),
  ('synod_ledger_t5',     'engine', 'engine_basic',         70, 90),
  ('synod_orrery_t5',     'weapon', 'weapon_lance_5',       75, 92),
  ('synod_orrery_t5',     'weapon', 'weapon_lance_5',       75, 92),
  ('synod_orrery_t5',     'weapon', 'weapon_driver_5',      75, 92),
  ('synod_orrery_t5',     'shield', 'shield_void_5',        75, 92),
  ('synod_orrery_t5',     'shield', 'shield_void_5',        75, 92),
  ('synod_orrery_t5',     'reactor','reactor_singularity_5',75, 92),
  ('synod_orrery_t5',     'engine', 'engine_plasma_3',      75, 92),
  ('synod_calibrant_nine','weapon', 'weapon_lance_5',       85, 97),
  ('synod_calibrant_nine','weapon', 'weapon_lance_5',       85, 97),
  ('synod_calibrant_nine','weapon', 'weapon_driver_5',      85, 97),
  ('synod_calibrant_nine','shield', 'shield_void_5',        85, 97),
  ('synod_calibrant_nine','shield', 'shield_void_5',        85, 97),
  ('synod_calibrant_nine','shield', 'shield_solar_3',       85, 97),
  ('synod_calibrant_nine','reactor','reactor_singularity_5',85, 97),
  ('synod_calibrant_nine','engine', 'engine_plasma_3',      85, 97);

-- ============================================
-- 4. Loot tables
--    Module entries: {module_type_id, chance, quality:[min,max]} (077).
--    NEW resource entries (spec §4.4): {kind:"resource", resource_name,
--    quantity:[min,max], quality:[min,max], chance}. Resolved by name in
--    /combat/claim-loot so processed materials (serial ids) work too.
-- ============================================
-- Swarm: carcasses drop biologicals, deeper broods drop exotics.
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Spores","quantity":[6,14],"quality":[45,70],"chance":0.7}]'::jsonb WHERE id IN ('swarm_needle_t1','swarm_stalk_t1','swarm_needle_t2','swarm_borer_t2');
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Spores","quantity":[10,24],"quality":[50,75],"chance":0.85},{"kind":"resource","resource_name":"Amber Sap","quantity":[4,10],"quality":[50,75],"chance":0.5}]'::jsonb WHERE id IN ('swarm_grub_t1','swarm_grub_t2','swarm_mantis_t2');
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Amber Sap","quantity":[8,18],"quality":[55,80],"chance":0.8},{"kind":"resource","resource_name":"Plasma","quantity":[3,8],"quality":[55,80],"chance":0.4}]'::jsonb WHERE id IN ('swarm_stalk_t3','swarm_gnasher_t3','swarm_mantis_t3');
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Spores","quantity":[20,40],"quality":[55,80],"chance":1.0},{"kind":"resource","resource_name":"Amber Sap","quantity":[12,24],"quality":[55,80],"chance":0.9},{"kind":"resource","resource_name":"Plasma","quantity":[4,10],"quality":[55,80],"chance":0.5}]'::jsonb WHERE id = 'swarm_bloat_t3';
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Plasma","quantity":[6,14],"quality":[60,85],"chance":0.8},{"kind":"resource","resource_name":"Helium-3","quantity":[4,10],"quality":[60,85],"chance":0.5}]'::jsonb WHERE id IN ('swarm_gnasher_t4','swarm_matriarch_t4');
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Amber Sap","quantity":[16,30],"quality":[60,85],"chance":1.0},{"kind":"resource","resource_name":"Plasma","quantity":[8,16],"quality":[60,85],"chance":0.9},{"kind":"resource","resource_name":"Void Essence","quantity":[1,3],"quality":[60,85],"chance":0.25}]'::jsonb WHERE id = 'swarm_bloat_t4';
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Plasma","quantity":[10,20],"quality":[65,90],"chance":0.9},{"kind":"resource","resource_name":"Void Essence","quantity":[2,5],"quality":[65,90],"chance":0.5},{"kind":"resource","resource_name":"Dark Matter","quantity":[1,3],"quality":[65,90],"chance":0.35}]'::jsonb WHERE id = 'swarm_brood_sovereign';
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Plasma","quantity":[8,16],"quality":[65,90],"chance":0.8},{"kind":"resource","resource_name":"Void Essence","quantity":[1,3],"quality":[65,90],"chance":0.25}]'::jsonb WHERE id IN ('swarm_mantis_t5','swarm_matriarch_t5');
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Amber Sap","quantity":[20,36],"quality":[65,90],"chance":1.0},{"kind":"resource","resource_name":"Void Essence","quantity":[2,6],"quality":[65,90],"chance":0.6},{"kind":"resource","resource_name":"Dark Matter","quantity":[1,2],"quality":[65,90],"chance":0.2}]'::jsonb WHERE id = 'swarm_bloat_t5';
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Void Essence","quantity":[4,8],"quality":[75,95],"chance":1.0},{"kind":"resource","resource_name":"Dark Matter","quantity":[2,5],"quality":[75,95],"chance":1.0},{"kind":"resource","resource_name":"Quantum Dust","quantity":[1,3],"quality":[75,95],"chance":0.5}]'::jsonb WHERE id = 'swarm_hollow_mother';

-- Synod: parts and modules.
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Copper Ingot","quantity":[2,5],"quality":[45,65],"chance":0.6}]'::jsonb WHERE id IN ('synod_sprocket_t1','synod_dowser_t1','synod_sprocket_t2','synod_auger_t2');
UPDATE enemy_templates SET loot_table = '[{"kind":"resource","resource_name":"Iron Ingot","quantity":[3,6],"quality":[45,65],"chance":0.7},{"kind":"resource","resource_name":"Copper Ingot","quantity":[2,5],"quality":[45,65],"chance":0.5}]'::jsonb WHERE id IN ('synod_tender_t1','synod_tender_t2','synod_caliper_t2');
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"shield_solar_3","chance":0.12,"quality":[55,75]},{"kind":"resource","resource_name":"Copper Ingot","quantity":[3,7],"quality":[50,70],"chance":0.6}]'::jsonb WHERE id IN ('synod_dowser_t3','synod_mattock_t3','synod_caliper_t3');
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"shield_solar_3","chance":0.25,"quality":[55,78]},{"module_type_id":"weapon_beam_3","chance":0.15,"quality":[55,78]}]'::jsonb WHERE id = 'synod_ledger_t3';
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"weapon_beam_3","chance":0.2,"quality":[60,82]},{"module_type_id":"reactor_helium_3","chance":0.15,"quality":[60,82]}]'::jsonb WHERE id IN ('synod_mattock_t4','synod_orrery_t4');
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"shield_solar_3","chance":0.3,"quality":[62,85]},{"module_type_id":"reactor_helium_3","chance":0.2,"quality":[62,85]}]'::jsonb WHERE id = 'synod_ledger_t4';
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"weapon_lance_5","chance":0.6,"quality":[78,92]},{"module_type_id":"shield_void_5","chance":0.5,"quality":[78,92]},{"module_type_id":"reactor_singularity_5","chance":0.3,"quality":[78,92]}]'::jsonb WHERE id = 'synod_choir_primus';
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"weapon_lance_5","chance":0.12,"quality":[65,88]},{"module_type_id":"shield_void_5","chance":0.12,"quality":[65,88]}]'::jsonb WHERE id IN ('synod_caliper_t5','synod_orrery_t5');
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"shield_void_5","chance":0.25,"quality":[68,90]},{"module_type_id":"reactor_singularity_5","chance":0.2,"quality":[68,90]}]'::jsonb WHERE id = 'synod_ledger_t5';
UPDATE enemy_templates SET loot_table = '[{"module_type_id":"shield_void_5","chance":1.0,"quality":[85,97]},{"module_type_id":"weapon_lance_5","chance":1.0,"quality":[85,97]},{"module_type_id":"reactor_singularity_5","chance":0.5,"quality":[85,97]}]'::jsonb WHERE id = 'synod_calibrant_nine';
