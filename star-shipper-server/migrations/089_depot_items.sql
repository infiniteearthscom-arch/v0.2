-- 089: The base depot is a cargo hold (2026-09-26).
--
-- player_base_inventory held resources only. Now it mirrors
-- player_resource_inventory: resource stacks OR item stacks (modules,
-- supplies, buildings), each with a slot position so the base cargo grid
-- is arranged by drag and drop like the fleet cargo. Items count 1 depot
-- unit each; resources keep the density rule. Everything at the base
-- (foundry jobs, base upgrades, fitting buildings, bench crafting, the
-- grade refinery) can draw from the depot.

ALTER TABLE player_base_inventory ADD COLUMN IF NOT EXISTS item_type VARCHAR(16) NOT NULL DEFAULT 'resource';
ALTER TABLE player_base_inventory ALTER COLUMN resource_type_id DROP NOT NULL;
ALTER TABLE player_base_inventory ADD COLUMN IF NOT EXISTS item_id VARCHAR(50) REFERENCES item_definitions(id);
ALTER TABLE player_base_inventory ADD COLUMN IF NOT EXISTS item_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE player_base_inventory ADD COLUMN IF NOT EXISTS slot_index INTEGER;
ALTER TABLE player_base_inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- give existing depot stacks a position
UPDATE player_base_inventory bi SET slot_index = s.rn - 1
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY base_id ORDER BY created_at, id) AS rn FROM player_base_inventory) s
 WHERE bi.id = s.id AND bi.slot_index IS NULL;
