# The Foundry — base industry tree

Built 2026-09-26, migration 088. Design guide: the "Foundry Tree" artifact (owner-approved). Authoring source for the data: `server/src/game/foundryTree.js` (088 was generated from it; the DB is runtime truth — change the tree with a NEW migration).

## Shape

- **Five families across:** Smelting (ores), Gas Works, Biolab, Electronics, Assembly. **Five tiers up** matching module tiers and resource rarity: commons at T1–T2, rares at T3, rares + first exotics at T4, exotics at T5.
- **Stations are base buildings** (`module_types` slot_type `base`, `stats.foundry = {family, tier, bench, gate}`), craft-only, research-gated per tier (`tech_foundry_1..5`, Industry). A T*n* station only fits a base of tier ≥ *n*; service buildings (depot, grade refinery, lab, repair shop) fit any tier.
- **Jobs** (`foundry_recipes`): a station turns raw resources or lower materials into **processed materials** (`resource_types`, category `processed`, with `tier`, `family`, `is_part`) or items (Fuel Cell, probes, warheads, Basic Harvester). 36 materials, 41 jobs.
- **Parts** (`is_part`): Structural Frame, Control Unit, Titanium Frame, Servo Assembly, Reinforced Hull Section, Smart Actuator, Precursor Frame, Field Core, Void Core. Made only at Assembly benches; they build stations and base tiers; they never drop.
- **One gate station per tier** is built from the previous tier's parts alone (Smelter from raw cargo; Arc Smelter; Fusion Smelter; Plasma Containment; Void Foundry); the rest of the tier chains off it and the bench is always last.
- **Two kinds of refining stay separate:** the Grade Refinery raises quality only; the Foundry changes what a thing is. Processed materials inherit the quantity-weighted quality of their inputs.
- **Benches:** T2+ ship-module recipes were rewritten to processed materials (2 raw = 1 processed, `ceil(q/2)`) and carry `crafting_recipes.station_required` = the tier's bench (Machine Shop / Fabricator / Nano-Assembler / Quantum Forge). `/resources/craft` refuses them unless the pilot is docked at an own, built base with that bench; `/recipes` returns `station_required_name` + `station_available`. Station buildings and pre-088 base modules keep raw recipes (onboarding untouched).
- **Base tiers:** Framework 8 plots → Outpost 16 → Station 24 → Hub 32 → Citadel 40 (`BASE_TIERS`; 8 plots per tier = one "area" in the console). **Command Center Upgrades** adds +1 plot to every area per level (`plotLayout` in `api/bases.js`; keys b1..b40 are base plots, b41..b65 bonus plots, so keys never move). Upgrades cost the previous tier's parts + credits; T4/T5 need `tech_base_citadel`. Costs pull from the depot first, then cargo.
- **Sourcing rule (owner):** crafting is the cheapest, best-quality route, not the only one. Vendors keep everything they sold; any non-part processed material can drop from an NPC wreck (`combat.js` `rollFoundryDrop`: chance by item tier 4% / 2% / 1% / 0.4% / 0.15%, only from wrecks of tier ≥ item tier − 1). Tooltips carry **Made at / Used for** from `GET /foundry/catalog`.

## API (`/api/foundry`)

`GET /catalog` (public: materials with made_at/used_for, stations, recipes, base tiers) · `GET /status` (docked own base: stations with recipes (`can_run`, `seconds_here`) + jobs, materials on hand depot+cargo) · `POST /queue {slot, recipe_id, runs}` · `POST /jobs/:id/cancel` (not started; inputs back to cargo) · `POST /jobs/:id/collect {to}` (depot default for resources, cargo for items).

Job time = `recipe.seconds × runs ÷ (Q/50)^0.6 × (1 + smelting_time_pct)`; queue ≤ 8 per station, ≤ 20 runs per job; starts_at/completes_at fixed at enqueue (no cron).

## Console (client `components/base/BaseWindow.jsx`)

Full-screen: base portrait (`utils/pixelArt/baseArt.js`, grows with tier and fitted buildings), upgrade card, depot meter, materials on hand · the plot grid (one 2×2 area per tier, locked areas dimmed) · the selected plot (empty: cargo buildings + the catalogue with research / craft deep-links; station: recipes, runs slider, queue with progress, COLLECT / CANCEL; depot: store / take; grade refinery: RefineryPanel; lab; repair shop). The planet Base tab is now the build card + a summary with OPEN BASE CONSOLE.

## The depot is a cargo hold (089)

`player_base_inventory` mirrors cargo: resource OR item stacks with a slot position (items take 1 depot unit). The console's depot panel shows the fleet hold and the base hold side by side as grids (`components/items/CargoGrid.jsx`); a drag moves the whole stack across, arranges within a hold, or merges onto a matching stack (`/bases/:id/depot/move`). Everything at the base draws from the depot: foundry jobs and base upgrades (depot first), buildings fit straight from the depot (`/fit {depot_stack_id}`), the grade refinery lists depot stacks (`source: 'depot'`), and the Crafting window shows depot resource stacks with a BASE badge while docked at your base (`/craft` ingredients carry `source`).

## Automatic stations: the Fuel Refinery (090)

`base_fuel_refinery` (Gas Works T1, `stats.foundry.hopper = true`, `hopper_capacity 400`) has a HOPPER (`player_base_hoppers`, a small cargo grid per plot). The pilot drags Hydrogen, Hydrogen Cells, Xenon or Helium-3 in from either hold; the station turns them into Fuel Cells on its own (`foundry_recipes.auto = TRUE`, in sort order: hydrogen 3→1 in 12 s, hydrogen cell 2→1 in 8 s, xenon 2→2 in 14 s, helium-3 1→4 in 20 s; station quality and Smelting speed it up) and drops them into the base depot. Production SETTLES lazily on every base read (`settleHopperStation`, `player_base_station_state`: last tick, banked fraction of a unit, produced total, stall reason). Stalls: hopper empty, no usable ingredients, no depot, depot full; a stalled station banks no idle time. Fuel consumers at the base pull from the depot first: the grade refinery's jobs (`consumeFuel` depot → cargo). Console: hopper grid + a feed grid (fleet or base hold) with non-accepted stacks dimmed; drag in to feed, drag out to take back.

## Not built yet

Consumables with no use-slot (hull repair kit, afterburner, shield battery…), blueprints for T4/T5 stations, drone bays and vendor posts (need their systems), surface-vs-orbital family bonuses, per-family speed skills, item inputs to jobs.
