-- Migration 027: Scout gets a mining slot; backfill cargo items with slot_type
--
-- Two fixes uncovered while wiring asteroid mining:
--
-- 1. Scout + starter_scout have no mining slot, so mining_basic can't be
--    fit on the starter ship. Add an mng1 mining slot near the bow.
--    Shuttle + Capital already have mining slots; left untouched.
--
-- 2. Existing rows in player_resource_inventory created by the unfit
--    endpoint have item_data = { quality } only -- no slot_type. The
--    Ship Builder's FittableModulesPanel filters by item_data.slot_type
--    so those items become invisible in the fit panel (still visible in
--    Cargo). Backfill slot_type from module_types so existing unfit
--    modules become refittable again. The server-side unfit code is
--    also being fixed to include slot_type going forward.

-- Add mining slot to scout + starter_scout (each maintains its own
-- copy of the slots JSONB since starter_scout was SELECT'd from scout
-- at migration 017, not referenced).
UPDATE hull_types
SET slots = slots || '[{"id":"mng1","type":"mining","x":2,"y":1,"w":3,"h":2}]'::jsonb
WHERE id IN ('scout', 'starter_scout');

-- Backfill: any cargo row that's a module_types item but is missing
-- slot_type in item_data gets it added. Idempotent (only updates rows
-- that currently lack the field).
UPDATE player_resource_inventory pri
SET item_data = COALESCE(item_data, '{}'::jsonb)
              || jsonb_build_object('slot_type', mt.slot_type)
FROM module_types mt
WHERE pri.item_id = mt.id
  AND pri.item_type = 'item'
  AND COALESCE(pri.item_data->>'slot_type', '') = '';
