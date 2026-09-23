-- 082: Player bases, Phase 1 -- docs/bases-spec.md
--
-- One modular base per pilot (more with Interplanetary Consolidation),
-- anchored to a planet: a SURFACE base (planetary) or an ORBITAL base
-- (star base). Tiers Framework -> Outpost -> Station add module slots.
-- Modules are ordinary module_types rows with slot_type 'base' (bought or
-- crafted, carried in cargo, fitted at the base). Phase 1 modules:
-- Cargo Depot (base storage), Refinery (fee-free refining here), Research
-- Lab (+RP/min).

CREATE TABLE IF NOT EXISTS player_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  celestial_body_id UUID NOT NULL REFERENCES celestial_bodies(id) ON DELETE CASCADE,
  system_procedural_id VARCHAR(64) NOT NULL,
  body_name VARCHAR(100) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'surface',     -- surface | orbital
  name VARCHAR(64) NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1,                 -- 1 Framework, 2 Outpost, 3 Station
  fitted_modules JSONB NOT NULL DEFAULT '{}',      -- { "b1": { module_type_id, quality, name, stats }, ... }
  build_completes_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, celestial_body_id)
);
CREATE INDEX IF NOT EXISTS idx_player_bases_user ON player_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_player_bases_body ON player_bases(celestial_body_id);

-- Depot storage: resource stacks only, same stat-tuple identity as cargo.
CREATE TABLE IF NOT EXISTS player_base_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES player_bases(id) ON DELETE CASCADE,
  resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  stat_purity INTEGER, stat_stability INTEGER, stat_potency INTEGER, stat_density INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_player_base_inventory_base ON player_base_inventory(base_id);

-- Base modules (slot_type 'base' fits no ship hull; only bases take them).
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('base_cargo_depot', 'Cargo Depot', 'base', 1,
   'Base storage. Deposit and withdraw resources at this base; 1,500 cargo units per depot.',
   '{"depot_capacity":1500}'::jsonb, 4000, 'tech_base_construction'),
  ('base_refinery', 'Base Refinery', 'base', 2,
   'A refinery you own: refining at this base costs no fee and returns +5% yield.',
   '{"refinery":true,"refine_yield_pct":5}'::jsonb, 9000, 'tech_base_construction'),
  ('base_research_lab', 'Research Lab', 'base', 2,
   'Passive research. +0.5 research points per minute while fitted.',
   '{"rp_per_min":0.5}'::jsonb, 12000, 'tech_base_construction')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slot_type = EXCLUDED.slot_type, tier = EXCLUDED.tier,
  description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech;

-- item_definitions twins (pitfall #19)
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('base_cargo_depot',  'Cargo Depot',   'Base storage module. Fits a base slot.',            'module', '🏗️', 5, '{"slot_type":"base"}'),
  ('base_refinery',     'Base Refinery', 'Fee-free refinery module. Fits a base slot.',       'module', '⚗️', 5, '{"slot_type":"base"}'),
  ('base_research_lab', 'Research Lab',  'Passive research module. Fits a base slot.',        'module', '🔬', 5, '{"slot_type":"base"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category, icon = EXCLUDED.icon, item_data_defaults = EXCLUDED.item_data_defaults;

INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_base_cargo_depot', 'Cargo Depot', 'Assemble a base storage module.', 'base_cargo_depot', 1,
   '[{"resource_name":"Iron","quantity":120},{"resource_name":"Titanium","quantity":40}]'::jsonb, 'module', 'tech_base_construction'),
  ('craft_base_refinery', 'Base Refinery', 'Assemble a base refinery module.', 'base_refinery', 1,
   '[{"resource_name":"Titanium","quantity":80},{"resource_name":"Copper","quantity":60},{"resource_name":"Crystite","quantity":20}]'::jsonb, 'module', 'tech_base_construction'),
  ('craft_base_research_lab', 'Research Lab', 'Assemble a base research lab.', 'base_research_lab', 1,
   '[{"resource_name":"Copper","quantity":80},{"resource_name":"Crystite","quantity":30},{"resource_name":"Solar Crystals","quantity":5}]'::jsonb, 'module', 'tech_base_construction')
ON CONFLICT (id) DO NOTHING;

-- Research gates (Industry tree)
INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_base_construction', 'industry', 2, 'Base Construction',
   'Build a Framework base on a planet (surface or orbital). Unlocks the base modules.',
   450, '["tech_adv_mining"]', '{"modules":["base_cargo_depot","base_refinery","base_research_lab"]}', 217),
  ('tech_base_expansion', 'industry', 3, 'Base Expansion',
   'Upgrade bases to Outpost and Station tiers (2 and 3 module slots).',
   1800, '["tech_base_construction"]', '{"service":"base_tiers"}', 218)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description, rp_cost = EXCLUDED.rp_cost,
  prerequisites = EXCLUDED.prerequisites, unlocks = EXCLUDED.unlocks;

-- Planetary skills now gate bases.
UPDATE skill_definitions SET description = 'Base command. Level 1 lets you build a base; +1 harvester slot per planet per level.' WHERE id = 'pln_cc_upgrades';
UPDATE skill_definitions SET description = 'Multi-base logistics. +1 base you may own per level (base 1).' WHERE id = 'pln_interplanetary';
