-- Add 'luna_station' alias for Luna Station.
-- The client refers to Sol's only station as 'luna_station' (underscore)
-- but migration 005 only seeded 'luna station' (space) + 'station'.
-- That mismatch produced a spurious 404 "Station not found" from
-- /fitting/store-ship when docked at Luna. Add the alias to close it.

INSERT INTO celestial_body_aliases (alias, celestial_body_id) VALUES
  ('luna_station', '00000000-0000-0000-0001-000000000009')
ON CONFLICT (alias) DO UPDATE SET celestial_body_id = EXCLUDED.celestial_body_id;
