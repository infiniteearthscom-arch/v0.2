-- Migration 046: Quality pass phase 1 -- make mineral quality variance visible.
-- ============================================
-- Today everything in Sol (and every asteroid game-wide) is hardcoded q50,
-- so players never see the quality-tier system the inventory already
-- renders. This migration:
--
--   1. Adds per-asteroid quality stats (stat_purity, stability, potency,
--      density) -- defaults to q50 so any code reading them works during
--      the deploy window before resources.js rolls fresh values.
--
--   2. Backfills EVERY existing asteroid with a weighted random roll so
--      the next time a player scans + mines they see real variance.
--      Sol's procedural asteroid set is wiped and regenerated lazily on
--      the next GET /asteroids anyway, but this catches procedural
--      systems players have already visited.
--
--   3. Backfills EVERY Sol resource_deposit with the same weighted
--      distribution. Players' existing inventory stacks stay at q50
--      (historical mining); the next planet-mine produces a fresh stack
--      keyed on the new deposit stats, so variance becomes visible
--      starting from the next mine action.
--
-- Distribution: triangular, avg of 3 uniform rolls. Centered at 50.
-- q90+ rolls hit ~1-2% of the time. Matches deposits.js post-migration.
-- ============================================

-- ============================================
-- 1. Asteroid quality columns
-- ============================================

ALTER TABLE asteroids ADD COLUMN IF NOT EXISTS stat_purity    INTEGER NOT NULL DEFAULT 50 CHECK (stat_purity    BETWEEN 0 AND 100);
ALTER TABLE asteroids ADD COLUMN IF NOT EXISTS stat_stability INTEGER NOT NULL DEFAULT 50 CHECK (stat_stability BETWEEN 0 AND 100);
ALTER TABLE asteroids ADD COLUMN IF NOT EXISTS stat_potency   INTEGER NOT NULL DEFAULT 50 CHECK (stat_potency   BETWEEN 0 AND 100);
ALTER TABLE asteroids ADD COLUMN IF NOT EXISTS stat_density   INTEGER NOT NULL DEFAULT 50 CHECK (stat_density   BETWEEN 0 AND 100);

-- ============================================
-- 2. Backfill existing asteroids with weighted random rolls
-- ============================================
-- PG's RANDOM() is evaluated per reference, so RANDOM()+RANDOM()+RANDOM()
-- gives 3 independent uniform draws on [0,1). Averaging produces a
-- triangular(0,1,0.5) distribution which we scale to 0-100 and round.

UPDATE asteroids SET
  stat_purity    = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER)),
  stat_stability = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER)),
  stat_potency   = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER)),
  stat_density   = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER));

-- ============================================
-- 3. Backfill Sol resource_deposits with weighted random rolls
-- ============================================
-- Scope: only deposits attached to bodies in the Sol system. Procedural
-- systems already roll real stats via deposits.js (they're untouched).
-- We re-roll Sol deposits even if their stats were already non-50,
-- because Sol's seed file shipped q50 for everything and we want the
-- learning-by-doing economy from day one.

UPDATE resource_deposits SET
  stat_purity    = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER)),
  stat_stability = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER)),
  stat_potency   = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER)),
  stat_density   = LEAST(100, GREATEST(0, ROUND(((RANDOM() + RANDOM() + RANDOM()) / 3) * 100)::INTEGER))
WHERE celestial_body_id IN (
  SELECT cb.id FROM celestial_bodies cb
  JOIN star_systems s ON cb.system_id = s.id
  WHERE s.procedural_id = 'sol'
);
