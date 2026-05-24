-- Migration 041: Mining barge family (3 tiers)
-- ============================================
-- Three tiers of dedicated mining ships -- the first proper
-- "Industrial" class hulls. Each tier scales mining laser slots,
-- cargo, support modules, and physical size:
--
--   Prospector  (T1, 15000 cr)  -- 2 mng / 2 crg / 1 wpn / 1 utl  -- 9x12 grid
--   Excavator   (T2, 80000 cr)  -- 3 mng / 6 crg / 2 wpn / 2 utl  -- 13x18 grid
--   Leviathan   (T3, 250000 cr) -- 4 mng / 10 crg / 3 wpn / 3 utl -- 17x24 grid
--
-- All three share: 1 engine slot (required), 1 reactor slot.
-- Pricing is between shuttle (5k) and capital (200k); the Leviathan
-- is more expensive than the capital since it's a specialized
-- top-tier industrial. Per user direction, no skill/research gates
-- yet -- just price.
--
-- Stats: HP scales up, speed + maneuver scale DOWN (loaded ore
-- hauler is not nimble), sensors moderate. Players who want to be
-- mobile run a shuttle; barges are big slow targets that need
-- escorts in deep space.
--
-- Visual hull shapes (HULL_SHAPES.{prospector,excavator,leviathan})
-- are seeded client-side in shipRenderer.js -- the slot grid here
-- must match the gridW/gridH there.

INSERT INTO hull_types (id, name, class, description, price, base_hull, base_speed, base_maneuver, base_sensors, grid_w, grid_h, slots)
VALUES

-- ============================================
-- T1 -- PROSPECTOR
-- ============================================
-- Chunky entry-level barge. 2 mining lasers up front, modest cargo,
-- a single defensive turret, one utility (room for a scanner or
-- nav computer). Designed to be the player's first dedicated mining
-- ship -- affordable, productive, but vulnerable in dangerous space.
  ('prospector', 'Prospector', 'Industrial',
   'Entry-class mining barge. Two laser mounts, modest cargo, a single defensive turret. Slow + lightly armed -- bring an escort to dangerous space.',
   15000,
   400, 60, 35, 250,
   9, 12,
   '[
     {"id":"mng1","type":"mining","x":1,"y":1,"w":2,"h":2},
     {"id":"mng2","type":"mining","x":6,"y":1,"w":2,"h":2},
     {"id":"wpn1","type":"weapon","x":3,"y":1,"w":3,"h":2},
     {"id":"crg1","type":"cargo","x":1,"y":4,"w":3,"h":4},
     {"id":"crg2","type":"cargo","x":5,"y":4,"w":3,"h":4},
     {"id":"utl1","type":"utility","x":3,"y":8,"w":3,"h":1},
     {"id":"rct1","type":"reactor","x":3,"y":9,"w":3,"h":2},
     {"id":"eng1","type":"engine","x":3,"y":11,"w":3,"h":1,"required":true}
   ]'::jsonb),

-- ============================================
-- T2 -- EXCAVATOR
-- ============================================
-- Wide H-pattern with side cargo silos. 3 mining lasers in a
-- spread + center mount, 6 cargo holds in a 3x2 grid, 2 weapons
-- and 2 utility slots for proper defensive + sensor loadout. The
-- workhorse tier; mid-game players run these in groups.
  ('excavator', 'Excavator', 'Industrial',
   'Mid-tier mining barge. Three lasers in a wide spread, doubled cargo over the Prospector, real defensive teeth. The industrial workhorse.',
   80000,
   800, 50, 25, 350,
   13, 18,
   '[
     {"id":"mng1","type":"mining","x":1,"y":2,"w":2,"h":2},
     {"id":"mng2","type":"mining","x":5,"y":1,"w":3,"h":2},
     {"id":"mng3","type":"mining","x":10,"y":2,"w":2,"h":2},
     {"id":"wpn1","type":"weapon","x":1,"y":5,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":9,"y":5,"w":3,"h":2},
     {"id":"crg1","type":"cargo","x":1,"y":8,"w":4,"h":3},
     {"id":"crg2","type":"cargo","x":5,"y":8,"w":3,"h":3},
     {"id":"crg3","type":"cargo","x":8,"y":8,"w":4,"h":3},
     {"id":"crg4","type":"cargo","x":1,"y":11,"w":4,"h":3},
     {"id":"crg5","type":"cargo","x":5,"y":11,"w":3,"h":3},
     {"id":"crg6","type":"cargo","x":8,"y":11,"w":4,"h":3},
     {"id":"utl1","type":"utility","x":3,"y":14,"w":3,"h":1},
     {"id":"utl2","type":"utility","x":7,"y":14,"w":3,"h":1},
     {"id":"rct1","type":"reactor","x":5,"y":15,"w":3,"h":1},
     {"id":"eng1","type":"engine","x":4,"y":16,"w":5,"h":2,"required":true}
   ]'::jsonb),

-- ============================================
-- T3 -- LEVIATHAN
-- ============================================
-- Top-tier industrial behemoth. 4 mining lasers across a wide nose,
-- 10 cargo silos in a stacked 4x2 + 2 grid, 3 weapon hardpoints,
-- 3 utility slots, and a big quad-engine block. Larger than a
-- capital ship by mass -- a moving asteroid processor.
  ('leviathan', 'Leviathan', 'Industrial',
   'Top-tier industrial behemoth. Four lasers, ten cargo silos, real combat hardpoints. A walking refinery -- and a juicy target.',
   250000,
   1500, 30, 12, 500,
   17, 24,
   '[
     {"id":"mng1","type":"mining","x":1,"y":2,"w":3,"h":2},
     {"id":"mng2","type":"mining","x":5,"y":2,"w":3,"h":2},
     {"id":"mng3","type":"mining","x":9,"y":2,"w":3,"h":2},
     {"id":"mng4","type":"mining","x":13,"y":2,"w":3,"h":2},
     {"id":"wpn1","type":"weapon","x":1,"y":5,"w":3,"h":2},
     {"id":"wpn2","type":"weapon","x":7,"y":5,"w":3,"h":2},
     {"id":"wpn3","type":"weapon","x":13,"y":5,"w":3,"h":2},
     {"id":"utl1","type":"utility","x":1,"y":7,"w":3,"h":1},
     {"id":"utl2","type":"utility","x":7,"y":7,"w":3,"h":1},
     {"id":"utl3","type":"utility","x":13,"y":7,"w":3,"h":1},
     {"id":"crg1","type":"cargo","x":1,"y":9,"w":3,"h":3},
     {"id":"crg2","type":"cargo","x":5,"y":9,"w":3,"h":3},
     {"id":"crg3","type":"cargo","x":9,"y":9,"w":3,"h":3},
     {"id":"crg4","type":"cargo","x":13,"y":9,"w":3,"h":3},
     {"id":"crg5","type":"cargo","x":1,"y":13,"w":3,"h":3},
     {"id":"crg6","type":"cargo","x":5,"y":13,"w":3,"h":3},
     {"id":"crg7","type":"cargo","x":9,"y":13,"w":3,"h":3},
     {"id":"crg8","type":"cargo","x":13,"y":13,"w":3,"h":3},
     {"id":"crg9","type":"cargo","x":3,"y":17,"w":5,"h":3},
     {"id":"crg10","type":"cargo","x":9,"y":17,"w":5,"h":3},
     {"id":"rct1","type":"reactor","x":6,"y":20,"w":5,"h":1},
     {"id":"eng1","type":"engine","x":5,"y":22,"w":7,"h":2,"required":true}
   ]'::jsonb)

ON CONFLICT (id) DO NOTHING;
