-- Migration 049: per-ship computed scan time from fitted scanner + quality.
-- ============================================
-- Scanner Depth Phase 1. SystemView's asteroid scan timer is currently
-- hardcoded to 8000ms even though the fitted scanner module already
-- carries a `scan_time` stat (T1=8, T2=4). This column makes the value
-- authoritative on the ship so the client can read it without needing
-- access to module_types.stats.
--
-- recalcShipStats picks the BEST (lowest) scan_time across fitted
-- scanners, scaled by quality (lower is better, so quality is inverted
-- via the shared qualityMultiplier helper). NULL on existing rows;
-- client falls back to the hardcoded 8000ms until the ship is next
-- re-fitted -- matches the migration 047 backfill pattern.
-- ============================================

ALTER TABLE ships ADD COLUMN IF NOT EXISTS computed_scan_time INTEGER;
