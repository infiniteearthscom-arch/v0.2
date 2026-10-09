-- 106: description pass over every craftable item (owner 2026-10-09: "several
-- of the items have descriptions that either don't tell you anything about
-- what the item actually does, or are too vague ... without too many lines").
--
-- The Crafting window shows item_definitions.description; the Vendor rows
-- and the fit tooltip show module_types.description. Both are set to the
-- same text for modules. Rules: say what it DOES in one or two sentences,
-- with the number that matters; damage type / layer rule for weapons and
-- defenses; no research names (the lock badge already carries those).
-- Numbers are base values at quality 50. Legacy (untuned) modules describe
-- behaviour, not numbers, since the engine uses type defaults for them.

CREATE OR REPLACE FUNCTION _desc106(_id TEXT, _d TEXT) RETURNS VOID AS $$
BEGIN
  UPDATE item_definitions SET description = _d WHERE id = _id;
  UPDATE module_types     SET description = _d WHERE id = _id;
END $$ LANGUAGE plpgsql;

-- ---- consumables / tools ----
SELECT _desc106('scanner_probe',          'Spent by an Orbital Scan. Reveals which resources a planet holds and roughly how much. Vendor stock, or printed at a Circuit Printer.');
SELECT _desc106('advanced_scanner_probe', 'Spent by a Ground Scan. Pins a planet''s deposits with their grades so you can mine them or drop harvesters on them.');
SELECT _desc106('fuel_cell',              'Six hours of running time for one deployed harvester. Drag it onto the harvester in the planet''s Auto tab.');
SELECT _desc106('missile_warhead',        'One round for a missile launcher. Launchers reload from your cargo six at a time, so carry a stack.');
SELECT _desc106('basic_harvester',        'Unattended planet miner: 30 units/hr into a 200-unit hopper. Needs a deposit assigned and Fuel Cells to run; collect from the Auto tab.');
SELECT _desc106('advanced_harvester',     'Unattended planet miner: 50 units/hr into a 500-unit hopper. Needs a deposit and Fuel Cells.');
SELECT _desc106('industrial_harvester',   'Unattended planet miner: 100 units/hr into a 1000-unit hopper. Needs a deposit and Fuel Cells.');

-- ---- weapons (damage triangle: laser > armor, kinetic > shields, missiles > hull) ----
SELECT _desc106('weapon_laser',         'Small energy turret. Laser damage: strong against armor, weak against shields. Draws capacitor per shot.');
SELECT _desc106('weapon_laser_2',       'Small energy turret that cycles faster and reaches further than the Pulse Laser. Laser: strong against armor. Draws capacitor.');
SELECT _desc106('weapon_cannon',        'Small projectile turret. Kinetic damage: strong against shields, weak against armor. Costs no capacitor.');
SELECT _desc106('weapon_cannon_1',      'Cheap small projectile turret with a quick cycle. Kinetic: strong against shields. Costs no capacitor.');
SELECT _desc106('weapon_missile_basic', 'Small missile launcher. Fires only at a locked target and loads Missile Warheads, six per magazine. Explosive damage goes for the hull.');
SELECT _desc106('weapon_beam_3',        'Medium energy turret: longer optimal range than small turrets, slower tracking. Laser: strong against armor. Draws capacitor.');
SELECT _desc106('weapon_railgun_3',     'Medium hybrid turret. Kinetic: strong against shields. Light capacitor cost per shot.');
SELECT _desc106('weapon_beam_4',        'Large energy turret. Heavy laser hits at range with poor tracking against small ships. Strong against armor; joins Alpha Volley.');
SELECT _desc106('weapon_coil_4',        'Large hybrid turret. Heavy kinetic rounds, slow tracking. Strong against shields; joins Alpha Volley.');
SELECT _desc106('weapon_torpedo_4',     'Large missile launcher with the longest reach of any weapon. Needs a lock; six warheads per magazine. Explosive: strong against hull.');
SELECT _desc106('weapon_lance_5',       'Large energy turret at the top of the laser ladder. Strong against armor. Draws capacitor.');
SELECT _desc106('weapon_driver_5',      'Large projectile turret at the top of the kinetic ladder. Strong against shields. Costs no capacitor.');

-- ---- defenses (shield slot: shield OR armor) ----
SELECT _desc106('shield_basic',     'Shield generator. Adds to the fleet''s shield pool: the first layer hit, and the only one that recharges on its own. Weak to kinetics.');
SELECT _desc106('shield_barrier_2', 'Shield generator: +65 to the fleet''s shield pool. Shields take hits first and recharge on their own. Weak to kinetics.');
SELECT _desc106('shield_solar_3',   'Shield generator: +95 to the fleet''s shield pool. Weak to kinetics.');
SELECT _desc106('shield_void_5',    'Shield generator: +160 to the fleet''s shield pool, the strongest made. Weak to kinetics.');
SELECT _desc106('armor_plate_1',    'Armor plate (fits the shield slot): +30 to the fleet''s armor pool. Armor sits under shields and only repairs at a station or by Armor Repairer. Weak to lasers.');
SELECT _desc106('armor_plate_2',    'Armor plate (fits the shield slot): +50 armor. Repairs only at a station or by Armor Repairer. Weak to lasers.');
SELECT _desc106('armor_alloy_4',    'Armor plate (fits the shield slot): +90 armor. Weak to lasers.');
SELECT _desc106('armor_ancient_5',  'Armor plate (fits the shield slot): +140 armor, the thickest made. Weak to lasers.');

-- ---- engines (fleet flies at its slowest ship) ----
SELECT _desc106('engine_basic',    'Baseline thruster: the hull''s own speed, no bonus. Every ship needs an engine to fly.');
SELECT _desc106('engine_advanced', 'Ion drive: +30 top speed. The fleet moves at its slowest ship, so upgrade every hull.');
SELECT _desc106('engine_plasma_3', 'Plasma drive: +50 top speed.');
SELECT _desc106('engine_helion_4', 'Helium-3 torch drive: +75 top speed.');
SELECT _desc106('engine_void_5',   'Dark-matter displacement drive: +110 top speed, the fastest made.');

-- ---- reactors (the fleet capacitor) ----
SELECT _desc106('reactor_basic',         'Reactor: +60 capacitor, recharging 2.0/s. Energy and hybrid turrets, boosters, repairers and Overheat all draw from the capacitor.');
SELECT _desc106('reactor_advanced',      'Reactor: +110 capacitor, recharging 3.2/s.');
SELECT _desc106('reactor_helium_3',      'Helium-3 reactor: +190 capacitor, recharging 5.4/s.');
SELECT _desc106('reactor_singularity_5', 'Contained singularity: +330 capacitor, recharging 9.6/s, the largest made.');

-- ---- cargo ----
SELECT _desc106('cargo_basic',   'Cargo pod: +100 units of hold. Cargo is pooled across the whole fleet.');
SELECT _desc106('cargo_large',   'Reinforced hold: +250 units of fleet cargo.');
SELECT _desc106('cargo_large_2', 'Bulk cargo bay: +500 units of fleet cargo, the largest made.');

-- ---- mining ----
SELECT _desc106('mining_basic',   'Mining laser: 3 units every 2 s from a scanned asteroid within 120 units. Each fitted laser mines its own rock at once.');
SELECT _desc106('mining_laser_2', 'Mining laser: 6 units every 2 s, reach 150.');
SELECT _desc106('mining_laser_3', 'Resonance mining laser: 11 units every 1.6 s, reach 170.');
SELECT _desc106('mining_auto_5',  'Autonomous mining array: 24 units every 1.4 s, reach 220, and it puts every idle laser in the fleet onto the nearest scanned rock by itself.');

-- ---- utility ----
SELECT _desc106('utility_scanner',            'Sensor suite: lets you scan asteroids and planets and shows enemies out to 500 units. No scans without one somewhere in the fleet.');
SELECT _desc106('utility_scanner_adv',        'Sensor suite: sees enemies out to 900 units and scans an asteroid in 4 s.');
SELECT _desc106('utility_scanner_area',       'Sensor suite: 700 sensor range, plus a hotbar Area Scan that surveys every rock in scan range at once.');
SELECT _desc106('utility_scanner_elite',      'Sensor suite: 1400 sensor range, 2.5 s scans, Area Scan, and a Bulk Belt scan that surveys the whole belt.');
SELECT _desc106('utility_systemscan',         'Hotbar Sweep: a 12 s ping, then every hostile in the system is shown for 30 s. 120 s cooldown.');
SELECT _desc106('utility_autopilot',          'Flight computer from the starter kit. Fills a utility slot; it adds no bonus of its own today.');
SELECT _desc106('utility_ast_telemetry',      'Lists the asteroids you have scanned in the System Map''s Bodies panel, with quality and distance, so you can fly to them by click.');
SELECT _desc106('utility_ast_telemetry_deep', 'Lists every asteroid inside sensor range in the System Map, scanned or not, with minerals for the scanned ones.');
SELECT _desc106('utility_ast_telemetry_grid', 'Lists every asteroid in the whole system in the System Map, with a mineral filter.');
SELECT _desc106('utility_auto_survey',        'Sensor suite (1000 range, 3 s scans) that area-scans any unscanned rocks in range by itself, every second, while you mine.');
SELECT _desc106('utility_orbit_lock',         'Hotbar ability: hold the fleet beside the nearest planet, moon or station (within 400 units) and ride its orbit. Any thrust releases it.');
SELECT _desc106('utility_probe_launcher',     'Probes cosmic signatures from the Signals window. Three 20 s probe cycles pin a site so you can fly there and investigate it.');
SELECT _desc106('utility_warp_core_3',        'Lets the whole active fleet enter galaxy flight from a Warp Point. Without one somewhere in the fleet you travel by jump gate only.');
SELECT _desc106('utility_shield_booster_2',   'Hotbar toggle: +60 shield every 3 s for 24 capacitor while running. Stops when the capacitor cannot pay.');
SELECT _desc106('utility_shield_booster_4',   'Hotbar toggle: +180 shield every 3 s for 50 capacitor. Three times the Shield Booster.');
SELECT _desc106('utility_armor_repairer_2',   'Hotbar toggle: +40 armor every 4 s for 20 capacitor while running. The only field repair for armor.');
SELECT _desc106('utility_armor_repairer_4',   'Hotbar toggle: +120 armor every 4 s for 42 capacitor. Three times the Armor Repairer.');

-- ---- base modules (fit to a base plot; built from the base console) ----
SELECT _desc106('base_cargo_depot',   'Base storage: 1500 units. Crafting, refining, building and upgrades at this base all draw from it; drag stacks in from the fleet hold.');
SELECT _desc106('base_research_lab',  'Passive research: +0.5 research points per minute while fitted.');
SELECT _desc106('base_refinery',      'Refining lane: turns an ore stack into fewer units at higher quality, on a timer. Up to three lanes at Station tier; better crafted quality means faster, higher-yield lanes.');
SELECT _desc106('base_repair_shop',   'Repair the fleet''s hull and armor at this base, 25% cheaper than a station.');
SELECT _desc106('base_fuel_refinery', 'Runs by itself: feed its hopper Hydrogen, Hydrogen Cells, Xenon or Helium-3 and it presses Fuel Cells into the depot.');
SELECT _desc106('base_smelter',            'Tier 1 smelting station. Smelts iron and copper ore into ingots; the first station of every base.');
SELECT _desc106('base_condenser',          'Tier 1 gas station. Compresses hydrogen and fixes nitrogen; also presses Fuel Cells cheaper than the vendor.');
SELECT _desc106('base_bioreactor',         'Tier 1 bio station. Spins biomass into Polymer and Nutrient Gel.');
SELECT _desc106('base_circuit_printer',    'Tier 1 electronics station. Prints Basic Circuits; also builds Scanner Probes.');
SELECT _desc106('base_workbench',          'Tier 1 assembly station. Builds Structural Frames and Control Units (the parts for tier 2 stations and the Outpost) and harvesters.');
SELECT _desc106('base_arc_smelter',        'Tier 2 smelting station. Arc-smelts Titanium Ingots and rolls Steel Plate.');
SELECT _desc106('base_cryo_separator',     'Tier 2 gas station. Separates Xenon Propellant and makes Cryo Coolant.');
SELECT _desc106('base_coral_kiln',         'Tier 2 bio station. Fires coral into Ceramic Composite.');
SELECT _desc106('base_circuit_etcher',     'Tier 2 electronics station. Etches Printed Boards; also builds Advanced Scanner Probes.');
SELECT _desc106('base_machine_shop',       'Tier 2 assembly bench. Builds Titanium Frames and Servo Assemblies, and is where tier 2 ship modules are crafted.');
SELECT _desc106('base_fusion_smelter',     'Tier 3 smelting station. Grows Crystite Lattice and sinters Uranium Pellets.');
SELECT _desc106('base_isotope_plant',      'Tier 3 gas station. Presses helium-3 into He-3 Fuel Pellets.');
SELECT _desc106('base_spore_incubator',    'Tier 3 bio station. Cultures Nanite Culture from alien spores.');
SELECT _desc106('base_crystal_lathe',      'Tier 3 electronics station. Cuts Energy Cells and Lattice Processors.');
SELECT _desc106('base_fabricator',         'Tier 3 assembly bench. Builds Reinforced Hull Sections and Smart Actuators, and is where tier 3 ship modules are crafted.');
SELECT _desc106('base_plasma_containment', 'Tier 4 gas station. Bottles Contained Plasma; also builds Missile Warheads.');
SELECT _desc106('base_plasma_forge',       'Tier 4 smelting station. Re-forges Ancient Alloy into Precursor Plate and dopes titanium into Dense Alloy.');
SELECT _desc106('base_resin_works',        'Tier 4 bio station. Cures amber sap into Sealant Resin.');
SELECT _desc106('base_capacitor_bank',     'Tier 4 electronics station. Cages dark matter into Dark Capacitors.');
SELECT _desc106('base_nano_assembler',     'Tier 4 assembly bench. Builds Precursor Frames and Field Cores, and is where tier 4 ship modules are crafted.');
SELECT _desc106('base_void_foundry',       'Tier 5 smelting station. Quenches Precursor Plate into Void-Tempered Alloy.');
SELECT _desc106('base_quantum_condenser',  'Tier 5 gas station. Stabilises quantum dust into Stable Quantum Matrix and wires Quantum Boards.');
SELECT _desc106('base_quantum_forge',      'Tier 5 assembly bench. Builds Void Cores, and is where tier 5 ship modules are crafted.');

DROP FUNCTION _desc106(TEXT, TEXT);
