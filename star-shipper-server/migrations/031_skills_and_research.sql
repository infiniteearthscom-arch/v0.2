-- Migration 031: Skills + Research framework (Phase 1)
-- ============================================
-- Two fully independent progression systems.
--
-- SKILLS  -- EVE-style. Per-captain, real-time training (trains 24/7
--           while offline). Queue up to 10 skills; each level grants a
--           % bonus and/or unlocks the ability to fit higher-tier
--           modules. Baseline 30 SP/min. SP-per-level scales by skill
--           rank multiplier so end-game skills take real days/weeks.
--
-- RESEARCH -- Civ-style. Per-account tech tree with strict prereqs.
--             Single shared RP pool. Trickles passively while docked
--             (~1 RP/min) until colonies + Research Lab buildings
--             land. Unlocks happen instantly when RP is spent (no
--             additional research-takes-X-days timer on top).
--
-- ============================================
-- USERS: passive RP accrual
-- ============================================
-- research_points_updated_at is the last time we "checkpointed" the
-- player's RP. Any read computes new_rp = stored_rp + minutes_since *
-- (rate per current dock state) before returning. This avoids needing
-- a cron tick -- the math is on-demand and consistent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS research_points INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS research_points_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS docked_since TIMESTAMPTZ;

-- ============================================
-- SKILL DEFINITIONS  (static content, seeded below)
-- ============================================
-- rank_multiplier: a 1x skill is cheap to train; a 5x skill is real
--   commitment (~30x the time at L5). EVE uses this to gate "you can
--   speedrun the basics but mastery takes weeks."
-- bonus_per_level: JSONB like {"type": "fleet_damage_pct", "value": 5}
--   meaning +5% per level (so L5 = +25%). Server reads this to compute
--   active bonuses; client renders it as a "+25% fleet weapon damage"
--   line on the skill detail panel.

CREATE TABLE IF NOT EXISTS skill_definitions (
  id              VARCHAR(64) PRIMARY KEY,
  category        VARCHAR(32) NOT NULL,
  name            VARCHAR(96) NOT NULL,
  description     TEXT NOT NULL,
  rank_multiplier INT NOT NULL DEFAULT 1,   -- 1..5
  bonus_per_level JSONB NOT NULL DEFAULT '{}',
  sort_order      INT NOT NULL DEFAULT 0
);

-- ============================================
-- PLAYER SKILLS  (one row per skill the player has touched)
-- ============================================
-- sp is the persistent SP banked on this specific skill. level is
-- derived: cumulative_sp_for(level) <= sp < cumulative_sp_for(level+1).
-- The actively training skill has its SP growing in real time -- we
-- recompute SP on every read (sp_at_checkpoint + minutes_since * rate)
-- rather than running a tick.

CREATE TABLE IF NOT EXISTS player_skills (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id VARCHAR(64) NOT NULL REFERENCES skill_definitions(id),
  sp       INT NOT NULL DEFAULT 0,
  level    INT NOT NULL DEFAULT 0,           -- 0..5, snapshot for fast reads
  PRIMARY KEY (user_id, skill_id)
);

-- ============================================
-- SKILL QUEUE  (ordered, max 10 entries per player)
-- ============================================
-- finishes_at is computed at enqueue time. When a queue entry
-- finishes, it's removed and the player_skills row is bumped. The
-- "head" of the queue (position=0) is the actively training skill;
-- its SP grows in real time and on-read we compute the actual SP.

CREATE TABLE IF NOT EXISTS player_skill_queue (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position     INT NOT NULL,                 -- 0 = currently training
  skill_id     VARCHAR(64) NOT NULL REFERENCES skill_definitions(id),
  target_level INT NOT NULL,                 -- 1..5
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finishes_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, position)
);

CREATE INDEX IF NOT EXISTS idx_skill_queue_user ON player_skill_queue(user_id);

-- ============================================
-- TECH DEFINITIONS  (Civ-style tree, static)
-- ============================================
-- tree: one of 'propulsion', 'weapons', 'defense', 'industry', 'society'.
-- tier: 1..5, used by the client tree visualizer for vertical layout.
-- prerequisites: ["tech_id_a", "tech_id_b"] -- all required.
-- unlocks: { "modules": ["utility_scanner_adv"], "fleet_cap": 1 }
--   -- semantics: modules become purchasable; fleet_cap stacks additively.

CREATE TABLE IF NOT EXISTS tech_definitions (
  id            VARCHAR(64) PRIMARY KEY,
  tree          VARCHAR(32) NOT NULL,
  tier          INT NOT NULL,
  name          VARCHAR(96) NOT NULL,
  description   TEXT NOT NULL,
  rp_cost       INT NOT NULL,
  prerequisites JSONB NOT NULL DEFAULT '[]',
  unlocks       JSONB NOT NULL DEFAULT '{}',
  sort_order    INT NOT NULL DEFAULT 0
);

-- ============================================
-- PLAYER RESEARCH  (one row per unlocked tech)
-- ============================================

CREATE TABLE IF NOT EXISTS player_research (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tech_id     VARCHAR(64) NOT NULL REFERENCES tech_definitions(id),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tech_id)
);

CREATE INDEX IF NOT EXISTS idx_player_research_user ON player_research(user_id);

-- ============================================
-- SEED: SKILLS  (20 across 6 categories)
-- ============================================
-- Only Gunnery I, Mining Operations I, and Astrometrics I have live
-- bonus hooks today (fleet weapon dmg %, mining yield %, sensor range %).
-- The rest are placeholder bonuses that will be wired as combat /
-- fitting depth grows. Sort_order keeps the UI list deterministic.

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order) VALUES
  -- GUNNERY
  ('gun_small_hybrid',   'Gunnery', 'Small Hybrid Turret Operation', 'Fundamentals of small-bore hybrid turret control. +5% damage per level.', 1, '{"type":"fleet_damage_pct","value":5}', 10),
  ('gun_rapid_fire',     'Gunnery', 'Rapid Firing',                  'Refined trigger discipline. +5% fleet weapon rate of fire per level.', 2, '{"type":"fleet_fire_rate_pct","value":5}', 11),
  ('gun_precision',      'Gunnery', 'Precision Optics',              'Targeting computer calibration. +5% weapon optimal range per level.', 2, '{"type":"fleet_weapon_range_pct","value":5}', 12),
  ('gun_motion',         'Gunnery', 'Motion Prediction',             'Lead-target intuition. +5% tracking against fast targets per level.', 3, '{"type":"fleet_tracking_pct","value":5}', 13),
  -- ENGINEERING
  ('eng_capacitor',      'Engineering', 'Power Grid Management',     'Allocation of reactor output. +5% power grid capacity per level.', 1, '{"type":"powergrid_pct","value":5}', 20),
  ('eng_shield_ops',     'Engineering', 'Shield Operation',          'Tuning of shield emitters. +5% maximum shield capacity per level.', 2, '{"type":"shield_max_pct","value":5}', 21),
  ('eng_armor',          'Engineering', 'Hull Reinforcement',        'Damage-control routines. +5% armor / hull HP per level.', 2, '{"type":"hull_max_pct","value":5}', 22),
  ('eng_capacitor_mgmt', 'Engineering', 'Capacitor Management',      'Sustained energy delivery. +5% capacitor capacity per level.', 3, '{"type":"capacitor_pct","value":5}', 23),
  -- NAVIGATION
  ('nav_afterburner',    'Navigation', 'Afterburner',                'Sustained burn discipline. +5% afterburner duration per level.', 1, '{"type":"ab_duration_pct","value":5}', 30),
  ('nav_evasion',        'Navigation', 'Evasive Maneuvers',          'Pilot reflex training. +5% sub-warp speed per level.', 2, '{"type":"sub_warp_speed_pct","value":5}', 31),
  ('nav_warp_drive',     'Navigation', 'Warp Drive Operation',       'Inter-system jump efficiency. +10% warp speed per level.', 3, '{"type":"warp_speed_pct","value":10}', 32),
  -- INDUSTRY
  ('ind_mining_ops',     'Industry', 'Mining Operations',            'Beam alignment + cycle tuning. +5% mining laser yield per level.', 1, '{"type":"mining_yield_pct","value":5}', 40),
  ('ind_refining',       'Industry', 'Refining',                     'Reduces refining waste at planet processors. +4% refining yield per level.', 2, '{"type":"refining_yield_pct","value":4}', 41),
  ('ind_salvaging',      'Industry', 'Salvaging',                    'Wreck inspection + recovery. +5% chance of module drop from wrecks per level.', 2, '{"type":"salvage_drop_pct","value":5}', 42),
  ('ind_production',     'Industry', 'Production Efficiency',        'Tighter manufacturing tolerances. -5% production material cost per level.', 3, '{"type":"production_cost_pct","value":-5}', 43),
  -- ASTROMETRICS
  ('ast_sensors',        'Astrometrics', 'Sensor Linking',           'Fleet-wide sensor data fusion. +5% sensor range per level.', 1, '{"type":"sensor_range_pct","value":5}', 50),
  ('ast_scanning',       'Astrometrics', 'Survey Scanning',          'Asteroid scan throughput. -5% scan time per level.', 2, '{"type":"scan_time_pct","value":-5}', 51),
  ('ast_probing',        'Astrometrics', 'Probe Deployment',         'Long-range probe handling. +1 deployable probe per level.', 3, '{"type":"max_probes_flat","value":1}', 52),
  -- SPACESHIP COMMAND
  ('cmd_scout',          'Spaceship Command', 'Scout Frame Command', 'Mastery of scout-class hulls. +5% scout-class bonuses per level.', 1, '{"type":"hull_scout_pct","value":5}', 60),
  ('cmd_fleet_disc',     'Spaceship Command', 'Fleet Discipline',    'Formation tightness + comms. +1 maximum active fleet ship at level 5.', 4, '{"type":"fleet_cap_at_5","value":1}', 61)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED: TECH NODES  (15 across 5 trees, 3 tiers each)
-- ============================================
-- Tier 1 nodes have no prereqs (the entry points). Tier 2 require
-- the tier-1 node in the same tree. Tier 3 require tier 2.
-- Cost curve: 200 / 800 / 2400 RP (4x each tier) so the first unlock
-- is reachable in a couple of dock sessions and the tier-3 is a real
-- commitment but not a months-long grind.
--
-- "unlocks" semantics:
--   {"modules": ["x"]}    -- module ids become purchasable from vendors
--   {"hulls":   ["y"]}    -- hull ids become purchasable
--   {"fleet_cap": N}      -- fleet cap increases by N (additive)
--   {"placeholder": true} -- node exists for the tree shape; effect TBD

INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  -- PROPULSION
  ('tech_thrust_optim',  'propulsion', 1, 'Thruster Optimization',    'Refined burn profiles for improved sub-light maneuvering. Unlocks Improved Thruster (T2 engine).',  200, '[]',                            '{"modules":["engine_thruster_2"],"placeholder":true}', 100),
  ('tech_warp_theory',   'propulsion', 2, 'Warp Theory',              'Subspace folding fundamentals. Prerequisite for inter-system jump tech.',                       800, '["tech_thrust_optim"]',         '{"placeholder":true}', 110),
  ('tech_capital_drive', 'propulsion', 3, 'Capital Drive Theory',     'Scale-up of warp tech to capital-class hulls. Unlocks the Capital hull tier (placeholder).',   2400, '["tech_warp_theory"]',          '{"placeholder":true}', 120),
  -- WEAPONS
  ('tech_pulse_optim',   'weapons', 1, 'Pulse Optimization',          'Tighter energy delivery on pulse lasers. Unlocks Pulse Laser II.',                              200, '[]',                            '{"modules":["weapon_laser_2"],"placeholder":true}', 200),
  ('tech_heavy_ord',     'weapons', 2, 'Heavy Ordnance',              'Mass-driver kinetic systems. Unlocks the Missile Launcher class (placeholder).',                800, '["tech_pulse_optim"]',          '{"placeholder":true}', 210),
  ('tech_capital_weap',  'weapons', 3, 'Capital Weapons',             'Dreadnought-class main batteries. Unlocks capital weapon hardpoints (placeholder).',           2400, '["tech_heavy_ord"]',            '{"placeholder":true}', 220),
  -- DEFENSE
  ('tech_shield_theory', 'defense', 1, 'Shield Theory',               'Enhanced shield emitter geometry. Unlocks Reinforced Shield (T2 shield module).',               200, '[]',                            '{"placeholder":true}', 300),
  ('tech_armor_eng',     'defense', 2, 'Armor Engineering',           'Composite plating compositions. Unlocks the Armor Plating module class (placeholder).',        800, '["tech_shield_theory"]',        '{"placeholder":true}', 310),
  ('tech_capital_def',   'defense', 3, 'Capital Defense Systems',     'Capital-grade hull integrity + reactive armor. Placeholder for late-game capital fitting.',   2400, '["tech_armor_eng"]',            '{"placeholder":true}', 320),
  -- INDUSTRY
  ('tech_adv_mining',    'industry', 1, 'Advanced Mining',            'Higher-throughput beam optics. Unlocks Mining Laser II.',                                       200, '[]',                            '{"modules":["mining_laser_2"]}', 400),
  ('tech_bulk_process',  'industry', 2, 'Bulk Processing',            'High-capacity cargo bay design. Unlocks the Bulk Cargo Bay module (placeholder).',              800, '["tech_adv_mining"]',           '{"placeholder":true}', 410),
  ('tech_industrial',    'industry', 3, 'Industrial Empire',          'Megaproject-scale manufacturing. Unlocks the Industrial hull tier (placeholder).',            2400, '["tech_bulk_process"]',         '{"placeholder":true}', 420),
  -- SOCIETY
  ('tech_sensor_refine', 'society', 1, 'Sensor Refinement',           'Calibrated signal-processing arrays. Unlocks the Advanced Sensor Suite (T2 scanner).',          200, '[]',                            '{"modules":["utility_scanner_adv"]}', 500),
  ('tech_crew_protocol', 'society', 2, 'Crew Training Protocols',     'Standardized cross-ship training. +1 active fleet capacity.',                                   800, '["tech_sensor_refine"]',        '{"fleet_cap":1}', 510),
  ('tech_imperial_cmd',  'society', 3, 'Imperial Command',            'Multi-fleet doctrine + logistics. +1 active fleet capacity (stacks).',                         2400, '["tech_crew_protocol"]',        '{"fleet_cap":1,"placeholder":true}', 520)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED: MODULES that the research unlocks point at
-- ============================================
-- utility_scanner_adv + mining_laser_2 are the two we wire today.
-- Other "placeholder" modules in the unlock JSONB don't get inserted
-- here -- they ship when the relevant gameplay system lands.
--
-- These mirror their tier-1 counterparts in shape (slot_type, stats)
-- but with stronger numbers. They're added to item_definitions too so
-- they show up as inventory items / fittable / buyable.

INSERT INTO module_types (id, name, slot_type, tier, description, stats) VALUES
  ('utility_scanner_adv', 'Advanced Sensor Suite', 'utility', 2,
   'Higher-resolution sensor array. Doubles asteroid scan range, halves scan time, and pushes fleet-wide enemy detection further out.',
   '{"sensor_range":900, "scan_range":160, "scan_time":4}'::jsonb),
  ('mining_laser_2', 'Mining Laser II', 'mining', 2,
   'Higher-throughput mining beam. Doubled yield per cycle, slightly extended range.',
   '{"mine_yield":10, "mine_cycle":2, "mine_range":150}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_scanner_adv', 'Advanced Sensor Suite', 'A higher-spec Sensor Suite unlocked via Sensor Refinement research.',
   'module', '📡', 5, '{"slot_type":"utility"}'),
  ('mining_laser_2', 'Mining Laser II', 'A higher-yield mining beam unlocked via Advanced Mining research.',
   'module', '⛏️', 5, '{"slot_type":"mining"}')
ON CONFLICT (id) DO NOTHING;
