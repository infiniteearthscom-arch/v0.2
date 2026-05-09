-- Migration 019: Escape Pod hull type
-- Adds the 'pod' hull used when the player's active ship is destroyed.
-- Phase 1 of EVE-style podding: ship destroyed -> player ejects into a
-- pod they can fly back to a station to disembark / re-equip.
--
-- Pirates ignore pods (client-side aggro check on hull_type_id === 'pod').
-- Pods are not vendor-purchasable -- the /hulls endpoint filters on
-- price IS NOT NULL so this row is excluded from station hull listings.

INSERT INTO hull_types (
  id, name, class, description, price,
  base_hull, base_speed, base_maneuver, base_sensors,
  grid_w, grid_h, slots
)
VALUES (
  'pod',
  'Escape Pod',
  'Pod',
  'Emergency life support capsule. Fragile but evasive -- pirates will not engage. Fly to any station to disembark and board a fleet ship or purchase a new hull.',
  NULL,    -- not vendor-purchasable; excluded from /hulls via WHERE price IS NOT NULL
  1,       -- 1 HP -- moot since pods are untargetable
  100,     -- frigate-tier base speed
  100,     -- frigate-tier maneuver
  200,     -- baseline sensors
  3,
  5,
  '[]'::jsonb  -- no slots: pods cannot fit modules
)
ON CONFLICT (id) DO NOTHING;
