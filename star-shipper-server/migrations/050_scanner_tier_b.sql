-- Migration 050: Scanner Depth Tier B -- area scan + bulk-belt scan + system-wide sweep.
-- ============================================
-- Three new modules and their research gates:
--
--   utility_scanner_area (T2.5) -- mid-tier, "scan everything in your
--     fleet's scan range with one click." Bridges single-target (T1/T2)
--     and bulk-belt (T3). Player still has to fly to widen what gets
--     revealed -- a great middle-ground for active exploration.
--
--   utility_scanner_elite (T3) -- top-tier scanner, "scan every asteroid
--     in the current belt with one click." The endgame asteroid prep
--     tool. Subsumes area scan + adds bulk_scan flag for the belt-wide
--     server endpoint.
--
--   utility_systemscan -- active ability utility module. Reveals every
--     enemy in the system regardless of sensor range for 30 seconds,
--     120 second cooldown. Pure render-filter override -- enemy AI
--     already runs on out-of-range targets, this just shows them.
--
-- Research gating (each unlocks the next):
--   tech_sensor_refine (existing, T1) → utility_scanner_adv
--     → tech_sensor_array (T2, 250 RP)  → utility_scanner_area
--        → tech_sensor_grid (T3, 400 RP)        → utility_scanner_elite
--        → tech_system_telemetry (T3, 350 RP)   → utility_systemscan
--
-- Two T3 nodes both branch off tech_sensor_array so the player can pick
-- a specialization: "I want to scan rocks faster" (elite) vs "I want to
-- see enemies coming" (system telemetry). Both eventually -- but the
-- branch lets early-game research time go to whichever matters first.
-- ============================================

-- Modules ------------------------------------------------------------
INSERT INTO module_types (id, name, slot_type, tier, description, stats) VALUES
  ('utility_scanner_area', 'Wide-Field Sensor Array', 'utility', 2,
   'Mid-tier sensor suite with area-scan capability. One click scans every asteroid currently in your fleet sensor radius -- no per-rock click. Stronger numbers than T1 but doesn''t reach the elite tier''s full-belt sweep.',
   '{"sensor_range":700, "scan_range":200, "scan_time":5, "area_scan":true}'::jsonb),
  ('utility_scanner_elite', 'Elite Survey Grid', 'utility', 3,
   'Top-tier scanner. One click scans every non-depleted asteroid in the entire current belt. Faster cycles, longer reach, and the highest sensor range available outside late-game utility specialty modules.',
   '{"sensor_range":1400, "scan_range":320, "scan_time":2.5, "bulk_scan":true, "area_scan":true}'::jsonb),
  ('utility_systemscan', 'System Telemetry Array', 'utility', 3,
   'Active ability: reveals every enemy in the system for 30s regardless of fleet sensor range. 120s cooldown. Pairs with combat -- the alpha-strike enabler for a fleet caught off-guard.',
   '{"system_sweep":true, "sweep_duration":30, "sweep_cooldown":120}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  stats = EXCLUDED.stats;

-- Item definitions (so modules show up in inventory + are fittable) ---
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_scanner_area',  'Wide-Field Sensor Array', 'Mid-tier sensor with one-click area scan. Unlocked via Sensor Array Networking research.',
   'module', '📡', 5, '{"slot_type":"utility"}'),
  ('utility_scanner_elite', 'Elite Survey Grid',       'Top-tier sensor with full-belt bulk scan. Unlocked via Sensor Grid Mastery research.',
   'module', '📡', 5, '{"slot_type":"utility"}'),
  ('utility_systemscan',    'System Telemetry Array',  'Active ability: reveals all enemies system-wide for 30s, 120s cooldown. Unlocked via System Telemetry research.',
   'module', '🛰️', 5, '{"slot_type":"utility"}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  item_data_defaults = EXCLUDED.item_data_defaults;

-- Research nodes ------------------------------------------------------
-- tech_sensor_refine (T1) already exists in migration 031.
INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_sensor_array',     'society', 2, 'Sensor Array Networking',
   'Networked sensor processing across slot-fitted arrays. Unlocks Wide-Field Sensor Array -- one-click area scan within fleet sensor range.',
   250, '["tech_sensor_refine"]',                              '{"modules":["utility_scanner_area"]}',  530),
  ('tech_sensor_grid',      'society', 3, 'Sensor Grid Mastery',
   'Belt-wide multi-target survey arrays. Unlocks Elite Survey Grid -- bulk-scan every asteroid in a belt with one click.',
   400, '["tech_sensor_array"]',                               '{"modules":["utility_scanner_elite"]}', 531),
  ('tech_system_telemetry', 'society', 3, 'System Telemetry',
   'Long-range threat-detection telemetry. Unlocks System Telemetry Array -- active ability to reveal every enemy in the system for 30s.',
   350, '["tech_sensor_array"]',                               '{"modules":["utility_systemscan"]}',    532)
ON CONFLICT (id) DO UPDATE SET
  description  = EXCLUDED.description,
  rp_cost      = EXCLUDED.rp_cost,
  prerequisites = EXCLUDED.prerequisites,
  unlocks      = EXCLUDED.unlocks,
  sort_order   = EXCLUDED.sort_order;
