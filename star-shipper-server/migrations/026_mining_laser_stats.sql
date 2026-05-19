-- Migration 026: Mining Laser weapon-shape stats
-- Phase A3 of asteroid mining. mining_basic gains weapon-shape stats
-- so the client's mining loop can read them the same way it reads
-- weapon range / damage / fire_rate:
--
--   mine_range — must be within N world units of target asteroid
--   mine_yield — resource units extracted per cycle
--   mine_cycle — seconds between mining ticks
--
-- harvest_rate_bonus is kept for the docked-mining (planet harvest)
-- system, which is unrelated to asteroid mining and still uses it.

UPDATE module_types
SET stats = stats || '{"mine_range": 120, "mine_yield": 5, "mine_cycle": 2}'::jsonb
WHERE id = 'mining_basic';
