-- Migration 040: Missiles -- weapon module + warhead ammo + recipes
-- ============================================
-- Adds the third weapon archetype. The projectile + tracking code in
-- SystemView already supports `weapon_type: 'missile'`; this migration
-- supplies the missing module row + ammo item + recipes + vendor entry
-- so the player can actually fit and use them.
--
-- Design (per design call):
--   * High damage, slow fire rate (~1.4s cycle) -- distinct from
--     lasers (fast, instant) and autocannons (medium, kinetic).
--   * Lock-on time (~2s): launcher must hold a target before firing.
--     Punishes ADHD targeting; rewards commitment.
--   * Limited ammo (6 missiles per launcher): defining missile
--     mechanic. Reload at station via vendor.
--   * Tracking projectile: already wired; missile turns toward target
--     each frame at turn_rate=4 rad/s.
--
-- Future tiers (Light/Heavy/Cruise/Torpedo) map to the existing
-- Missiles skill category from migration 032 -- they're content-only
-- additions once balance is dialed in.

-- ============================================
-- (1) The launcher module
-- ============================================
-- stats:
--   damage, range, fire_rate -- same shape as laser / cannon
--   projectile_speed, turn_rate -- already consumed by SystemView's
--     missile branch
--   lock_time -- seconds the launcher must hold target before firing
--   ammo_capacity -- max loaded warheads per launcher (refilled by reload)

INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, build_recipe) VALUES
  ('weapon_missile_basic', 'Missile Launcher', 'weapon', 2,
   'Slow-firing guided ordnance. Requires 2s target lock + loaded warheads. 6-round magazine; reload at any station vendor.',
   '{"damage":22,"range":280,"fire_rate":1.4,"projectile_speed":180,"turn_rate":4.0,"lock_time":2,"ammo_capacity":6}'::jsonb,
   5500,
   '[{"resource":"Titanium","quantity":15},{"resource":"Copper","quantity":10},{"resource":"Crystite","quantity":5}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- (2) Warhead ammo item
-- ============================================
-- One warhead = one missile in the magazine. Reload action at the
-- vendor consumes warheads from cargo to top up loaded launchers.

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('missile_warhead', 'Missile Warhead', 'Ammunition for missile launchers. Each warhead loads one round into a launcher magazine.',
   'ammo', '🚀', 50, '{}')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- (3) Crafting recipes
-- ============================================
-- Warheads come in bulk (5 per craft) so the player isn't constantly
-- crafting one-at-a-time. Launcher recipe scales with the laser/cannon
-- pattern -- mid-tier weapon costs.

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category) VALUES
  ('craft_missile_warhead', 'Missile Warhead', 'Craft 5 missile warheads (ammo for missile launchers).',
   'missile_warhead', 5,
   '[{"resource_name":"Iron","quantity":5},{"resource_name":"Crystite","quantity":2}]'::jsonb,
   'ammo'),
  ('craft_weapon_missile_basic', 'Missile Launcher', 'Craft a missile launcher (mid-tier weapon module).',
   'weapon_missile_basic', 1,
   '[{"resource_name":"Titanium","quantity":15},{"resource_name":"Copper","quantity":10},{"resource_name":"Crystite","quantity":5}]'::jsonb,
   'module')
ON CONFLICT (id) DO NOTHING;
