-- Migration 069: Combat redesign Phase 2 — enemy template system (2026-09-17)
-- Per docs/combat-redesign-plan.md Phase 2 + settled point A4 ("enemies
-- use the player's systems").
--
-- Enemies are now ASSEMBLED from the player's own catalogs: a real
-- hull_types row (base_hull = HP, base_speed) plus module_types rows
-- (weapons / shield-slot defenses / engines) with a per-module quality
-- range. The server generates each system's spawn manifest FROM these
-- templates (src/game/enemyManifest.js) and the client renders/simulates
-- what it is handed. This DELETES the hand-mirrored pirateManifest.js +
-- the client-side PIRATE_* catalogs (CLAUDE.md pitfall #16, manifest half).
--
--   1. The three pirate-visual hulls (client shipRenderer.js PIRATE_HULLS)
--      become hull_types rows so enemies can reference them like any
--      other hull. price NULL = never sold (vendor filters price IS NOT
--      NULL). base_hull keeps the pre-Phase-2 class HP (60/140/280).
--   2. enemy_templates + enemy_template_modules.
--   3. Seed roster: 18 templates across tiers 1–5 incl. two elites
--      (T4 captain, T5 named admiral). Faction is data-only for now.
--
-- Fleet composition / counts / loot live in enemyManifest.js, not here.

-- ============================================
-- 1. Pirate hulls as real hull_types rows
-- ============================================
INSERT INTO hull_types (id, name, class, description, price, base_hull, base_speed, base_maneuver, base_sensors, grid_w, grid_h, slots)
VALUES
  ('pirate_interceptor', 'Reaver Interceptor', 'Pirate',
   'Stripped-down raider hull. Fast, fragile, cheap to lose.', NULL,
   60, 160, 90, 200, 7, 11,
   '[
     {"id":"eng1","type":"engine","x":3,"y":9,"w":1,"h":2,"required":true},
     {"id":"wpn1","type":"weapon","x":2,"y":2,"w":3,"h":2},
     {"id":"def1","type":"shield","x":2,"y":5,"w":3,"h":2},
     {"id":"rct1","type":"reactor","x":2,"y":7,"w":3,"h":2}
   ]'::jsonb),
  ('pirate_marauder', 'Reaver Marauder', 'Pirate',
   'Mid-weight raider. Two gun mounts and room for plating.', NULL,
   140, 120, 65, 250, 9, 14,
   '[
     {"id":"eng1","type":"engine","x":4,"y":12,"w":1,"h":2,"required":true},
     {"id":"wpn1","type":"weapon","x":1,"y":3,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":5,"y":3,"w":3,"h":2},
     {"id":"def1","type":"shield","x":3,"y":6,"w":3,"h":2},
     {"id":"rct1","type":"reactor","x":3,"y":9,"w":3,"h":2}
   ]'::jsonb),
  ('pirate_destroyer', 'Reaver Destroyer', 'Pirate',
   'Heavy raider line ship. Slow, layered, and mean.', NULL,
   280, 90, 40, 300, 11, 18,
   '[
     {"id":"eng1","type":"engine","x":5,"y":16,"w":1,"h":2,"required":true},
     {"id":"wpn1","type":"weapon","x":1,"y":3,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":7,"y":3,"w":3,"h":2},
     {"id":"def1","type":"shield","x":4,"y":6,"w":3,"h":2},
     {"id":"def2","type":"shield","x":4,"y":9,"w":3,"h":2},
     {"id":"rct1","type":"reactor","x":4,"y":12,"w":3,"h":2}
   ]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. Template tables
-- ============================================
CREATE TABLE IF NOT EXISTS enemy_templates (
  id              VARCHAR(64) PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,          -- display name, tier is prefixed at spawn ("T3 Reaver Corsair")
  tier            INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 5),
  faction         VARCHAR(64) NOT NULL DEFAULT 'void_reavers',
  hull_type_id    VARCHAR(32) NOT NULL REFERENCES hull_types(id),
  role            VARCHAR(16) NOT NULL DEFAULT 'escort'   -- escort | line | flagship | elite
                  CHECK (role IN ('escort', 'line', 'flagship', 'elite')),
  behavior_mode   VARCHAR(32) NOT NULL DEFAULT 'aggressive', -- data only until Phase 4 behavior tiers
  spawn_weight    INTEGER NOT NULL DEFAULT 10,    -- relative pick weight within (tier, role)
  loot_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  is_elite        BOOLEAN NOT NULL DEFAULT FALSE,
  loot_table      JSONB NOT NULL DEFAULT '[]',    -- guaranteed-drop hooks; consumed in Phase 4 (wrecks)
  description     TEXT
);

CREATE TABLE IF NOT EXISTS enemy_template_modules (
  id              SERIAL PRIMARY KEY,
  template_id     VARCHAR(64) NOT NULL REFERENCES enemy_templates(id) ON DELETE CASCADE,
  slot_type       VARCHAR(32) NOT NULL,           -- weapon | shield (armor fits the shield slot) | engine | reactor
  module_type_id  VARCHAR(64) NOT NULL REFERENCES module_types(id),
  quality_min     INTEGER NOT NULL DEFAULT 30 CHECK (quality_min BETWEEN 0 AND 100),
  quality_max     INTEGER NOT NULL DEFAULT 60 CHECK (quality_max BETWEEN 0 AND 100),
  CHECK (quality_min <= quality_max)
);
CREATE INDEX IF NOT EXISTS idx_enemy_template_modules_template ON enemy_template_modules(template_id);
CREATE INDEX IF NOT EXISTS idx_enemy_templates_tier_role ON enemy_templates(tier, role);

-- ============================================
-- 3. Seed roster
-- ============================================
-- Quality ranges climb with tier so a T5 fit is Q60-85 (×1.2-1.7) while a
-- T1 fit is Q30-55 (×0.6-1.1). Escorts are the lightest hulls of a tier,
-- flagships the heaviest; capital hulls appear only at T5.
INSERT INTO enemy_templates (id, name, tier, hull_type_id, role, spawn_weight, loot_multiplier, is_elite, description) VALUES
  -- T1 — Core Worlds pickets
  ('reaver_interceptor',  'Reaver Interceptor',   1, 'pirate_interceptor', 'escort',   12, 1.0, FALSE, 'Pulse-laser raider. Dies to anything.'),
  ('reaver_picket',       'Reaver Picket',        1, 'fighter',            'escort',   8,  1.0, FALSE, 'Stolen fighter hull with an autocannon and a plate.'),
  ('reaver_marauder',     'Reaver Marauder',      1, 'pirate_marauder',    'flagship', 10, 1.2, FALSE, 'T1 patrol leader. Two cannons behind a deflector.'),
  -- T2
  ('reaver_raider',       'Reaver Raider',        2, 'scout',              'escort',   10, 1.0, FALSE, 'Scout hull, barrier web, autocannon.'),
  ('reaver_rocketeer',    'Reaver Rocketeer',     2, 'pirate_marauder',    'line',     10, 1.1, FALSE, 'Missile marauder — hull-finisher. Kill it first.'),
  ('reaver_destroyer',    'Reaver Destroyer',     2, 'pirate_destroyer',   'flagship', 10, 1.3, FALSE, 'Armored line ship. Bring lasers.'),
  -- T3
  ('reaver_lancer',       'Reaver Lancer',        3, 'pirate_destroyer',   'escort',   10, 1.0, FALSE, 'Beam-laser destroyer. Strips armor.'),
  ('reaver_corsair',      'Reaver Corsair',       3, 'frigate',            'line',     10, 1.2, FALSE, 'Railgun frigate behind a solar barrier.'),
  ('reaver_warlord',      'Reaver Warlord',       3, 'frigate',            'flagship', 10, 1.5, FALSE, 'Mixed-type flagship: rail + beam, shield + plate.'),
  -- T4
  ('reaver_ravager',      'Reaver Ravager',       4, 'pirate_destroyer',   'escort',   10, 1.0, FALSE, 'Twin railguns on alloy plating.'),
  ('reaver_torpedo_frig', 'Reaver Torpedo Frigate', 4, 'frigate',          'line',     10, 1.2, FALSE, 'Quantum torpedoes. Shields do nothing against it.'),
  ('reaver_dreadmaster',  'Reaver Dreadmaster',   4, 'frigate',            'flagship', 10, 1.6, FALSE, 'Torpedo + rail flagship, alloy over solar barrier.'),
  ('reaver_dread_captain','Dread Captain Orsk',   4, 'frigate',            'elite',    3,  3.0, TRUE,  'Named T4 elite. High-quality fit, guaranteed drops (Phase 4).'),
  -- T5
  ('reaver_void_lancer',  'Void Lancer',          5, 'pirate_destroyer',   'escort',   10, 1.0, FALSE, 'Plasma lance destroyer in ancient plate.'),
  ('reaver_executioner',  'Reaver Executioner',   5, 'frigate',            'line',     10, 1.2, FALSE, 'Mass driver frigate under a void barrier.'),
  ('reaver_titan',        'Reaver Titan',         5, 'capital',            'flagship', 10, 1.8, FALSE, 'Capital hull. Lance, driver, torpedoes, both defense layers.'),
  ('reaver_admiral_vask', 'Admiral Vask',         5, 'capital',            'elite',    3,  4.0, TRUE,  'Named T5 admiral. Q75-90 everything.'),
  ('reaver_void_herald',  'Void Herald',          5, 'pirate_destroyer',   'line',     6,  1.3, FALSE, 'Torpedo destroyer — escorts the Titan.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO enemy_template_modules (template_id, slot_type, module_type_id, quality_min, quality_max) VALUES
  -- T1
  ('reaver_interceptor',  'weapon', 'weapon_laser',         30, 55),
  ('reaver_interceptor',  'shield', 'shield_basic',         30, 55),
  ('reaver_interceptor',  'engine', 'engine_basic',         30, 55),
  ('reaver_picket',       'weapon', 'weapon_cannon',        30, 55),
  ('reaver_picket',       'shield', 'armor_plate_1',        30, 55),
  ('reaver_picket',       'engine', 'engine_basic',         30, 55),
  ('reaver_marauder',     'weapon', 'weapon_cannon',        35, 60),
  ('reaver_marauder',     'weapon', 'weapon_laser',         35, 60),
  ('reaver_marauder',     'shield', 'shield_basic',         35, 60),
  ('reaver_marauder',     'engine', 'engine_basic',         35, 60),
  -- T2
  ('reaver_raider',       'weapon', 'weapon_cannon',        40, 65),
  ('reaver_raider',       'shield', 'shield_barrier_2',     40, 65),
  ('reaver_raider',       'engine', 'engine_advanced',      40, 65),
  ('reaver_rocketeer',    'weapon', 'weapon_missile_basic', 40, 65),
  ('reaver_rocketeer',    'weapon', 'weapon_laser',         40, 65),
  ('reaver_rocketeer',    'shield', 'armor_plate_2',        40, 65),
  ('reaver_rocketeer',    'engine', 'engine_advanced',      40, 65),
  ('reaver_destroyer',    'weapon', 'weapon_cannon',        45, 70),
  ('reaver_destroyer',    'weapon', 'weapon_cannon',        45, 70),
  ('reaver_destroyer',    'shield', 'armor_plate_2',        45, 70),
  ('reaver_destroyer',    'shield', 'shield_barrier_2',     45, 70),
  ('reaver_destroyer',    'engine', 'engine_advanced',      45, 70),
  -- T3
  ('reaver_lancer',       'weapon', 'weapon_beam_3',        45, 70),
  ('reaver_lancer',       'shield', 'armor_plate_2',        45, 70),
  ('reaver_lancer',       'engine', 'engine_plasma_3',      45, 70),
  ('reaver_corsair',      'weapon', 'weapon_railgun_3',     45, 70),
  ('reaver_corsair',      'shield', 'shield_solar_3',       45, 70),
  ('reaver_corsair',      'engine', 'engine_plasma_3',      45, 70),
  ('reaver_warlord',      'weapon', 'weapon_railgun_3',     50, 75),
  ('reaver_warlord',      'weapon', 'weapon_beam_3',        50, 75),
  ('reaver_warlord',      'shield', 'shield_solar_3',       50, 75),
  ('reaver_warlord',      'shield', 'armor_plate_2',        50, 75),
  ('reaver_warlord',      'engine', 'engine_plasma_3',      50, 75),
  -- T4
  ('reaver_ravager',      'weapon', 'weapon_railgun_3',     50, 75),
  ('reaver_ravager',      'weapon', 'weapon_railgun_3',     50, 75),
  ('reaver_ravager',      'shield', 'armor_alloy_4',        50, 75),
  ('reaver_ravager',      'engine', 'engine_helion_4',      50, 75),
  ('reaver_torpedo_frig', 'weapon', 'weapon_torpedo_4',     50, 75),
  ('reaver_torpedo_frig', 'shield', 'armor_alloy_4',        50, 75),
  ('reaver_torpedo_frig', 'engine', 'engine_helion_4',      50, 75),
  ('reaver_dreadmaster',  'weapon', 'weapon_torpedo_4',     55, 80),
  ('reaver_dreadmaster',  'weapon', 'weapon_railgun_3',     55, 80),
  ('reaver_dreadmaster',  'shield', 'armor_alloy_4',        55, 80),
  ('reaver_dreadmaster',  'shield', 'shield_solar_3',       55, 80),
  ('reaver_dreadmaster',  'engine', 'engine_helion_4',      55, 80),
  ('reaver_dread_captain','weapon', 'weapon_torpedo_4',     70, 85),
  ('reaver_dread_captain','weapon', 'weapon_beam_3',        70, 85),
  ('reaver_dread_captain','shield', 'armor_alloy_4',        70, 85),
  ('reaver_dread_captain','shield', 'shield_solar_3',       70, 85),
  ('reaver_dread_captain','engine', 'engine_helion_4',      70, 85),
  -- T5
  ('reaver_void_lancer',  'weapon', 'weapon_lance_5',       60, 85),
  ('reaver_void_lancer',  'shield', 'armor_ancient_5',      60, 85),
  ('reaver_void_lancer',  'engine', 'engine_void_5',        60, 85),
  ('reaver_executioner',  'weapon', 'weapon_driver_5',      60, 85),
  ('reaver_executioner',  'shield', 'shield_void_5',        60, 85),
  ('reaver_executioner',  'engine', 'engine_void_5',        60, 85),
  ('reaver_void_herald',  'weapon', 'weapon_torpedo_4',     60, 85),
  ('reaver_void_herald',  'shield', 'armor_ancient_5',      60, 85),
  ('reaver_void_herald',  'engine', 'engine_void_5',        60, 85),
  ('reaver_titan',        'weapon', 'weapon_lance_5',       60, 85),
  ('reaver_titan',        'weapon', 'weapon_driver_5',      60, 85),
  ('reaver_titan',        'weapon', 'weapon_torpedo_4',     60, 85),
  ('reaver_titan',        'shield', 'shield_void_5',        60, 85),
  ('reaver_titan',        'shield', 'armor_ancient_5',      60, 85),
  ('reaver_titan',        'engine', 'engine_void_5',        60, 85),
  ('reaver_admiral_vask', 'weapon', 'weapon_lance_5',       75, 90),
  ('reaver_admiral_vask', 'weapon', 'weapon_driver_5',      75, 90),
  ('reaver_admiral_vask', 'weapon', 'weapon_torpedo_4',     75, 90),
  ('reaver_admiral_vask', 'shield', 'shield_void_5',        75, 90),
  ('reaver_admiral_vask', 'shield', 'armor_ancient_5',      75, 90),
  ('reaver_admiral_vask', 'engine', 'engine_void_5',        75, 90);
