-- 098: Sol's asteroid belt row matches the client's belt ring.
--
-- Owner 2026-10-08: "In Sol, the asteroids are now in a different orbit
-- than the asteroid background graphics." The client's hand-authored Sol
-- (SystemView / SystemMapWindow SOL_SYSTEM) draws the belt at radius 1500,
-- 250 wide, between Mars (1100) and Jupiter (2200). The 005 seed row the
-- server spawns asteroids from says orbit_radius 1100 / size 50 (its
-- planets are on a different scale too, Mars 750; only the belt row is
-- read for anything -- by the asteroid spawner), so every Sol rock sat
-- 400 units inside the drawn ring, on Mars's orbit.
--
-- Fix the row, then move the EXISTING Sol asteroids out to the new band
-- radially (same angle; the old +/-20 jitter becomes +/-100) so ids,
-- scans and mining locks survive. buildAsteroidsForBelt spreads +/- 40%
-- of size: 250 -> +/-100, inside the drawn ring's +/-125. The respawn
-- seed uses orbit_radius, so rocks respawned from now on land in the ring.

UPDATE celestial_bodies
   SET orbit_radius = 1500, size = 250
 WHERE id = '00000000-0000-0000-0001-000000000006'
   AND body_type = 'asteroid_belt';

WITH r AS (
  SELECT id, sqrt(x * x + y * y) AS rad
    FROM asteroids
   WHERE belt_body_id = '00000000-0000-0000-0001-000000000006'
     AND sqrt(x * x + y * y) BETWEEN 900 AND 1300
)
UPDATE asteroids a
   SET x = a.x * ((1500.0 + (r.rad - 1100.0) * 5.0) / GREATEST(1.0, r.rad)),
       y = a.y * ((1500.0 + (r.rad - 1100.0) * 5.0) / GREATEST(1.0, r.rad))
  FROM r
 WHERE a.id = r.id;
