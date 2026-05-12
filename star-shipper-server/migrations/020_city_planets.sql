-- Migration 020: City planets
-- Phase A of city seeding. A body with has_city = TRUE shows a "City"
-- tab in the dock UI, with Vendor / NPCs / Buildings sub-tabs. Stations
-- (body_type = 'station') always show an equivalent "Station" tab and
-- are independent of this flag.
--
-- Procedural systems get city placement deterministically via the
-- /ensure-body endpoint when a player first docks at any body in the
-- system (40% chance the system has a city; if yes, one random planet
-- index is chosen from the system seed).
--
-- Sol is hand-seeded: Earth is the only Sol body with a city.

ALTER TABLE celestial_bodies ADD COLUMN IF NOT EXISTS has_city BOOLEAN DEFAULT FALSE;

-- Earth (deterministic UUID from migration 005)
UPDATE celestial_bodies
SET has_city = TRUE
WHERE id = '00000000-0000-0000-0001-000000000003';
