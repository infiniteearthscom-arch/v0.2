// game/foundryTree.js -- the base industry tree (Foundry, 2026-09-26).
//
// AUTHORING SOURCE. Migration 088 was generated from this file
// (scratch script gen-088.mjs); at runtime the server reads the DB
// (resource_types.tier/is_part, module_types.stats.foundry, foundry_recipes)
// so nothing here is imported by request handlers. If you change the
// tree, write a NEW migration -- don't edit 088 and don't expect a
// change here to reach production on its own.
//
// Shape (see docs/foundry-spec.md):
//   five station FAMILIES across (smelting, gas, bio, electronics,
//   assembly) x five TIERS up. Stations are base modules (slot_type
//   'base', stats.foundry = { family, tier }). Each station runs JOBS
//   (timed, queued) that turn raw resources or lower materials into
//   PROCESSED MATERIALS (resource_types, category 'processed') or items.
//   PARTS (is_part) build stations and base tiers and are craft-only;
//   everything else may also drop from wrecks.

export const FAMILIES = {
  smelting:    { name: 'Smelting',    color: '#f0883e' },
  gas:         { name: 'Gas Works',   color: '#38bdf8' },
  bio:         { name: 'Biolab',      color: '#4ade80' },
  electronics: { name: 'Electronics', color: '#a78bfa' },
  assembly:    { name: 'Assembly',    color: '#f5c542' },
  service:     { name: 'Services',    color: '#94a3b8' },
};

const RARITY_BY_TIER = { 1: 'common', 2: 'common', 3: 'rare', 4: 'exotic', 5: 'exotic' };

// name, tier, family, base_price, part?, description
export const MATERIALS = [
  ['Iron Ingot', 1, 'smelting', 22, false, 'Smelted iron. The first thing a base makes.'],
  ['Copper Ingot', 1, 'smelting', 32, false, 'Smelted copper for wiring and circuits.'],
  ['Hydrogen Cell', 1, 'gas', 26, false, 'Compressed hydrogen. Reducing agent and fuel stock.'],
  ['Nitrate Compound', 1, 'gas', 26, false, 'Fixed nitrogen for chemistry and ceramics.'],
  ['Polymer', 1, 'bio', 55, false, 'Bioplastic spun from biomass.'],
  ['Nutrient Gel', 1, 'bio', 50, false, 'Growth medium for cultures.'],
  ['Basic Circuit', 1, 'electronics', 90, false, 'Copper traces on a polymer board.'],
  ['Structural Frame', 1, 'assembly', 80, true, 'Iron and copper framing. Builds T2 stations and the Outpost.'],
  ['Control Unit', 1, 'assembly', 140, true, 'A circuit in an iron housing. Builds T2 stations and the Outpost.'],

  ['Titanium Ingot', 2, 'smelting', 55, false, 'Arc-smelted titanium.'],
  ['Steel Plate', 2, 'smelting', 75, false, 'Hydrogen-reduced iron, rolled to plate.'],
  ['Xenon Propellant', 2, 'gas', 75, false, 'Cryo-separated xenon for ion drives.'],
  ['Cryo Coolant', 2, 'gas', 60, false, 'Liquid nitrogen coolant for fusion-grade machinery.'],
  ['Ceramic Composite', 2, 'bio', 90, false, 'Kiln-fired coral ceramic.'],
  ['Printed Board', 2, 'electronics', 220, false, 'Multilayer board on a ceramic substrate.'],
  ['Titanium Frame', 2, 'assembly', 200, true, 'Titanium and steel framing. Builds T3 stations and the Station tier.'],
  ['Servo Assembly', 2, 'assembly', 450, true, 'Actuated frame with a printed board. Builds T3 stations and the Station tier.'],

  ['Crystite Lattice', 3, 'smelting', 160, false, 'Fusion-grown crystite lattice.'],
  ['Uranium Pellet', 3, 'smelting', 300, false, 'Enriched uranium, cooled and sintered.'],
  ['He-3 Fuel Pellet', 3, 'gas', 240, false, 'Helium-3 fusion fuel.'],
  ['Nanite Culture', 3, 'bio', 260, false, 'A living nanite colony in nutrient gel.'],
  ['Energy Cell', 3, 'electronics', 210, false, 'Solar-crystal storage cell.'],
  ['Lattice Processor', 3, 'electronics', 420, false, 'Crystite logic on a printed board.'],
  ['Reinforced Hull Section', 3, 'assembly', 500, true, 'Lattice-braced titanium hull section. Builds T4 stations and the Hub.'],
  ['Smart Actuator', 3, 'assembly', 760, true, 'A lattice processor driving nanite muscle. Builds T4 stations and the Hub.'],

  ['Contained Plasma', 4, 'gas', 400, false, 'Plasma held in a helium-3 bottle.'],
  ['Precursor Plate', 4, 'smelting', 1300, false, 'Ancient Alloy re-forged in plasma.'],
  ['Dense Alloy', 4, 'smelting', 450, false, 'Uranium-doped titanium.'],
  ['Sealant Resin', 4, 'bio', 420, false, 'Amber sap cured by nanites.'],
  ['Dark Capacitor', 4, 'electronics', 1500, false, 'Dark matter in an energy-cell cage.'],
  ['Precursor Frame', 4, 'assembly', 2000, true, 'Precursor plate bonded with resin. Builds T5 stations and the Citadel.'],
  ['Field Core', 4, 'assembly', 2600, true, 'A dark capacitor on a smart actuator. Builds T5 stations and the Citadel.'],

  ['Void-Tempered Alloy', 5, 'smelting', 3000, false, 'Precursor plate quenched in void essence.'],
  ['Stable Quantum Matrix', 5, 'gas', 1700, false, 'Quantum dust stabilised in contained plasma.'],
  ['Quantum Board', 5, 'electronics', 3400, false, 'A quantum matrix wired through a dark capacitor.'],
  ['Void Core', 5, 'assembly', 5200, true, 'Void alloy around a quantum matrix. The top of the tree.'],
];

export const materialRows = () => MATERIALS.map(([name, tier, family, price, part, desc]) => ({
  name, tier, family, base_price: price, is_part: part, rarity: RARITY_BY_TIER[tier], description: desc,
}));

// Research gates per station tier (Industry tree).
export const TECH = {
  1: 'tech_foundry_1', 2: 'tech_foundry_2', 3: 'tech_foundry_3', 4: 'tech_foundry_4', 5: 'tech_foundry_5',
};
export const TECH_ROWS = [
  ['tech_foundry_1', 2, 'Foundry Basics', 'Tier 1 base industry: Smelter, Condenser, Bioreactor, Circuit Printer, Workbench. Raw ore, gas and biomass become ingots, cells, polymer and circuits.', 500, ['tech_base_construction'], 219],
  ['tech_foundry_2', 3, 'Industrial Works', 'Tier 2 stations: Arc Smelter, Cryo Separator, Coral Kiln, Circuit Etcher, Machine Shop. Tier 2 ship modules are assembled at the Machine Shop.', 1500, ['tech_foundry_1'], 220],
  ['tech_foundry_3', 3, 'Fusion Industry', 'Tier 3 stations: Fusion Smelter, Isotope Plant, Spore Incubator, Crystal Lathe, Fabricator. Rares become lattices, pellets, cultures and processors.', 3200, ['tech_foundry_2'], 221],
  ['tech_foundry_4', 4, 'Plasma Industry', 'Tier 4 stations: Plasma Containment, Plasma Forge, Resin Works, Capacitor Bank, Nano-Assembler. The first exotics enter the tree.', 7000, ['tech_foundry_3'], 222],
  ['tech_foundry_5', 4, 'Void Industry', 'Tier 5 stations: Void Foundry, Quantum Condenser, Quantum Forge. Void Cores and tier 5 modules.', 16000, ['tech_foundry_4'], 223],
  ['tech_base_citadel', 4, 'Citadel Engineering', 'Upgrade bases to Hub and Citadel tiers (16 and 20 plots).', 9000, ['tech_base_expansion'], 224],
];

const R = (name, quantity) => ({ resource_name: name, quantity });
const I = (item_id, quantity) => ({ item_id, quantity });

// Stations. build = crafting_recipes ingredients for the station MODULE
// (crafted in the Crafting window from cargo; parts come from benches).
// jobs = foundry_recipes rows (timed, queued at the station).
export const STATIONS = [
  // ---------- T1 ----------
  { id: 'base_smelter', name: 'Smelter', family: 'smelting', tier: 1, gate: true,
    desc: 'Smelts iron and copper ore into ingots. Built from raw cargo -- the first station of every base.',
    build: [R('Iron', 40), R('Copper', 20), R('Hydrogen', 10)],
    jobs: [
      { id: 'fj_iron_ingot', name: 'Iron Ingot', inputs: [R('Iron', 2)], output: R('Iron Ingot', 1), seconds: 20 },
      { id: 'fj_copper_ingot', name: 'Copper Ingot', inputs: [R('Copper', 2)], output: R('Copper Ingot', 1), seconds: 20 },
    ] },
  { id: 'base_condenser', name: 'Condenser', family: 'gas', tier: 1,
    desc: 'Compresses hydrogen and fixes nitrogen. Also presses Fuel Cells, cheaper than the vendor.',
    build: [R('Iron Ingot', 6), R('Copper Ingot', 4), R('Nitrogen', 20)],
    jobs: [
      { id: 'fj_hydrogen_cell', name: 'Hydrogen Cell', inputs: [R('Hydrogen', 3)], output: R('Hydrogen Cell', 1), seconds: 20 },
      { id: 'fj_nitrate', name: 'Nitrate Compound', inputs: [R('Nitrogen', 2)], output: R('Nitrate Compound', 1), seconds: 20 },
      { id: 'fj_fuel_cell', name: 'Fuel Cell', inputs: [R('Hydrogen Cell', 2)], output: I('fuel_cell', 1), seconds: 30 },
    ] },
  { id: 'base_bioreactor', name: 'Bioreactor', family: 'bio', tier: 1,
    desc: 'Spins biomass into polymer and nutrient gel.',
    build: [R('Iron Ingot', 6), R('Hydrogen Cell', 4), R('Biomass', 30)],
    jobs: [
      { id: 'fj_polymer', name: 'Polymer', inputs: [R('Biomass', 3)], output: R('Polymer', 1), seconds: 25 },
      { id: 'fj_nutrient_gel', name: 'Nutrient Gel', inputs: [R('Biomass', 2), R('Nitrate Compound', 1)], output: R('Nutrient Gel', 1), seconds: 25 },
    ] },
  { id: 'base_circuit_printer', name: 'Circuit Printer', family: 'electronics', tier: 1,
    desc: 'Prints copper traces on polymer. Also builds Scanner Probes.',
    build: [R('Copper Ingot', 8), R('Polymer', 6), R('Nitrate Compound', 4)],
    jobs: [
      { id: 'fj_basic_circuit', name: 'Basic Circuit', inputs: [R('Copper Ingot', 1), R('Polymer', 1)], output: R('Basic Circuit', 1), seconds: 30 },
      { id: 'fj_scanner_probe', name: 'Scanner Probe', inputs: [R('Basic Circuit', 1), R('Polymer', 1)], output: I('scanner_probe', 1), seconds: 30 },
    ] },
  { id: 'base_workbench', name: 'Workbench', family: 'assembly', tier: 1,
    desc: 'Assembles Structural Frames and Control Units -- the parts every T2 station and the Outpost are built from. Also builds harvesters.',
    build: [R('Iron Ingot', 10), R('Basic Circuit', 4), R('Polymer', 6)],
    jobs: [
      { id: 'fj_structural_frame', name: 'Structural Frame', inputs: [R('Iron Ingot', 2), R('Copper Ingot', 1)], output: R('Structural Frame', 1), seconds: 40 },
      { id: 'fj_control_unit', name: 'Control Unit', inputs: [R('Basic Circuit', 1), R('Iron Ingot', 1)], output: R('Control Unit', 1), seconds: 40 },
      { id: 'fj_basic_harvester', name: 'Basic Harvester', inputs: [R('Structural Frame', 1), R('Control Unit', 1)], output: I('basic_harvester', 1), seconds: 60 },
    ] },

  // ---------- T2 ----------
  { id: 'base_arc_smelter', name: 'Arc Smelter', family: 'smelting', tier: 2, gate: true,
    desc: 'Arc-smelts titanium and rolls steel plate.',
    build: [R('Structural Frame', 4), R('Basic Circuit', 4), R('Polymer', 8), R('Nitrate Compound', 6)],
    jobs: [
      { id: 'fj_titanium_ingot', name: 'Titanium Ingot', inputs: [R('Titanium', 2)], output: R('Titanium Ingot', 1), seconds: 30 },
      { id: 'fj_steel_plate', name: 'Steel Plate', inputs: [R('Iron Ingot', 2), R('Hydrogen Cell', 1)], output: R('Steel Plate', 1), seconds: 35 },
    ] },
  { id: 'base_cryo_separator', name: 'Cryo Separator', family: 'gas', tier: 2,
    desc: 'Separates xenon propellant and makes cryo coolant.',
    build: [R('Titanium Ingot', 6), R('Control Unit', 2), R('Polymer', 6)],
    jobs: [
      { id: 'fj_xenon_propellant', name: 'Xenon Propellant', inputs: [R('Xenon', 2)], output: R('Xenon Propellant', 1), seconds: 30 },
      { id: 'fj_cryo_coolant', name: 'Cryo Coolant', inputs: [R('Nitrogen', 2), R('Hydrogen Cell', 1)], output: R('Cryo Coolant', 1), seconds: 30 },
    ] },
  { id: 'base_coral_kiln', name: 'Coral Kiln', family: 'bio', tier: 2,
    desc: 'Fires coral into ceramic composite.',
    build: [R('Steel Plate', 4), R('Cryo Coolant', 3), R('Basic Circuit', 3)],
    jobs: [
      { id: 'fj_ceramic', name: 'Ceramic Composite', inputs: [R('Coral', 2), R('Nitrate Compound', 1)], output: R('Ceramic Composite', 1), seconds: 35 },
    ] },
  { id: 'base_circuit_etcher', name: 'Circuit Etcher', family: 'electronics', tier: 2,
    desc: 'Etches multilayer printed boards. Also builds Advanced Scanner Probes.',
    build: [R('Control Unit', 2), R('Cryo Coolant', 3), R('Ceramic Composite', 4)],
    jobs: [
      { id: 'fj_printed_board', name: 'Printed Board', inputs: [R('Basic Circuit', 1), R('Ceramic Composite', 1), R('Titanium Ingot', 1)], output: R('Printed Board', 1), seconds: 45 },
      { id: 'fj_adv_probe', name: 'Advanced Scanner Probe', inputs: [R('Printed Board', 1), R('Polymer', 1)], output: I('advanced_scanner_probe', 1), seconds: 45 },
    ] },
  { id: 'base_machine_shop', name: 'Machine Shop', family: 'assembly', tier: 2, bench: true,
    desc: 'Assembles Titanium Frames and Servo Assemblies. Tier 2 ship modules are crafted here.',
    build: [R('Structural Frame', 4), R('Steel Plate', 6), R('Printed Board', 3), R('Xenon Propellant', 3)],
    jobs: [
      { id: 'fj_titanium_frame', name: 'Titanium Frame', inputs: [R('Titanium Ingot', 2), R('Steel Plate', 1)], output: R('Titanium Frame', 1), seconds: 60 },
      { id: 'fj_servo_assembly', name: 'Servo Assembly', inputs: [R('Printed Board', 1), R('Titanium Frame', 1)], output: R('Servo Assembly', 1), seconds: 75 },
    ] },

  // ---------- T3 ----------
  { id: 'base_fusion_smelter', name: 'Fusion Smelter', family: 'smelting', tier: 3, gate: true,
    desc: 'Grows crystite lattice and sinters uranium pellets.',
    build: [R('Titanium Frame', 3), R('Servo Assembly', 2), R('Cryo Coolant', 6), R('Ceramic Composite', 6)],
    jobs: [
      { id: 'fj_crystite_lattice', name: 'Crystite Lattice', inputs: [R('Crystite', 2)], output: R('Crystite Lattice', 1), seconds: 60 },
      { id: 'fj_uranium_pellet', name: 'Uranium Pellet', inputs: [R('Uranium', 2), R('Cryo Coolant', 1)], output: R('Uranium Pellet', 1), seconds: 70 },
    ] },
  { id: 'base_isotope_plant', name: 'Isotope Plant', family: 'gas', tier: 3,
    desc: 'Presses helium-3 into fusion fuel pellets.',
    build: [R('Crystite Lattice', 4), R('Uranium Pellet', 2), R('Titanium Frame', 2), R('Printed Board', 3)],
    jobs: [
      { id: 'fj_he3_pellet', name: 'He-3 Fuel Pellet', inputs: [R('Helium-3', 2), R('Cryo Coolant', 1)], output: R('He-3 Fuel Pellet', 1), seconds: 70 },
    ] },
  { id: 'base_spore_incubator', name: 'Spore Incubator', family: 'bio', tier: 3,
    desc: 'Cultures nanites from alien spores.',
    build: [R('Ceramic Composite', 6), R('Crystite Lattice', 3), R('Servo Assembly', 2), R('He-3 Fuel Pellet', 2)],
    jobs: [
      { id: 'fj_nanite_culture', name: 'Nanite Culture', inputs: [R('Spores', 1), R('Nutrient Gel', 1)], output: R('Nanite Culture', 1), seconds: 80 },
    ] },
  { id: 'base_crystal_lathe', name: 'Crystal Lathe', family: 'electronics', tier: 3,
    desc: 'Cuts energy cells and lattice processors.',
    build: [R('Crystite Lattice', 4), R('He-3 Fuel Pellet', 2), R('Servo Assembly', 2), R('Nanite Culture', 2)],
    jobs: [
      { id: 'fj_energy_cell', name: 'Energy Cell', inputs: [R('Solar Crystals', 2)], output: R('Energy Cell', 1), seconds: 60 },
      { id: 'fj_lattice_processor', name: 'Lattice Processor', inputs: [R('Crystite Lattice', 1), R('Printed Board', 1)], output: R('Lattice Processor', 1), seconds: 90 },
    ] },
  { id: 'base_fabricator', name: 'Fabricator', family: 'assembly', tier: 3, bench: true,
    desc: 'Assembles Reinforced Hull Sections and Smart Actuators. Tier 3 ship modules are crafted here.',
    build: [R('Titanium Frame', 4), R('Lattice Processor', 3), R('Energy Cell', 4), R('Nanite Culture', 3)],
    jobs: [
      { id: 'fj_hull_section', name: 'Reinforced Hull Section', inputs: [R('Crystite Lattice', 1), R('Titanium Frame', 1)], output: R('Reinforced Hull Section', 1), seconds: 120 },
      { id: 'fj_smart_actuator', name: 'Smart Actuator', inputs: [R('Lattice Processor', 1), R('Nanite Culture', 1)], output: R('Smart Actuator', 1), seconds: 120 },
    ] },

  // ---------- T4 ----------
  { id: 'base_plasma_containment', name: 'Plasma Containment', family: 'gas', tier: 4, gate: true,
    desc: 'Bottles plasma in helium-3 fields. Also builds Missile Warheads.',
    build: [R('Smart Actuator', 2), R('Reinforced Hull Section', 2), R('He-3 Fuel Pellet', 6), R('Energy Cell', 6)],
    jobs: [
      { id: 'fj_contained_plasma', name: 'Contained Plasma', inputs: [R('Plasma', 2), R('He-3 Fuel Pellet', 1)], output: R('Contained Plasma', 1), seconds: 120 },
      { id: 'fj_warheads', name: 'Missile Warheads ×4', inputs: [R('Contained Plasma', 1), R('Steel Plate', 1)], output: I('missile_warhead', 4), seconds: 90 },
    ] },
  { id: 'base_plasma_forge', name: 'Plasma Forge', family: 'smelting', tier: 4,
    desc: 'Re-forges Ancient Alloy into precursor plate and dopes titanium into dense alloy.',
    build: [R('Contained Plasma', 4), R('Reinforced Hull Section', 2), R('Lattice Processor', 3), R('Uranium Pellet', 4)],
    jobs: [
      { id: 'fj_precursor_plate', name: 'Precursor Plate', inputs: [R('Ancient Alloy', 1), R('Contained Plasma', 1)], output: R('Precursor Plate', 1), seconds: 150 },
      { id: 'fj_dense_alloy', name: 'Dense Alloy', inputs: [R('Uranium Pellet', 1), R('Titanium Ingot', 2)], output: R('Dense Alloy', 1), seconds: 120 },
    ] },
  { id: 'base_resin_works', name: 'Resin Works', family: 'bio', tier: 4,
    desc: 'Cures amber sap into sealant resin with nanites.',
    build: [R('Dense Alloy', 4), R('Smart Actuator', 2), R('Nutrient Gel', 8)],
    jobs: [
      { id: 'fj_sealant_resin', name: 'Sealant Resin', inputs: [R('Amber Sap', 1), R('Nanite Culture', 1)], output: R('Sealant Resin', 1), seconds: 120 },
    ] },
  { id: 'base_capacitor_bank', name: 'Capacitor Bank', family: 'electronics', tier: 4,
    desc: 'Cages dark matter in energy cells.',
    build: [R('Precursor Plate', 2), R('Lattice Processor', 3), R('Sealant Resin', 3)],
    jobs: [
      { id: 'fj_dark_capacitor', name: 'Dark Capacitor', inputs: [R('Dark Matter', 1), R('Energy Cell', 2)], output: R('Dark Capacitor', 1), seconds: 180 },
    ] },
  { id: 'base_nano_assembler', name: 'Nano-Assembler', family: 'assembly', tier: 4, bench: true,
    desc: 'Assembles Precursor Frames and Field Cores. Tier 4 ship modules are crafted here.',
    build: [R('Precursor Plate', 3), R('Dark Capacitor', 2), R('Smart Actuator', 3), R('Sealant Resin', 3)],
    jobs: [
      { id: 'fj_precursor_frame', name: 'Precursor Frame', inputs: [R('Precursor Plate', 1), R('Sealant Resin', 1)], output: R('Precursor Frame', 1), seconds: 200 },
      { id: 'fj_field_core', name: 'Field Core', inputs: [R('Dark Capacitor', 1), R('Smart Actuator', 1)], output: R('Field Core', 1), seconds: 240 },
    ] },

  // ---------- T5 ----------
  { id: 'base_void_foundry', name: 'Void Foundry', family: 'smelting', tier: 5, gate: true,
    desc: 'Quenches precursor plate in void essence.',
    build: [R('Precursor Frame', 2), R('Field Core', 2), R('Contained Plasma', 6), R('Dark Capacitor', 3)],
    jobs: [
      { id: 'fj_void_alloy', name: 'Void-Tempered Alloy', inputs: [R('Void Essence', 1), R('Precursor Plate', 1)], output: R('Void-Tempered Alloy', 1), seconds: 300 },
    ] },
  { id: 'base_quantum_condenser', name: 'Quantum Condenser', family: 'gas', tier: 5,
    desc: 'Stabilises quantum dust and wires quantum boards.',
    build: [R('Void-Tempered Alloy', 3), R('Field Core', 2), R('Dark Capacitor', 3)],
    jobs: [
      { id: 'fj_quantum_matrix', name: 'Stable Quantum Matrix', inputs: [R('Quantum Dust', 1), R('Contained Plasma', 1)], output: R('Stable Quantum Matrix', 1), seconds: 300 },
      { id: 'fj_quantum_board', name: 'Quantum Board', inputs: [R('Stable Quantum Matrix', 1), R('Dark Capacitor', 1)], output: R('Quantum Board', 1), seconds: 360 },
    ] },
  { id: 'base_quantum_forge', name: 'Quantum Forge', family: 'assembly', tier: 5, bench: true,
    desc: 'Assembles Void Cores. Tier 5 ship modules are crafted here.',
    build: [R('Void-Tempered Alloy', 3), R('Quantum Board', 2), R('Precursor Frame', 2), R('Sealant Resin', 4)],
    jobs: [
      { id: 'fj_void_core', name: 'Void Core', inputs: [R('Void-Tempered Alloy', 1), R('Stable Quantum Matrix', 1)], output: R('Void Core', 1), seconds: 480 },
    ] },
];

// Service buildings that share the grid (not foundry stations).
export const SERVICES = [
  { id: 'base_repair_shop', name: 'Repair Shop', family: 'service', tier: 2, tech: 'tech_foundry_1',
    desc: 'Repair your fleet at this base at 25% off station rates.',
    stats: { repair_shop: true, repair_discount_pct: 25 },
    build: [R('Steel Plate', 6), R('Control Unit', 2), R('Polymer', 6)] },
];

// Bench per module tier (ship-module recipes of that tier require it).
export const BENCH_BY_TIER = { 2: 'base_machine_shop', 3: 'base_fabricator', 4: 'base_nano_assembler', 5: 'base_quantum_forge' };

// Raw -> processed for the T2+ ship-module recipe rewrite (2 raw = 1 processed).
export const RAW_TO_PROCESSED = {
  'Iron': 'Iron Ingot', 'Copper': 'Copper Ingot', 'Titanium': 'Titanium Ingot', 'Crystite': 'Crystite Lattice',
  'Uranium': 'Uranium Pellet', 'Hydrogen': 'Hydrogen Cell', 'Helium-3': 'He-3 Fuel Pellet', 'Plasma': 'Contained Plasma',
  'Nitrogen': 'Nitrate Compound', 'Xenon': 'Xenon Propellant', 'Biomass': 'Polymer', 'Spores': 'Nanite Culture',
  'Coral': 'Ceramic Composite', 'Amber Sap': 'Sealant Resin', 'Solar Crystals': 'Energy Cell', 'Dark Matter': 'Dark Capacitor',
  'Void Essence': 'Void-Tempered Alloy', 'Ancient Alloy': 'Precursor Plate', 'Quantum Dust': 'Stable Quantum Matrix',
};

// Base tiers: plots (4 per area, one area per tier) and upgrade costs in parts.
export const BASE_TIERS = {
  1: { name: 'Framework', slots: 4,  build_minutes: 10,  credits: 5000,   resources: { Iron: 200, Titanium: 100, Copper: 50 }, tech: 'tech_base_construction' },
  2: { name: 'Outpost',   slots: 8,  build_minutes: 45,  credits: 20000,  resources: { 'Structural Frame': 6, 'Control Unit': 4, Polymer: 20 }, tech: 'tech_base_expansion' },
  3: { name: 'Station',   slots: 12, build_minutes: 180, credits: 80000,  resources: { 'Titanium Frame': 6, 'Servo Assembly': 4, 'Steel Plate': 20 }, tech: 'tech_base_expansion' },
  4: { name: 'Hub',       slots: 16, build_minutes: 360, credits: 250000, resources: { 'Reinforced Hull Section': 6, 'Smart Actuator': 4, 'Energy Cell': 20 }, tech: 'tech_base_citadel' },
  5: { name: 'Citadel',   slots: 20, build_minutes: 720, credits: 800000, resources: { 'Precursor Frame': 6, 'Field Core': 4, 'Dense Alloy': 20 }, tech: 'tech_base_citadel' },
};
export const PLOTS_PER_AREA = 4;
