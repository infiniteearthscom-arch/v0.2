-- Migration 008: Unified Cargo Items
-- Adds item support to player_resource_inventory so crafted items
-- (harvesters, fuel cells, scanner probes) share the same cargo system as resources.

-- Add item columns
ALTER TABLE player_resource_inventory
ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'resource',
ADD COLUMN IF NOT EXISTS item_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS item_data JSONB DEFAULT '{}';

-- item_type: 'resource' (default, existing behavior) or 'item' (crafted goods)
-- item_id: identifier like 'scanner_probe', 'basic_harvester', 'fuel_cell', etc.
-- item_data: JSONB for item-specific properties (harvester efficiency, etc.)

-- Backfill existing rows
UPDATE player_resource_inventory SET item_type = 'resource' WHERE item_type IS NULL;

-- Make resource_type_id nullable (items don't have one)
ALTER TABLE player_resource_inventory ALTER COLUMN resource_type_id DROP NOT NULL;

-- Make stat columns nullable (items may not have quality stats)
ALTER TABLE player_resource_inventory ALTER COLUMN stat_purity DROP NOT NULL;
ALTER TABLE player_resource_inventory ALTER COLUMN stat_stability DROP NOT NULL;
ALTER TABLE player_resource_inventory ALTER COLUMN stat_potency DROP NOT NULL;
ALTER TABLE player_resource_inventory ALTER COLUMN stat_density DROP NOT NULL;

-- Drop the old unique constraint that requires stats (won't work for items)
-- The original constraint: UNIQUE(user_id, resource_type_id, stat_purity, stat_stability, stat_potency, stat_density)
-- We need to handle this carefully since items don't have stats
ALTER TABLE player_resource_inventory DROP CONSTRAINT IF EXISTS player_resource_inventory_user_id_resource_type_id_stat_pur_key;

-- New unique constraint for resources (same resource + same stats still stack)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_resource_stack
ON player_resource_inventory(user_id, resource_type_id, stat_purity, stat_stability, stat_potency, stat_density)
WHERE item_type = 'resource';

-- Index for item lookups
CREATE INDEX IF NOT EXISTS idx_inventory_items
ON player_resource_inventory(user_id, item_type, item_id)
WHERE item_type = 'item';

-- ============================================
-- ITEM TYPE DEFINITIONS (reference table)
-- ============================================

CREATE TABLE IF NOT EXISTS item_definitions (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(30) NOT NULL,  -- 'scanner', 'harvester', 'fuel', 'upgrade'
  icon VARCHAR(20),
  max_stack INTEGER DEFAULT 1,     -- how many can stack in one slot
  item_data_defaults JSONB DEFAULT '{}'
);

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('scanner_probe', 'Scanner Probe', 'Basic orbital scanner for detecting resource types', 'scanner', '📡', 10, '{}'),
  ('advanced_scanner_probe', 'Advanced Scanner Probe', 'Ground-penetrating scanner for detailed deposit analysis', 'scanner', '🛰️', 10, '{}'),
  ('basic_harvester', 'Basic Harvester', 'Automated resource extraction unit', 'harvester', '⚙️', 1, '{"harvest_rate": 30, "storage_capacity": 200}'),
  ('advanced_harvester', 'Advanced Harvester', 'Improved automated harvester with better speed and capacity', 'harvester', '🔧', 1, '{"harvest_rate": 50, "storage_capacity": 500}'),
  ('industrial_harvester', 'Industrial Harvester', 'Heavy-duty industrial extraction unit', 'harvester', '🏭', 1, '{"harvest_rate": 100, "storage_capacity": 1000}'),
  ('fuel_cell', 'Fuel Cell', 'Powers a harvester for 6 hours of operation', 'fuel', '🔋', 20, '{"fuel_hours": 6}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  max_stack = EXCLUDED.max_stack,
  item_data_defaults = EXCLUDED.item_data_defaults;

-- ============================================
-- CRAFTING RECIPES
-- ============================================

CREATE TABLE IF NOT EXISTS crafting_recipes (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  output_item_id VARCHAR(50) NOT NULL REFERENCES item_definitions(id),
  output_quantity INTEGER DEFAULT 1,
  ingredients JSONB NOT NULL,  -- Array of {resource_name, quantity}
  crafting_time_seconds INTEGER DEFAULT 0,  -- 0 = instant
  category VARCHAR(30) NOT NULL  -- matches item_definitions category
);

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category) VALUES
  ('craft_scanner_probe', 'Scanner Probe', 'Craft a basic orbital scanner probe',
   'scanner_probe', 1,
   '[{"resource_name": "Iron", "quantity": 5}, {"resource_name": "Copper", "quantity": 2}]',
   'scanner'),
  ('craft_advanced_scanner', 'Advanced Scanner Probe', 'Craft an advanced ground-penetrating scanner',
   'advanced_scanner_probe', 1,
   '[{"resource_name": "Titanium", "quantity": 3}, {"resource_name": "Copper", "quantity": 5}, {"resource_name": "Crystite", "quantity": 1}]',
   'scanner'),
  ('craft_basic_harvester', 'Basic Harvester', 'Craft a basic automated harvester',
   'basic_harvester', 1,
   '[{"resource_name": "Iron", "quantity": 20}, {"resource_name": "Copper", "quantity": 10}]',
   'harvester'),
  ('craft_advanced_harvester', 'Advanced Harvester', 'Craft an improved automated harvester',
   'advanced_harvester', 1,
   '[{"resource_name": "Titanium", "quantity": 15}, {"resource_name": "Copper", "quantity": 10}, {"resource_name": "Crystite", "quantity": 5}]',
   'harvester'),
  ('craft_industrial_harvester', 'Industrial Harvester', 'Craft a heavy-duty industrial harvester',
   'industrial_harvester', 1,
   '[{"resource_name": "Titanium", "quantity": 30}, {"resource_name": "Crystite", "quantity": 20}, {"resource_name": "Uranium", "quantity": 5}]',
   'harvester'),
  ('craft_fuel_cell', 'Fuel Cell', 'Craft fuel for automated harvesters',
   'fuel_cell', 1,
   '[{"resource_name": "Hydrogen", "quantity": 10}, {"resource_name": "Copper", "quantity": 2}]',
   'fuel')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  ingredients = EXCLUDED.ingredients,
  output_item_id = EXCLUDED.output_item_id;

-- ============================================
-- MIGRATE EXISTING SCANNER PROBES TO CARGO
-- ============================================

-- For each user who has scanner probes, insert them as cargo items
-- We need to assign slot indices carefully

-- Basic scanner probes
INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
SELECT
  pr.user_id,
  'item',
  'scanner_probe',
  pr.scanner_probes,
  COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = pr.user_id), 0),
  '{}'
FROM player_resources pr
WHERE pr.scanner_probes > 0
ON CONFLICT DO NOTHING;

-- Advanced scanner probes
INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
SELECT
  pr.user_id,
  'item',
  'advanced_scanner_probe',
  pr.advanced_scanner_probes,
  COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = pr.user_id), 0),
  '{}'
FROM player_resources pr
WHERE pr.advanced_scanner_probes > 0
ON CONFLICT DO NOTHING;
