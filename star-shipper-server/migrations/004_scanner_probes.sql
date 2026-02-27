-- Add scanner probe columns to player_resources
-- Run this migration to support the surveying system

-- Add scanner probe columns
ALTER TABLE player_resources 
ADD COLUMN IF NOT EXISTS scanner_probes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS advanced_scanner_probes INTEGER DEFAULT 2;

-- Give existing players some starting probes
UPDATE player_resources 
SET scanner_probes = 5, advanced_scanner_probes = 2
WHERE scanner_probes IS NULL OR advanced_scanner_probes IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN player_resources.scanner_probes IS 'Basic orbital scanner probes';
COMMENT ON COLUMN player_resources.advanced_scanner_probes IS 'Advanced ground scanner probes';
