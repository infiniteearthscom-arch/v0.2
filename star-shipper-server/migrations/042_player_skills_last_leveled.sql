-- Migration 042: track when each skill was last leveled up
-- ============================================
-- Adds player_skills.last_leveled_at, set by the on-read commit in
-- api/skills.js whenever a queue entry pops and bumps a skill's
-- level. Drives the "↩ LAST TRAINED" badge in the Skills tab so the
-- player can see where they left off after a long break.

ALTER TABLE player_skills
  ADD COLUMN IF NOT EXISTS last_leveled_at TIMESTAMPTZ;

-- For existing rows we have no historical data; leave NULL. The
-- column starts populating organically on the next level commit.
