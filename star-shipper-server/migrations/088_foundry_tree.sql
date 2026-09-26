-- 088: The Foundry Tree -- base industry (docs/foundry-spec.md, 2026-09-26).
--
-- GENERATED from src/game/foundryTree.js (scratch gen-088.mjs). Five station
-- families across, five tiers up. Stations are base modules (slot_type
-- 'base', stats.foundry) that run timed, queued JOBS (foundry_recipes) turning
-- raw resources into PROCESSED MATERIALS (resource_types, category
-- 'processed'). PARTS (is_part) build stations and base tiers. Tier 2+ ship
-- module recipes now take processed materials and must be crafted at the
-- matching Assembly bench (crafting_recipes.station_required). Base tiers go
-- to 5 (Hub, Citadel) with 4 plots per tier.

-- ---- schema ----
ALTER TABLE resource_types ADD COLUMN IF NOT EXISTS tier INTEGER;
ALTER TABLE resource_types ADD COLUMN IF NOT EXISTS is_part BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE resource_types ADD COLUMN IF NOT EXISTS family VARCHAR(24);
ALTER TABLE crafting_recipes ADD COLUMN IF NOT EXISTS station_required VARCHAR(64);

CREATE TABLE IF NOT EXISTS foundry_recipes (
  id VARCHAR(64) PRIMARY KEY,
  station_module_id VARCHAR(64) NOT NULL REFERENCES module_types(id),
  name VARCHAR(96) NOT NULL,
  tier INTEGER NOT NULL,
  inputs JSONB NOT NULL,          -- [{resource_name, quantity} | {item_id, quantity}]
  output JSONB NOT NULL,          -- {resource_name, quantity} | {item_id, quantity}
  seconds INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_foundry_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_id UUID NOT NULL REFERENCES player_bases(id) ON DELETE CASCADE,
  slot VARCHAR(8) NOT NULL,                       -- base plot key of the station (b1..b20)
  recipe_id VARCHAR(64) NOT NULL REFERENCES foundry_recipes(id),
  runs INTEGER NOT NULL DEFAULT 1,
  inputs JSONB NOT NULL,                          -- what was consumed (for cancel refunds)
  output_resource_type_id INTEGER REFERENCES resource_types(id),
  output_item_id VARCHAR(50) REFERENCES item_definitions(id),
  output_quantity INTEGER NOT NULL,
  out_purity INTEGER, out_stability INTEGER, out_potency INTEGER, out_density INTEGER,
  starts_at TIMESTAMPTZ NOT NULL,
  completes_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',   -- queued | collected | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_foundry_jobs_base ON player_foundry_jobs(base_id, status);
CREATE INDEX IF NOT EXISTS idx_foundry_jobs_user ON player_foundry_jobs(user_id, status);


-- ---- processed materials (resource_types, category 'processed') ----
INSERT INTO resource_types (name, category, rarity, base_price, description, icon, tier, is_part, family) VALUES
  ('Iron Ingot', 'processed', 'common', 22, 'Smelted iron. The first thing a base makes.', 'ironingot', 1, FALSE, 'smelting'),
  ('Copper Ingot', 'processed', 'common', 32, 'Smelted copper for wiring and circuits.', 'copperingot', 1, FALSE, 'smelting'),
  ('Hydrogen Cell', 'processed', 'common', 26, 'Compressed hydrogen. Reducing agent and fuel stock.', 'hydrogencell', 1, FALSE, 'gas'),
  ('Nitrate Compound', 'processed', 'common', 26, 'Fixed nitrogen for chemistry and ceramics.', 'nitratecompound', 1, FALSE, 'gas'),
  ('Polymer', 'processed', 'common', 55, 'Bioplastic spun from biomass.', 'polymer', 1, FALSE, 'bio'),
  ('Nutrient Gel', 'processed', 'common', 50, 'Growth medium for cultures.', 'nutrientgel', 1, FALSE, 'bio'),
  ('Basic Circuit', 'processed', 'common', 90, 'Copper traces on a polymer board.', 'basiccircuit', 1, FALSE, 'electronics'),
  ('Structural Frame', 'processed', 'common', 80, 'Iron and copper framing. Builds T2 stations and the Outpost.', 'structuralframe', 1, TRUE, 'assembly'),
  ('Control Unit', 'processed', 'common', 140, 'A circuit in an iron housing. Builds T2 stations and the Outpost.', 'controlunit', 1, TRUE, 'assembly'),
  ('Titanium Ingot', 'processed', 'common', 55, 'Arc-smelted titanium.', 'titaniumingot', 2, FALSE, 'smelting'),
  ('Steel Plate', 'processed', 'common', 75, 'Hydrogen-reduced iron, rolled to plate.', 'steelplate', 2, FALSE, 'smelting'),
  ('Xenon Propellant', 'processed', 'common', 75, 'Cryo-separated xenon for ion drives.', 'xenonpropellant', 2, FALSE, 'gas'),
  ('Cryo Coolant', 'processed', 'common', 60, 'Liquid nitrogen coolant for fusion-grade machinery.', 'cryocoolant', 2, FALSE, 'gas'),
  ('Ceramic Composite', 'processed', 'common', 90, 'Kiln-fired coral ceramic.', 'ceramiccomposite', 2, FALSE, 'bio'),
  ('Printed Board', 'processed', 'common', 220, 'Multilayer board on a ceramic substrate.', 'printedboard', 2, FALSE, 'electronics'),
  ('Titanium Frame', 'processed', 'common', 200, 'Titanium and steel framing. Builds T3 stations and the Station tier.', 'titaniumframe', 2, TRUE, 'assembly'),
  ('Servo Assembly', 'processed', 'common', 450, 'Actuated frame with a printed board. Builds T3 stations and the Station tier.', 'servoassembly', 2, TRUE, 'assembly'),
  ('Crystite Lattice', 'processed', 'rare', 160, 'Fusion-grown crystite lattice.', 'crystitelattice', 3, FALSE, 'smelting'),
  ('Uranium Pellet', 'processed', 'rare', 300, 'Enriched uranium, cooled and sintered.', 'uraniumpellet', 3, FALSE, 'smelting'),
  ('He-3 Fuel Pellet', 'processed', 'rare', 240, 'Helium-3 fusion fuel.', 'he3fuelpellet', 3, FALSE, 'gas'),
  ('Nanite Culture', 'processed', 'rare', 260, 'A living nanite colony in nutrient gel.', 'naniteculture', 3, FALSE, 'bio'),
  ('Energy Cell', 'processed', 'rare', 210, 'Solar-crystal storage cell.', 'energycell', 3, FALSE, 'electronics'),
  ('Lattice Processor', 'processed', 'rare', 420, 'Crystite logic on a printed board.', 'latticeprocessor', 3, FALSE, 'electronics'),
  ('Reinforced Hull Section', 'processed', 'rare', 500, 'Lattice-braced titanium hull section. Builds T4 stations and the Hub.', 'reinforcedhullsection', 3, TRUE, 'assembly'),
  ('Smart Actuator', 'processed', 'rare', 760, 'A lattice processor driving nanite muscle. Builds T4 stations and the Hub.', 'smartactuator', 3, TRUE, 'assembly'),
  ('Contained Plasma', 'processed', 'exotic', 400, 'Plasma held in a helium-3 bottle.', 'containedplasma', 4, FALSE, 'gas'),
  ('Precursor Plate', 'processed', 'exotic', 1300, 'Ancient Alloy re-forged in plasma.', 'precursorplate', 4, FALSE, 'smelting'),
  ('Dense Alloy', 'processed', 'exotic', 450, 'Uranium-doped titanium.', 'densealloy', 4, FALSE, 'smelting'),
  ('Sealant Resin', 'processed', 'exotic', 420, 'Amber sap cured by nanites.', 'sealantresin', 4, FALSE, 'bio'),
  ('Dark Capacitor', 'processed', 'exotic', 1500, 'Dark matter in an energy-cell cage.', 'darkcapacitor', 4, FALSE, 'electronics'),
  ('Precursor Frame', 'processed', 'exotic', 2000, 'Precursor plate bonded with resin. Builds T5 stations and the Citadel.', 'precursorframe', 4, TRUE, 'assembly'),
  ('Field Core', 'processed', 'exotic', 2600, 'A dark capacitor on a smart actuator. Builds T5 stations and the Citadel.', 'fieldcore', 4, TRUE, 'assembly'),
  ('Void-Tempered Alloy', 'processed', 'exotic', 3000, 'Precursor plate quenched in void essence.', 'voidtemperedalloy', 5, FALSE, 'smelting'),
  ('Stable Quantum Matrix', 'processed', 'exotic', 1700, 'Quantum dust stabilised in contained plasma.', 'stablequantummatrix', 5, FALSE, 'gas'),
  ('Quantum Board', 'processed', 'exotic', 3400, 'A quantum matrix wired through a dark capacitor.', 'quantumboard', 5, FALSE, 'electronics'),
  ('Void Core', 'processed', 'exotic', 5200, 'Void alloy around a quantum matrix. The top of the tree.', 'voidcore', 5, TRUE, 'assembly')
ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, rarity = EXCLUDED.rarity, base_price = EXCLUDED.base_price, description = EXCLUDED.description, tier = EXCLUDED.tier, is_part = EXCLUDED.is_part, family = EXCLUDED.family;
-- raw resources keep tier NULL / family NULL (they are inputs, not tree nodes)

-- ---- research (Industry tree) ----
INSERT INTO tech_definitions (id, tree, tier, name, description, rp_cost, prerequisites, unlocks, sort_order) VALUES
  ('tech_foundry_1', 'industry', 2, 'Foundry Basics', 'Tier 1 base industry: Smelter, Condenser, Bioreactor, Circuit Printer, Workbench. Raw ore, gas and biomass become ingots, cells, polymer and circuits.', 500, '["tech_base_construction"]'::jsonb, '{"modules":["base_smelter","base_condenser","base_bioreactor","base_circuit_printer","base_workbench","base_repair_shop"]}'::jsonb, 219),
  ('tech_foundry_2', 'industry', 3, 'Industrial Works', 'Tier 2 stations: Arc Smelter, Cryo Separator, Coral Kiln, Circuit Etcher, Machine Shop. Tier 2 ship modules are assembled at the Machine Shop.', 1500, '["tech_foundry_1"]'::jsonb, '{"modules":["base_arc_smelter","base_cryo_separator","base_coral_kiln","base_circuit_etcher","base_machine_shop"]}'::jsonb, 220),
  ('tech_foundry_3', 'industry', 3, 'Fusion Industry', 'Tier 3 stations: Fusion Smelter, Isotope Plant, Spore Incubator, Crystal Lathe, Fabricator. Rares become lattices, pellets, cultures and processors.', 3200, '["tech_foundry_2"]'::jsonb, '{"modules":["base_fusion_smelter","base_isotope_plant","base_spore_incubator","base_crystal_lathe","base_fabricator"]}'::jsonb, 221),
  ('tech_foundry_4', 'industry', 4, 'Plasma Industry', 'Tier 4 stations: Plasma Containment, Plasma Forge, Resin Works, Capacitor Bank, Nano-Assembler. The first exotics enter the tree.', 7000, '["tech_foundry_3"]'::jsonb, '{"modules":["base_plasma_containment","base_plasma_forge","base_resin_works","base_capacitor_bank","base_nano_assembler"]}'::jsonb, 222),
  ('tech_foundry_5', 'industry', 4, 'Void Industry', 'Tier 5 stations: Void Foundry, Quantum Condenser, Quantum Forge. Void Cores and tier 5 modules.', 16000, '["tech_foundry_4"]'::jsonb, '{"modules":["base_void_foundry","base_quantum_condenser","base_quantum_forge"]}'::jsonb, 223),
  ('tech_base_citadel', 'industry', 4, 'Citadel Engineering', 'Upgrade bases to Hub and Citadel tiers (16 and 20 plots).', 9000, '["tech_base_expansion"]'::jsonb, '{"service":"base_tiers_4_5"}'::jsonb, 224)
ON CONFLICT (id) DO UPDATE SET tree = EXCLUDED.tree, tier = EXCLUDED.tier, name = EXCLUDED.name, description = EXCLUDED.description, rp_cost = EXCLUDED.rp_cost, prerequisites = EXCLUDED.prerequisites, unlocks = EXCLUDED.unlocks, sort_order = EXCLUDED.sort_order;
UPDATE tech_definitions SET description = 'Upgrade bases to Outpost and Station tiers (8 and 12 plots).' WHERE id = 'tech_base_expansion';

-- ---- stations + services: module_types ----
INSERT INTO module_types (id, name, slot_type, tier, description, stats, buy_price, requires_tech) VALUES
  ('base_smelter', 'Smelter', 'base', 1, 'Smelts iron and copper ore into ingots. Built from raw cargo -- the first station of every base.', '{"foundry":{"family":"smelting","tier":1,"bench":false,"gate":true},"speed":1}'::jsonb, NULL, 'tech_foundry_1'),
  ('base_condenser', 'Condenser', 'base', 1, 'Compresses hydrogen and fixes nitrogen. Also presses Fuel Cells, cheaper than the vendor.', '{"foundry":{"family":"gas","tier":1,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_1'),
  ('base_bioreactor', 'Bioreactor', 'base', 1, 'Spins biomass into polymer and nutrient gel.', '{"foundry":{"family":"bio","tier":1,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_1'),
  ('base_circuit_printer', 'Circuit Printer', 'base', 1, 'Prints copper traces on polymer. Also builds Scanner Probes.', '{"foundry":{"family":"electronics","tier":1,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_1'),
  ('base_workbench', 'Workbench', 'base', 1, 'Assembles Structural Frames and Control Units -- the parts every T2 station and the Outpost are built from. Also builds harvesters.', '{"foundry":{"family":"assembly","tier":1,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_1'),
  ('base_arc_smelter', 'Arc Smelter', 'base', 2, 'Arc-smelts titanium and rolls steel plate.', '{"foundry":{"family":"smelting","tier":2,"bench":false,"gate":true},"speed":1}'::jsonb, NULL, 'tech_foundry_2'),
  ('base_cryo_separator', 'Cryo Separator', 'base', 2, 'Separates xenon propellant and makes cryo coolant.', '{"foundry":{"family":"gas","tier":2,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_2'),
  ('base_coral_kiln', 'Coral Kiln', 'base', 2, 'Fires coral into ceramic composite.', '{"foundry":{"family":"bio","tier":2,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_2'),
  ('base_circuit_etcher', 'Circuit Etcher', 'base', 2, 'Etches multilayer printed boards. Also builds Advanced Scanner Probes.', '{"foundry":{"family":"electronics","tier":2,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_2'),
  ('base_machine_shop', 'Machine Shop', 'base', 2, 'Assembles Titanium Frames and Servo Assemblies. Tier 2 ship modules are crafted here.', '{"foundry":{"family":"assembly","tier":2,"bench":true,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_2'),
  ('base_fusion_smelter', 'Fusion Smelter', 'base', 3, 'Grows crystite lattice and sinters uranium pellets.', '{"foundry":{"family":"smelting","tier":3,"bench":false,"gate":true},"speed":1}'::jsonb, NULL, 'tech_foundry_3'),
  ('base_isotope_plant', 'Isotope Plant', 'base', 3, 'Presses helium-3 into fusion fuel pellets.', '{"foundry":{"family":"gas","tier":3,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_3'),
  ('base_spore_incubator', 'Spore Incubator', 'base', 3, 'Cultures nanites from alien spores.', '{"foundry":{"family":"bio","tier":3,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_3'),
  ('base_crystal_lathe', 'Crystal Lathe', 'base', 3, 'Cuts energy cells and lattice processors.', '{"foundry":{"family":"electronics","tier":3,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_3'),
  ('base_fabricator', 'Fabricator', 'base', 3, 'Assembles Reinforced Hull Sections and Smart Actuators. Tier 3 ship modules are crafted here.', '{"foundry":{"family":"assembly","tier":3,"bench":true,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_3'),
  ('base_plasma_containment', 'Plasma Containment', 'base', 4, 'Bottles plasma in helium-3 fields. Also builds Missile Warheads.', '{"foundry":{"family":"gas","tier":4,"bench":false,"gate":true},"speed":1}'::jsonb, NULL, 'tech_foundry_4'),
  ('base_plasma_forge', 'Plasma Forge', 'base', 4, 'Re-forges Ancient Alloy into precursor plate and dopes titanium into dense alloy.', '{"foundry":{"family":"smelting","tier":4,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_4'),
  ('base_resin_works', 'Resin Works', 'base', 4, 'Cures amber sap into sealant resin with nanites.', '{"foundry":{"family":"bio","tier":4,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_4'),
  ('base_capacitor_bank', 'Capacitor Bank', 'base', 4, 'Cages dark matter in energy cells.', '{"foundry":{"family":"electronics","tier":4,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_4'),
  ('base_nano_assembler', 'Nano-Assembler', 'base', 4, 'Assembles Precursor Frames and Field Cores. Tier 4 ship modules are crafted here.', '{"foundry":{"family":"assembly","tier":4,"bench":true,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_4'),
  ('base_void_foundry', 'Void Foundry', 'base', 5, 'Quenches precursor plate in void essence.', '{"foundry":{"family":"smelting","tier":5,"bench":false,"gate":true},"speed":1}'::jsonb, NULL, 'tech_foundry_5'),
  ('base_quantum_condenser', 'Quantum Condenser', 'base', 5, 'Stabilises quantum dust and wires quantum boards.', '{"foundry":{"family":"gas","tier":5,"bench":false,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_5'),
  ('base_quantum_forge', 'Quantum Forge', 'base', 5, 'Assembles Void Cores. Tier 5 ship modules are crafted here.', '{"foundry":{"family":"assembly","tier":5,"bench":true,"gate":false},"speed":1}'::jsonb, NULL, 'tech_foundry_5'),
  ('base_repair_shop', 'Repair Shop', 'base', 2, 'Repair your fleet at this base at 25% off station rates.', '{"repair_shop":true,"repair_discount_pct":25,"foundry":null}'::jsonb, NULL, 'tech_foundry_1')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slot_type = EXCLUDED.slot_type, tier = EXCLUDED.tier, description = EXCLUDED.description, stats = EXCLUDED.stats, buy_price = EXCLUDED.buy_price, requires_tech = EXCLUDED.requires_tech;

-- item_definitions twins
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults) VALUES
  ('base_smelter', 'Smelter', 'Smelting building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_condenser', 'Condenser', 'Gas Works building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_bioreactor', 'Bioreactor', 'Biolab building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_circuit_printer', 'Circuit Printer', 'Electronics building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_workbench', 'Workbench', 'Assembly building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_arc_smelter', 'Arc Smelter', 'Smelting building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_cryo_separator', 'Cryo Separator', 'Gas Works building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_coral_kiln', 'Coral Kiln', 'Biolab building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_circuit_etcher', 'Circuit Etcher', 'Electronics building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_machine_shop', 'Machine Shop', 'Assembly building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_fusion_smelter', 'Fusion Smelter', 'Smelting building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_isotope_plant', 'Isotope Plant', 'Gas Works building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_spore_incubator', 'Spore Incubator', 'Biolab building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_crystal_lathe', 'Crystal Lathe', 'Electronics building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_fabricator', 'Fabricator', 'Assembly building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_plasma_containment', 'Plasma Containment', 'Gas Works building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_plasma_forge', 'Plasma Forge', 'Smelting building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_resin_works', 'Resin Works', 'Biolab building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_capacitor_bank', 'Capacitor Bank', 'Electronics building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_nano_assembler', 'Nano-Assembler', 'Assembly building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_void_foundry', 'Void Foundry', 'Smelting building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_quantum_condenser', 'Quantum Condenser', 'Gas Works building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_quantum_forge', 'Quantum Forge', 'Assembly building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}'),
  ('base_repair_shop', 'Repair Shop', 'Services building for a base. Fit it to a plot.', 'module', '🏭', 5, '{"slot_type":"base"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category, item_data_defaults = EXCLUDED.item_data_defaults;

-- crafting_recipes: the station MODULE is crafted in the Crafting window from parts (no bench needed -- the parts are the gate)
INSERT INTO crafting_recipes (id, name, description, output_item_id, output_quantity, ingredients, category, requires_tech) VALUES
  ('craft_base_smelter', 'Smelter', 'Build a Smelter for your base.', 'base_smelter', 1, '[{"resource_name":"Iron","quantity":40},{"resource_name":"Copper","quantity":20},{"resource_name":"Hydrogen","quantity":10}]'::jsonb, 'module', 'tech_foundry_1'),
  ('craft_base_condenser', 'Condenser', 'Build a Condenser for your base.', 'base_condenser', 1, '[{"resource_name":"Iron Ingot","quantity":6},{"resource_name":"Copper Ingot","quantity":4},{"resource_name":"Nitrogen","quantity":20}]'::jsonb, 'module', 'tech_foundry_1'),
  ('craft_base_bioreactor', 'Bioreactor', 'Build a Bioreactor for your base.', 'base_bioreactor', 1, '[{"resource_name":"Iron Ingot","quantity":6},{"resource_name":"Hydrogen Cell","quantity":4},{"resource_name":"Biomass","quantity":30}]'::jsonb, 'module', 'tech_foundry_1'),
  ('craft_base_circuit_printer', 'Circuit Printer', 'Build a Circuit Printer for your base.', 'base_circuit_printer', 1, '[{"resource_name":"Copper Ingot","quantity":8},{"resource_name":"Polymer","quantity":6},{"resource_name":"Nitrate Compound","quantity":4}]'::jsonb, 'module', 'tech_foundry_1'),
  ('craft_base_workbench', 'Workbench', 'Build a Workbench for your base.', 'base_workbench', 1, '[{"resource_name":"Iron Ingot","quantity":10},{"resource_name":"Basic Circuit","quantity":4},{"resource_name":"Polymer","quantity":6}]'::jsonb, 'module', 'tech_foundry_1'),
  ('craft_base_arc_smelter', 'Arc Smelter', 'Build a Arc Smelter for your base.', 'base_arc_smelter', 1, '[{"resource_name":"Structural Frame","quantity":4},{"resource_name":"Basic Circuit","quantity":4},{"resource_name":"Polymer","quantity":8},{"resource_name":"Nitrate Compound","quantity":6}]'::jsonb, 'module', 'tech_foundry_2'),
  ('craft_base_cryo_separator', 'Cryo Separator', 'Build a Cryo Separator for your base.', 'base_cryo_separator', 1, '[{"resource_name":"Titanium Ingot","quantity":6},{"resource_name":"Control Unit","quantity":2},{"resource_name":"Polymer","quantity":6}]'::jsonb, 'module', 'tech_foundry_2'),
  ('craft_base_coral_kiln', 'Coral Kiln', 'Build a Coral Kiln for your base.', 'base_coral_kiln', 1, '[{"resource_name":"Steel Plate","quantity":4},{"resource_name":"Cryo Coolant","quantity":3},{"resource_name":"Basic Circuit","quantity":3}]'::jsonb, 'module', 'tech_foundry_2'),
  ('craft_base_circuit_etcher', 'Circuit Etcher', 'Build a Circuit Etcher for your base.', 'base_circuit_etcher', 1, '[{"resource_name":"Control Unit","quantity":2},{"resource_name":"Cryo Coolant","quantity":3},{"resource_name":"Ceramic Composite","quantity":4}]'::jsonb, 'module', 'tech_foundry_2'),
  ('craft_base_machine_shop', 'Machine Shop', 'Build a Machine Shop for your base.', 'base_machine_shop', 1, '[{"resource_name":"Structural Frame","quantity":4},{"resource_name":"Steel Plate","quantity":6},{"resource_name":"Printed Board","quantity":3},{"resource_name":"Xenon Propellant","quantity":3}]'::jsonb, 'module', 'tech_foundry_2'),
  ('craft_base_fusion_smelter', 'Fusion Smelter', 'Build a Fusion Smelter for your base.', 'base_fusion_smelter', 1, '[{"resource_name":"Titanium Frame","quantity":3},{"resource_name":"Servo Assembly","quantity":2},{"resource_name":"Cryo Coolant","quantity":6},{"resource_name":"Ceramic Composite","quantity":6}]'::jsonb, 'module', 'tech_foundry_3'),
  ('craft_base_isotope_plant', 'Isotope Plant', 'Build a Isotope Plant for your base.', 'base_isotope_plant', 1, '[{"resource_name":"Crystite Lattice","quantity":4},{"resource_name":"Uranium Pellet","quantity":2},{"resource_name":"Titanium Frame","quantity":2},{"resource_name":"Printed Board","quantity":3}]'::jsonb, 'module', 'tech_foundry_3'),
  ('craft_base_spore_incubator', 'Spore Incubator', 'Build a Spore Incubator for your base.', 'base_spore_incubator', 1, '[{"resource_name":"Ceramic Composite","quantity":6},{"resource_name":"Crystite Lattice","quantity":3},{"resource_name":"Servo Assembly","quantity":2},{"resource_name":"He-3 Fuel Pellet","quantity":2}]'::jsonb, 'module', 'tech_foundry_3'),
  ('craft_base_crystal_lathe', 'Crystal Lathe', 'Build a Crystal Lathe for your base.', 'base_crystal_lathe', 1, '[{"resource_name":"Crystite Lattice","quantity":4},{"resource_name":"He-3 Fuel Pellet","quantity":2},{"resource_name":"Servo Assembly","quantity":2},{"resource_name":"Nanite Culture","quantity":2}]'::jsonb, 'module', 'tech_foundry_3'),
  ('craft_base_fabricator', 'Fabricator', 'Build a Fabricator for your base.', 'base_fabricator', 1, '[{"resource_name":"Titanium Frame","quantity":4},{"resource_name":"Lattice Processor","quantity":3},{"resource_name":"Energy Cell","quantity":4},{"resource_name":"Nanite Culture","quantity":3}]'::jsonb, 'module', 'tech_foundry_3'),
  ('craft_base_plasma_containment', 'Plasma Containment', 'Build a Plasma Containment for your base.', 'base_plasma_containment', 1, '[{"resource_name":"Smart Actuator","quantity":2},{"resource_name":"Reinforced Hull Section","quantity":2},{"resource_name":"He-3 Fuel Pellet","quantity":6},{"resource_name":"Energy Cell","quantity":6}]'::jsonb, 'module', 'tech_foundry_4'),
  ('craft_base_plasma_forge', 'Plasma Forge', 'Build a Plasma Forge for your base.', 'base_plasma_forge', 1, '[{"resource_name":"Contained Plasma","quantity":4},{"resource_name":"Reinforced Hull Section","quantity":2},{"resource_name":"Lattice Processor","quantity":3},{"resource_name":"Uranium Pellet","quantity":4}]'::jsonb, 'module', 'tech_foundry_4'),
  ('craft_base_resin_works', 'Resin Works', 'Build a Resin Works for your base.', 'base_resin_works', 1, '[{"resource_name":"Dense Alloy","quantity":4},{"resource_name":"Smart Actuator","quantity":2},{"resource_name":"Nutrient Gel","quantity":8}]'::jsonb, 'module', 'tech_foundry_4'),
  ('craft_base_capacitor_bank', 'Capacitor Bank', 'Build a Capacitor Bank for your base.', 'base_capacitor_bank', 1, '[{"resource_name":"Precursor Plate","quantity":2},{"resource_name":"Lattice Processor","quantity":3},{"resource_name":"Sealant Resin","quantity":3}]'::jsonb, 'module', 'tech_foundry_4'),
  ('craft_base_nano_assembler', 'Nano-Assembler', 'Build a Nano-Assembler for your base.', 'base_nano_assembler', 1, '[{"resource_name":"Precursor Plate","quantity":3},{"resource_name":"Dark Capacitor","quantity":2},{"resource_name":"Smart Actuator","quantity":3},{"resource_name":"Sealant Resin","quantity":3}]'::jsonb, 'module', 'tech_foundry_4'),
  ('craft_base_void_foundry', 'Void Foundry', 'Build a Void Foundry for your base.', 'base_void_foundry', 1, '[{"resource_name":"Precursor Frame","quantity":2},{"resource_name":"Field Core","quantity":2},{"resource_name":"Contained Plasma","quantity":6},{"resource_name":"Dark Capacitor","quantity":3}]'::jsonb, 'module', 'tech_foundry_5'),
  ('craft_base_quantum_condenser', 'Quantum Condenser', 'Build a Quantum Condenser for your base.', 'base_quantum_condenser', 1, '[{"resource_name":"Void-Tempered Alloy","quantity":3},{"resource_name":"Field Core","quantity":2},{"resource_name":"Dark Capacitor","quantity":3}]'::jsonb, 'module', 'tech_foundry_5'),
  ('craft_base_quantum_forge', 'Quantum Forge', 'Build a Quantum Forge for your base.', 'base_quantum_forge', 1, '[{"resource_name":"Void-Tempered Alloy","quantity":3},{"resource_name":"Quantum Board","quantity":2},{"resource_name":"Precursor Frame","quantity":2},{"resource_name":"Sealant Resin","quantity":4}]'::jsonb, 'module', 'tech_foundry_5'),
  ('craft_base_repair_shop', 'Repair Shop', 'Build a Repair Shop for your base.', 'base_repair_shop', 1, '[{"resource_name":"Steel Plate","quantity":6},{"resource_name":"Control Unit","quantity":2},{"resource_name":"Polymer","quantity":6}]'::jsonb, 'module', 'tech_foundry_1')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, ingredients = EXCLUDED.ingredients, requires_tech = EXCLUDED.requires_tech;

-- ---- foundry_recipes: the jobs each station runs ----
INSERT INTO foundry_recipes (id, station_module_id, name, tier, inputs, output, seconds, sort_order) VALUES
  ('fj_iron_ingot', 'base_smelter', 'Iron Ingot', 1, '[{"resource_name":"Iron","quantity":2}]'::jsonb, '{"resource_name":"Iron Ingot","quantity":1}'::jsonb, 20, 0),
  ('fj_copper_ingot', 'base_smelter', 'Copper Ingot', 1, '[{"resource_name":"Copper","quantity":2}]'::jsonb, '{"resource_name":"Copper Ingot","quantity":1}'::jsonb, 20, 1),
  ('fj_hydrogen_cell', 'base_condenser', 'Hydrogen Cell', 1, '[{"resource_name":"Hydrogen","quantity":3}]'::jsonb, '{"resource_name":"Hydrogen Cell","quantity":1}'::jsonb, 20, 2),
  ('fj_nitrate', 'base_condenser', 'Nitrate Compound', 1, '[{"resource_name":"Nitrogen","quantity":2}]'::jsonb, '{"resource_name":"Nitrate Compound","quantity":1}'::jsonb, 20, 3),
  ('fj_fuel_cell', 'base_condenser', 'Fuel Cell', 1, '[{"resource_name":"Hydrogen Cell","quantity":2}]'::jsonb, '{"item_id":"fuel_cell","quantity":1}'::jsonb, 30, 4),
  ('fj_polymer', 'base_bioreactor', 'Polymer', 1, '[{"resource_name":"Biomass","quantity":3}]'::jsonb, '{"resource_name":"Polymer","quantity":1}'::jsonb, 25, 5),
  ('fj_nutrient_gel', 'base_bioreactor', 'Nutrient Gel', 1, '[{"resource_name":"Biomass","quantity":2},{"resource_name":"Nitrate Compound","quantity":1}]'::jsonb, '{"resource_name":"Nutrient Gel","quantity":1}'::jsonb, 25, 6),
  ('fj_basic_circuit', 'base_circuit_printer', 'Basic Circuit', 1, '[{"resource_name":"Copper Ingot","quantity":1},{"resource_name":"Polymer","quantity":1}]'::jsonb, '{"resource_name":"Basic Circuit","quantity":1}'::jsonb, 30, 7),
  ('fj_scanner_probe', 'base_circuit_printer', 'Scanner Probe', 1, '[{"resource_name":"Basic Circuit","quantity":1},{"resource_name":"Polymer","quantity":1}]'::jsonb, '{"item_id":"scanner_probe","quantity":1}'::jsonb, 30, 8),
  ('fj_structural_frame', 'base_workbench', 'Structural Frame', 1, '[{"resource_name":"Iron Ingot","quantity":2},{"resource_name":"Copper Ingot","quantity":1}]'::jsonb, '{"resource_name":"Structural Frame","quantity":1}'::jsonb, 40, 9),
  ('fj_control_unit', 'base_workbench', 'Control Unit', 1, '[{"resource_name":"Basic Circuit","quantity":1},{"resource_name":"Iron Ingot","quantity":1}]'::jsonb, '{"resource_name":"Control Unit","quantity":1}'::jsonb, 40, 10),
  ('fj_basic_harvester', 'base_workbench', 'Basic Harvester', 1, '[{"resource_name":"Structural Frame","quantity":1},{"resource_name":"Control Unit","quantity":1}]'::jsonb, '{"item_id":"basic_harvester","quantity":1}'::jsonb, 60, 11),
  ('fj_titanium_ingot', 'base_arc_smelter', 'Titanium Ingot', 2, '[{"resource_name":"Titanium","quantity":2}]'::jsonb, '{"resource_name":"Titanium Ingot","quantity":1}'::jsonb, 30, 12),
  ('fj_steel_plate', 'base_arc_smelter', 'Steel Plate', 2, '[{"resource_name":"Iron Ingot","quantity":2},{"resource_name":"Hydrogen Cell","quantity":1}]'::jsonb, '{"resource_name":"Steel Plate","quantity":1}'::jsonb, 35, 13),
  ('fj_xenon_propellant', 'base_cryo_separator', 'Xenon Propellant', 2, '[{"resource_name":"Xenon","quantity":2}]'::jsonb, '{"resource_name":"Xenon Propellant","quantity":1}'::jsonb, 30, 14),
  ('fj_cryo_coolant', 'base_cryo_separator', 'Cryo Coolant', 2, '[{"resource_name":"Nitrogen","quantity":2},{"resource_name":"Hydrogen Cell","quantity":1}]'::jsonb, '{"resource_name":"Cryo Coolant","quantity":1}'::jsonb, 30, 15),
  ('fj_ceramic', 'base_coral_kiln', 'Ceramic Composite', 2, '[{"resource_name":"Coral","quantity":2},{"resource_name":"Nitrate Compound","quantity":1}]'::jsonb, '{"resource_name":"Ceramic Composite","quantity":1}'::jsonb, 35, 16),
  ('fj_printed_board', 'base_circuit_etcher', 'Printed Board', 2, '[{"resource_name":"Basic Circuit","quantity":1},{"resource_name":"Ceramic Composite","quantity":1},{"resource_name":"Titanium Ingot","quantity":1}]'::jsonb, '{"resource_name":"Printed Board","quantity":1}'::jsonb, 45, 17),
  ('fj_adv_probe', 'base_circuit_etcher', 'Advanced Scanner Probe', 2, '[{"resource_name":"Printed Board","quantity":1},{"resource_name":"Polymer","quantity":1}]'::jsonb, '{"item_id":"advanced_scanner_probe","quantity":1}'::jsonb, 45, 18),
  ('fj_titanium_frame', 'base_machine_shop', 'Titanium Frame', 2, '[{"resource_name":"Titanium Ingot","quantity":2},{"resource_name":"Steel Plate","quantity":1}]'::jsonb, '{"resource_name":"Titanium Frame","quantity":1}'::jsonb, 60, 19),
  ('fj_servo_assembly', 'base_machine_shop', 'Servo Assembly', 2, '[{"resource_name":"Printed Board","quantity":1},{"resource_name":"Titanium Frame","quantity":1}]'::jsonb, '{"resource_name":"Servo Assembly","quantity":1}'::jsonb, 75, 20),
  ('fj_crystite_lattice', 'base_fusion_smelter', 'Crystite Lattice', 3, '[{"resource_name":"Crystite","quantity":2}]'::jsonb, '{"resource_name":"Crystite Lattice","quantity":1}'::jsonb, 60, 21),
  ('fj_uranium_pellet', 'base_fusion_smelter', 'Uranium Pellet', 3, '[{"resource_name":"Uranium","quantity":2},{"resource_name":"Cryo Coolant","quantity":1}]'::jsonb, '{"resource_name":"Uranium Pellet","quantity":1}'::jsonb, 70, 22),
  ('fj_he3_pellet', 'base_isotope_plant', 'He-3 Fuel Pellet', 3, '[{"resource_name":"Helium-3","quantity":2},{"resource_name":"Cryo Coolant","quantity":1}]'::jsonb, '{"resource_name":"He-3 Fuel Pellet","quantity":1}'::jsonb, 70, 23),
  ('fj_nanite_culture', 'base_spore_incubator', 'Nanite Culture', 3, '[{"resource_name":"Spores","quantity":1},{"resource_name":"Nutrient Gel","quantity":1}]'::jsonb, '{"resource_name":"Nanite Culture","quantity":1}'::jsonb, 80, 24),
  ('fj_energy_cell', 'base_crystal_lathe', 'Energy Cell', 3, '[{"resource_name":"Solar Crystals","quantity":2}]'::jsonb, '{"resource_name":"Energy Cell","quantity":1}'::jsonb, 60, 25),
  ('fj_lattice_processor', 'base_crystal_lathe', 'Lattice Processor', 3, '[{"resource_name":"Crystite Lattice","quantity":1},{"resource_name":"Printed Board","quantity":1}]'::jsonb, '{"resource_name":"Lattice Processor","quantity":1}'::jsonb, 90, 26),
  ('fj_hull_section', 'base_fabricator', 'Reinforced Hull Section', 3, '[{"resource_name":"Crystite Lattice","quantity":1},{"resource_name":"Titanium Frame","quantity":1}]'::jsonb, '{"resource_name":"Reinforced Hull Section","quantity":1}'::jsonb, 120, 27),
  ('fj_smart_actuator', 'base_fabricator', 'Smart Actuator', 3, '[{"resource_name":"Lattice Processor","quantity":1},{"resource_name":"Nanite Culture","quantity":1}]'::jsonb, '{"resource_name":"Smart Actuator","quantity":1}'::jsonb, 120, 28),
  ('fj_contained_plasma', 'base_plasma_containment', 'Contained Plasma', 4, '[{"resource_name":"Plasma","quantity":2},{"resource_name":"He-3 Fuel Pellet","quantity":1}]'::jsonb, '{"resource_name":"Contained Plasma","quantity":1}'::jsonb, 120, 29),
  ('fj_warheads', 'base_plasma_containment', 'Missile Warheads ×4', 4, '[{"resource_name":"Contained Plasma","quantity":1},{"resource_name":"Steel Plate","quantity":1}]'::jsonb, '{"item_id":"missile_warhead","quantity":4}'::jsonb, 90, 30),
  ('fj_precursor_plate', 'base_plasma_forge', 'Precursor Plate', 4, '[{"resource_name":"Ancient Alloy","quantity":1},{"resource_name":"Contained Plasma","quantity":1}]'::jsonb, '{"resource_name":"Precursor Plate","quantity":1}'::jsonb, 150, 31),
  ('fj_dense_alloy', 'base_plasma_forge', 'Dense Alloy', 4, '[{"resource_name":"Uranium Pellet","quantity":1},{"resource_name":"Titanium Ingot","quantity":2}]'::jsonb, '{"resource_name":"Dense Alloy","quantity":1}'::jsonb, 120, 32),
  ('fj_sealant_resin', 'base_resin_works', 'Sealant Resin', 4, '[{"resource_name":"Amber Sap","quantity":1},{"resource_name":"Nanite Culture","quantity":1}]'::jsonb, '{"resource_name":"Sealant Resin","quantity":1}'::jsonb, 120, 33),
  ('fj_dark_capacitor', 'base_capacitor_bank', 'Dark Capacitor', 4, '[{"resource_name":"Dark Matter","quantity":1},{"resource_name":"Energy Cell","quantity":2}]'::jsonb, '{"resource_name":"Dark Capacitor","quantity":1}'::jsonb, 180, 34),
  ('fj_precursor_frame', 'base_nano_assembler', 'Precursor Frame', 4, '[{"resource_name":"Precursor Plate","quantity":1},{"resource_name":"Sealant Resin","quantity":1}]'::jsonb, '{"resource_name":"Precursor Frame","quantity":1}'::jsonb, 200, 35),
  ('fj_field_core', 'base_nano_assembler', 'Field Core', 4, '[{"resource_name":"Dark Capacitor","quantity":1},{"resource_name":"Smart Actuator","quantity":1}]'::jsonb, '{"resource_name":"Field Core","quantity":1}'::jsonb, 240, 36),
  ('fj_void_alloy', 'base_void_foundry', 'Void-Tempered Alloy', 5, '[{"resource_name":"Void Essence","quantity":1},{"resource_name":"Precursor Plate","quantity":1}]'::jsonb, '{"resource_name":"Void-Tempered Alloy","quantity":1}'::jsonb, 300, 37),
  ('fj_quantum_matrix', 'base_quantum_condenser', 'Stable Quantum Matrix', 5, '[{"resource_name":"Quantum Dust","quantity":1},{"resource_name":"Contained Plasma","quantity":1}]'::jsonb, '{"resource_name":"Stable Quantum Matrix","quantity":1}'::jsonb, 300, 38),
  ('fj_quantum_board', 'base_quantum_condenser', 'Quantum Board', 5, '[{"resource_name":"Stable Quantum Matrix","quantity":1},{"resource_name":"Dark Capacitor","quantity":1}]'::jsonb, '{"resource_name":"Quantum Board","quantity":1}'::jsonb, 360, 39),
  ('fj_void_core', 'base_quantum_forge', 'Void Core', 5, '[{"resource_name":"Void-Tempered Alloy","quantity":1},{"resource_name":"Stable Quantum Matrix","quantity":1}]'::jsonb, '{"resource_name":"Void Core","quantity":1}'::jsonb, 480, 40)
ON CONFLICT (id) DO UPDATE SET station_module_id = EXCLUDED.station_module_id, name = EXCLUDED.name, tier = EXCLUDED.tier, inputs = EXCLUDED.inputs, output = EXCLUDED.output, seconds = EXCLUDED.seconds, sort_order = EXCLUDED.sort_order;

-- ---- Tier 2+ ship-module recipes: raw -> processed (2 raw = 1 processed), crafted at the tier's bench ----
CREATE TEMP TABLE fmap (raw TEXT PRIMARY KEY, processed TEXT);
INSERT INTO fmap VALUES ('Iron', 'Iron Ingot'), ('Copper', 'Copper Ingot'), ('Titanium', 'Titanium Ingot'), ('Crystite', 'Crystite Lattice'), ('Uranium', 'Uranium Pellet'), ('Hydrogen', 'Hydrogen Cell'), ('Helium-3', 'He-3 Fuel Pellet'), ('Plasma', 'Contained Plasma'), ('Nitrogen', 'Nitrate Compound'), ('Xenon', 'Xenon Propellant'), ('Biomass', 'Polymer'), ('Spores', 'Nanite Culture'), ('Coral', 'Ceramic Composite'), ('Amber Sap', 'Sealant Resin'), ('Solar Crystals', 'Energy Cell'), ('Dark Matter', 'Dark Capacitor'), ('Void Essence', 'Void-Tempered Alloy'), ('Ancient Alloy', 'Precursor Plate'), ('Quantum Dust', 'Stable Quantum Matrix');
DO $$
DECLARE r RECORD; ing JSONB; newing JSONB; pname TEXT; qty INTEGER; bench TEXT;
BEGIN
  FOR r IN
    SELECT cr.id, cr.ingredients, mt.tier
      FROM crafting_recipes cr JOIN module_types mt ON mt.id = cr.output_item_id
     WHERE mt.tier >= 2 AND mt.slot_type <> 'base' AND cr.station_required IS NULL
  LOOP
    newing := '[]'::jsonb;
    FOR ing IN SELECT jsonb_array_elements(r.ingredients) LOOP
      SELECT processed INTO pname FROM fmap WHERE raw = ing->>'resource_name';
      IF pname IS NULL THEN
        newing := newing || ing;
      ELSE
        qty := GREATEST(1, CEIL((ing->>'quantity')::numeric / 2));
        newing := newing || jsonb_build_object('resource_name', pname, 'quantity', qty);
      END IF;
    END LOOP;
    bench := CASE r.tier WHEN 2 THEN 'base_machine_shop' WHEN 3 THEN 'base_fabricator' WHEN 4 THEN 'base_nano_assembler' ELSE 'base_quantum_forge' END;
    UPDATE crafting_recipes SET ingredients = newing, station_required = bench WHERE id = r.id;
  END LOOP;
END $$;
DROP TABLE fmap;

-- ---- onboarding text: Homestead now points at the Foundry ----
UPDATE quest_definitions SET description = 'Claim a planet. Research Base Construction (Industry tree), train Command Center Upgrades I, dock at a planet and build a Framework from its Base tab. Your base has 4 plots: a Smelter is the first thing to build (Foundry Basics research) -- it is where ore becomes ingots.'
 WHERE id = 'tutorial_first_base';
-- Base modules that existed before 088 keep their raw recipes so onboarding is untouched.

