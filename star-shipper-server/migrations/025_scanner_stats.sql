-- Migration 025: Sensor Suite scanning stats + per-player asteroid reveals
-- Phase A2 of asteroid mining. Sensor Suite gains:
--   scan_range — must be within N world units of asteroid to start scan
--   scan_time  — seconds to complete a scan
-- player_asteroid_scans records which asteroids each player has revealed,
-- so reveals persist across sessions.
--
-- Tier upgrades (advanced + elite + bulk_scan flag) are deferred to a
-- follow-up. Today only the basic Sensor Suite has these stats; that's
-- what the existing Starter Kit ships with.

UPDATE module_types
SET stats = stats || '{"scan_range": 80, "scan_time": 8}'::jsonb
WHERE id = 'utility_scanner';

CREATE TABLE IF NOT EXISTS player_asteroid_scans (
  user_id     UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  asteroid_id UUID NOT NULL REFERENCES asteroids(id) ON DELETE CASCADE,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, asteroid_id)
);

-- Speeds up the per-system "what have I scanned" lookup used by the
-- GET /asteroids endpoint after this migration (joins to filter contents).
CREATE INDEX IF NOT EXISTS idx_asteroid_scans_user
  ON player_asteroid_scans(user_id);
