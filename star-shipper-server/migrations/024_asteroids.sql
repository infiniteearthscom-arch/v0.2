-- Migration 024: Asteroids
-- Phase A1 of asteroid mining. Spatial entities positioned in the belt
-- bodies of each system. Server-persisted so depletion state is shared
-- across players (multiplayer-ready). Generated lazily on first GET
-- /resources/asteroids for a system from the system seed + belt index.
--
-- Phase A1 only adds the schema + list/generate. Scan (A2) and mine
-- (A3) endpoints come later but reuse this table.

CREATE TABLE IF NOT EXISTS asteroids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id UUID NOT NULL REFERENCES star_systems(id) ON DELETE CASCADE,
  belt_body_id UUID NOT NULL REFERENCES celestial_bodies(id) ON DELETE CASCADE,
  -- World coordinates in the system view. Random within the belt's
  -- orbit radius +/- belt thickness, generated server-side from the
  -- system seed so all players see the same field.
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  -- Visual size (also hints at total resource capacity). Range 2-6.
  size INTEGER NOT NULL DEFAULT 4,
  -- Visual rotation in radians, for sprite variety.
  rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Resource composition. Shape:
  --   { "<resource_type_id>": { "initial": N, "remaining": N }, ... }
  -- Mining (A3) decrements `remaining`; when all hit 0, asteroid is
  -- depleted and the respawn timer fires.
  contents JSONB NOT NULL DEFAULT '{}',
  spawned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when fully depleted (A3). NULL while still mineable.
  depleted_at TIMESTAMPTZ,
  -- Time the asteroid respawns with fresh (re-rolled) contents at the
  -- same position. NULL until depleted.
  respawn_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_asteroids_system ON asteroids(system_id);
CREATE INDEX IF NOT EXISTS idx_asteroids_belt ON asteroids(belt_body_id);
-- Speeds up the active-asteroid list query in /asteroids GET.
CREATE INDEX IF NOT EXISTS idx_asteroids_mineable
  ON asteroids(system_id)
  WHERE depleted_at IS NULL;
