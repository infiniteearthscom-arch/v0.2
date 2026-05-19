-- Migration 023: "Clear the Sector" tutorial combat quest
-- Chains after tutorial_fit_modules ("Ready for Launch"). Triggers
-- when the player kills the last pirate in their current system --
-- a client-side detection in SystemView watches enemyCount transitions
-- from >0 to 0 and fires completeQuest('tutorial_clear_sector').

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order)
VALUES (
  'tutorial_clear_sector',
  'Baptism by Fire',
  'Now that your ship is ready, prove you can fight. Destroy every hostile pirate in this system. They patrol the asteroid belt and the outer planets.',
  'tutorial', 'flag',
  '{"credits": 1000}',
  '[]',
  5
)
ON CONFLICT (id) DO NOTHING;

-- Chain the new quest in -- completing tutorial_fit_modules now also
-- triggers (activates) tutorial_clear_sector. If the previous chain
-- already triggered something else this would clobber it, but
-- tutorial_fit_modules's triggers_quests was '[]' so we're safe.
UPDATE quest_definitions
SET triggers_quests = '["tutorial_clear_sector"]'::jsonb
WHERE id = 'tutorial_fit_modules';
