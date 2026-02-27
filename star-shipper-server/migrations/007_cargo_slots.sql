-- Migration 007: Cargo Slot Positions
-- Adds slot_index to player_resource_inventory so item positions persist

-- Add slot_index column
ALTER TABLE player_resource_inventory
ADD COLUMN IF NOT EXISTS slot_index INTEGER;

-- Assign sequential slot indices to existing items per user
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY acquired_at, id) - 1 AS idx
  FROM player_resource_inventory
)
UPDATE player_resource_inventory pri
SET slot_index = numbered.idx
FROM numbered
WHERE pri.id = numbered.id AND pri.slot_index IS NULL;

-- Unique constraint: one item per slot per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_slot
ON player_resource_inventory(user_id, slot_index);
