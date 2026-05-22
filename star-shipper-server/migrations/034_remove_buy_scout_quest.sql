-- Migration 034: Retire tutorial_buy_starter_scout
-- ============================================
-- New players now spawn with the Starter Scout already granted by
-- grantStarterShip() during user creation (auth/index.js), so the
-- "buy your free ship" intro friction is gone. tutorial_fly_to_luna
-- becomes the opening quest -- it's the first quest auto-activated
-- by the /api/quests GET first-time-player branch.
--
-- This migration removes the dead quest from quest_definitions.
-- player_quests.quest_id FKs to quest_definitions(id) with the
-- default RESTRICT behavior, so we must DELETE the player_quests
-- rows first.

DELETE FROM player_quests WHERE quest_id = 'tutorial_buy_starter_scout';
DELETE FROM quest_definitions WHERE id = 'tutorial_buy_starter_scout';
