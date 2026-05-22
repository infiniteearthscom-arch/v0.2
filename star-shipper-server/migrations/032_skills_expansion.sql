-- Migration 032: Skills catalog expansion (Phase 1 content drop)
-- ============================================
-- Adds ~145 new skills across the EVE/DSP-style breadth so the skill
-- tree can DEFINE future game design rather than be defined by it.
-- Bonus types are intentionally semantic strings (e.g.
-- 'weapon_optimal_range_pct', 'manufacture_time_pct',
-- 'broker_fee_pct') so future systems read the catalog to know
-- "what bonus types must I support?" instead of the catalog being
-- bolted on after each system ships.
--
-- Each skill row is ON CONFLICT DO NOTHING so this migration is
-- safe to re-run; the 20 skills from 031 are preserved unchanged.
--
-- Categories in this migration:
--   GUNNERY      (+12)  -- weapon class/size specializations
--   MISSILES     (+10)  -- launcher + warhead skills
--   ENGINEERING  (+8)   -- electronics, shield/armor compensation
--   NAVIGATION   (+6)   -- AB/MWD, warp efficiency, jump calibration
--   TARGETING    (+6)   -- lock count, range, sig analysis
--   DRONES       (+8)   -- drone count, damage, range, types
--   ASTROMETRICS (+5)   -- probe specs, survey, signals
--   INDUSTRY     (+10)  -- mining specializations, mass production
--   SCIENCE      (+10)  -- labs, research, invention, blueprint copy
--   TRADE        (+10)  -- market orders, broker, accounting
--   SOCIAL       (+6)   -- standings, negotiation, faction
--   SHIPCMD      (+14)  -- per-hull-class command + fleet/wing
--   MISSILES (cont)     -- (in MISSILES block above)
--   EXPLORATION  (+6)   -- hacking, archaeology, salvaging
--   RIGGING      (+6)   -- rig skill drawback offsets
--   LEADERSHIP   (+6)   -- warfare link / boost specializations
--   PLANETARY    (+6)   -- planet scan / colony / terraforming
--   PROCESSING   (+8)   -- refining + chemical + smelting chains
--   POWER        (+4)   -- power-tier (solar/nuclear/antimatter)
--   LOGISTICS    (+4)   -- freighter, supply chain, fleet support

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order) VALUES

-- ============================================
-- GUNNERY  (+12)
-- ============================================
('gun_small_hybrid_spec',  'Gunnery', 'Small Hybrid Turret Specialization', 'Mastery of small-bore hybrid turrets. +2% damage to small hybrid turrets per level on top of the operation bonus.', 4, '{"type":"weapon_small_hybrid_dmg_pct","value":2}', 100),
('gun_medium_hybrid',      'Gunnery', 'Medium Hybrid Turret Operation',     'Operation of medium-class hybrid turrets. +5% damage per level.', 2, '{"type":"weapon_medium_hybrid_dmg_pct","value":5}', 101),
('gun_large_hybrid',       'Gunnery', 'Large Hybrid Turret Operation',      'Operation of large-class (battleship-grade) hybrid turrets. +5% damage per level.', 3, '{"type":"weapon_large_hybrid_dmg_pct","value":5}', 102),
('gun_small_projectile',   'Gunnery', 'Small Projectile Turret Operation',  'Operation of small projectile (autocannon / artillery) turrets. +5% damage per level.', 1, '{"type":"weapon_small_proj_dmg_pct","value":5}', 103),
('gun_medium_projectile',  'Gunnery', 'Medium Projectile Turret Operation', 'Operation of medium projectile turrets. +5% damage per level.', 2, '{"type":"weapon_medium_proj_dmg_pct","value":5}', 104),
('gun_large_projectile',   'Gunnery', 'Large Projectile Turret Operation',  'Operation of large projectile (battleship) turrets. +5% damage per level.', 3, '{"type":"weapon_large_proj_dmg_pct","value":5}', 105),
('gun_small_energy',       'Gunnery', 'Small Energy Turret Operation',      'Operation of small energy (laser) turrets. +5% damage per level.', 1, '{"type":"weapon_small_energy_dmg_pct","value":5}', 106),
('gun_medium_energy',      'Gunnery', 'Medium Energy Turret Operation',     'Operation of medium energy turrets. +5% damage per level.', 2, '{"type":"weapon_medium_energy_dmg_pct","value":5}', 107),
('gun_large_energy',       'Gunnery', 'Large Energy Turret Operation',      'Operation of large energy (battleship) turrets. +5% damage per level.', 3, '{"type":"weapon_large_energy_dmg_pct","value":5}', 108),
('gun_surgical_strike',    'Gunnery', 'Surgical Strike',                    'Fleet-wide turret damage discipline. +3% damage per level to ALL turret weapons.', 4, '{"type":"weapon_all_turret_dmg_pct","value":3}', 109),
('gun_sharpshooter',       'Gunnery', 'Sharpshooter',                       'Long-range engagement training. +5% turret optimal range per level.', 3, '{"type":"weapon_optimal_range_pct","value":5}', 110),
('gun_controlled_bursts',  'Gunnery', 'Controlled Bursts',                  'Energy delivery efficiency. -5% capacitor cost per turret cycle per level.', 2, '{"type":"weapon_cap_cost_pct","value":-5}', 111),
('gun_trajectory_analysis','Gunnery', 'Trajectory Analysis',                'Off-axis fire control. +5% turret falloff per level.', 3, '{"type":"weapon_falloff_pct","value":5}', 112),

-- ============================================
-- MISSILES  (+10)
-- ============================================
('mis_missile_launcher',   'Missiles', 'Missile Launcher Operation',  'Fundamentals of guided ordnance launchers. +2% missile rate of fire per level.', 1, '{"type":"missile_rof_pct","value":2}', 200),
('mis_light_missiles',     'Missiles', 'Light Missiles',              'Operation of light-class anti-frigate missiles. +5% damage per level.', 1, '{"type":"missile_light_dmg_pct","value":5}', 201),
('mis_heavy_missiles',     'Missiles', 'Heavy Missiles',              'Operation of heavy-class anti-cruiser missiles. +5% damage per level.', 2, '{"type":"missile_heavy_dmg_pct","value":5}', 202),
('mis_cruise_missiles',    'Missiles', 'Cruise Missiles',             'Operation of cruise missiles. +5% damage per level. Battleship-grade.', 3, '{"type":"missile_cruise_dmg_pct","value":5}', 203),
('mis_torpedoes',          'Missiles', 'Torpedoes',                   'Operation of capital-grade torpedoes. +5% damage per level.', 4, '{"type":"missile_torpedo_dmg_pct","value":5}', 204),
('mis_rockets',            'Missiles', 'Rockets',                     'Operation of unguided rocket pods. +5% damage per level. Short range, high DPS.', 1, '{"type":"missile_rocket_dmg_pct","value":5}', 205),
('mis_warhead_upgrades',   'Missiles', 'Warhead Upgrades',            'Improved missile warhead chemistry. +2% damage to ALL missiles per level.', 4, '{"type":"missile_all_dmg_pct","value":2}', 206),
('mis_missile_bombardment','Missiles', 'Missile Bombardment',         'Sustained missile-flight discipline. +10% missile flight time per level.', 3, '{"type":"missile_flight_time_pct","value":10}', 207),
('mis_missile_projection', 'Missiles', 'Missile Projection',          'Missile drive tuning. +10% missile velocity per level.', 3, '{"type":"missile_velocity_pct","value":10}', 208),
('mis_target_navigation',  'Missiles', 'Target Navigation Prediction','Anti-evasion calibration. +10% missile explosion velocity per level (better hits on fast targets).', 4, '{"type":"missile_explosion_velocity_pct","value":10}', 209),

-- ============================================
-- ENGINEERING  (+8)
-- ============================================
('eng_electronics',        'Engineering', 'Electronics',          'Onboard electronics calibration. +5% ship CPU output per level.', 1, '{"type":"cpu_pct","value":5}', 300),
('eng_shield_upgrades',    'Engineering', 'Shield Upgrades',      'Permits fitting of shield upgrade modules. Required to fit Shield Extenders and Power Diagnostic Systems.', 2, '{"type":"shield_upgrade_unlock","value":1}', 301),
('eng_shield_compensation','Engineering', 'Shield Compensation',  'Active shield damage profile tuning. +5% shield resistance per level (all damage types averaged).', 3, '{"type":"shield_resist_pct","value":5}', 302),
('eng_armor_layering',     'Engineering', 'Armor Layering',       'Composite armor application. Required to fit armor plate modules. +5% armor HP per level on top of base.', 2, '{"type":"armor_max_pct","value":5}', 303),
('eng_armor_compensation', 'Engineering', 'Armor Compensation',   'Active armor resist tuning. +5% armor resistance per level (all damage types averaged).', 3, '{"type":"armor_resist_pct","value":5}', 304),
('eng_hull_upgrades',      'Engineering', 'Hull Upgrades',        'Permits fitting of hull upgrade modules. +5% hull HP per level.', 1, '{"type":"hull_max_pct","value":5}', 305),
('eng_power_management',   'Engineering', 'Power Management',     'Reactor output smoothing. +5% capacitor recharge rate per level.', 3, '{"type":"cap_recharge_pct","value":5}', 306),
('eng_thermodynamics',     'Engineering', 'Thermodynamics',       'Module overload discipline. Unlocks module overheating; -5% heat damage to your modules per level when overheating.', 4, '{"type":"overheat_damage_pct","value":-5}', 307),

-- ============================================
-- NAVIGATION  (+6)
-- ============================================
('nav_acceleration',       'Navigation', 'Acceleration Control',        'Propulsion module optimization. +5% bonus speed from afterburners and microwarpdrives per level.', 1, '{"type":"prop_mod_speed_pct","value":5}', 400),
('nav_fuel_conservation',  'Navigation', 'Fuel Conservation',           'Sustained afterburner economy. -10% afterburner capacitor cost per level.', 2, '{"type":"ab_cap_pct","value":-10}', 401),
('nav_high_speed',         'Navigation', 'High Speed Maneuvering',      'Microwarpdrive discipline. -5% MWD capacitor cost per level.', 4, '{"type":"mwd_cap_pct","value":-5}', 402),
('nav_warp_efficiency',    'Navigation', 'Warp Drive Operation',        'Inter-system warp tuning. -10% capacitor cost per warp per level.', 3, '{"type":"warp_cap_pct","value":-10}', 403),
('nav_jump_calibration',   'Navigation', 'Jump Drive Calibration',      'Long-haul jump tuning. +5% jump drive range per level. Required for capital jumps.', 4, '{"type":"jump_range_pct","value":5}', 404),
('nav_signature_analysis', 'Navigation', 'Signature Analysis',          'Targeting computer calibration. +5% scan resolution (lock speed) per level.', 3, '{"type":"lock_speed_pct","value":5}', 405),

-- ============================================
-- TARGETING  (+6, new category)
-- ============================================
('tar_targeting',          'Targeting', 'Targeting',                'Fundamentals of weapons targeting. +1 maximum locked target per level.', 1, '{"type":"max_locked_targets_flat","value":1}', 500),
('tar_multitasking',       'Targeting', 'Multitasking',             'Advanced parallel-target discipline. +1 maximum locked target per level (stacks with Targeting).', 3, '{"type":"max_locked_targets_flat","value":1}', 501),
('tar_signature_radius',   'Targeting', 'Target Signature Analysis','Sub-frame target analysis. -5% lock time per level.', 2, '{"type":"lock_time_pct","value":-5}', 502),
('tar_long_range',         'Targeting', 'Long Range Targeting',     'Extended-range targeting computer. +5% maximum targeting range per level.', 2, '{"type":"targeting_range_pct","value":5}', 503),
('tar_advanced_target',    'Targeting', 'Advanced Target Management','Specialty pilot focus training. +1 max locked target at level 5 only.', 5, '{"type":"max_locked_targets_at_5","value":1}', 504),
('tar_sensor_linking',     'Targeting', 'Sensor Linking',           'Cross-ship sensor fusion. Required to fit Sensor Boosters / Remote Sensor Boosters. +5% sensor strength per level.', 3, '{"type":"sensor_strength_pct","value":5}', 505),

-- ============================================
-- DRONES  (+8, new category)
-- ============================================
('drn_drones',             'Drones', 'Drones',                  'Drone bay fundamentals. +1 active drone control per level. Max 5 drones in space at level 5.', 1, '{"type":"active_drone_count_flat","value":1}', 600),
('drn_drone_avionics',     'Drones', 'Drone Avionics',          'Drone uplink range. +5 km maximum drone control range per level.', 2, '{"type":"drone_control_range_km","value":5}', 601),
('drn_drone_interfacing',  'Drones', 'Drone Interfacing',       'Mastery of drone command. +10% drone damage AND drone HP per level.', 5, '{"type":"drone_damage_and_hp_pct","value":10}', 602),
('drn_drone_navigation',   'Drones', 'Drone Navigation',        'Drone-side MWD tuning. +5% drone microwarpdrive speed per level.', 2, '{"type":"drone_mwd_speed_pct","value":5}', 603),
('drn_drone_durability',   'Drones', 'Drone Durability',        'Drone hull reinforcement. +5% drone hit points per level.', 3, '{"type":"drone_hp_pct","value":5}', 604),
('drn_combat_drones',      'Drones', 'Combat Drone Operation',  'Operation of light/medium/heavy combat drones. +5% combat drone damage per level.', 1, '{"type":"combat_drone_dmg_pct","value":5}', 605),
('drn_mining_drones',      'Drones', 'Mining Drone Operation',  'Operation of dedicated mining drones. +5% mining drone yield per level.', 1, '{"type":"mining_drone_yield_pct","value":5}', 606),
('drn_repair_drones',      'Drones', 'Logistic Drone Operation','Operation of friendly-target repair drones. +5% repair drone effectiveness per level.', 3, '{"type":"repair_drone_pct","value":5}', 607),

-- ============================================
-- INDUSTRY  (+10)
-- ============================================
('ind_mining_upgrades',    'Industry', 'Mining Upgrades',              'Permits fitting of Mining Laser Upgrade rigs and Mining Foreman links. +5% mining yield from upgrades per level.', 2, '{"type":"mining_upgrade_yield_pct","value":5}', 700),
('ind_drone_mining',       'Industry', 'Drone Mining',                 'Mining drone specialty training. +5% mining drone yield per level (stacks with Mining Drone Operation).', 3, '{"type":"mining_drone_yield_pct","value":5}', 701),
('ind_ice_harvesting',     'Industry', 'Ice Harvesting',               'Operation of ice-harvesting modules. -5% ice harvester cycle time per level.', 4, '{"type":"ice_harvest_time_pct","value":-5}', 702),
('ind_gas_harvesting',     'Industry', 'Gas Cloud Harvesting',         'Operation of gas cloud harvester modules. +5% gas harvester yield per level.', 3, '{"type":"gas_harvest_yield_pct","value":5}', 703),
('ind_deep_core',          'Industry', 'Deep Core Mining',             'Mastery of rare-resource mining. Unlocks deep core sites; +5% deep core yield per level.', 4, '{"type":"deep_core_yield_pct","value":5}', 704),
('ind_industry',           'Industry', 'Industry',                     'Manufacturing fundamentals. -4% production time per level.', 1, '{"type":"manufacture_time_pct","value":-4}', 705),
('ind_mass_production',    'Industry', 'Mass Production',              'Concurrent factory job management. +1 manufacturing job slot per level.', 2, '{"type":"manufacture_slots_flat","value":1}', 706),
('ind_adv_mass_prod',      'Industry', 'Advanced Mass Production',     'Industrial-scale job concurrency. +1 manufacturing job slot at level 5 only.', 5, '{"type":"manufacture_slots_at_5","value":1}', 707),
('ind_supply_chain',       'Industry', 'Supply Chain Management',      'Remote-job logistics. Run manufacturing jobs from one extra solar system away per level.', 3, '{"type":"remote_job_range_jumps","value":1}', 708),
('ind_scientific_networking','Industry','Scientific Networking',       'Remote research job logistics. Run research jobs from one extra solar system away per level.', 3, '{"type":"remote_research_range_jumps","value":1}', 709),

-- ============================================
-- ASTROMETRICS  (+5)
-- ============================================
('ast_astrometric_acq',    'Astrometrics', 'Astrometric Acquisition',   'Probe-launch alignment. -5% scan probe scan time per level.', 3, '{"type":"probe_scan_time_pct","value":-5}', 800),
('ast_astrometric_pin',    'Astrometrics', 'Astrometric Pinpointing',   'Precision triangulation. -5% scan probe deviation per level (tighter results).', 3, '{"type":"probe_scan_deviation_pct","value":-5}', 801),
('ast_astrometric_range',  'Astrometrics', 'Astrometric Rangefinding',  'Long-range probe sensitivity. +5% probe scan strength per level.', 4, '{"type":"probe_scan_strength_pct","value":5}', 802),
('ast_survey',             'Astrometrics', 'Survey',                    'Survey scanner operation. +5% survey scanner range per level (asteroid contents reveal range).', 2, '{"type":"survey_scanner_range_pct","value":5}', 803),
('ast_signal_acquisition', 'Astrometrics', 'Signal Acquisition',        'Cosmic anomaly signal processing. -5% sig analysis time per level.', 3, '{"type":"sig_analysis_time_pct","value":-5}', 804),

-- ============================================
-- SCIENCE  (+10, new category)
-- ============================================
('sci_science',            'Science', 'Science',                  'Research fundamentals. -5% blueprint research time per level.', 1, '{"type":"research_time_pct","value":-5}', 900),
('sci_research',           'Science', 'Research',                 'Concurrent research project management. +1 research project slot per level.', 2, '{"type":"research_slots_flat","value":1}', 901),
('sci_lab_op',             'Science', 'Laboratory Operation',     'Lab facility throughput. +1 research project slot per level (stacks).', 3, '{"type":"research_slots_flat","value":1}', 902),
('sci_adv_lab_op',         'Science', 'Advanced Laboratory Operation','Capital research facility mastery. +1 research project slot at level 5 only.', 5, '{"type":"research_slots_at_5","value":1}', 903),
('sci_metallurgy',         'Science', 'Metallurgy',               'Material efficiency research. -5% material-efficiency research time per level.', 3, '{"type":"me_research_time_pct","value":-5}', 904),
('sci_invention',          'Science', 'Invention',                'Tech-2 blueprint invention. +1% base invention success chance per level.', 4, '{"type":"invention_chance_pct","value":1}', 905),
('sci_data_processing',    'Science', 'Data Processing',          'Data-site site processing. -5% data site hack time per level.', 2, '{"type":"data_site_hack_time_pct","value":-5}', 906),
('sci_blueprint_copy',     'Science', 'Blueprint Copy',           'Blueprint copy throughput. -5% blueprint copy time per level.', 3, '{"type":"bpc_copy_time_pct","value":-5}', 907),
('sci_eng_complexes',      'Science', 'Engineering Complexes',    'Upwell engineering structure access. Required to use Engineering Complex services.', 4, '{"type":"engineering_complex_access","value":1}', 908),
('sci_signal_processing',  'Science', 'Signal Processing',        'Cosmic signature decoding. Required for advanced probe deployment. +5% probe strength per level.', 3, '{"type":"probe_scan_strength_pct","value":5}', 909),

-- ============================================
-- TRADE  (+10, new category)
-- ============================================
('trd_trade',              'Trade', 'Trade',                      'Market fundamentals. +4 active market orders per level (base 1).', 1, '{"type":"market_orders_flat","value":4}', 1000),
('trd_retail',             'Trade', 'Retail',                     'Mid-volume market operator. +8 active market orders per level.', 2, '{"type":"market_orders_flat","value":8}', 1001),
('trd_wholesale',          'Trade', 'Wholesale',                  'Bulk market operator. +16 active market orders per level.', 4, '{"type":"market_orders_flat","value":16}', 1002),
('trd_tycoon',             'Trade', 'Tycoon',                     'Top-tier market mogul. +32 active market orders per level.', 6, '{"type":"market_orders_flat","value":32}', 1003),
('trd_broker_relations',   'Trade', 'Broker Relations',           'Order-placement broker discount. -0.3% broker fee per level.', 2, '{"type":"broker_fee_pct","value":-0.3}', 1004),
('trd_accounting',         'Trade', 'Accounting',                 'Sale-tax bookkeeping discipline. -10% sales tax per level.', 3, '{"type":"sales_tax_pct","value":-10}', 1005),
('trd_marketing',          'Trade', 'Marketing',                  'Remote sell-order placement. Place sell orders from N jumps away per level.', 2, '{"type":"remote_sell_jumps","value":1}', 1006),
('trd_procurement',        'Trade', 'Procurement',                'Remote buy-order placement. Place buy orders from N jumps away per level.', 3, '{"type":"remote_buy_jumps","value":1}', 1007),
('trd_visibility',         'Trade', 'Visibility',                 'Extended market search radius. See orders from N more jumps per level.', 1, '{"type":"market_search_jumps","value":1}', 1008),
('trd_contracting',        'Trade', 'Contracting',                'Player-to-player contracts. +4 active contracts per level.', 1, '{"type":"contracts_flat","value":4}', 1009),

-- ============================================
-- SOCIAL  (+6, new category)
-- ============================================
('soc_social',             'Social', 'Social',                       'Interpersonal training. +5% effective NPC standings gains per level.', 1, '{"type":"npc_standings_gain_pct","value":5}', 1100),
('soc_negotiation',         'Social', 'Negotiation',                  'Mission-reward negotiation. +5% mission reward payouts per level.', 2, '{"type":"mission_reward_pct","value":5}', 1101),
('soc_connections',         'Social', 'Connections',                  'Positive-standings amplification. +4% effective +rep standings per level.', 3, '{"type":"positive_standings_pct","value":4}', 1102),
('soc_diplomacy',           'Social', 'Diplomacy',                    'Negative-standings amplification. +4% effective -rep standings per level (softens hate).', 3, '{"type":"negative_standings_pct","value":4}', 1103),
('soc_criminal_conn',       'Social', 'Criminal Connections',         'Pirate-faction relations. +4% effective pirate standings per level.', 4, '{"type":"pirate_standings_pct","value":4}', 1104),
('soc_distribution_conn',   'Social', 'Distribution Connections',     'NPC corporation standings amplification. +4% effective corp standings per level.', 2, '{"type":"corp_standings_pct","value":4}', 1105),

-- ============================================
-- SPACESHIP COMMAND  (+14)
-- ============================================
('cmd_spaceship',          'Spaceship Command', 'Spaceship Command',         'Universal ship-handling fundamentals. +2% to all hull stats per level.', 1, '{"type":"all_hull_stats_pct","value":2}', 1200),
('cmd_frigate',            'Spaceship Command', 'Frigate Command',           'Frigate-class hull mastery. +5% frigate-class bonuses per level.', 2, '{"type":"hull_frigate_pct","value":5}', 1201),
('cmd_destroyer',          'Spaceship Command', 'Destroyer Command',         'Destroyer-class hull mastery. +5% destroyer-class bonuses per level.', 3, '{"type":"hull_destroyer_pct","value":5}', 1202),
('cmd_cruiser',            'Spaceship Command', 'Cruiser Command',           'Cruiser-class hull mastery. +5% cruiser-class bonuses per level.', 4, '{"type":"hull_cruiser_pct","value":5}', 1203),
('cmd_battlecruiser',      'Spaceship Command', 'Battlecruiser Command',     'Battlecruiser-class hull mastery. +5% battlecruiser-class bonuses per level.', 5, '{"type":"hull_battlecruiser_pct","value":5}', 1204),
('cmd_battleship',         'Spaceship Command', 'Battleship Command',        'Battleship-class hull mastery. +5% battleship-class bonuses per level.', 6, '{"type":"hull_battleship_pct","value":5}', 1205),
('cmd_industrial',         'Spaceship Command', 'Industrial Command',        'Industrial hull operation. +5% cargo capacity on industrial-class hulls per level.', 3, '{"type":"hull_industrial_cargo_pct","value":5}', 1206),
('cmd_mining_barge',       'Spaceship Command', 'Mining Barge Command',      'Mining barge specialty. +5% mining yield on mining barge hulls per level.', 4, '{"type":"hull_barge_mining_pct","value":5}', 1207),
('cmd_capital',            'Spaceship Command', 'Capital Ship Command',      'Required to operate capital-class hulls. +5% to capital hull bonuses per level.', 8, '{"type":"hull_capital_pct","value":5}', 1208),
('cmd_marauder',           'Spaceship Command', 'Marauder Command',          'Specialty for marauder-class battleships. +5% marauder bonuses per level.', 8, '{"type":"hull_marauder_pct","value":5}', 1209),
('cmd_adv_spaceship',      'Spaceship Command', 'Advanced Spaceship Command','Cross-class hull mastery. +2% to all hull stats per level (stacks with Spaceship Command).', 5, '{"type":"all_hull_stats_pct","value":2}', 1210),
('cmd_fleet_command',      'Spaceship Command', 'Fleet Command',             'Fleet hierarchy training. +20% warfare link range per level. Required for wing-level command.', 4, '{"type":"warfare_link_range_pct","value":20}', 1211),
('cmd_wing_command',       'Spaceship Command', 'Wing Command',              'Multi-wing fleet command. +1 maximum wing per level.', 5, '{"type":"max_wings_flat","value":1}', 1212),
('cmd_warfare_link',       'Spaceship Command', 'Warfare Link Specialist',   'Warfare-link broadcasting tuning. +3% warfare link effectiveness per level.', 3, '{"type":"warfare_link_strength_pct","value":3}', 1213),

-- ============================================
-- EXPLORATION  (+6, new category)
-- ============================================
('exp_archaeology',        'Exploration', 'Archaeology',           'Relic-site analyzer operation. -10% relic site hack time per level.', 3, '{"type":"relic_hack_time_pct","value":-10}', 1300),
('exp_hacking',            'Exploration', 'Hacking',               'Data-site analyzer operation. -10% data site hack time per level.', 3, '{"type":"data_hack_time_pct","value":-10}', 1301),
('exp_salvaging',          'Exploration', 'Salvaging',             'Wreck-salvager operation. +10% salvage success chance per level.', 2, '{"type":"salvage_chance_pct","value":10}', 1302),
('exp_survey_probing',     'Exploration', 'Survey Probing',        'Cosmic-site probe operation. -5% probe cycle time per level.', 4, '{"type":"probe_cycle_time_pct","value":-5}', 1303),
('exp_data_analysis',      'Exploration', 'Data Analysis',         'Data-site analyzer specialty. +10 virus coherence per level for data sites.', 2, '{"type":"data_virus_coherence_flat","value":10}', 1304),
('exp_relic_analysis',     'Exploration', 'Relic Analysis',        'Relic-site analyzer specialty. +10 virus coherence per level for relic sites.', 2, '{"type":"relic_virus_coherence_flat","value":10}', 1305),

-- ============================================
-- RIGGING  (+6, new category)
-- ============================================
('rig_jury_rigging',       'Rigging', 'Jury Rigging',         'Required to fit any rig module. -10% rig drawback penalty per level.', 3, '{"type":"rig_drawback_pct","value":-10}', 1400),
('rig_armor_rigging',      'Rigging', 'Armor Rigging',        'Armor rig specialty. -10% armor rig drawback penalty per level.', 3, '{"type":"rig_armor_drawback_pct","value":-10}', 1401),
('rig_shield_rigging',     'Rigging', 'Shield Rigging',       'Shield rig specialty. -10% shield rig drawback penalty per level.', 3, '{"type":"rig_shield_drawback_pct","value":-10}', 1402),
('rig_energy_rigging',     'Rigging', 'Energy Grid Rigging',  'Energy/cap rig specialty. -10% energy-grid rig drawback penalty per level.', 3, '{"type":"rig_energy_drawback_pct","value":-10}', 1403),
('rig_drone_rigging',      'Rigging', 'Drone Rigging',        'Drone rig specialty. -10% drone-rig drawback penalty per level.', 3, '{"type":"rig_drone_drawback_pct","value":-10}', 1404),
('rig_launcher_rigging',   'Rigging', 'Launcher Rigging',     'Launcher rig specialty. -10% launcher-rig drawback penalty per level.', 3, '{"type":"rig_launcher_drawback_pct","value":-10}', 1405),

-- ============================================
-- LEADERSHIP  (+6, new category -- fleet boost trees)
-- ============================================
('ldr_leadership',         'Leadership', 'Leadership',              'Fleet boost fundamentals. +2% effective range of fleet boosts per level.', 2, '{"type":"fleet_boost_range_pct","value":2}', 1500),
('ldr_armored_warfare',    'Leadership', 'Armored Warfare',         'Armor-boost broadcast. +3% effectiveness of armor-related fleet boosts per level.', 4, '{"type":"armor_boost_pct","value":3}', 1501),
('ldr_skirmish_warfare',   'Leadership', 'Skirmish Warfare',        'Speed/agility-boost broadcast. +3% effectiveness of speed-related fleet boosts per level.', 4, '{"type":"skirmish_boost_pct","value":3}', 1502),
('ldr_information_warfare','Leadership', 'Information Warfare',     'Sensor/EWAR-boost broadcast. +3% effectiveness of sensor-related fleet boosts per level.', 4, '{"type":"info_boost_pct","value":3}', 1503),
('ldr_siege_warfare',      'Leadership', 'Siege Warfare',           'Shield-boost broadcast. +3% effectiveness of shield-related fleet boosts per level.', 4, '{"type":"siege_boost_pct","value":3}', 1504),
('ldr_mining_foreman',     'Leadership', 'Mining Foreman',          'Mining-boost broadcast. +3% effectiveness of mining fleet boosts per level.', 3, '{"type":"mining_foreman_boost_pct","value":3}', 1505),

-- ============================================
-- PLANETARY INTERACTION  (+6, new category)
-- ============================================
('pln_planetology',        'Planetary', 'Planetology',                'Planet survey resolution. +1 to scan precision per level (better resource reveals).', 2, '{"type":"planet_scan_precision_flat","value":1}', 1600),
('pln_adv_planetology',    'Planetary', 'Advanced Planetology',       'Master planet surveyor. +1 to scan precision per level (stacks).', 5, '{"type":"planet_scan_precision_flat","value":1}', 1601),
('pln_cc_upgrades',        'Planetary', 'Command Center Upgrades',    'Command Center tier access. Unlocks higher-tier CCs and +1 planet per level.', 3, '{"type":"max_planets_flat","value":1}', 1602),
('pln_interplanetary',     'Planetary', 'Interplanetary Consolidation','Multi-planet logistics. +1 maximum colonized planets per level (stacks with CC Upgrades).', 4, '{"type":"max_planets_flat","value":1}', 1603),
('pln_remote_sensing',     'Planetary', 'Remote Sensing',             'Long-range planet scan. +X range per level for orbital sensor operations.', 3, '{"type":"planet_scan_range_pct","value":10}', 1604),
('pln_terraforming',       'Planetary', 'Terraforming',               'Endgame planet modification. Unlocks terraforming projects. +5% terraform speed per level.', 6, '{"type":"terraform_speed_pct","value":5}', 1605),

-- ============================================
-- RESOURCE PROCESSING  (+8, new category)
-- ============================================
('prc_reprocessing',           'Processing', 'Reprocessing',                 'Ore reprocessing fundamentals. +3% reprocessing yield per level (base).', 2, '{"type":"reprocessing_yield_pct","value":3}', 1700),
('prc_reprocessing_eff',       'Processing', 'Reprocessing Efficiency',      'Advanced reprocessing. +2% reprocessing yield per level on top of base.', 3, '{"type":"reprocessing_yield_pct","value":2}', 1701),
('prc_metallurgy_refining',    'Processing', 'Metallurgy Refining',          'Specialty metal-ore refining. +2% yield per level when refining metal-class ores.', 3, '{"type":"metal_refining_pct","value":2}', 1702),
('prc_ore_specialty',          'Processing', 'Ore Reprocessing Specialty',   'Mineral-ore-type specialty. +2% yield per level on common ore types.', 2, '{"type":"common_ore_refining_pct","value":2}', 1703),
('prc_alchemy',                'Processing', 'Alchemy',                      'Advanced material conversion. Unlocks transmutation reactions. +5% reaction yield per level.', 3, '{"type":"reaction_yield_pct","value":5}', 1704),
('prc_chemistry',              'Processing', 'Chemistry',                    'Industrial chemistry. Required for chemical-process modules. +5% chemistry output per level.', 4, '{"type":"chemistry_output_pct","value":5}', 1705),
('prc_smelting',               'Processing', 'Smelting',                     'Foundry operations. -5% smelting time per level.', 3, '{"type":"smelting_time_pct","value":-5}', 1706),
('prc_assembly',               'Processing', 'Assembly Line Operation',      'Industrial assembly. -5% assembly time per level on chained production jobs.', 4, '{"type":"assembly_time_pct","value":-5}', 1707),

-- ============================================
-- POWER & ENERGY  (+4, new category)
-- ============================================
('pwr_power_management',   'Power', 'Power Management',            'Reactor-output discipline. +5% reactor output per level (placeholder for capital reactor systems).', 2, '{"type":"reactor_output_pct","value":5}', 1800),
('pwr_solar_engineering',  'Power', 'Solar Engineering',           'Solar collector engineering. +5% solar collector output per level (placeholder for orbital power).', 3, '{"type":"solar_output_pct","value":5}', 1801),
('pwr_nuclear_engineering','Power', 'Nuclear Engineering',         'Nuclear reactor design. Unlocks Fusion II reactor module. +5% nuclear reactor output per level.', 4, '{"type":"nuclear_output_pct","value":5}', 1802),
('pwr_antimatter',         'Power', 'Antimatter Research',         'Endgame antimatter containment. Unlocks Antimatter Core reactor; +5% antimatter yield per level.', 6, '{"type":"antimatter_output_pct","value":5}', 1803),

-- ============================================
-- LOGISTICS  (+4, new category)
-- ============================================
('log_logistics',          'Logistics', 'Logistics',                   'Cargo-movement fundamentals. +5% remote-cargo-transfer rate per level.', 2, '{"type":"logistics_transfer_pct","value":5}', 1900),
('log_freighter_ops',      'Logistics', 'Freighter Operation',         'Required to operate freighter-class hulls. +5% freighter cargo capacity per level.', 4, '{"type":"freighter_cargo_pct","value":5}', 1901),
('log_fleet_support',      'Logistics', 'Fleet Support',               'Logistic-ship operations. +5% remote shield/armor repair amount per level.', 3, '{"type":"remote_rep_pct","value":5}', 1902),
('log_supply_chain_opt',   'Logistics', 'Supply Chain Optimization',   'Multi-station inventory mastery. -5% courier contract collateral per level (less risk).', 3, '{"type":"courier_collateral_pct","value":-5}', 1903)

ON CONFLICT (id) DO NOTHING;
