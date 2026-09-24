-- 086: Refining moves to player bases -- crafted Refinery module, timed +
-- queued jobs (docs/refining-spec.md v2).
--
-- Stations / cities no longer refine. You need a base with a Base
-- Refinery fitted (craft-only; its crafted quality drives yield, cap and
-- speed). Each fitted refinery is a LANE that runs one job at a time;
-- jobs queue per lane; outputs are collected while docked, into cargo
-- or the base depot. Jobs burn Fuel Cells.

CREATE TABLE IF NOT EXISTS player_refine_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_id UUID NOT NULL REFERENCES player_bases(id) ON DELETE CASCADE,
  lane VARCHAR(8) NOT NULL,                       -- base slot key of the refinery module (b1..b3)
  resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  units_in INTEGER NOT NULL,
  in_purity INTEGER, in_stability INTEGER, in_potency INTEGER, in_density INTEGER,
  units_out INTEGER NOT NULL,
  out_purity INTEGER, out_stability INTEGER, out_potency INTEGER, out_density INTEGER,
  fuel_cells INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  completes_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',   -- queued | collected | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refine_jobs_base ON player_refine_jobs(base_id, status);
CREATE INDEX IF NOT EXISTS idx_refine_jobs_user ON player_refine_jobs(user_id, status);

-- The Refinery is a CRAFTED building now (no vendor), gated by Ore Refining.
UPDATE module_types
   SET buy_price = NULL,
       requires_tech = 'tech_refining',
       description = 'A refinery for your base. Runs one refining job at a time; higher crafted quality = better yield, higher quality cap, faster jobs. Fit more for parallel lanes.',
       stats = '{"refinery":true,"refine_speed":1.0}'::jsonb
 WHERE id = 'base_refinery';
UPDATE crafting_recipes SET requires_tech = 'tech_refining',
       ingredients = '[{"resource_name":"Titanium","quantity":120},{"resource_name":"Copper","quantity":80},{"resource_name":"Crystite","quantity":30},{"resource_name":"Iron","quantity":100}]'::jsonb
 WHERE id = 'craft_base_refinery';
UPDATE item_definitions SET description = 'Refinery building for a base. Craft it, fit it to a base slot, queue refining jobs.' WHERE id = 'base_refinery';

UPDATE tech_definitions
   SET description = 'Unlocks the Base Refinery blueprint. Refine ore at your own base: fewer units out at a higher quality. Output capped at Q75.'
 WHERE id = 'tech_refining';
UPDATE tech_definitions
   SET description = 'Multi-stage refinement for your base refineries. +4 quality per job and the cap rises to Q95.'
 WHERE id = 'tech_deep_refining';
UPDATE skill_definitions SET description = 'Foundry operations. -5% refining job time per level.' WHERE id = 'prc_smelting';

-- Onboarding chain: a base must come BEFORE refining now.
--   Special Delivery -> Homestead -> Grade Up -> Something on the Band -> Dig Site
UPDATE quest_definitions SET triggers_quests = '["tutorial_first_base"]'::jsonb, sort_order = 15 WHERE id = 'tutorial_first_delivery';
UPDATE quest_definitions SET triggers_quests = '["tutorial_first_refine"]'::jsonb, sort_order = 16,
       description = 'Claim a planet. Research Base Construction (Industry tree), train Command Center Upgrades I, dock at a planet and build a Framework from its Base tab. Your base is where refining happens.'
 WHERE id = 'tutorial_first_base';
UPDATE quest_definitions SET triggers_quests = '["tutorial_first_signal"]'::jsonb, sort_order = 17,
       description = 'Quality is everything out here. Research Ore Refining (Industry tree), craft a Base Refinery, fit it to your base, queue a refining job from the Base tab and collect the output.'
 WHERE id = 'tutorial_first_refine';
UPDATE quest_definitions SET sort_order = 18 WHERE id = 'tutorial_first_signal';
UPDATE quest_definitions SET triggers_quests = '[]'::jsonb, sort_order = 19 WHERE id = 'tutorial_first_investigate';
