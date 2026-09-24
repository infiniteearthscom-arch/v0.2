-- 084: Contracts join the Missions board -- pin flag so HUD tiles follow
-- the same pin/unpin rule as story quests. Defaults TRUE so nothing
-- disappears from the HUD for existing contracts.
ALTER TABLE player_contracts ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT TRUE;
