-- Migration 038: Survey quest description hints at probe vendor
-- ============================================
-- Players often hit the ground-scan step with zero Advanced Scanner
-- Probes and no idea where to get more. Add a hint to the quest copy
-- pointing at the Luna Station vendor's Supplies tab.

UPDATE quest_definitions
SET description = 'Dock at a planet (Earth is closest), open the Scan tab, and run an Orbital Scan followed by a Ground Scan to find resource deposits. Each scan consumes a probe -- if you''re out of Advanced Scanner Probes, dock at Luna Station and buy more from the vendor''s Supplies tab.'
WHERE id = 'tutorial_survey_planet';
