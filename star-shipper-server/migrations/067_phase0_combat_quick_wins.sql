-- Migration 067: Combat redesign Phase 0 — quick wins (2026-09-04)
-- Per docs/combat-redesign-plan.md Phase 0. Five data fixes:
--   1. Mining Laser II becomes obtainable (price + recipe) — the T1
--      Industry research node previously unlocked nothing real.
--   2. Honest weapon stats: T1/T2 vendor weapons get combat_tuned
--      stats matching what the client's WEAPON_DEFAULTS actually do,
--      so tooltips stop lying (Pulse Laser showed 10 dmg / 300 range,
--      fired 6 / 200).
--   3. Explicit damage_type in every weapon's stats JSONB (client
--      weapons.js honors it; keyword-guess demoted to fallback).
--   4. The two placeholder T1 tech nodes repoint at real modules:
--      Thruster Optimization -> Ion Drive; Pulse Optimization ->
--      T2 vendor weapons (Autocannon + Missile Launcher).
--   5. Backfill: players already owning newly-gated modules get the
--      gating tech granted free (no stranding veterans).

-- ============================================
-- 1. Mining Laser II obtainable
-- ============================================
UPDATE module_types
   SET buy_price = 4500,
       requires_tech = 'tech_adv_mining'
 WHERE id = 'mining_laser_2';

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech)
VALUES (
  'craft_mining_laser_2', 'Mining Laser II', 'Craft a higher-yield mining beam.',
  'mining_laser_2', 1,
  '[{"resource_name": "Titanium", "quantity": 20}, {"resource_name": "Crystite", "quantity": 8}]',
  'module', 'tech_adv_mining'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2 + 3. Honest, combat_tuned, explicitly-typed weapon stats
-- ============================================
-- T1/T2 vendor weapons: stats now match the client's WEAPON_DEFAULTS
-- exactly, flagged combat_tuned so newly-fitted copies read them.
-- (Already-fitted legacy copies keep their old snapshot and keep using
-- type defaults — same numbers, zero balance drift.)
UPDATE module_types SET stats =
  '{"damage":6, "fire_rate":0.45, "range":200, "damage_type":"laser", "combat_tuned":true}'::jsonb
 WHERE id = 'weapon_laser';

UPDATE module_types SET stats =
  '{"damage":12, "fire_rate":0.7, "range":180, "projectile_speed":320, "spread":0.08, "damage_type":"kinetic", "combat_tuned":true}'::jsonb
 WHERE id = 'weapon_cannon';

-- Missile Launcher's DB stats already match the defaults — just flag +
-- type it (lock_time/ammo_capacity were always read from DB).
UPDATE module_types SET stats = stats || '{"damage_type":"missile", "combat_tuned":true}'::jsonb
 WHERE id = 'weapon_missile_basic';

-- Crafted weapons (already combat_tuned from 062): add explicit type.
UPDATE module_types SET stats = stats || '{"damage_type":"laser"}'::jsonb
 WHERE id IN ('weapon_beam_3', 'weapon_lance_5');
UPDATE module_types SET stats = stats || '{"damage_type":"kinetic"}'::jsonb
 WHERE id IN ('weapon_railgun_3', 'weapon_driver_5');
UPDATE module_types SET stats = stats || '{"damage_type":"missile"}'::jsonb
 WHERE id = 'weapon_torpedo_4';

-- ============================================
-- 4. Placeholder T1 tech nodes -> real unlocks
-- ============================================
UPDATE tech_definitions
   SET description = 'Refined burn profiles for improved sub-light maneuvering. Unlocks the Ion Drive (T2 engine).',
       unlocks = '{"modules":["engine_advanced"]}'::jsonb
 WHERE id = 'tech_thrust_optim';

UPDATE tech_definitions
   SET description = 'Weapons-platform integration and fire-control calibration. Unlocks the Autocannon and Missile Launcher (T2 weapons).',
       unlocks = '{"modules":["weapon_cannon","weapon_missile_basic"]}'::jsonb
 WHERE id = 'tech_pulse_optim';

-- The gates themselves (buy + craft honor requires_tech since 053):
UPDATE module_types SET requires_tech = 'tech_thrust_optim' WHERE id = 'engine_advanced';
UPDATE module_types SET requires_tech = 'tech_pulse_optim'  WHERE id IN ('weapon_cannon', 'weapon_missile_basic');
UPDATE crafting_recipes SET requires_tech = 'tech_thrust_optim' WHERE id = 'craft_engine_advanced';
UPDATE crafting_recipes SET requires_tech = 'tech_pulse_optim'  WHERE id IN ('craft_weapon_cannon', 'craft_weapon_missile_basic');

-- ============================================
-- 5. Veteran backfill — grant the new gate techs to anyone who
--    already owns (in cargo) or has fitted the newly-gated modules,
--    so nothing they can currently use/re-buy gets locked away.
-- ============================================
INSERT INTO player_research (user_id, tech_id)
SELECT DISTINCT u.user_id, 'tech_thrust_optim' FROM (
  SELECT user_id FROM player_resource_inventory WHERE item_id = 'engine_advanced'
  UNION
  SELECT user_id FROM ships WHERE fitted_modules::text LIKE '%engine_advanced%'
) u
ON CONFLICT (user_id, tech_id) DO NOTHING;

INSERT INTO player_research (user_id, tech_id)
SELECT DISTINCT u.user_id, 'tech_pulse_optim' FROM (
  SELECT user_id FROM player_resource_inventory WHERE item_id IN ('weapon_cannon', 'weapon_missile_basic')
  UNION
  SELECT user_id FROM ships WHERE fitted_modules::text LIKE '%weapon_cannon%'
     OR fitted_modules::text LIKE '%weapon_missile_basic%'
) u
ON CONFLICT (user_id, tech_id) DO NOTHING;
