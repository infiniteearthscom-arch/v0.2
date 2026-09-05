-- Migration 068: Combat redesign Phase 1 — rebalance pass (2026-09-04)
-- Per docs/combat-redesign-plan.md Phase 1 + decisions B5/B6.
-- Numbers only, no new systems:
--   1. Research ladder steepened + material costs on T3+ nodes
--      (research joins the risk→resource→craft loop; T5-weapon research
--      goes from ~6.5 days of passive trickle to a real expedition).
--   2. Common resource prices lowered ~40% (T1 mining was ~45k cr/hr
--      risk-free — within range of endgame combat income).
--   3. Mining yields flattened (part of the same income retune).
-- Companion code changes (same deploy): belt asteroids danger-scale,
-- loot roll raised 20-80 → 35-120, Sol TEST BUFF reverted, spawn curve
-- flattened, quality DPS linearized.

-- ============================================
-- 1a. Material-cost column + ladder steepening
-- ============================================
ALTER TABLE tech_definitions ADD COLUMN IF NOT EXISTS material_cost JSONB DEFAULT '[]';

-- New ladder: T1 200 (unchanged) / T2 1,000 / T3 4,000 / T4 15,000.
-- The deliberately-cheap sensor+cargo side nodes scale proportionally.
UPDATE tech_definitions SET rp_cost = 1000  WHERE tier = 2;
UPDATE tech_definitions SET rp_cost = 400   WHERE id = 'tech_sensor_array';
UPDATE tech_definitions SET rp_cost = 800   WHERE id = 'tech_cargo_handling';
UPDATE tech_definitions SET rp_cost = 4000  WHERE tier = 3;
UPDATE tech_definitions SET rp_cost = 900   WHERE id = 'tech_sensor_grid';
UPDATE tech_definitions SET rp_cost = 800   WHERE id = 'tech_system_telemetry';
UPDATE tech_definitions SET rp_cost = 3000  WHERE id = 'tech_cargo_compression';
UPDATE tech_definitions SET rp_cost = 15000 WHERE tier = 4;

-- ============================================
-- 1b. Material costs (T3+ real nodes; placeholders stay RP-only).
--     Consumed worst-quality-first from cargo at unlock time
--     (api/research.js).
-- ============================================
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Plasma","quantity":5}]'                                              WHERE id = 'tech_high_energy';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Uranium","quantity":8}]'                                             WHERE id = 'tech_adv_munitions';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Solar Crystals","quantity":6}]'                                      WHERE id = 'tech_reactive_defense';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Helium-3","quantity":5}]'                                            WHERE id = 'tech_deep_extraction';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Crystite","quantity":15}]'                                           WHERE id = 'tech_sensor_grid';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Crystite","quantity":12}]'                                           WHERE id = 'tech_system_telemetry';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Crystite","quantity":10}]'                                           WHERE id = 'tech_cargo_compression';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Dark Matter","quantity":2},{"resource_name":"Plasma","quantity":10}]'         WHERE id = 'tech_exotic_drives';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Quantum Dust","quantity":2},{"resource_name":"Plasma","quantity":10}]'        WHERE id = 'tech_exotic_weapons';
UPDATE tech_definitions SET material_cost = '[{"resource_name":"Void Essence","quantity":2},{"resource_name":"Solar Crystals","quantity":10}]' WHERE id = 'tech_exotic_defense';

-- ============================================
-- 2. Common resource sell-price retune (~×0.6). Rares/exotics
--    unchanged — they're crafting inputs and the deep-zone draw.
-- ============================================
UPDATE resource_types SET base_price = 6  WHERE name = 'Iron';
UPDATE resource_types SET base_price = 9  WHERE name = 'Copper';
UPDATE resource_types SET base_price = 16 WHERE name = 'Titanium';
UPDATE resource_types SET base_price = 5  WHERE name = 'Hydrogen';
UPDATE resource_types SET base_price = 8  WHERE name = 'Nitrogen';
UPDATE resource_types SET base_price = 22 WHERE name = 'Xenon';
UPDATE resource_types SET base_price = 11 WHERE name = 'Biomass';
UPDATE resource_types SET base_price = 19 WHERE name = 'Coral';

-- ============================================
-- 3. Mining yield flattening: 5/10/18 → 3/6/11 per cycle. The server
--    mining endpoint reads module_types live, so this applies to
--    already-fitted lasers too (no refit needed).
-- ============================================
UPDATE module_types SET stats = stats || '{"mine_yield":3}'::jsonb  WHERE id = 'mining_basic';
UPDATE module_types SET stats = stats || '{"mine_yield":6}'::jsonb  WHERE id = 'mining_laser_2';
UPDATE module_types SET stats = stats || '{"mine_yield":11}'::jsonb WHERE id = 'mining_laser_3';
