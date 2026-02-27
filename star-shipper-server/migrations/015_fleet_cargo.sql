-- Migration 015: Fleet-wide cargo system
-- Adds computed_cargo column to ships table so cargo capacity comes from
-- fitted modules on each ship, and total fleet cargo = sum of all ships.

-- Add computed_cargo to ships
ALTER TABLE ships ADD COLUMN IF NOT EXISTS computed_cargo INTEGER DEFAULT 0;

-- Backfill: calculate cargo from fitted modules for existing ships
-- This runs a simple estimate — recalcShipStats will correct on next module fit
DO $$
DECLARE
  ship_rec RECORD;
  mod_info JSONB;
  slot_key TEXT;
  mod_type_id TEXT;
  mod_stats JSONB;
  total INTEGER;
BEGIN
  FOR ship_rec IN SELECT id, fitted_modules FROM ships WHERE fitted_modules IS NOT NULL AND fitted_modules != '{}'::jsonb LOOP
    total := 0;
    FOR slot_key IN SELECT jsonb_object_keys(ship_rec.fitted_modules) LOOP
      mod_info := ship_rec.fitted_modules -> slot_key;
      mod_type_id := mod_info ->> 'module_type_id';
      IF mod_type_id IS NOT NULL THEN
        SELECT stats INTO mod_stats FROM module_types WHERE id = mod_type_id;
        IF mod_stats IS NOT NULL AND (mod_stats ->> 'cargo_capacity') IS NOT NULL THEN
          total := total + (mod_stats ->> 'cargo_capacity')::INTEGER;
        END IF;
      END IF;
    END LOOP;
    UPDATE ships SET computed_cargo = total WHERE id = ship_rec.id;
  END LOOP;
END $$;
