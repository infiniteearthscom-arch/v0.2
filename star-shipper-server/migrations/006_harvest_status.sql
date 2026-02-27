-- Migration 006: Harvest Session Status
-- Replaces is_active boolean with a status column to distinguish
-- between active, completed (deposit depleted / cargo full), and cancelled (player stopped).

-- Add status column
ALTER TABLE harvest_sessions 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Migrate existing data: is_active=true -> 'active', is_active=false -> 'completed'
UPDATE harvest_sessions SET status = 'active' WHERE is_active = TRUE;
UPDATE harvest_sessions SET status = 'completed' WHERE is_active = FALSE;

-- Add resource_type_id for quick lookups without joining deposits
ALTER TABLE harvest_sessions
ADD COLUMN IF NOT EXISTS resource_type_id INTEGER REFERENCES resource_types(id);

-- Backfill resource_type_id from deposit data
UPDATE harvest_sessions hs
SET resource_type_id = rd.resource_type_id
FROM resource_deposits rd
WHERE hs.deposit_id = rd.id AND hs.resource_type_id IS NULL;

-- Add end_reason for more detail on why a session ended
-- Values: 'depleted' (deposit empty), 'cargo_full', 'player_stopped'
ALTER TABLE harvest_sessions
ADD COLUMN IF NOT EXISTS end_reason VARCHAR(30);

-- Now we can drop is_active (keep for safety — just stop using it)
-- ALTER TABLE harvest_sessions DROP COLUMN IF EXISTS is_active;

-- Update the index to use status instead of is_active
DROP INDEX IF EXISTS idx_harvest_active;
CREATE INDEX IF NOT EXISTS idx_harvest_status ON harvest_sessions(status) WHERE status = 'active';

-- Add unique constraint: only one active session per deposit
-- (prevents two players mining the same slot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_harvest_active_deposit 
ON harvest_sessions(deposit_id) WHERE status = 'active';

-- Add unique constraint: only one active manual session per player
-- (player's ship can only be in one place)
CREATE UNIQUE INDEX IF NOT EXISTS idx_harvest_active_user 
ON harvest_sessions(user_id) WHERE status = 'active';
