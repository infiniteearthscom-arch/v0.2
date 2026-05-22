-- Migration 036: Starter Kit gains a Mining Laser
-- ============================================
-- Migration 027 added an mng1 mining slot to the Starter Scout hull
-- but the Starter Kit was never updated. Result: the player fills 6
-- of 7 slots, "Ready for Launch" (tutorial_fit_modules) never fires
-- because all_slots_filled stays false, and the chain stalls.
--
-- Fixed forward by adding mining_basic to STARTER_KIT_ITEMS in
-- api/fitting.js. This migration:
--   1. Updates the item_definitions copy so the vendor description
--      reflects the new contents.
--   2. Backfills a mining_basic for any existing player who's stuck
--      on tutorial_fit_modules -- they bought the old 6-item kit
--      and have no way to satisfy the all-slots check otherwise.

-- (1) Vendor blurb update.
UPDATE item_definitions
SET description = 'A basic loadout for a Scout-class ship. Contains: Basic Thruster, Fusion Core, Cargo Pod, Pulse Laser, Sensor Suite, Nav Computer, Mining Laser.'
WHERE id = 'starter_kit';

-- (2) Backfill: grant mining_basic to anyone currently stuck on the
-- fit-modules quest who doesn't already have one (in inventory OR
-- fitted on a ship). slot_index = next free slot in their inventory.
-- One row per stuck player.
WITH stuck_players AS (
  SELECT DISTINCT pq.user_id
  FROM player_quests pq
  WHERE pq.quest_id = 'tutorial_fit_modules'
    AND pq.status = 'active'
),
already_have_in_inv AS (
  SELECT DISTINCT user_id
  FROM player_resource_inventory
  WHERE item_type = 'item' AND item_id = 'mining_basic'
),
already_have_fitted AS (
  SELECT DISTINCT s.user_id
  FROM ships s,
       jsonb_each(s.fitted_modules) AS slot(slot_key, slot_val)
  WHERE slot_val->>'module_type_id' = 'mining_basic'
     OR slot_val->>'module_type_id' LIKE 'mining_%'
),
needs_backfill AS (
  SELECT user_id FROM stuck_players
  EXCEPT
  SELECT user_id FROM already_have_in_inv
  EXCEPT
  SELECT user_id FROM already_have_fitted
)
INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
SELECT
  nb.user_id,
  'item',
  'mining_basic',
  1,
  COALESCE(
    (SELECT MAX(slot_index) + 1 FROM player_resource_inventory pri WHERE pri.user_id = nb.user_id),
    0
  ),
  '{"slot_type":"mining","quality":{"purity":50,"stability":50,"potency":50,"density":50}}'::jsonb
FROM needs_backfill nb;
