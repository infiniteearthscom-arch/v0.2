-- Migration 010: Cargo Volume System
-- Add volume_per_unit to item_definitions for future variable-weight items

ALTER TABLE item_definitions
ADD COLUMN IF NOT EXISTS volume_per_unit NUMERIC(6,2) DEFAULT 1.0;

-- Update default volumes (all 1 for now, can be adjusted later)
UPDATE item_definitions SET volume_per_unit = 1.0;
