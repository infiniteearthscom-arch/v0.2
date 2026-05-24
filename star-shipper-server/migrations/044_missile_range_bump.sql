-- Migration 044: bump Missile Launcher range 280 -> 1120 (~4x)
-- ============================================
-- Per user balance call: 280 was too short to feel like the
-- standoff weapon it should be -- player flew well inside laser
-- range (300) before missiles could engage, defeating the point.
-- 1120 puts missiles well past sensor range (500), so designated
-- targets get hit as long as they're tracked, and the player can
-- pre-paint targets they can't yet see (designation works at any
-- distance; in-range firing kicks in once the target is reached).

UPDATE module_types
SET stats = jsonb_set(stats, '{range}', '1120')
WHERE id = 'weapon_missile_basic';
