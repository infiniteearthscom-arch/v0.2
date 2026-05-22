-- Migration 035: Pinned quests
-- ============================================
-- Players can favorite ("pin") quests so they show up in a persistent
-- top-of-screen overlay. Pinned is set to TRUE on tutorial quests by
-- default (auto-pinned at activation by api/quests.js); other quests
-- are pinned/unpinned via POST /api/quests/pin.
--
-- The overlay reads only ACTIVE + pinned quests, so completing a
-- pinned quest naturally removes it from the overlay; the next
-- triggered tutorial quest auto-pins itself on activation and slides
-- into the same slot.

ALTER TABLE player_quests
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any currently-active tutorial quest should be pinned so
-- existing players see the same top-overlay treatment a fresh player
-- gets, instead of having to manually pin from the quest log.
UPDATE player_quests pq
SET pinned = TRUE
FROM quest_definitions qd
WHERE pq.quest_id = qd.id
  AND pq.status = 'active'
  AND qd.category = 'tutorial'
  AND pq.pinned = FALSE;

-- Fast lookup for the overlay's "give me my pinned active quests" query.
CREATE INDEX IF NOT EXISTS idx_player_quests_pinned
  ON player_quests(user_id) WHERE pinned = TRUE AND status = 'active';
