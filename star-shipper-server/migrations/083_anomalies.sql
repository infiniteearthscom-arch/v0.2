-- 083: Anomalies + archaeology (cosmic signatures) -- docs/anomalies-spec.md
--
-- Every system hides a few SIGNATURE SITES, seeded from the system seed
-- and a daily bucket. With a Signature Probe Launcher fitted, a pilot
-- probes a site over several cycles (the estimate circle shrinks), flies
-- to the pinned position, and investigates it for site-type rewards.
-- Guarded sites spawn a raider fleet on investigation.

CREATE TABLE IF NOT EXISTS player_anomaly_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  system_procedural_id VARCHAR(64) NOT NULL,
  site_index INTEGER NOT NULL,
  bucket INTEGER NOT NULL,                 -- daily bucket the site belongs to
  cycles_done INTEGER NOT NULL DEFAULT 0,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  last_probe_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, system_procedural_id, site_index, bucket)
);

-- The probe launcher (utility slot). One module; the skills do the scaling.
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('utility_probe_launcher', 'Signature Probe Launcher', 'utility', 2,
   'Launches astrometric probes at cosmic signatures. Each 20 s probe cycle narrows a site''s position; three cycles pin it.',
   '{"probe_launcher":true,"probe_cycle":20}'::jsonb, 7000, 'tech_signature_analysis')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech;

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('utility_probe_launcher', 'Signature Probe Launcher', 'Astrometric probe launcher. Fits a utility slot.', 'module', '🔭', 5, '{"slot_type":"utility"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, item_data_defaults = EXCLUDED.item_data_defaults;

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_probe_launcher', 'Signature Probe Launcher', 'Assemble a probe launcher from sensor parts.', 'utility_probe_launcher', 1,
   '[{"resource_name":"Copper","quantity":40},{"resource_name":"Crystite","quantity":15},{"resource_name":"Titanium","quantity":20}]'::jsonb, 'module', 'tech_signature_analysis')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_signature_analysis', 'society', 2, 'Signature Analysis',
   'Detect and probe cosmic signatures. Unlocks the Signature Probe Launcher.',
   500, '["tech_sensor_refine"]', '{"modules":["utility_probe_launcher"]}', 540),
  ('tech_xenoarchaeology', 'society', 3, 'Xenoarchaeology',
   'Precursor site analysis. Required to open tier IV+ relic caches; doubles relic module drops.',
   1600, '["tech_signature_analysis"]', '{"service":"relic_sites"}', 541)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description, rp_cost = EXCLUDED.rp_cost, prerequisites = EXCLUDED.prerequisites, unlocks = EXCLUDED.unlocks;

-- Skill descriptions now say what the anomaly loop actually reads.
UPDATE skill_definitions SET description = 'Probe cycle time. -5% per level (stacks with Survey Probing).' WHERE id = 'ast_astrometric_acq';
UPDATE skill_definitions SET description = 'Probe precision. -5% estimate radius per level (tighter circles).' WHERE id = 'ast_astrometric_pin';
UPDATE skill_definitions SET description = 'Probe strength. +5% per level; at +20% a site pins in two cycles instead of three.' WHERE id = 'ast_astrometric_range';
UPDATE skill_definitions SET description = 'Probe cycle time. -5% per level (stacks with Astrometric Acquisition).' WHERE id = 'exp_survey_probing';
UPDATE skill_definitions SET description = 'Derelict salvage. +10% chance per level that a derelict yields a module.' WHERE id = 'exp_salvaging';
UPDATE skill_definitions SET description = 'Data vaults. +10% research points per level from data vault sites.' WHERE id = 'exp_data_analysis';
UPDATE skill_definitions SET description = 'Relic caches. +10% chance per level that a relic cache yields a module.' WHERE id = 'exp_relic_analysis';
