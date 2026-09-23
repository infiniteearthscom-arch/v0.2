-- 081: Resource refining (quality) -- docs/refining-spec.md
--
-- A station / city service: feed N units of one resource stack in, get
-- fewer units out at a higher average quality, for a credit fee. Gated
-- by research; yield / cap scale with the Processing skills that were
-- catalog-only until now.

INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_refining', 'industry', 2, 'Ore Refining',
   'Station refinery access. Refine a resource stack to a higher quality (fewer units out, credit fee). Output capped at Q75.',
   450, '["tech_adv_mining"]', '{"service":"refinery"}', 215),
  ('tech_deep_refining', 'industry', 3, 'Deep Refining',
   'Multi-stage refinement. +4 quality per pass and the refinery cap rises to Q95.',
   1500, '["tech_refining"]', '{"service":"refinery_deep"}', 216)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description, rp_cost = EXCLUDED.rp_cost,
  prerequisites = EXCLUDED.prerequisites, unlocks = EXCLUDED.unlocks;

-- Processing skills now do something (bonus contracts unchanged; the
-- refinery reads them). Descriptions say what they actually do.
UPDATE skill_definitions SET description = 'Refinery yield. +3% units returned per refining pass per level.' WHERE id = 'prc_reprocessing';
UPDATE skill_definitions SET description = 'Refinery yield, advanced. +2% units returned per refining pass per level (stacks with Reprocessing).' WHERE id = 'prc_reprocessing_eff';
UPDATE skill_definitions SET description = 'Metal ores (category: ore). +2% refinery yield and +1 to the refinery quality cap per level.' WHERE id = 'prc_metallurgy_refining';
UPDATE skill_definitions SET description = 'Common resources. +2% refinery yield per level when refining common-rarity resources.' WHERE id = 'prc_ore_specialty';
