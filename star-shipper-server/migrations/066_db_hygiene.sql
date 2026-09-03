-- Migration 066: DB hygiene (audit batch 4, 2026-09-02)
-- ============================================================
-- 1. Repair the deployed_harvesters migration chain (003 vs 011).
--    003 created an old-shape table (deposit_id NOT NULL, no
--    celestial_body_id/slot_index); 011 "replaced" it with
--    CREATE TABLE IF NOT EXISTS and no DROP — so on any fresh
--    database the 003 table survives and 011's index on
--    celestial_body_id errors out, aborting the whole migration run.
--    Prod evidently had the old table dropped out-of-band; this makes
--    the on-disk truth reproducible from the files again.
-- 2. Guarantee the one-harvester-per-deposit UNIQUE index actually
--    exists (003 created a NON-unique index under the same name, so
--    011's CREATE UNIQUE INDEX IF NOT EXISTS silently no-op'd on
--    that path).
-- 3. Indexes on activity_events: leaderboards + profiles run live
--    COUNT aggregates over the whole table (event_type / user_id),
--    which today is a sequential scan that gets slower forever.
-- ============================================================

-- ---- 1. Replace the legacy 003-shape table if it survives ----
-- Detection: the 003 shape has no celestial_body_id column. The modern
-- code can't read that shape, so any rows in it are unreachable data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deployed_harvesters'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deployed_harvesters' AND column_name = 'celestial_body_id'
  ) THEN
    DROP TABLE deployed_harvesters CASCADE;
  END IF;
END $$;

-- Recreate in the 011 (modern) shape if missing. Verbatim copy of 011.
CREATE TABLE IF NOT EXISTS deployed_harvesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  celestial_body_id UUID NOT NULL,
  slot_index INTEGER NOT NULL,

  harvester_type VARCHAR(50) NOT NULL,
  harvest_rate NUMERIC(8,2) NOT NULL,
  storage_capacity INTEGER NOT NULL,
  fuel_efficiency NUMERIC(6,2) DEFAULT 1.0,

  deposit_id UUID,
  resource_type_id INTEGER,

  fuel_remaining_hours NUMERIC(10,2) DEFAULT 0,
  last_fuel_check_at TIMESTAMPTZ DEFAULT NOW(),

  hopper_quantity INTEGER DEFAULT 0,
  hopper_resource_type_id INTEGER,
  hopper_stat_purity INTEGER,
  hopper_stat_stability INTEGER,
  hopper_stat_potency INTEGER,
  hopper_stat_density INTEGER,
  last_hopper_update_at TIMESTAMPTZ DEFAULT NOW(),

  status VARCHAR(20) DEFAULT 'idle',

  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_harvesters_body_slot
ON deployed_harvesters(celestial_body_id, slot_index);

CREATE INDEX IF NOT EXISTS idx_harvesters_user ON deployed_harvesters(user_id);
CREATE INDEX IF NOT EXISTS idx_harvesters_body ON deployed_harvesters(celestial_body_id);
CREATE INDEX IF NOT EXISTS idx_harvesters_active ON deployed_harvesters(status) WHERE status = 'active';

-- ---- 2. Force idx_harvesters_deposit to be the UNIQUE partial ----
-- If prod ever accumulated two harvesters on one deposit while the
-- guarantee was missing, unassign the newer one first (it goes idle on
-- that deposit rather than blocking the index build).
UPDATE deployed_harvesters SET deposit_id = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY deposit_id ORDER BY deployed_at DESC) AS rn
    FROM deployed_harvesters WHERE deposit_id IS NOT NULL
  ) t WHERE t.rn > 1
);

DROP INDEX IF EXISTS idx_harvesters_deposit;
CREATE UNIQUE INDEX idx_harvesters_deposit
ON deployed_harvesters(deposit_id) WHERE deposit_id IS NOT NULL;

-- ---- 3. activity_events aggregate indexes ----
-- Top Crafters board + every profile open: COUNT(*) WHERE event_type
-- GROUP BY user_id. Most Active (7d): per-user COUNT over created_at.
CREATE INDEX IF NOT EXISTS idx_activity_type_user ON activity_events(event_type, user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_created ON activity_events(user_id, created_at);
