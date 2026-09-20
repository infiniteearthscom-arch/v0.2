-- Migration 075: field repair module (2026-09-20)
-- Healing hulls follow-up: with station repair live and damage
-- persistent, a fleet deep in T4 space needs an option besides limping
-- home. The Repair Nanite Hive is a T3 utility module that slowly
-- repairs the fleet's pooled hull + armor OUT OF COMBAT (no hits for
-- `repair_delay` seconds). Rates stack across fitted hives and scale
-- with quality; the Fleet Support skill (log_fleet_support,
-- remote_rep_pct +5%/level) multiplies them. Vendor-buyable, no
-- research gate (T3 utility isn't skill-gated either) -- it's a
-- convenience, not power.

INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price)
VALUES
  ('utility_repair_nanites', 'Repair Nanite Hive', 'utility', 3,
   'Swarm of hull-knitting nanites. Out of combat (8s without taking a hit) it repairs the fleet''s pooled hull by 2/s and armor by 1/s, scaled by quality. Multiple hives stack. Does nothing while you are being shot.',
   '{"hull_repair_per_sec":2, "armor_repair_per_sec":1, "repair_delay":8, "combat_tuned":true}'::jsonb,
   12000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  stats = EXCLUDED.stats,
  buy_price = EXCLUDED.buy_price;
