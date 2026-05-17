-- Migration 022: Repair migration for the wrecks table.
-- Migration 021 was recorded as applied in the migrations tracker
-- but the actual wrecks table doesn't exist in the production DB
-- (multiple kills returned PG 42P01 / parserOpenTable). Possible
-- causes: 021 was applied to a different DB instance, the table was
-- dropped after, or the multi-statement migration partially failed.
--
-- This migration is a verbatim re-run of 021 with a different filename
-- so the tracker treats it as new. All statements are idempotent
-- (IF NOT EXISTS) so it's safe to run regardless of current state.

CREATE TABLE IF NOT EXISTS wrecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id UUID NOT NULL REFERENCES star_systems(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  contents JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(32) NOT NULL DEFAULT 'pirate',
  spawned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wrecks_system ON wrecks(system_id);
CREATE INDEX IF NOT EXISTS idx_wrecks_unclaimed_by_system
  ON wrecks(system_id)
  WHERE claimed_by IS NULL;
