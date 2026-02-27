-- Migration 012: Ship Hull & Module System
-- Replaces cell-painting ship builder with hull selection + module fitting

-- ============================================
-- HULL TYPES (purchasable ship chassis)
-- ============================================

CREATE TABLE IF NOT EXISTS hull_types (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  class VARCHAR(32) NOT NULL,          -- 'Strike', 'Light', 'Medium', 'Heavy'
  description TEXT,
  price INTEGER DEFAULT 0,
  
  -- Base stats (before modules)
  base_hull INTEGER DEFAULT 100,
  base_speed INTEGER DEFAULT 50,
  base_maneuver INTEGER DEFAULT 50,
  base_sensors INTEGER DEFAULT 200,
  
  -- Grid dimensions (for visual rendering)
  grid_w INTEGER NOT NULL,
  grid_h INTEGER NOT NULL,
  
  -- Slot definitions as JSONB array
  -- Each: { id, type, x, y, w, h, required? }
  slots JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed hull types
INSERT INTO hull_types (id, name, class, description, price, base_hull, base_speed, base_maneuver, base_sensors, grid_w, grid_h, slots)
VALUES
  ('fighter', 'Fighter', 'Strike', 'Nimble strike craft. Minimal hull, maximum agility.', 2000,
   80, 160, 95, 200, 5, 9,
   '[
     {"id":"eng1","type":"engine","x":2,"y":6,"w":1,"h":2,"required":true},
     {"id":"wpn1","type":"weapon","x":1,"y":2,"w":3,"h":2},
     {"id":"rct1","type":"reactor","x":1,"y":4,"w":3,"h":2},
     {"id":"utl1","type":"utility","x":1,"y":4,"w":1,"h":2}
   ]'::jsonb),

  ('scout', 'Scout', 'Light', 'Fast recon vessel. Excellent sensors, minimal armament.', 0,
   200, 120, 85, 500, 7, 18,
   '[
     {"id":"eng1","type":"engine","x":2,"y":14,"w":3,"h":2,"required":true},
     {"id":"rct1","type":"reactor","x":2,"y":11,"w":3,"h":2},
     {"id":"crg1","type":"cargo","x":1,"y":7,"w":5,"h":3},
     {"id":"utl1","type":"utility","x":1,"y":5,"w":2,"h":2},
     {"id":"utl2","type":"utility","x":4,"y":5,"w":2,"h":2},
     {"id":"wpn1","type":"weapon","x":2,"y":3,"w":3,"h":2}
   ]'::jsonb),

  ('shuttle', 'Shuttle', 'Light', 'Compact utility vessel. Balanced for early exploration.', 5000,
   350, 90, 70, 350, 11, 14,
   '[
     {"id":"eng1","type":"engine","x":3,"y":11,"w":5,"h":2,"required":true},
     {"id":"rct1","type":"reactor","x":4,"y":8,"w":3,"h":3},
     {"id":"crg1","type":"cargo","x":1,"y":5,"w":4,"h":3},
     {"id":"crg2","type":"cargo","x":6,"y":5,"w":4,"h":3},
     {"id":"wpn1","type":"weapon","x":1,"y":3,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":7,"y":3,"w":3,"h":2},
     {"id":"utl1","type":"utility","x":4,"y":2,"w":3,"h":3},
     {"id":"mng1","type":"mining","x":2,"y":8,"w":2,"h":3}
   ]'::jsonb),

  ('freighter', 'Freighter', 'Medium', 'Bulk hauler. Massive cargo, minimal combat ability.', 25000,
   600, 55, 35, 250, 13, 22,
   '[
     {"id":"eng1","type":"engine","x":3,"y":19,"w":7,"h":2,"required":true},
     {"id":"rct1","type":"reactor","x":5,"y":16,"w":3,"h":3},
     {"id":"crg1","type":"cargo","x":1,"y":6,"w":5,"h":5},
     {"id":"crg2","type":"cargo","x":7,"y":6,"w":5,"h":5},
     {"id":"crg3","type":"cargo","x":1,"y":11,"w":4,"h":5},
     {"id":"crg4","type":"cargo","x":8,"y":11,"w":4,"h":5},
     {"id":"wpn1","type":"weapon","x":1,"y":4,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":9,"y":4,"w":3,"h":2},
     {"id":"utl1","type":"utility","x":5,"y":3,"w":3,"h":3},
     {"id":"shd1","type":"shield","x":5,"y":13,"w":3,"h":3}
   ]'::jsonb),

  ('frigate', 'Frigate', 'Medium', 'Stealth combat vessel. Angular profile, heavy weapons.', 40000,
   500, 75, 55, 400, 17, 11,
   '[
     {"id":"eng1","type":"engine","x":6,"y":8,"w":5,"h":2,"required":true},
     {"id":"rct1","type":"reactor","x":7,"y":5,"w":3,"h":3},
     {"id":"wpn1","type":"weapon","x":3,"y":4,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":11,"y":4,"w":3,"h":2},
     {"id":"wpn3","type":"weapon","x":1,"y":6,"w":3,"h":2},
     {"id":"wpn4","type":"weapon","x":13,"y":6,"w":3,"h":2},
     {"id":"shd1","type":"shield","x":7,"y":2,"w":3,"h":3},
     {"id":"crg1","type":"cargo","x":4,"y":6,"w":2,"h":3},
     {"id":"utl1","type":"utility","x":11,"y":6,"w":2,"h":3}
   ]'::jsonb),

  ('capital', 'Capital', 'Heavy', 'Massive command ship. Fleet carrier, bulk hauler, mobile base.', 200000,
   2000, 25, 10, 800, 19, 32,
   '[
     {"id":"eng1","type":"engine","x":7,"y":29,"w":5,"h":2,"required":true},
     {"id":"rct1","type":"reactor","x":7,"y":24,"w":5,"h":4},
     {"id":"rct2","type":"reactor","x":2,"y":22,"w":3,"h":3},
     {"id":"crg1","type":"cargo","x":1,"y":9,"w":5,"h":6},
     {"id":"crg2","type":"cargo","x":13,"y":9,"w":5,"h":6},
     {"id":"crg3","type":"cargo","x":6,"y":9,"w":7,"h":4},
     {"id":"crg4","type":"cargo","x":6,"y":13,"w":7,"h":4},
     {"id":"wpn1","type":"weapon","x":1,"y":6,"w":4,"h":3},
     {"id":"wpn2","type":"weapon","x":14,"y":6,"w":4,"h":3},
     {"id":"wpn3","type":"weapon","x":3,"y":17,"w":3,"h":3},
     {"id":"wpn4","type":"weapon","x":13,"y":17,"w":3,"h":3},
     {"id":"shd1","type":"shield","x":7,"y":17,"w":5,"h":3},
     {"id":"utl1","type":"utility","x":4,"y":4,"w":3,"h":2},
     {"id":"utl2","type":"utility","x":12,"y":4,"w":3,"h":2},
     {"id":"mng1","type":"mining","x":14,"y":22,"w":3,"h":3}
   ]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MODULE TYPES (installable ship components)
-- ============================================

CREATE TABLE IF NOT EXISTS module_types (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  slot_type VARCHAR(32) NOT NULL,      -- must match slot type on hull
  tier INTEGER DEFAULT 1,               -- 1=basic, 2=advanced, 3=elite
  description TEXT,
  
  -- Base stats this module provides (before quality scaling)
  stats JSONB DEFAULT '{}',
  -- e.g. { "cargo_capacity": 100, "speed_bonus": 10 }
  
  -- Crafting recipe (null = station-purchasable only)
  recipe JSONB DEFAULT NULL,
  -- e.g. [{"resource":"Iron","quantity":20},{"resource":"Copper","quantity":10}]
  
  -- Station purchase price (null = craft only)
  buy_price INTEGER DEFAULT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed basic modules (Tier 1 — purchasable at stations)
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, recipe) VALUES
  -- Engines
  ('engine_basic', 'Basic Thruster', 'engine', 1, 'Standard propulsion system.',
   '{"speed_bonus":0,"fuel_efficiency":1.0}', 500,
   '[{"resource":"Iron","quantity":15},{"resource":"Copper","quantity":5}]'),
  ('engine_advanced', 'Ion Drive', 'engine', 2, 'High-efficiency ion propulsion.',
   '{"speed_bonus":30,"fuel_efficiency":1.5}', 5000,
   '[{"resource":"Titanium","quantity":20},{"resource":"Copper","quantity":10},{"resource":"Crystite","quantity":5}]'),
  
  -- Reactors
  ('reactor_basic', 'Fusion Core', 'reactor', 1, 'Standard power generation.',
   '{"power_output":10}', 800,
   '[{"resource":"Iron","quantity":20},{"resource":"Copper","quantity":8}]'),
  ('reactor_advanced', 'Quantum Reactor', 'reactor', 2, 'High-output power generation.',
   '{"power_output":25}', 8000,
   '[{"resource":"Titanium","quantity":15},{"resource":"Crystite","quantity":10},{"resource":"Uranium","quantity":3}]'),
  
  -- Cargo
  ('cargo_basic', 'Cargo Pod', 'cargo', 1, 'Standard cargo storage.',
   '{"cargo_capacity":100}', 300,
   '[{"resource":"Iron","quantity":10},{"resource":"Copper","quantity":3}]'),
  ('cargo_large', 'Reinforced Hold', 'cargo', 2, 'Expanded cargo storage.',
   '{"cargo_capacity":250}', 3000,
   '[{"resource":"Titanium","quantity":15},{"resource":"Iron","quantity":20}]'),
  
  -- Weapons
  ('weapon_laser', 'Pulse Laser', 'weapon', 1, 'Light energy weapon.',
   '{"damage":10,"range":300,"fire_rate":2.0}', 1000,
   '[{"resource":"Copper","quantity":15},{"resource":"Crystite","quantity":5}]'),
  ('weapon_cannon', 'Autocannon', 'weapon', 2, 'Heavy kinetic weapon.',
   '{"damage":25,"range":200,"fire_rate":1.0}', 4000,
   '[{"resource":"Titanium","quantity":20},{"resource":"Iron","quantity":15}]'),

  -- Shields
  ('shield_basic', 'Deflector Screen', 'shield', 1, 'Basic energy shielding.',
   '{"shield_hp":100,"recharge_rate":5}', 1500,
   '[{"resource":"Copper","quantity":10},{"resource":"Crystite","quantity":8}]'),
  
  -- Utility
  ('utility_scanner', 'Sensor Suite', 'utility', 1, 'Enhanced detection range.',
   '{"sensor_bonus":100}', 600,
   '[{"resource":"Copper","quantity":8},{"resource":"Crystite","quantity":3}]'),
  ('utility_autopilot', 'Nav Computer', 'utility', 1, 'Autopilot and route planning.',
   '{"autopilot":true}', 400,
   '[{"resource":"Copper","quantity":5},{"resource":"Iron","quantity":5}]'),

  -- Mining
  ('mining_basic', 'Mining Laser', 'mining', 1, 'Enables manual mining from orbit.',
   '{"harvest_rate_bonus":50}', 1200,
   '[{"resource":"Iron","quantity":15},{"resource":"Copper","quantity":10},{"resource":"Crystite","quantity":3}]')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- UPDATE SHIPS TABLE — link to hull_type, store fitted modules
-- ============================================

ALTER TABLE ships ADD COLUMN IF NOT EXISTS hull_type_id VARCHAR(32) REFERENCES hull_types(id);
ALTER TABLE ships ADD COLUMN IF NOT EXISTS fitted_modules JSONB DEFAULT '{}';
-- fitted_modules: { "slot_id": { "module_type_id": "...", "quality": {...}, "cargo_item_id": "..." } }

-- Default existing ships to scout hull
UPDATE ships SET hull_type_id = 'scout' WHERE hull_type_id IS NULL;

-- ============================================
-- ADD MODULE TYPES TO ITEM_DEFINITIONS (for cargo display)
-- ============================================

INSERT INTO item_definitions (id, name, icon, category, max_stack, item_data_defaults)
VALUES
  ('engine_basic', 'Basic Thruster', '🔥', 'module', 5, '{"slot_type":"engine"}'),
  ('engine_advanced', 'Ion Drive', '🔥', 'module', 5, '{"slot_type":"engine"}'),
  ('reactor_basic', 'Fusion Core', '⚛️', 'module', 5, '{"slot_type":"reactor"}'),
  ('reactor_advanced', 'Quantum Reactor', '⚛️', 'module', 5, '{"slot_type":"reactor"}'),
  ('cargo_basic', 'Cargo Pod', '📦', 'module', 5, '{"slot_type":"cargo"}'),
  ('cargo_large', 'Reinforced Hold', '📦', 'module', 5, '{"slot_type":"cargo"}'),
  ('weapon_laser', 'Pulse Laser', '🔫', 'module', 5, '{"slot_type":"weapon"}'),
  ('weapon_cannon', 'Autocannon', '🔫', 'module', 5, '{"slot_type":"weapon"}'),
  ('shield_basic', 'Deflector Screen', '🛡️', 'module', 5, '{"slot_type":"shield"}'),
  ('utility_scanner', 'Sensor Suite', '📡', 'module', 5, '{"slot_type":"utility"}'),
  ('utility_autopilot', 'Nav Computer', '🧭', 'module', 5, '{"slot_type":"utility"}'),
  ('mining_basic', 'Mining Laser', '⛏️', 'module', 5, '{"slot_type":"mining"}')
ON CONFLICT (id) DO NOTHING;
