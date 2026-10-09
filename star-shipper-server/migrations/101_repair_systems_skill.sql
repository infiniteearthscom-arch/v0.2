-- 101: Repair Systems skill -- the Armor Repairer's skill multiplier.
--
-- Phase B (100) gave the Shield Booster a skill (Shield Upgrades,
-- shield_boost_pct +4 %/level) but the Armor Repairer read
-- `armor_repair_pct`, a bonus type no skill defined, so it always ran at
-- base × quality. This adds the matching Engineering skill. SystemView
-- already applies the type (runActive('armor_repairer', ..., 'armor_repair_pct')).
--
--   armor_repair_pct: +4 per level -> L5 = +20 % repair per cycle
--   (Armor Repairer 40 -> 48, Heavy Armor Repairer 120 -> 144, before quality)
--
-- Rank 2 like Shield Upgrades; sort_order 308 follows the Engineering block.

INSERT INTO skill_definitions (id, category, name, description, rank_multiplier, bonus_per_level, sort_order)
VALUES (
  'eng_repair_systems',
  'Engineering',
  'Repair Systems',
  'Nanite repairer tuning. Armor Repairer and Heavy Armor Repairer restore +4% more armor per cycle per level.',
  2,
  '{"type":"armor_repair_pct","value":4}'::jsonb,
  308
)
ON CONFLICT (id) DO NOTHING;

-- Overheat retuned (owner 2026-10-09): taking hull damage in a prolonged
-- fight is dangerous in the current combat state, so the payoff is raised
-- from +30 % to +50 % on turret damage AND rate (DPS ×2.25) and +50 % on
-- boosting. The client constant is OVERHEAT_MULT in SystemView; this only
-- keeps the skill text honest.
UPDATE skill_definitions SET
  description = 'Enables Overheat at level I (with Exotic Defenses research): 10 s of +50% turret damage and rate (×2.25 DPS) and +50% boosting, then heat damage to the hull. Heat damage −10% per level.'
WHERE id = 'eng_thermodynamics';
