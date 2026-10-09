-- 102: six skills for mechanics that had no skill reading them
-- (owner 2026-10-09: "skill based bonuses for a lot of game mechanics").
--
--   eng_heat_sinks          overheat_duration_pct  +8/level  Overheat 10 s -> 14 s at V
--   eng_heat_dissipation    overheat_cooldown_pct  -6/level  cooldown 45 s -> 31.5 s at V
--   eng_nanite_interfacing  repair_delay_pct      -10/level  Repair Nanite Hive waits 8 s -> 4 s at V
--   eng_shield_management   shield_recharge_pct    +8/level  passive shield regen 2/s -> 2.8/s at V
--   eng_emergency_power     cap_empty_rate_pct     -8/level  empty-capacitor turret penalty (cycle ×2) shrinks: ×1.6 at V
--   log_dock_maintenance    repair_cost_pct        -5/level  station / city / base repair bill -25 % at V
--
-- Client: SystemView reads the five combat types off activeBonuses;
-- the Repair tab shows the discounted bill. Server: /fitting/repair
-- applies repair_cost_pct after the base Repair Shop discount.

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order) VALUES
('eng_heat_sinks',         'Engineering', 'Heat Sinks',          'Thermal mass added to the weapon mounts. Overheat lasts +8% longer per level.', 3, '{"type":"overheat_duration_pct","value":8}', 309),
('eng_heat_dissipation',   'Engineering', 'Heat Dissipation',    'Radiator discipline after an overload. Overheat cooldown -6% per level.', 3, '{"type":"overheat_cooldown_pct","value":-6}', 310),
('eng_nanite_interfacing', 'Engineering', 'Nanite Interfacing',  'Faster hand-off to the Repair Nanite Hive. The hive starts repairing -10% sooner after the last hit per level.', 2, '{"type":"repair_delay_pct","value":-10}', 311),
('eng_shield_management',  'Engineering', 'Shield Management',   'Emitter recovery tuning. Passive shield recharge +8% per level.', 2, '{"type":"shield_recharge_pct","value":8}', 312),
('eng_emergency_power',    'Engineering', 'Emergency Power',     'Reserve bus routing. The fire-rate penalty when the capacitor is empty is -8% smaller per level.', 3, '{"type":"cap_empty_rate_pct","value":-8}', 313),
('log_dock_maintenance',   'Logistics',   'Dock Maintenance',    'Standing yard contracts. Hull and armor repairs at stations, cities and your bases cost -5% per level.', 2, '{"type":"repair_cost_pct","value":-5}', 1903)
ON CONFLICT (id) DO NOTHING;
