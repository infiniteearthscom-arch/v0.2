-- Migration 011: Automated Harvester System
-- Adds harvester slots to planets and a deployed_harvesters table

-- Add harvester_slots to celestial_bodies
ALTER TABLE celestial_bodies
ADD COLUMN IF NOT EXISTS harvester_slots INTEGER;

-- Generate random harvester slots (2-10) for existing planets/moons
UPDATE celestial_bodies
SET harvester_slots = 2 + floor(random() * 9)::int
WHERE body_type IN ('planet', 'dwarf_planet', 'moon')
AND harvester_slots IS NULL;

-- Stations and asteroid belts get 0 slots
UPDATE celestial_bodies
SET harvester_slots = 0
WHERE body_type NOT IN ('planet', 'dwarf_planet', 'moon')
AND harvester_slots IS NULL;

-- ============================================
-- DEPLOYED HARVESTERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS deployed_harvesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  celestial_body_id UUID NOT NULL,
  slot_index INTEGER NOT NULL,
  
  harvester_type VARCHAR(50) NOT NULL,
  harvest_rate NUMERIC(8,2) NOT NULL,
  storage_capacity INTEGER NOT NULL,
  fuel_efficiency NUMERIC(6,2) DEFAULT 1.0,
  
  deposit_id UUID,
  resource_type_id INTEGER,
  
  fuel_remaining_hours NUMERIC(10,2) DEFAULT 0,
  last_fuel_check_at TIMESTAMPTZ DEFAULT NOW(),
  
  hopper_quantity INTEGER DEFAULT 0,
  hopper_resource_type_id INTEGER,
  hopper_stat_purity INTEGER,
  hopper_stat_stability INTEGER,
  hopper_stat_potency INTEGER,
  hopper_stat_density INTEGER,
  last_hopper_update_at TIMESTAMPTZ DEFAULT NOW(),
  
  status VARCHAR(20) DEFAULT 'idle',
  
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One harvester per slot per planet
CREATE UNIQUE INDEX IF NOT EXISTS idx_harvesters_body_slot
ON deployed_harvesters(celestial_body_id, slot_index);

-- One harvester per deposit (only when deposit is assigned)
CREATE UNIQUE INDEX IF NOT EXISTS idx_harvesters_deposit
ON deployed_harvesters(deposit_id) WHERE deposit_id IS NOT NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_harvesters_user ON deployed_harvesters(user_id);
CREATE INDEX IF NOT EXISTS idx_harvesters_body ON deployed_harvesters(celestial_body_id);
CREATE INDEX IF NOT EXISTS idx_harvesters_active ON deployed_harvesters(status) WHERE status = 'active';
