-- 103: three Planetary skills for deployed harvesters -- the first skills
-- that touch them (owner 2026-10-09: "give harvesters a skill", then
-- "add a hopper and fuel skill for harvesters too").
--
--   pln_harvester_ops   harvester_rate_pct    +5/level  -> L5 +25 % (Industrial 100/hr -> 125/hr)
--   pln_hopper_expansion harvester_hopper_pct +10/level -> L5 +50 % (Industrial hopper 1000 -> 1500)
--   pln_fuel_efficiency harvester_fuel_pct    +8/level  -> L5 +40 % (a Fuel Cell 6 h -> 8.4 h)
--
-- All applied in api/harvesters.js (harvesterMults): rate and hopper at
-- settle time so every harvester already in the ground benefits; fuel as a
-- cell is loaded (remaining hours stay true hours). Never baked into the
-- row or the item -- pick-up returns the base harvester.
-- Same pass, no migration needed: docked planet mining (/harvest/start)
-- now reads the fleet's mining lasers at 25 % of their asteroid rate
-- (PLANET_LASER_FRACTION) × quality × Mining Operations, floor 50/hr.

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order) VALUES
('pln_harvester_ops',    'Planetary', 'Harvester Operations', 'Field tuning of deployed harvesters. Every harvester you own extracts +5% faster per level.', 2, '{"type":"harvester_rate_pct","value":5}', 1606),
('pln_hopper_expansion', 'Planetary', 'Hopper Expansion',     'Denser hopper packing. Every harvester you own holds +10% more per level before it stops.', 2, '{"type":"harvester_hopper_pct","value":10}', 1607),
('pln_fuel_efficiency',  'Planetary', 'Fuel Efficiency',      'Leaner harvester burn. Each Fuel Cell loaded into a harvester lasts +8% longer per level.', 2, '{"type":"harvester_fuel_pct","value":8}', 1608)
ON CONFLICT (id) DO NOTHING;
