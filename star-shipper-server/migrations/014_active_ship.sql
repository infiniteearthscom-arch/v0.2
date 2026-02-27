-- Migration 014: Active ship tracking on users table
-- Simpler than using player_presence which may not always exist

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_ship_id UUID REFERENCES ships(id) ON DELETE SET NULL;

-- Set first ship as active for existing users
UPDATE users u SET active_ship_id = (
  SELECT s.id FROM ships s WHERE s.user_id = u.id ORDER BY s.created_at ASC LIMIT 1
) WHERE u.active_ship_id IS NULL;
