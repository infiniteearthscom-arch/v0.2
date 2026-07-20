-- Migration 064: Research Methodology skill (Science)
--
-- First skill that boosts overall Research Point GENERATION. Distinct
-- from sci_science's research_time_pct, which is reserved for the
-- future blueprint-research mechanic — RP trickle rate gets its own
-- bonus contract:
--
--   rp_rate_pct: +5 per level -> L5 = +25% (1.25 RP/min on the 1/min base)
--
-- Server: api/research.js reads it via getPlayerBonuses and scales the
-- on-read accrual + returns the effective rate in GET /api/research.
-- Client: WIRED_BONUS_TYPES includes 'rp_rate_pct' so the skill renders
-- as live (not "○ CATALOG").

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order)
VALUES (
  'sci_research_methodology',
  'Science',
  'Research Methodology',
  'Systematic experimentation and data hygiene. +5% research point generation per level.',
  2,
  '{"type":"rp_rate_pct","value":5}',
  910
)
ON CONFLICT (id) DO NOTHING;
