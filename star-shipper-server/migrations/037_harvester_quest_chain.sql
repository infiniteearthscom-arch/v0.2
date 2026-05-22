-- Migration 037: Harvester quest chain
-- ============================================
-- Continues the tutorial off tutorial_sell_at_luna. Teaches the
-- planetary mining + crafting + harvester loop in 5 discrete steps:
--
--   1. tutorial_survey_planet     -- orbital + ground scan a planet
--   2. tutorial_mine_deposit      -- manually mine a planet deposit
--   3. tutorial_craft_harvester   -- craft basic_harvester from gathered materials
--   4. tutorial_deploy_harvester  -- deploy it to a planet
--   5. tutorial_collect_harvester -- come back later, collect output
--
-- Each step has a client hook that fires completeQuest on the
-- relevant API success. tutorial_craft_harvester also gets a new
-- recipe row -- the basic_harvester item already exists in
-- item_definitions (migration 008) but had no recipe.

-- (1) New recipe -- craft basic_harvester from Iron + Copper.
-- Quantities are slightly above one-session mining so the player has
-- to either mine a full deposit or do two passes. Keeps the "gather
-- materials" step meaningful without dragging.
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category) VALUES
  ('craft_basic_harvester', 'Basic Harvester', 'Craft an automated resource extraction unit. Deploy at a planet deposit to harvest passively over time.',
   'basic_harvester', 1,
   '[{"resource_name": "Iron", "quantity": 20}, {"resource_name": "Copper", "quantity": 10}]',
   'utility')
ON CONFLICT (id) DO NOTHING;

-- (2) Five new quest definitions. Tutorial chain category so they
-- auto-pin in the top overlay per migration 035 + the activation
-- logic in api/quests.js. Reward curve matches the existing chain --
-- slightly larger rewards as the player gets deeper into the loop.
INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order) VALUES
  (
    'tutorial_survey_planet',
    'Look Down',
    'Dock at a planet (Earth is closest), open the Scan tab, and run an Orbital Scan followed by a Ground Scan to find resource deposits.',
    'tutorial', 'flag',
    '{"credits": 500}',
    '["tutorial_mine_deposit"]',
    8
  ),
  (
    'tutorial_mine_deposit',
    'Pickaxe Time',
    'Open the Mine tab on the planet, pick a revealed deposit, and start mining. Collect the harvest when the cargo cycle finishes.',
    'tutorial', 'flag',
    '{"credits": 500}',
    '["tutorial_craft_harvester"]',
    9
  ),
  (
    'tutorial_craft_harvester',
    'Build the Bot',
    'Open Crafting (🔨), find the Basic Harvester recipe, and craft one. You will need 20 Iron and 10 Copper -- mine more if you are short.',
    'tutorial', 'flag',
    '{"credits": 700}',
    '["tutorial_deploy_harvester"]',
    10
  ),
  (
    'tutorial_deploy_harvester',
    'Set & Forget',
    'Dock at a planet, open the Harvesters tab, and drag your Basic Harvester from cargo onto a free slot. Then assign it to a deposit so it starts pulling resources.',
    'tutorial', 'flag',
    '{"credits": 700}',
    '["tutorial_collect_harvester"]',
    11
  ),
  (
    'tutorial_collect_harvester',
    'Coming Home',
    'Give the harvester time to fill its hold, then dock at the planet, open the Harvesters tab, and collect the output. Passive income unlocked.',
    'tutorial', 'flag',
    '{"credits": 1000}',
    '[]',
    12
  )
ON CONFLICT (id) DO NOTHING;

-- (3) Chain trigger: tutorial_sell_at_luna -> tutorial_survey_planet.
UPDATE quest_definitions
SET triggers_quests = '["tutorial_survey_planet"]'::jsonb
WHERE id = 'tutorial_sell_at_luna';

-- (4) Backfill: any player past tutorial_sell_at_luna gets the new
-- chain auto-activated so they don't fall off. Pinned TRUE because
-- it's a tutorial quest (matches the auto-pin policy in api/quests.js).
INSERT INTO player_quests (user_id, quest_id, pinned)
SELECT pq.user_id, 'tutorial_survey_planet', TRUE
FROM player_quests pq
WHERE pq.quest_id = 'tutorial_sell_at_luna'
  AND pq.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM player_quests pq2
    WHERE pq2.user_id = pq.user_id AND pq2.quest_id = 'tutorial_survey_planet'
  );
