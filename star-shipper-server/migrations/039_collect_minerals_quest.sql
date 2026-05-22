-- Migration 039: "Cargo In Hand" -- bridge step between mining and crafting
-- ============================================
-- Pickaxe Time fires on startHarvest (the act of mining begins), but
-- the player still has to come back and collect the cycle's output
-- before they have materials to craft the harvester. Without an
-- explicit quest for the collect step, the chain jumps straight to
-- Build the Bot and players sit at the crafting window wondering
-- where their resources are.

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order) VALUES
  (
    'tutorial_collect_minerals',
    'Cargo In Hand',
    'Wait for the mining cycle to fill, then click Collect on the active session. The mined resources move into your cargo and are ready to craft with.',
    'tutorial', 'flag',
    '{"credits": 400}',
    '["tutorial_craft_harvester"]',
    10
  )
ON CONFLICT (id) DO NOTHING;

-- Rewire: Pickaxe Time -> Cargo In Hand -> Build the Bot.
UPDATE quest_definitions
SET triggers_quests = '["tutorial_collect_minerals"]'::jsonb
WHERE id = 'tutorial_mine_deposit';

-- sort_order bump for the chain entries that come after the insert
-- (Build the Bot 10 -> 11, Set & Forget 11 -> 12, Coming Home 12 -> 13)
-- so the new quest slots between Pickaxe Time and Build the Bot in
-- the Missions log display order.
UPDATE quest_definitions SET sort_order = 11 WHERE id = 'tutorial_craft_harvester';
UPDATE quest_definitions SET sort_order = 12 WHERE id = 'tutorial_deploy_harvester';
UPDATE quest_definitions SET sort_order = 13 WHERE id = 'tutorial_collect_harvester';

-- Backfill: any player who's already completed Pickaxe Time but hasn't
-- yet completed Build the Bot needs Cargo In Hand activated so they
-- don't drop off the chain. Pinned TRUE since it's a tutorial quest.
INSERT INTO player_quests (user_id, quest_id, pinned)
SELECT pq.user_id, 'tutorial_collect_minerals', TRUE
FROM player_quests pq
WHERE pq.quest_id = 'tutorial_mine_deposit'
  AND pq.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM player_quests pq2
    WHERE pq2.user_id = pq.user_id AND pq2.quest_id = 'tutorial_collect_minerals'
  )
  AND NOT EXISTS (
    -- Skip players already past craft_harvester -- they obviously
    -- collected their minerals along the way and the bridge step
    -- would be a stale auto-pin.
    SELECT 1 FROM player_quests pq3
    WHERE pq3.user_id = pq.user_id AND pq3.quest_id = 'tutorial_craft_harvester' AND pq3.status = 'completed'
  );
