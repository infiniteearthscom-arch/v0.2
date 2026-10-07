-- 093: Fleet Command + Fleet Discipline skill text (2026-10-05).
--
-- Text only. Since 071 the active fleet cap is 2 + level(cmd_fleet_command),
-- max 5 (src/game/fitGates.js fleetCapForLevel), but the row still carried
-- the 032 catalog stub "+20% warfare link range per level" -- a bonus type
-- nothing reads. The Skills window therefore never told the player this is
-- the skill that unlocks ships 3-5. The new bonus type fleet_size_flat is
-- informational (the server reads the level directly); it lets the Skills
-- window show "+1 per level" and mark the skill as wired.

UPDATE skill_definitions
   SET description = 'Wing-level command training. +1 active fleet ship per level: base 2 ships, 5 ships at level III (levels IV-V add nothing today). Required to buy or activate a third ship.',
       bonus_per_level = '{"type":"fleet_size_flat","value":1}'::jsonb
 WHERE id = 'cmd_fleet_command';

-- Fleet Discipline (031) promised "+1 maximum active fleet ship at level 5"
-- and nothing ever read it. Now wired: fitGates.js fleetCapForLevel adds
-- one ship at level V on top of the Fleet Command ladder (hard max 6).
-- at_level marks a threshold bonus for the Skills window (not per level).
UPDATE skill_definitions
   SET description = 'Formation tightness + comms. Grants a sixth ship at level V: +1 maximum active fleet ship on top of Fleet Command III (levels I-IV add nothing today).',
       bonus_per_level = '{"type":"fleet_size_flat","value":1,"at_level":5}'::jsonb
 WHERE id = 'cmd_fleet_disc';
