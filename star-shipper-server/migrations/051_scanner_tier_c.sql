-- Migration 051: Scanner Depth Tier C -- 3 skills paired with Tier B
-- abilities + a player_system_visits table backing galaxy fog of war.
-- ============================================
-- SKILLS (Astrometrics tree)
--   ast_area_scanning   -- +10% area-scan radius per level.
--                          Multiplies the radius passed to /scan_area
--                          on the client before the request is sent.
--   ast_bulk_belt_efficiency -- -10% bulk-belt cooldown per level.
--                               Pairs with a NEW 90s base cooldown on
--                               bulk belt (Tier B shipped it cooldown-
--                               free; the skill makes the cooldown the
--                               investment, not a flat nerf).
--   ast_telemetry_ops   -- -5% system-sweep cooldown per level. L5
--                          drops the 120s base cooldown to 90s.
--
-- Bonus contracts:
--   area_scan_radius_pct    (+%, ast_area_scanning)
--   bulk_belt_cooldown_pct  (-%, ast_bulk_belt_efficiency)
--   sweep_cooldown_pct      (-%, ast_telemetry_ops)
--
-- ============================================
-- player_system_visits
--   Records every star system a player has warped into. Drives the
--   client's galaxy-map fog of war: undiscovered systems show as
--   generic gray dots with no name / faction halo / star type.
--   First-time visits are dirt-cheap to record (idempotent UPSERT
--   on user_id + system_procedural_id) so we can fire-and-forget on
--   every system entry without performance worry.
-- ============================================

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order)
VALUES
  ('ast_area_scanning', 'Astrometrics', 'Area Scanning',
   'Wide-field scan calibration. +10% effective radius on Wide-Field Sensor Array (and higher tier) area scans per level. Stacks with sensor-range bonuses.',
   3, '{"type":"area_scan_radius_pct","value":10}', 1500),
  ('ast_bulk_belt_efficiency', 'Astrometrics', 'Bulk Survey Efficiency',
   'Tightened belt-scan procedure. -10% Elite Survey Grid bulk-belt cooldown per level (base 90s). L5 = 45s.',
   4, '{"type":"bulk_belt_cooldown_pct","value":-10}', 1501),
  ('ast_telemetry_ops', 'Astrometrics', 'Telemetry Operations',
   'System Telemetry Array operator training. -5% sensor sweep cooldown per level (base 120s). L5 = 90s.',
   4, '{"type":"sweep_cooldown_pct","value":-5}', 1502)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  rank_multiplier = EXCLUDED.rank_multiplier,
  bonus_per_level = EXCLUDED.bonus_per_level,
  sort_order = EXCLUDED.sort_order;


CREATE TABLE IF NOT EXISTS player_system_visits (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- procedural_id mirrors the client's discoveredSystems keys (e.g.
  -- 'sol', 'sys_4_12'). Stable across sessions since galaxy generation
  -- is seeded.
  system_procedural_id VARCHAR(64) NOT NULL,
  first_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, system_procedural_id)
);

CREATE INDEX IF NOT EXISTS idx_psv_user ON player_system_visits(user_id);
