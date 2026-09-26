-- Migration 087: Beam Focusing skill (Industry) -- mining laser reach.
--
-- Mining range was a hardcoded 120 units on the client; the lasers'
-- mine_range stats (120 / 150 / 170) were ignored. Now reach =
-- mine_range x sqrt(quality) x (1 + mining_range_pct / 100), computed
-- in client utils/mining.js and enforced in /resources/asteroids/mine.
-- This skill is the trainable part of that ladder:
--
--   mining_range_pct: +5 per level -> L5 = +25% (Resonance laser Q100 ~ 300 units)

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order)
VALUES (
  'ind_beam_focusing',
  'Industry',
  'Beam Focusing',
  'Collimator tuning for mining beams. +5% mining laser range per level.',
  2,
  '{"type":"mining_range_pct","value":5}',
  41
)
ON CONFLICT (id) DO NOTHING;
