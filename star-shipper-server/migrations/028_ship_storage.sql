-- Migration 028: Ship storage at celestial bodies
-- Phase 1 of the fleet-cap + station-ship-manager feature.
--
-- storage_body_id NULL  -> ship is "active" in the fleet (flying with the player)
-- storage_body_id !NULL -> ship is "stored" at that celestial body (station/planet)
--
-- Players can have unlimited ships, but only FLEET_CAP (server constant
-- in fitting.js, currently 5) can be active at once. Beyond that, new
-- ships must be stored at the player's current dock.
--
-- ON DELETE SET NULL: if a celestial body somehow gets deleted, ships
-- stored there fall back to active rather than vanishing. Players will
-- see them in the fleet and can re-store them elsewhere.

ALTER TABLE ships
  ADD COLUMN IF NOT EXISTS storage_body_id UUID
  REFERENCES celestial_bodies(id) ON DELETE SET NULL;

-- Indexed because the fleet endpoint joins on it and filters by it
-- (active vs stored counts) on every fleet read.
CREATE INDEX IF NOT EXISTS idx_ships_storage_body
  ON ships(storage_body_id) WHERE storage_body_id IS NOT NULL;

-- All pre-existing ships start as active (storage_body_id = NULL).
-- Players with >5 ships are grandfathered over the cap; the cap only
-- enforces on new activations + purchases going forward, so nobody
-- has ships disappear mid-session.
