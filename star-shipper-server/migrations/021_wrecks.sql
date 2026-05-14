-- Migration 021: Wrecks (lootable spatial entities)
-- Phase 1 of the wreckage system. When a pirate is destroyed (or a
-- player ship is destroyed in Podding Phase 2), a wreck spawns at that
-- position. Players fly to it, claim it server-side via proximity, and
-- the wreck contents go to their account.
--
-- Contents is JSONB so the system supports arbitrary loot shapes
-- without schema churn. v1 stores only { "credits": N }; future
-- iterations will add items / modules / etc.

CREATE TABLE IF NOT EXISTS wrecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id UUID NOT NULL REFERENCES star_systems(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  -- { credits: 100, items: [{item_id, quantity}], modules: [{module_type_id, quality}] }
  contents JSONB NOT NULL DEFAULT '{}',
  -- 'pirate' (Phase 1) | 'player_pod' (Phase 2 -- player death wreck)
  source VARCHAR(32) NOT NULL DEFAULT 'pirate',
  spawned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- First-touch claim. Stays NULL until a player flies into pickup
  -- range; once set, the wreck is "spent" and won't appear in the
  -- active list for any other player.
  claimed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ
);

-- Active wrecks lookup: clients poll for unclaimed wrecks in their
-- current system. This index makes that query cheap as wreck rows
-- accumulate over time. (Expired wrecks aren't deleted -- they just
-- get filtered out by the WHERE expires_at > NOW() in the SELECT.)
CREATE INDEX IF NOT EXISTS idx_wrecks_system ON wrecks(system_id);
CREATE INDEX IF NOT EXISTS idx_wrecks_unclaimed_by_system
  ON wrecks(system_id)
  WHERE claimed_by IS NULL;
