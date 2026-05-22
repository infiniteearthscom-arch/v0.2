-- Migration 033: Tutorial chain extension -- mine + sell
-- ============================================
-- Continues the onboarding chain off tutorial_scan_asteroid (Eyes
-- Wide Open). Player now learns to mine the rock they just scanned,
-- then sell the resources at a station vendor (the chain has parked
-- them at Luna so the description names it, but the server check is
-- not Luna-specific -- any sell anywhere counts. The Luna naming is
-- copy, not enforcement).

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order) VALUES
  (
    'tutorial_mine_resources',
    'Strike It Rich',
    'You can see what is in the asteroid -- now extract it. Make sure a Mining Laser is fitted, click the scanned asteroid, and let the beam run until you have some ore in your cargo.',
    'tutorial', 'flag',
    '{"credits": 400}',
    '["tutorial_sell_at_luna"]',
    6
  ),
  (
    'tutorial_sell_at_luna',
    'Cash Out',
    'Fly back to Luna Station, dock, open the City tab, switch to the Vendor sub-tab, and sell your mined ore. Watch the credits go up.',
    'tutorial', 'flag',
    '{"credits": 600}',
    '[]',
    7
  )
ON CONFLICT (id) DO NOTHING;

-- Chain trigger: tutorial_scan_asteroid -> tutorial_mine_resources.
UPDATE quest_definitions
SET triggers_quests = '["tutorial_mine_resources"]'::jsonb
WHERE id = 'tutorial_scan_asteroid';

-- Backfill: any player past tutorial_scan_asteroid before this
-- migration gets the new quest auto-activated so they don't fall
-- off the chain.
INSERT INTO player_quests (user_id, quest_id)
SELECT pq.user_id, 'tutorial_mine_resources'
FROM player_quests pq
WHERE pq.quest_id = 'tutorial_scan_asteroid'
  AND pq.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM player_quests pq2
    WHERE pq2.user_id = pq.user_id AND pq2.quest_id = 'tutorial_mine_resources'
  );
