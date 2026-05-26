-- Migration 054: per-skill SP override + Training Discipline skill.
-- ============================================
-- Two changes:
--
-- 1. New `sp_per_level_override` column on skill_definitions: when set
--    (JSONB array of SP costs), the server-side spForLevel/spAtLevel/
--    levelFromSp helpers ignore the rank_multiplier curve and use the
--    array's values directly. Array length implicitly defines max
--    level for that skill (overrides the MAX_LEVEL=5 default).
--
--    Lets us hit specific real-time training durations that the
--    smooth exponential rank curve can't (e.g. "level N takes exactly
--    60 days").
--
-- 2. New `lead_training_discipline` skill under Leadership. 7 levels;
--    each level unlocks one additional active skill-queue slot
--    (base is now 3 → L7 = 10). Training durations (SP / 30 SP/min):
--      L1 (slot 4):  7 days   →   302,400 SP
--      L2 (slot 5): 10 days   →   432,000 SP
--      L3 (slot 6): 14 days   →   604,800 SP
--      L4 (slot 7): 19 days   →   820,800 SP
--      L5 (slot 8): 24 days   → 1,036,800 SP
--      L6 (slot 9): 30 days   → 1,296,000 SP
--      L7 (slot 10): 60 days  → 2,592,000 SP
--
--    The base queue cap of 3 lives in code (skills.js); this skill
--    expands it. The queue-add endpoint reads the player's level of
--    `lead_training_discipline` and uses `3 + level` as the max.
-- ============================================

ALTER TABLE skill_definitions ADD COLUMN IF NOT EXISTS sp_per_level_override JSONB;

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order, sp_per_level_override)
VALUES (
  'lead_training_discipline',
  'Leadership',
  'Training Discipline',
  'Mental conditioning for parallel skill training. Each level unlocks one additional active skill-queue slot above the base 3. L7 caps the queue at 10 slots. Training times escalate aggressively: L1 = 7 days, L7 = 60 days.',
  1,
  '{"type":"queue_slots_flat","value":1}'::jsonb,
  1900,
  '[302400, 432000, 604800, 820800, 1036800, 1296000, 2592000]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  description           = EXCLUDED.description,
  rank_multiplier       = EXCLUDED.rank_multiplier,
  bonus_per_level       = EXCLUDED.bonus_per_level,
  sort_order            = EXCLUDED.sort_order,
  sp_per_level_override = EXCLUDED.sp_per_level_override;
