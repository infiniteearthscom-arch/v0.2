-- Migration 047: per-ship computed stats from fitted modules + quality.
-- ============================================
-- Phase 3 of the quality pass. Today the client reads `base_speed` /
-- `base_maneuver` directly off the hull type, so engine modules and
-- their crafted quality have ZERO effect on actual flight feel. Same
-- story for shield max HP and sensor range -- they're flat numbers.
--
-- This migration adds three computed columns the server fills via
-- recalcShipStats() every time fitted_modules changes. The client then
-- reads `computed_max_speed` etc. with fallback to `base_*` so existing
-- ships keep working until they're next re-fitted.
--
--   computed_max_speed    -- base_speed + sum(engine module thrust * Q)
--   computed_max_shield   -- sum(shield module shield_hp * Q). 0 if no shields fitted.
--   computed_sensor_range -- max(scanner module sensor_range * Q). 0 if no scanner.
--
-- All NULL on existing rows; recalcShipStats fills them on next fit/unfit.
-- Client falls back to hull base values when NULL.
-- ============================================

ALTER TABLE ships ADD COLUMN IF NOT EXISTS computed_max_speed    INTEGER;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS computed_max_shield   INTEGER;
ALTER TABLE ships ADD COLUMN IF NOT EXISTS computed_sensor_range INTEGER;
