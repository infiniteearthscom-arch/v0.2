-- Migration 045: missile range 1120 -> 500 (= basic scanner sensor range)
-- ============================================
-- Per balance call: 1120 was too generous -- missiles flew at
-- targets the player couldn't even see on the gameplay canvas
-- (sensor range cuts off at 500 with the basic Sensor Suite).
-- Pinning missile range to the default sensor range keeps "what
-- you can see, you can shoot" intact. Higher-tier scanners will
-- eventually extend BOTH sensor + effective missile reach, since
-- you can't designate what you can't see anyway.
--
-- Lifetime is computed client-side as (range/speed)*1.5, so it
-- scales down automatically -- no separate change needed.

UPDATE module_types
SET stats = jsonb_set(stats, '{range}', '500')
WHERE id = 'weapon_missile_basic';
