-- Migration 030: Sensor range + scan tutorial quest
-- ============================================
-- Part A: sensor_range stat on basic Sensor Suite
-- ============================================
-- Until now, pirates rendered at all distances regardless of what (if
-- any) scanner the fleet had fitted. This stat is the radius (in world
-- units, same scale as positions / PIRATE_AGGRO_RANGE = 350) inside
-- which enemies are visible to the player. 500 puts us just above
-- aggro range so the player sees pirates *before* they engage, giving
-- the "scout before you engage" feel. Tier upgrades (advanced / elite
-- scanners) will land later with wider sensor_range and a system-wide
-- reveal option. Without any scanner the client falls back to an
-- innate ~150px (matching PIRATE_ATTACK_RANGE) so you at least see
-- whoever is shooting you.

UPDATE module_types
SET stats = stats || '{"sensor_range": 500}'::jsonb
WHERE id = 'utility_scanner';

-- ============================================
-- Part B: tutorial_scan_asteroid quest
-- ============================================
-- Chains off the existing tutorial_fit_modules (the last quest in the
-- chain pre-A4). After the player slots their Sensor Suite, the next
-- quest tells them what to actually do with it. Completion fires
-- client-side on the first successful asteroidsAPI.scan() response.

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order)
VALUES (
  'tutorial_scan_asteroid',
  'Eyes Wide Open',
  'Fly to the asteroid belt and click an unscanned asteroid to survey it. Your Sensor Suite reveals its contents. Tip: scanned asteroids show a faint green tint.',
  'tutorial', 'flag',
  '{"credits": 300}',
  '[]',
  5
)
ON CONFLICT (id) DO NOTHING;

-- Chain it on for any FUTURE player who completes tutorial_fit_modules.
UPDATE quest_definitions
SET triggers_quests = '["tutorial_scan_asteroid"]'::jsonb
WHERE id = 'tutorial_fit_modules';

-- Backfill: any EXISTING player who already completed tutorial_fit_modules
-- before this migration won't get the chain auto-trigger, so activate
-- the new quest for them now. NOT EXISTS guards against duplicate
-- activations if the migration somehow runs twice.
INSERT INTO player_quests (user_id, quest_id)
SELECT pq.user_id, 'tutorial_scan_asteroid'
FROM player_quests pq
WHERE pq.quest_id = 'tutorial_fit_modules'
  AND pq.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM player_quests pq2
    WHERE pq2.user_id = pq.user_id AND pq2.quest_id = 'tutorial_scan_asteroid'
  );
