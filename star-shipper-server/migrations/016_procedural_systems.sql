-- Migration 016: Support procedural system bodies in database
-- Adds procedural_id to star_systems for mapping client-generated IDs to DB UUIDs
-- Adds star_type to celestial_bodies for resource weighting

-- Allow star_systems to be found by client-side procedural ID
ALTER TABLE star_systems ADD COLUMN IF NOT EXISTS procedural_id VARCHAR(64) UNIQUE;

-- Store star type on bodies for resource weighting  
ALTER TABLE celestial_bodies ADD COLUMN IF NOT EXISTS star_type VARCHAR(32);

-- Allow system_id to be nullable for bodies created before system is registered
ALTER TABLE celestial_bodies ALTER COLUMN system_id DROP NOT NULL;

-- Index for fast lookup by procedural_id
CREATE INDEX IF NOT EXISTS idx_systems_procedural_id ON star_systems(procedural_id);

-- Set Sol's procedural_id (only if not already set)
UPDATE star_systems SET procedural_id = 'sol' WHERE name = 'Sol' AND procedural_id IS NULL;
