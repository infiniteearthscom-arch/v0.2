-- Seed Sol System celestial bodies
-- These match the hardcoded bodies in the client SystemView

-- First, ensure we have the Sol system
INSERT INTO star_systems (id, name, galaxy_x, galaxy_y, star_type, star_size, is_hub)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Sol',
  0, 0,
  'yellow',
  60,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- Insert celestial bodies for Sol system
-- Using deterministic UUIDs based on body names for consistency

-- Mercury
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Mercury',
  'planet',
  200,
  0.8,
  0,
  8,
  'barren',
  2
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Venus
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Venus',
  'planet',
  350,
  0.6,
  2.5,
  15,
  'lava',
  3
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Earth
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Earth',
  'planet',
  500,
  0.4,
  1.2,
  16,
  'terran',
  4
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Luna (Moon - orbits Earth)
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'Luna',
  'moon',
  40,
  2.0,
  0,
  5,
  'barren',
  2
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Mars
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'Mars',
  'planet',
  750,
  0.3,
  4.0,
  12,
  'desert',
  4
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Asteroid Belt (between Mars and Jupiter)
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'Asteroid Belt',
  'asteroid_belt',
  1100,
  0.15,
  0,
  50,
  'rocky',
  5
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Jupiter
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'Jupiter',
  'planet',
  1500,
  0.1,
  2.8,
  50,
  'gas_giant',
  4
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Saturn
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000008',
  '00000000-0000-0000-0000-000000000001',
  'Saturn',
  'planet',
  2000,
  0.07,
  5.5,
  42,
  'gas_giant',
  4
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Luna Station (orbits Earth)
INSERT INTO celestial_bodies (id, system_id, name, body_type, orbit_radius, orbit_speed, orbit_offset, size, planet_type, deposit_slots)
VALUES (
  '00000000-0000-0000-0001-000000000009',
  '00000000-0000-0000-0000-000000000001',
  'Luna Station',
  'station',
  60,
  1.5,
  3.14,
  8,
  NULL,
  0
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Create a lookup table for easy name-to-UUID mapping
CREATE TABLE IF NOT EXISTS celestial_body_aliases (
  alias VARCHAR(50) PRIMARY KEY,
  celestial_body_id UUID REFERENCES celestial_bodies(id)
);

-- Insert aliases (lowercase for easy lookup)
INSERT INTO celestial_body_aliases (alias, celestial_body_id) VALUES
  ('mercury', '00000000-0000-0000-0001-000000000001'),
  ('venus', '00000000-0000-0000-0001-000000000002'),
  ('earth', '00000000-0000-0000-0001-000000000003'),
  ('luna', '00000000-0000-0000-0001-000000000004'),
  ('moon', '00000000-0000-0000-0001-000000000004'),
  ('mars', '00000000-0000-0000-0001-000000000005'),
  ('asteroid belt', '00000000-0000-0000-0001-000000000006'),
  ('asteroids', '00000000-0000-0000-0001-000000000006'),
  ('jupiter', '00000000-0000-0000-0001-000000000007'),
  ('saturn', '00000000-0000-0000-0001-000000000008'),
  ('luna station', '00000000-0000-0000-0001-000000000009'),
  ('station', '00000000-0000-0000-0001-000000000009')
ON CONFLICT (alias) DO UPDATE SET celestial_body_id = EXCLUDED.celestial_body_id;
