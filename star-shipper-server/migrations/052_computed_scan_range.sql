-- Migration 052: per-ship computed asteroid scan range.
-- ============================================
-- The client's "click to scan an asteroid" reach is currently hardcoded
-- to SCAN_RANGE = 80 in SystemView, ignoring the fitted scanner's
-- `scan_range` stat (T1=80, T2=160, T3=320) and the `ast_survey` skill's
-- `survey_scanner_range_pct` bonus (catalog-defined +5%/level but never
-- read in code). This column makes the value authoritative on the ship
-- so the client can read it without module_types.stats access.
--
-- recalcShipStats picks the BEST (max) scan_range across fitted scanners,
-- scaled by quality. NULL on existing rows; client falls back to the
-- hardcoded 80 until the ship is next re-fitted -- matches the migration
-- 047 + 049 backfill pattern.
-- ============================================

ALTER TABLE ships ADD COLUMN IF NOT EXISTS computed_scan_range INTEGER;
