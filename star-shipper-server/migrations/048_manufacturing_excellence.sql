-- Migration 048: Manufacturing Excellence skill (Phase 5 quality pass).
-- ============================================
-- New Industry-tree skill that lets a player elevate the quality of
-- modules they craft. The skill's bonus is additive to each of the
-- 4 output quality stats (purity / stability / potency / density)
-- written by the /craft endpoint, capped at 100.
--
-- Bonus contract: `crafted_quality_flat` -- +N to each output stat per
-- level. Starter value: +5/level, so L5 = +25 per stat.
--
-- Example: q47 ingredients + L3 skill = q47+15 = q62 module. Lets a
-- maxed crafter push mid-q ore into superior-tier output, but doesn't
-- entirely replace the value of finding high-q resources (since the
-- bonus is additive, not multiplicative).
-- ============================================

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order)
VALUES (
  'ind_manufacturing_excellence',
  'Industry',
  'Manufacturing Excellence',
  'Mastery of crafting precision. +5 to each output quality stat per level on every crafted module. Stacks with ingredient quality additively, capped at 100.',
  4,
  '{"type":"crafted_quality_flat","value":5}',
  710
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  rank_multiplier = EXCLUDED.rank_multiplier,
  bonus_per_level = EXCLUDED.bonus_per_level,
  sort_order = EXCLUDED.sort_order;
