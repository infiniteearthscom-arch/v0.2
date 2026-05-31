# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-31 (Social Multiplayer Step 5 SHIPPED: direct player-to-player trade with co-docked gating, atomic-swap server endpoint, two-pane window, invite toast)

---

## Current state — one-liner

Live in prod with **realtime multiplayer presence + chat + live roster + activity ticker** (Presence Phase 1 shipped 2026-05-28; Social Multiplayer Steps 1+2 shipped 2026-05-30; Step 3 shipped 2026-05-31). Two players in the same system see each other's ships smooth-interp'd via Hermite splines at 10 Hz; flagship + wingmen broadcast; ship visuals refresh on re-fit. System + Global chat channels are live with REST history hydration. Live "N ONLINE · M HERE" HUD badge + galaxy-map per-system population counts. Top-center activity ticker streams galaxy-wide first-discoveries, module crafts, and ship purchases. Full core loop (mine → craft → fit → fly → trade → fight → explore) works across 200 procedural systems. Strategic direction: continue building **social multiplayer** (next: Step 4 player profiles + leaderboards, then trade, market, corps); combat-multiplayer (server-owned enemies, shared damage, PvP) deferred indefinitely.

- Live URL: https://star-shipper-fjrrq.ondigitalocean.app
- Branch: `main` (auto-deploys on push)
- DB schema: through migration **057**; next new migration is **058** (009 was skipped)

---

## In progress

*Nothing currently in flight.* Step 5 (player-to-player trade) shipped end-to-end. Step 6 (player market -- EVE-style async order book) is next; bigger lift (new tables, order-matching SQL, station-scoped browse UI) so worth scoping carefully before starting.

---

## Up next

Unranked queue. Pull from the top of the next session, or pick by interest.

### User-prompted, coming next

- **Social multiplayer roadmap** — chat → activity ticker → leaderboards → direct trade → player market → corps → bounties → mail. Full spec under "Realtime multiplayer > Social multiplayer roadmap" below. Strategic priority for the post-Phase-1 multiplayer work.
- **System map changes** — user flagged the in-system SVG view needs work (specifics TBD).
- **Grow the research tree as we build systems** — every new gameplay system (colonies, factions, advanced combat, etc.) should land with new tech nodes that gate it. The skill catalog (165 entries) is already broad — research nodes should expand to match. Per pitfall #15, check `skill_definitions.bonus_per_level->>'type'` for existing bonus contracts before inventing new ones.

### Realtime multiplayer

Phase 1 SHIPPED 2026-05-28. See the "Recently shipped" entry for the full Phase 1 architecture; this is the forward-looking backlog.

**Strategic direction (decided 2026-05-28):** prioritize **social multiplayer features** (chat, market, trading, leaderboards, corporations) over **combat multiplayer** (server-owned enemies, shared damage, PvP). Rationale: social features deliver the "feels like a real multiplayer game" payoff at a fraction of the architectural risk + cost. Reference points like EVE Online prove that players engage with chat/market/corp drama 100× more than with PvP combat. Star Shipper's DB layer already persists everything we need; socket.io is already running for presence; the remaining gap is mostly UI + a handful of new tables. Combat multiplayer (Phases 2-4 below) is **deferred indefinitely** -- the social roadmap fills the "real multiplayer" need without touching the locally-authoritative combat loop that already works well.

**Phase 1 polish (remaining):**
- **Hover-to-identify** — clicking/hovering a peer ship currently does nothing. Should at least open a small panel: pilot name, ship class, maybe shared-system-time. Spec'd as `> PROFILE` link, deferred.
- **Galaxy-map presence** — Phase 1 only covers SystemView. Peers vanish during galaxy-fly transits. Also broadcast on the galaxy map (separate room key, e.g. `presence:galaxy`).
- **Cleanup legacy `hub:*` / `mission:*` socket code in `socketHandler.js`** — dead code from a prior design, no client consumers. Safe to remove now that Phase 1 is proven. (The legacy `chat:send` handler was removed 2026-05-30 when the new chat shipped; `hub:*` + `mission:*` blocks remain to be pruned.)

### Social multiplayer roadmap

The path that replaces Phases 2-4 of the old combat roadmap. Each item is independently shippable, behind its own feature flag, with low blast radius -- the existing single-player combat loop stays untouched throughout.

**Step 1 — Chat (SHIPPED 2026-05-30)** — see Recently shipped.

**Step 2 — Live online roster + system population indicators (SHIPPED 2026-05-30)** — see Recently shipped.

**Step 3 — Activity ticker / killboard (SHIPPED 2026-05-31)** — see Recently shipped. v1 covers system_discovered + module_crafted + ship_purchased. Combat events (pirate_kill, ship_destroyed) deferred until the combat loop has a server-validated path -- client-driven combat events would be the only cheat surface in the ticker, not worth it.

**Step 4 — Player profiles + leaderboards (target: 1-2 days)**
"Top Miners (last 7d)", "Richest pilots", "Most pirate kills", "Most systems discovered". All data already in DB; pure read queries. Public profile page per player (clickable from chat names + leaderboard rows): pilot name, ship classes flown, leaderboard ranks, member-since date. Adds competition + identity without combat.

**Step 5 — Direct player-to-player trade (target: 2-3 days)**
Two players docked at the same station can open a trade window. Each side puts items + credits into their half; both confirm; server atomically swaps. Offers/counter-offers ride on the existing socket. Lets players exchange gear directly ("I'll trade you my Q90 Crystite stack for your Mining Laser II"). Less ambitious than the player market below but ships faster and exercises the same UI patterns.

**Step 6 — Player market (target: 5-7 days, the big one)**
EVE-style async order book per station. Players post BUY orders ("Will pay 50 cr each for up to 1000 Iron at Luna") and SELL orders ("Offering 500 Mining Lasers at 800 cr each at Mars"). Other players browse the order book at each station and fulfill matching orders. Server matches automatically when compatible orders meet. New tables: `market_orders` (id, user_id, station_id, item_id, quality_floor, side, price, quantity_remaining, expires_at). New endpoints: post/cancel orders, list orders by station + item, fulfill order. Big lift but **massive** multiplayer feel -- suddenly other players are a meaningful part of your economy.

**Step 7 — Corporations / fleets (target: 1-2 weeks)**
Persistent player groups. Tag visible on ships (rides on presence's `ship_visual`). Shared corp chat channel. Member roster + roles (founder, officer, member). Future hooks: corp-owned stations, shared cargo depots, joint contracts. Adds the social-graph layer that anchors players long-term.

**Step 8 — Bounty board (target: 3-5 days)**
Players post bounties (cash reward for killing a specific pirate type or pirate fleet in a specific system). Other players claim by completing the criterion (server detects kill, credits claimant). Server-mediated, no realtime negotiation needed.

**Step 9 — Mail system (target: 2-3 days)**
In-game async messages between players. Standard inbox UI. Pairs with corp/market features for "your sell order filled" notifications.

**Open design questions to settle when each step starts:**
- Chat: profanity filtering / moderation -- needed before public launch?
- Activity ticker: per-system vs galaxy-wide visibility? (Big systems would dominate the ticker if galaxy-wide.)
- Market: tax on transactions? Order-fee on posting? (Standard EVE-style economy levers.)
- Trade: bound to station-docking only, or station-OR-fleet-rendezvous? (Latter requires both ships to be physically close in same system.)

**Deferred indefinitely (the old combat-multiplayer roadmap):**
The originally-planned Phases 2-4 of the combat roadmap (server-owned enemies, authoritative combat, PvP) are deferred. They're real and well-specced -- if we ever want them, the spec is preserved in git history (commit on 2026-05-27 added the original Phase 1-4 spec to STATUS.md; the Phase 1 SHIPPED entry below has the architecture summary). Reasons to defer: (1) social features deliver more multiplayer feel per dollar of dev time; (2) server-authoritative combat introduces ~150ms latency on everything pirate-related, degrading single-player feel; (3) DO Basic plan struggles with the server-tick CPU + bandwidth load past ~10-20 concurrent players, forcing a plan upgrade; (4) bugs in lag compensation = "I hit them but they didn't die" complaints, the classic hardest-to-debug multiplayer bug. Revisit if/when the player base grows to where shared combat is the obvious next step.

### Module + resource quality pass

Designed in chat 2026-05-25 with user. Goal: make ingredient quality a real lever -- a q90 rare resource should produce a tangibly better module than the same recipe with q40 commons. Today the math half-exists (crafting averages ingredient stats and stamps `.quality` on the output) but most consumers don't read it.

**Locked design decisions:**
- **Backfill Sol** with quality variance from day one -- training-wheels q50 deposits hide the core economic mechanic from new players.
- **Weighted random distribution** -- triangular (avg of 3 uniform rolls), centered at 50, q90+ rolls are rare (~1-2%). Makes high-quality finds a reward, not a flat expectation.
- **No quality decay** -- modules don't erode in combat. Simpler, less bookkeeping.
- **`.quality` is the authoritative field on fitted module instances.** Anything reading from `.stats` for instance quality is a bug (that's the base type's defaults).

**Phase 1 (SHIPPED 2026-05-25) -- visible variance + weapons fix:**
- Migration 046 + asteroid quality variance + weapons.js `.quality` bug fix.

**Phase 2 (SHIPPED 2026-05-25) -- single source of truth for quality math:**
- New `lib/quality.js` (server) + `utils/quality.js` (client) exporting `qualityMultiplier(fittedValue, { invert?: bool, power?: number })`.
- weapons.js + fleetStats.js + recalcShipStats + mining endpoint all routed through it. fleetStats.js bug fix (`.stats` -> `.quality`) bonus: every panel-displayed stat now correctly scales with quality.

**Phase 3 (PARTIALLY SHIPPED 2026-05-25) -- module-by-module wiring:**

| Slot | Stat | Status |
|---|---|---|
| Weapon | damage ×Q, range ×√Q, fire_rate ÷√Q, lock_time ÷√Q | shipped (weapons.js) |
| Mining laser | yield ×Q | shipped (resources.js mining) |
| Cargo | capacity ×Q | shipped (recalcShipStats) |
| Harvester | fuel efficiency ×Q | shipped (pre-existing) |
| Engine | top speed ×Q (additive bonus over hull base) | shipped (migration 047 + recalcShipStats; SystemView + GalaxyFlightView read computed_max_speed) |
| Shield | max shield HP ×Q | shipped via fleetStats panel + computed_max_shield column (HUD reads fleetStats path) |
| Scanner | sensor_range ×Q | shipped (migration 047 + recalcShipStats + SystemView fleetSensorRange reads computed_sensor_range; falls back to flat 500 for ships not yet re-fitted) |

**Still pending in Phase 3 (deferred for follow-up):**
- Engine maneuver ×√Q (low impact today since fleet maneuver is min-of-fleet on hull base).
- Reactor power ×Q + recharge ×Q -- no power-budget system to drive a stat effect yet.
- Shield regen ×Q -- SHIELD_REGEN_RATE is currently a global constant; needs per-module spec first.
- Scanner scan_time ÷Q -- requires routing through the SCAN_TIME timer; small refactor.
- Probe consumable uses_remaining ×⌈Q⌉ -- needs probe-stack quality plumbing.

**Phase 4 (SHIPPED 2026-05-25) -- UI signaling:**
- Asteroid scanner tooltip shows quality tier (`Superior (Q73)`).
- Ship Builder slot info shows effective stats per fitted module with per-stat scaling (linear/√/inverted) and color-coded multiplier (`Damage  11 (base 6) ×1.83` in green). Uses the shared `STAT_META` mapping from `utils/quality.js` so what the panel shows matches what the engine does.
- Crafting projection: every numeric field on `recipe.item_data_defaults` renders with `effective (base, ×mult)`, multiplier color-coded by better/worse-than-base. Builds a synthetic `{quality: avg}` from ingredient stacks so the math goes through the same shared helper.

**Phase 5 (SHIPPED 2026-05-25) -- skill hooks:**
- Migration 048: **Manufacturing Excellence** (Industry tree, rank 4, +5 to each crafted output quality stat per level, contract `crafted_quality_flat`). Server `/craft` reads it via `getPlayerBonuses` and adds it after the ingredient weighted-average, clamped at 100. Lets a maxed crafter elevate mid-q ingredients to superior-tier output without obsoleting high-q finds.
- Mining laser quality shapes extracted stack stats. Formula: q50 laser = exact asteroid stats; high-q lasers pull each stat toward 100 (`q60 ast + q100 laser → q80 out`); low-q lasers drag toward 0. Inventory unique constraint on `(user, resource, stat_*)` keeps shaped output in its own stack, so the player visibly sees "my new laser is producing better minerals."

**Open items for later:**
- Do we want belt-level bias (outer-system belts roll higher averages)? Adds travel incentive but complicates the spawn math. Defer.
- Quality cap on procedural rolls (true 0-100 vs hard cap at 95)? Default to 0-100 with the triangular distribution making 95+ self-limiting.

---

### Player-owned orbital stations

Greenfield system. Designed in chat 2026-05-25 with user.

**Architecture decisions (locked):**
- **Modular fitting grid like a ship hull** — re-uses `module_types`, `fleetHas`-style stat aggregation, the fitting UI pattern from ShipBuilderWindow, and the harvester slot-panel pattern from PlanetInteractionWindow. New module types ship as data, not new tables.
- **Anchored to a body, not free-floating** — orbits an existing stellar body or sits on a planet surface. Re-uses `bodies` for coordinates + dock logic.
- **Many stations per player, gated hard by skills/research** — start with one allowed; subsequent slots unlock via high-rank `pln_cc_upgrades` + `pln_interplanetary` (both already in the catalog from migration 032) plus matching research nodes.
- **Tiered construction** — Framework → Outpost → Station → Hub (or similar). Each tier costs a meaningful resource sink and unlocks more slots + higher-tier module fittings. Upgrading takes real time.
- **Vulnerable to pirate raids** (Phase 2) — undefended stations get raided; raids damage modules, take stations partially offline, and require repair. Drives the reason to fit defense slots.

**Slot type categories:**
- Industry (refinery, reprocessing, manufacturing queue)
- Research (RP/min boost, blueprint research)
- Trade (local market, automated trade-route runners, cargo depot)
- Military (defense turrets, shield, hull plating)
- Utility (sensor array, med bay forward-respawn, comms)

**Capability list (greenlit + bucketed by phase):**

*Phase 1 — Framework tier, single station, two industrial modules to prove the loop:*
- Migration: `player_stations` table (id, owner_id, body_id, tier, fitted_modules JSONB, hull_hp, armor, max_slots_by_type JSONB, name, created_at, last_tick_at)
- New `station_*` module types in `module_types` (or a flag column)
- "Build Station" action on a planet/asteroid scan tab, gated by `pln_cc_upgrades` L1
- Refinery module — converts low-q ore stack into base materials at a yield rate; reads `prc_reprocessing` skill bonuses
- Research Lab module — passive RP/min boost while undocked from the station's owner
- StationWindow UI (mirror PlanetInteractionWindow's tab structure)

*Phase 2 — Tier upgrades + defense + raids:*
- Outpost + Station tiers; tier-up requires resource feeding over time
- Defense slot type + basic turret module (laser/kinetic options)
- Shield generator + hull plating
- Pirate-raid scheduler (server-side cron); raid intent broadcast to the owner; damaged modules go offline until repaired
- Med Bay module — overrides Luna as the player's respawn point when fitted

*Phase 3 — Multiplayer + advanced trade:*
- Automated trade-route runners (NPC hauler ships the player assigns to routes between owned stations + vendor bodies)
- Local market / trade post — NPC traders dock with different prices; in multiplayer, other players can buy/sell
- Manufacturing queue (passive crafting jobs)
- Cargo depot (overflow storage the player can pull from)
- Sensor array — passive system-wide reveal within X of the station
- Influence radius / system claim — first-priority harvester slots in claimed systems, multiplayer reveal on galaxy map

**Open design questions to settle when work starts:**
- Where does the player physically interact with the station — dock-into-it (treat as a body) or open the StationWindow from anywhere they own it?
- Does the station have its own inventory pool, or share the player's cargo?
- Construction-feed mechanic: drop materials into a feed queue (passive over hours/days) or bulk-pay once + wait?
- What happens to fitted modules if a higher tier slot count *decreases* one of the type buckets? (Probably can't — only increases.)

### Sensor + scanner depth

**Scanner Depth Phase 1 (Tier A) -- specced 2026-05-25, in progress**

Goal: make scanning feel like a real action (not a button-click), make the fitted scanner module + Astrometrics skill matter for every scan surface, and remove the most-visible "catalog promises but code ignores" gap. Three coordinated changes:

1. **Asteroid scan time becomes dynamic** -- pull from the best fitted scanner's `scan_time` stat (T1=8s, T2=4s) instead of the hardcoded 8000ms, scaled by scanner quality and Astrometrics `ast_scanning` skill bonus (`scan_time_pct`, -5%/level). Q90 T2 scanner + L5 ast_scanning = ~3s asteroid scan.
2. **Planet scans become timed + module-gated** -- both orbital and ground scans now require a fitted scanner module, display a progress bar in the Scan tab, can be cancelled (close window / undock / explicit cancel), and consume the probe only on completion. Duration uses the SAME formula as asteroid scan, so all three scan surfaces feel consistent.
3. **Wire `ast_scanning` skill** -- the bonus contract already exists in migration 031 but no code reads it. This change makes the skill the natural training path for a player who scans a lot.

Implementation: migration 049 adds `computed_scan_time` to ships; recalcShipStats fills it (best scanner's scan_time × quality). New `utils/shipStats.js` client helper `getFleetScanTimeMs(ships, bonuses)` returns the effective duration, applying the skill bonus on top. Both SystemView (asteroid scan) and PlanetInteractionWindow (planet scans) call it.

**Phase 2 (SHIPPED 2026-05-25)** — probe quality affects scan output:
- Server `/survey/orbital` + `/survey/ground` now pick the **highest-quality** probe stack (ties to lowest slot). Players accumulating high-q probes burn them on important worlds; baseline q50 vendor probes preserve current behavior.
- Probe quality drives a `precision` value (0..1, Q≤50 = 0, Q100 = 1).
- **Orbital**: high-precision probes add a numeric `quantity_estimate` field per resource (rounded to nearest `100*(1-precision)` units, exact at Q100). Q≤50 probes show only the abundance bucket — same as before.
- **Ground**: stat range variance (was hardcoded ±10) shrinks to `±10*(1-precision)`. Quantity range (±10%) shrinks to `±10%*(1-precision)`. At Q100 both are exact (`min === max`, rendered as a single value instead of a range).
- Scan response carries `probe_quality` (0-100 avg). The ProbeQualityFooter component shows it under each result panel with a tier color + a hint nudging the player to craft a better probe when q50 was used.

**Scanner Depth Tier B (SHIPPED 2026-05-25)**

Three new modules + research nodes + activation UI. All three buttons live in a bottom-right "scan abilities" tray that only appears when at least one of the matching modules is fitted (no clutter for a starter fleet).

- **Wide-Field Sensor Array (T2.5)** -- `utility_scanner_area`, stats `{sensor_range:700, scan_range:200, scan_time:5, area_scan:true}`. Gated by new `tech_sensor_array` research (250 RP, prereq Sensor Refinement). One click → `POST /asteroids/scan_area` scans every unscanned asteroid in the fleet's sensor range. Player still has to fly to widen what gets revealed.
- **Elite Survey Grid (T3)** -- `utility_scanner_elite`, stats `{sensor_range:1400, scan_range:320, scan_time:2.5, area_scan:true, bulk_scan:true}`. Gated by `tech_sensor_grid` (400 RP, prereq Sensor Array Networking). One click → `POST /asteroids/scan_belt` scans every asteroid in the nearest belt.
- **System Telemetry Array (utility, active ability)** -- `utility_systemscan`, stats `{system_sweep:true, sweep_duration:30, sweep_cooldown:120}`. Gated by `tech_system_telemetry` (350 RP, prereq Sensor Array Networking -- branches alongside Sensor Grid Mastery for spec choice). Click → 30s window where `fleetSensorRange()` returns `Number.MAX_SAFE_INTEGER` (all enemies revealed regardless of proximity). 120s cooldown. State resets on system change.

Server endpoints validate the fleet has the right module fitted (`area_scan` / `bulk_scan` stat flag in `module_types.stats`); both endpoints bulk-insert scan rows + return enriched asteroid records so the client mutates `asteroidsRef` in place without re-listing.

**Scanner Depth Tier C (SHIPPED 2026-05-25)**

Two coordinated changes: skills paired with the Tier B abilities, and galaxy-map fog of war.

- **Three new Astrometrics skills (migration 051):**
  - `ast_area_scanning` (rank 3) -- +10%/level area-scan radius. Multiplies the radius passed to /scan_area. L5 = 1.5× effective sweep.
  - `ast_bulk_belt_efficiency` (rank 4) -- -10%/level bulk-belt cooldown. **Adds a 90s base cooldown to bulk belt** (was instant in Tier B); L5 trims to 45s.
  - `ast_telemetry_ops` (rank 4) -- -5%/level sweep cooldown. 120s base → 90s at L5.
- All three bonuses read from `activeBonuses` in the relevant SystemView handler and apply in the standard `time * (1 + pct/100)` form (negative pct shortens). Bulk + sweep cooldowns track in refs (`bulkBeltCooldownUntilRef`, `sweepCooldownUntilRef`); the HUD buttons show live countdowns and disable while cooling. Both reset on system change.

- **Galaxy-map fog of war:**
  - Migration 051 adds `player_system_visits` (user_id + system_procedural_id PK, first_visited_at).
  - New `/api/galaxy` router with `GET /visits` and `POST /visit` (idempotent). Client `enterSystem` + `setCurrentSystemId` fire-and-forget the visit.
  - `App.jsx` calls `hydrateDiscoveredSystems` on login to seed local state from the server table, so fog of war persists across reloads + devices.
  - GalaxyMapWindow + GalaxyFlightView render undiscovered systems as bare gray dots: no star type color, no faction halo, no glow, no name (label only on hover/target). Jump connection lines render only when at least one endpoint is discovered. Info panel hides star type / faction / danger / resources / jump connections for undiscovered systems -- just "Unknown System" + distance + Fly To button so exploration is still actionable.

**Phase D backlog (not started)**

- **Drone / probe exploration**: Autonomous scanner drones the player deploys system-wide. Each drone navigates to unscanned asteroids on its own, scans, returns. Big system -- needs new entity type, autonomy AI, deploy/recall UI, drone hangar slot type. Own future spec session.
- **Stationary scanner emplacements**: Pairs with the player-stations system once that lands.
- **Cosmic signature / hidden-site mechanic**: EVE-style probe-down-the-anomaly mechanic. Activates the inert `ast_probing`, `ast_astrometric_acq/_pin/_range`, `ast_signal_acquisition` skills.
- **Asteroid census output module** (user-requested 2026-05-25): output-style scanner module that surfaces a persistent right-pane list of every scanned asteroid in the current system, with columns for resource type(s), rarity, quality tier, and remaining quantity. Click-to-autopilot per row pulses the rock + sets the autopilot target. Probably needs three tiers gated by research: T1 shows scanned rocks only (current data); T2 also reveals rocks within sensor range without explicit scans; T3 shows the entire system regardless of distance. Sort/filter by resource type, quality, distance. Pairs naturally with the Wide-Field / Elite scanners -- this is the "data terminal" output to their input.
- **Auto-miners** (user-requested 2026-05-25): super-high-tier mining module that mines without requiring a click-target. Player flies into a belt, the module auto-locks the nearest unmined asteroid + cycles automatically; on depletion, picks the next nearest. Likely caps at one auto-miner per ship (vs the current stack of click-target lasers). Tier ladder: T1 mines only one rock at a time (auto-retarget); T2 mines two concurrently; T3 (legendary) mines + auto-jettisons low-value resources to keep cargo for high-value. Pairs with the asteroid census module above as the "deploy + walk away" endgame mining loop. Research-gated behind several existing Industry / Astrometrics nodes.

### Combat + death loop

- **Podding Phase 2: wreckage + cargo ejection** — eject ~50% of player inventory + destroyed ship's modules into a wreck on death so the pod can salvage. Pirates contest wrecks (Phase 3 polish). The wrecks table exists (migration 021) but the server endpoints have a parked bug — see Known Issues.
- **Enemy fleets Phase 2 (SHIPPED 2026-05-25)** -- pirates' combat stats now derive from a tiered loadout catalog (PIRATE_WEAPONS / PIRATE_SHIELDS / PIRATE_ENGINES + PIRATE_LOADOUT_TIERS) instead of the hardcoded `PIRATE_HULLS.stats`. Hull is purely visual + base HP (`PIRATE_HULL_BASE_HP[hullClass]`). Hull pool mixes pirate-themed visuals with player combat hulls (`fighter`, `scout`, `frigate`, `capital`) for variety. Loadout tier picked per-pirate by `pickLoadoutTier(rng, dangerLevel)` -- d1-2 = T1, d3-4 = 50/50 T1/T2, d5+ = mostly T3 with some T2. Display name includes weapon ("Pirate Destroyer (Heavy Cannon)") so threats read at a glance. Loot scales × loadout tier so T3 kills pay 3× T1.
- **Enemy fleets Phase 2b (not started)** -- formation flying. Wingmen currently spawn near a shared patrol center but each tracks its own patrol orbit. Real fleet feel needs a per-fleet leader (formationSlot = 0) + wingmen lag-following offset positions relative to the leader's current position (mirror of the player's `WINGMAN_LAG_RATE` system). When leader dies, promote next member. When fleet engages, wingmen converge on leader → leader chases player → effectively the whole fleet swarms together. Bigger AI change; defer until the loadout work has had playtest.

### UX polish

- **Orbital + ground scans should take time** — currently instant on the planet Scan tab. Should run like asteroid scanning (timed progress, cancellable, derives duration from the fitted scanner's `scan_time` stat). Probably a SCAN_TIME constant per scan kind on the server, with the client showing a progress bar.
- **Extract a shared `<CargoPanel>` component** — `FittableModulesPanel` (ShipBuilderWindow), `CraftingCargoPanel` (CraftingWindow), `HarvesterCargoPanel` (PlanetInteractionWindow), and the main `InventoryWindow` grid all render cargo+drag in their own way. Same chrome + tile render duplicated 4 ways. A common `<CargoPanel filter={…} groupBy={…} header={…} onTileClick={…} />` would let any new "drag-from-cargo" surface drop in.
- **Hardcoded `localhost:3001` audit** — pitfall #9 violation existed in the old respawn code; sweep the rest of the client for similar stragglers.

---

## Known issues / open threads

Bugs noticed but not fixed; rough edges to revisit.

- **Planet toolbar button missing intermittently** — user reports the 🪐 Planet button in the left toolbar doesn't appear when they expect to be docked. The button is conditional on `dockedBody` being truthy in the global store. SystemView mirrors local `dockedBody` to the store via a useEffect, and the dock-set path looks intact. **Diagnostic still pending**: need to confirm whether the planet window auto-opens when docked (→ store value is fine, toolbar render issue) or doesn't (→ store value never gets set).
- **Wreckage server-side parked until multiplayer matters** — `/wrecks/spawn` and `/wrecks/list` returned PG `42P01` despite migrations 021 + 022 being recorded as applied. Root cause not pinned down. **Doesn't matter today** — gameplay works via the client-only wreck workaround. Revisit when multiplayer ships and we need race-safe server-side claims. At that point: add a `GET /api/diag/db` probe endpoint that dumps what the runtime sees vs what the migrations tracker recorded.
- **`/repair-cost` server endpoint is dead code** — kept for backward compat. Safe to remove once we confirm no client references remain.
- **`ShipBuilderWindow.jsx:837` calls `fittingAPI.buyHull()`** without refreshing the global ships array. If we ever surface that flow to a podded player it'll have the same auto-disembark staleness bug the vendor had. Defensive `fetchShips()` if reachable from the podded state.

---

## Recently shipped

Most recent first. Group by session/theme. Trim entries older than ~2 weeks once they stop being load-bearing context.

### 2026-05-31 — Social Multiplayer Step 5: Direct player-to-player trade

End-to-end two-party trade flow. Two pilots dock at the same body, one invites the other, both lay out offers, both confirm, server atomically swaps. Built in two phases (presence foundation + trade flow) but shipping as one feature.

**Phase 1 -- docked-pilot presence:**
- Server's `presence.js` gains a `bodyOccupants: Map<bodyId, Map<userId, {name}>>` plus new events: client `presence:dock`/`presence:undock` and broadcast `presence:body { body_id, pilots }` to a per-body socket room. Disconnect cleans up dock rosters too.
- Client `utils/presence.js` mirrors via `getDockedPilots(bodyId)` + a `body_changed` event. Re-dock on reconnect.
- `GameFrame` has a `<DockedBodyPresenceBridge />` invisible component that watches `dockedBodyDbId` and forwards changes to the presence singleton -- single source of truth for "am I docked."

**Phase 2 -- trade flow:**
- **Server `lib/trade.js`:** in-memory session manager. No DB table for sessions (short-lived; audit goes to `activity_events`). Tracks pending vs active sessions, enforces one-at-a-time per user, body-co-docking on every endpoint, 30s pending timeout / 5min active idle timeout. Auto-cancels on undock via a hook in `presence.removeFromBody`. Bait-and-switch protection: any offer edit voids BOTH confirms.
- **Server `api/trade.js`:** REST surface `POST /invite | /:id/accept | /:id/cancel | /:id/set-offer | /:id/confirm` + `GET /active | /:id`.
- **Atomic swap:** single `transaction()` with FOR UPDATE locks on every offered stack + both users.credits rows (ordered by user_id to prevent deadlock). Validates stack quantities, validates credits, validates cargo capacity using net-delta (current usage + incoming - outgoing) so a player at 100% capacity can still trade if they're net-zero. Resource transfers merge into matching stacks by (resource_type_id + stat_* tuple); items merge by (item_id + item_data JSONB equality); else new slot. Credits applied as a single delta UPDATE per user. Logs to `activity_events` on success (event_type `trade_completed`).
- **Client `utils/trade.js`:** singleton mirroring the chat/activity pattern. Listens for `trade:invite | opened | updated | completed | cancelled` and exposes pendingInvite / activeTrade / lastResult state + a small API (invite, accept, reject, setOffer, setConfirmed, cancelActive). `recoverActive()` re-hydrates a live session after page reload.
- **TradeWindow** (modal): two-pane "Your Offer" / "Their Offer" layout. Own side has a click-to-add cargo picker + per-stack quantity inputs + credits input + Confirm/Unconfirm. Other side renders read-only. Border turns green when a participant has confirmed. Terminal overlay shows "Trade Complete" / "Trade Cancelled (reason)" before the window dismisses.
- **TradeInviteToast** (top-right, below TopBar): 30s countdown bar + Accept/Reject buttons. Auto-dismisses on either click, expiry, or server-side cancel.

**Two entry points:**
- **PlanetInteractionWindow → Pilots tab** (Phase 1 surface): each docked pilot row has a 🤝 Trade button alongside the click-to-profile area. Gating is automatic since they're already in our dock roster.
- **ProfileWindow** 🤝 Trade button: live-toggles enabled/disabled as the target docks/undocks. Inline error message when the invite fails (e.g. partner already mid-trade).

**Files (new):** `star-shipper-server/src/lib/trade.js`, `star-shipper-server/src/api/trade.js`, `star-shipper/src/utils/trade.js`, `star-shipper/src/components/trade/TradeWindow.jsx`, `star-shipper/src/components/trade/TradeInviteToast.jsx`.

**Files (modified):** `star-shipper-server/src/realtime/presence.js` (dock state + isUserDockedAt/getUserDockedBody/getUserSocketId queries + undock hook calls cancelTradesForUser), `star-shipper-server/src/realtime/socketHandler.js` (setTradeIO + setTradePresence), `star-shipper-server/src/api/resources.js` (export getNextSlotIndex), `star-shipper-server/src/index.js` (mount route + app.set('io', io)), `star-shipper/src/utils/api.js` (tradeAPI), `star-shipper/src/utils/presence.js` (dockAtBody/undockFromBody/getDockedPilots + body_changed event), `star-shipper/src/components/ui/GameFrame.jsx` (mount window + toast + DockedBodyPresenceBridge + TradeBootstrap), `star-shipper/src/components/profile/ProfileWindow.jsx` (live Trade button wired to invite), `star-shipper/src/components/system/PlanetInteractionWindow.jsx` (new Pilots sub-tab with click-row + quick Trade button).

**Open follow-ups:**
- Item volume is approximated at 1/unit (resources use real stat_density). Add proper `idef.volume_per_unit` lookup if item-heavy trades start hitting false cargo-overflow rejects.
- No "blocked players" list -- anyone can spam invites. Add a per-user invite rate limit if it becomes a problem.
- TradeWindow doesn't render the other party's offered items with full detail (resource names appear, but quality stats / module tier don't). Would need a server-side projection of the offer payload that includes resolved stack metadata. Defer until a player asks.
- Trade button errors in PlanetInteractionWindow's quick-trade button are console.warn only. Promote to a toast if it becomes annoying.

### 2026-05-31 — Social Multiplayer Step 4 (profile half): Public pilot profiles

New `GET /api/profile/:userId` returns the same shape for self + others (nothing in the response is strategic-secret -- credits is already on the leaderboards, ship classes flown is identity not loadout). Response:

- Identity: id, username, member_since
- Totals: skills_trained, systems_discovered, credits, ships_owned
- ship_classes: distinct hulls owned with counts (lifetime view, includes stored)
- ranks: array of `{ type, title, rank, value }` for every leaderboard board the player has data on (unranked = null when value is 0, same convention as `/api/leaderboards/:type`)

UUID-shape guard on `:userId` returns 400 for bad ids without hitting Postgres. All sub-queries (totals, ship classes, every per-board rank) run in parallel via `Promise.all`.

UI: `ProfileWindow` modal opened via the new `store.openProfile(userId)` helper (sets `profileTargetUserId` + opens the `profile` window in one call). Header shows pilot name + member-since; body is a 4-tile stats grid, ship-class pill list, and a leaderboard-rank table with the same icon/accent palette as `LeaderboardsWindow`. Self-view tags the header with "(YOU)".

**Open hooks wired:**
- **ChatPanel** sender names are now clickable -- hover shows underline + `Open <name>'s profile` tooltip, click fires `openProfile(sender_id)`.
- **LeaderboardsWindow** rows are now clickable -- hover row-highlights, click opens the profile.

Files: `star-shipper-server/src/api/profile.js` (new), `star-shipper-server/src/index.js` (mount route), `star-shipper/src/utils/api.js` (`profileAPI`), `star-shipper/src/components/profile/ProfileWindow.jsx` (new), `star-shipper/src/components/ui/GameFrame.jsx` (mount window), `star-shipper/src/components/leaderboards/LeaderboardsWindow.jsx` (row click + hover), `star-shipper/src/components/chat/ChatPanel.jsx` (name click), `star-shipper/src/stores/gameStore.js` (`profileTargetUserId` + `openProfile` helper + window registration).

**Open follow-ups:**
- No "members since the dawn of the project" identity beyond `users.created_at`. Add bio / pilot photo / corp tag fields later when they have meaning.
- ChatPanel name click only works in the chat panel. Activity ticker `sender_name` could also be clickable -- minor follow-up.
- Profile-of-self currently doesn't link back to CharacterPanel. Could add a "→ Edit Profile" button when looking at yourself; defer until there's something to edit.

### 2026-05-31 — Social Multiplayer Step 4 (boards half): Galaxy-wide leaderboards

Five leaderboards, all computed live from existing tables -- no cache table, no aggregation job. Player base is tiny so live SQL stays cheap.

- **Richest Pilots** -- `users.credits DESC`
- **Top Explorers** -- `COUNT(player_system_visits)` per user
- **Most Skills Trained** -- `COUNT(player_skills WHERE level > 0)` per user
- **Most Active (7d)** -- `COUNT(activity_events WHERE created_at > NOW() - 7d)` per user
- **Top Crafters** -- `COUNT(activity_events WHERE event_type='module_crafted')` per user

Single endpoint `GET /api/leaderboards/:type?limit=N` returns top N + the requesting user's own rank and value (separate aggregate query). `GET /api/leaderboards` returns the catalog so the client tab strip is server-driven (adding a board only needs a server change). Rank is null when the user has 0 of the metric -- a numeric rank would be misleading ("you're ranked #87 in crafting" when you've never crafted).

UI: dedicated toolbar button (🏆 Leaders) opens a ModalOverlay-style window. Tab strip across the top, ranked-list body (rank | pilot | value, top-3 ranks colored gold/silver/bronze, the user's own row highlighted in cyan with "(YOU)"). Footer summarizes "Your Rank: #N (value)" or "unranked" + `as of HH:MM:SS`. Per-board data cached after first fetch; manual refresh button re-fires the query.

**Setup left for the public-profile half:**
- Server `GET /api/profile/:userId` returning name, member-since, ship-classes flown, per-board ranks.
- Client `ProfileWindow` reusable from chat name clicks + leaderboard row clicks.
- Wire row click in `LeaderboardsWindow` + name click in `ChatPanel` to open the profile window.

Files: `star-shipper-server/src/api/leaderboards.js` (new), `star-shipper-server/src/index.js` (mount route), `star-shipper/src/utils/api.js` (`leaderboardsAPI`), `star-shipper/src/components/leaderboards/LeaderboardsWindow.jsx` (new), `star-shipper/src/components/ui/GameFrame.jsx` (toolbar button + mount), `star-shipper/src/stores/gameStore.js` (window registration).

### 2026-05-31 — CharacterPanel: Skills section rebuild

Replaced the stale 10-category teaser (lifted from the original design doc) with real data from `gameStore.skills` / `skillQueue`:

- **Active training tile** -- shows current skill, `→ {Roman target level}`, live progress bar that ticks every second, ETA. Only renders when the queue has a head.
- **Career totals** -- Skills Trained / Total SP (sum of sp_at_current_level across trained skills) / Queue length.
- **Top Specializations** -- top 3 categories by total SP invested, with skill counts.
- **→ Open Skills & Research** button for deep dives.

Also fixed the fleet-cap display (was `/3`, should be `/${MAX_FLEET}` = 5). Reputation section kept as a placeholder pending the faction-standing system -- the 4-faction teaser names (Terran Accord / Free Merchants Guild / Astral Collective / Void Reavers) are accurate to what's planned.

File: `star-shipper/src/components/ui/CharacterPanel.jsx`.

### 2026-05-31 — Social Multiplayer Step 3: Activity ticker

Append-only `activity_events` table backs a galaxy-wide HUD ticker. Three event types in v1:

- `system_discovered` — fired when `/api/galaxy/visit` creates a new row (gated on the `RETURNING` row from `ON CONFLICT DO NOTHING` so re-visits never re-log). Payload: `{ system_name }`.
- `module_crafted` — fired after a successful `/api/resources/craft` when `recipe.item_category === 'module'` (filters out the probe/fuel-cell spam). Payload: `{ module_name, quality }` (avg of the 4 quality stats).
- `ship_purchased` — fired after a successful `/api/fitting/buy-hull`. Skips `starter_scout` so the brand-new-pilot onboarding doesn't flood the ticker. Payload: `{ hull_name, hull_id }`.

**Architecture:**
- New `lib/activity.js` server-side helper exposes `logActivity({ userId, senderName, type, systemId, payload })`. Inserts to `activity_events` then `io.emit('activity:event', ...)` to broadcast galaxy-wide. Never throws -- a logging failure can't break the primary action.
- `socketHandler.js` calls `setActivityIO(io)` once at startup to give the lib its broadcast handle. No socket handlers needed -- activity is server-emit-only (no `chat:send`-style client emit path), which keeps the cheat surface zero.
- REST `GET /api/activity/recent?limit=50` for client hydration on connect. Wire shape mirrors the socket event so live + historical entries are interchangeable.
- Client `utils/activity.js` mirrors the chat singleton pattern: lazy-connect via the shared socket bus, REST-hydrate on first `loadEvents()`, append live events thereafter, capped at 100 in memory. Dedups on `id` to defend against the reconnect-race "server re-sends a recently-broadcast event" case.

**UI:** thin top-center strip (just under the TopBar), single-line, shows the most-recent event with `{age} ago`. CSS keyframe slide-up + fade-in plays whenever a new event arrives (re-keyed div remounts to trigger the animation). Click expands to a panel showing the last 10 events newest-first. Self-hides entirely until the first event arrives so brand-new servers don't show "no activity" chrome.

**System name resolution is client-side.** Server stores only `system_procedural_id`; the ticker resolves to a name via the deterministic galaxy generator (same one GalaxyMapWindow uses), so the server doesn't need to know procedural names. `recordVisit` now optionally accepts a `systemName` for callers who already have it, but the resolution fallback covers callers that don't.

**Files:**
- Server new: `migrations/057_activity_events.sql`, `src/lib/activity.js`, `src/api/activity.js`.
- Server modified: `src/index.js` (mount `/api/activity`), `src/realtime/socketHandler.js` (`setActivityIO(io)`), `src/api/galaxy.js` (log on first visit), `src/api/resources.js` (log on module craft), `src/api/fitting.js` (log on hull purchase).
- Client new: `src/utils/activity.js`, `src/components/activity/ActivityTicker.jsx`.
- Client modified: `src/utils/api.js` (`recordVisit` accepts optional name), `src/components/ui/GameFrame.jsx` (mounts `<ActivityTicker />`).

**Open follow-ups** for when traffic surfaces them:
- Combat events (pirate_kill, ship_destroyed) need server-validated combat first -- client-driven log calls are the only cheat vector.
- Galaxy-wide vs system-only filter toggle. Trivial to add: predicate over the buffer + a toggle button. Wait until the ticker actually feels noisy before adding the UI.
- No cleanup job on `activity_events` -- table grows unbounded. Cheap; revisit at ~1M rows.
- Mute lists / per-player block. Wait until someone is actually annoying.

### 2026-05-30 — Social Multiplayer Step 2: Live online roster + galaxy-map population

Pushed roster snapshots over the existing socket. New event:

```
Server -> Client: presence:stats { total_online, by_system: { [systemId]: count } }
```

Server broadcasts on every roster change (connect / disconnect / system-enter / system-leave / stale-peer eviction), debounced 250ms so connection storms collapse to a single emit. New sockets get an immediate stats snapshot on connect. `by_system` only includes non-empty systems -- consumers must REPLACE their local map (not merge) so a system going 1->0 cleanly drops out.

Client `utils/presence.js` extended with `getOnlineStats()` + a `stats_changed` event. Two UI surfaces consume it:

- **HUD badge** (top bar, next to Active Training): `👥 N ONLINE · M HERE`. The HERE half only renders when in system mode (galaxy-flight players are not in any system room; showing "HERE: 1" because someone else is in their old system would mislead). Tooltip lists the top 5 systems by population.
- **Galaxy map**: small cyan `👥 N` badge under each system's name on the map for any system with >0 pilots. "Pilots Here" row in the per-system info panel. Danger-level warning indicator's y-offset shifts down when the population badge is also present to avoid label stacking.

Architecture choice: no new REST endpoint, no DB writes -- the singleton already had all the data. Step 2's only server work was adding the debounced broadcast helper. Total diff: ~220 lines across 4 files.

Files: `star-shipper-server/src/realtime/presence.js`; `star-shipper/src/utils/presence.js`; `star-shipper/src/components/ui/GameFrame.jsx` (new `OnlineRosterIndicator`); `star-shipper/src/components/ui/GalaxyMapWindow.jsx`.

### 2026-05-30 — Social Multiplayer Step 1: Chat (System + Global) + shared socket bus

**First slice of social multiplayer.** Two channels live: **System** (everyone in the sender's current procedural system, routed through the existing `presence:system:${id}` room) and **Global** (everyone online). Fleet channel reserved for when corps land -- server accepts it but echoes back to sender only.

**Architecture:**
- **Shared socket bus** (`client utils/socket.js`) extracted from presence so chat + presence + any future realtime module ride a single authenticated socket per user. Auto-rebinds raw socket.io event handlers on every reconnect so a transport blip doesn't silently break chat/presence subscribers. Lifecycle events ('connect', 'disconnect', 'kicked', 'error') and socket events have separate subscription paths.
- **Chat sits on the presence rooms.** No new room subscription path -- `socket.data.presence.systemId` (set by presence.js handlers) tells the chat handler which system the sender is in.
- **REST history hydration.** On channel open / system change, client fetches the last 50 messages from `GET /api/chat/history` and seeds the in-memory buffer (capped at 200/channel). Live socket messages append from there. Wire shape is identical for both so the buffer treats them uniformly.
- **Persistence.** Every successful broadcast also `INSERT`s into `chat_messages`. Server time is the truth -- client clock isn't involved.
- **Rate limit** 1 msg / 750ms per socket. 500-char cap.

**Wire protocol:**
```
Client -> Server: chat:send  { channel, text }
Server -> Client: chat:message { id, channel, channel_id, sender_id, sender_name, text, ts }
Server -> Client: chat:error   { message }
```

**UI:** dockable bottom-right panel, always mounted in `GameFrame` (visible in both SystemView and GalaxyFlightView). Tab strip (System | Global) with per-tab unread badges; sticky auto-scroll that detects "user scrolled up to read history" (>30px from bottom). Collapses to a slim header bar with aggregate-unread badge.

**Migration 056** widens `chat_messages.channel_id` UUID → VARCHAR(64) so procedural system IDs ('sol', '42') fit. Table was empty in prod (legacy `hub:*`/`mission:*` chat handlers had no client consumers), so no data loss.

**Legacy cleanup:** the dead `chat:send` handler in `socketHandler.js` (expected `{channel, message}`, looked up hub/mission presence) was removed -- it was double-firing alongside the new `attachChat` handler but short-circuiting on the missing `message` field. The `hub:*` / `mission:*` blocks in that file remain dead and queued for a separate cleanup pass.

**Files:**
- Server new: `migrations/056_chat_channel_id_varchar.sql`, `src/api/chat.js`, `src/realtime/chat.js`.
- Server modified: `src/index.js` (mount `/api/chat`), `src/realtime/socketHandler.js` (`attachChat(io)` + legacy chat handler removal).
- Client new: `src/utils/socket.js`, `src/utils/chat.js`, `src/components/chat/ChatPanel.jsx`.
- Client modified: `src/components/ui/GameFrame.jsx` (renders `<ChatPanel />`), `src/utils/presence.js` (migrated to shared bus).

**Feature flag:** rides the same `VITE_PRESENCE_ENABLED=true` flag as presence -- already on in prod. `ChatPanel` self-disables when off.

**Open follow-ups** (Step 1 polish, queue if real chat traffic surfaces them):
- No moderation / profanity filter yet.
- Fleet channel has no UI tab (server-side stub only) until corps land.
- No `@mention` highlighting / sound on direct address.

### 2026-05-28 — Multiplayer Phase 1 polish: peer flagship resolves to active ship (not oldest)

Bug: server's `fetchShipVisual` picked the player's **oldest** non-stored ship (`ORDER BY created_at ASC LIMIT 1`) as their flagship for the `ship_visual` descriptor sent to peers. A player whose oldest ship was a Fighter but who was actually flying a newer Capital broadcast as a Fighter -- peers saw the wrong silhouette for the flagship while wingmen were correct (those come from the per-tick fleet payload which reads live state).

Fix: prefer `users.active_ship_id` (set on login + on every `/set-active-ship` call). Fall back to the old "oldest non-stored" heuristic only if no `active_ship_id` is set (covers the new-account-setup race). Both queries keep the `storage_body_id IS NULL` filter so stored ships can never claim active status (pitfall #15).

Files: `star-shipper-server/src/realtime/presence.js`.

### 2026-05-28 — Multiplayer Phase 1 polish: clock-domain bug fix (the real smoothing fix)

User reported peer ships visibly stuttering at ~100ms intervals (matching the snapshot rate exactly). Diagnosed as a **clock-domain mismatch** in the interp math:

Snapshot `ts` was server-stamped (`server.Date.now()` at relay time), but the receiver's interp formula `t = (now() - prev.ts) / (next.ts - prev.ts)` used the client's `Date.now()` for `now()`. Any clock skew between server and client (always non-zero in practice -- no NTP sync between DO Node host and the user's laptop) shifted the numerator into permanent over/underflow. Result: interp `t` clamped to either 0 or 1 the entire snapshot window, making the peer position "stuck" at prev or next, then teleporting on snapshot arrival = visible periodic stutter.

**Fix:** stamp snapshots with **client receive time** at the moment they arrive at `socket.on('presence:peers'|'presence:snapshot')`, not the server-supplied ts. All interp math now lives in one clock domain (the receiver's). Server `ts` is ignored on the receiver side; staleness is detected the same way (`now() - peer.next.ts > 5s`) but in client time.

While we were at it, bumped `RENDER_DELAY_MS` 100 → 150 to give the interp window headroom for snapshot arrival jitter (network is rarely on-the-dot at 100ms intervals; a 50ms cushion eliminates the extrapolation/interpolation mode-switch snap at the boundary).

The Hermite + 10 Hz + buffered-interp scaffolding from earlier in the evening was correct; the clock bug was masking the smoothness wins. Net result post-fix: ~150ms perceived peer lag (acceptable for non-combat presence), smooth Hermite-curve motion between snapshots.

Files: `star-shipper/src/utils/presence.js`.

### 2026-05-28 — Multiplayer Phase 1 polish: 10 Hz + Hermite spline (less lag AND smoother)

Second pass on the smoothing. The buffered interpolation from earlier in the evening fixed the snap-on-snapshot-arrival, but motion still read jerky around direction changes. Three coordinated changes push both lag AND smoothness in the right direction simultaneously:

1. **Snapshot rate 5 Hz -> 10 Hz.** Client send interval drops from 200ms to 100ms (every 6 frames @ 60fps). Server's MAX_POS_HZ cap is already 10 so no server change needed. Halves the curve length between snapshots = visibly less per-segment jerk. Bandwidth doubles to ~1 KB/s per player, still trivial.
2. **Cubic Hermite interpolation** replaces linear lerp for position. Uses the already-broadcast `vx`/`vy` as tangent vectors at each endpoint. The curve passes through both snapshots WITH the right slope, so the broadcaster's actual trajectory gets approximated through each waypoint instead of straight-line dart-between. Same input data, smarter math, zero extra bandwidth. Rotation stays linear (we don't broadcast angular velocity, and shortest-arc linear is fine for ship heading).
3. **Render delay 150ms -> 100ms.** With 100ms snapshots a 100ms buffer means render time usually lands ON or just-before `next`, giving us a tight, low-lag interp window. Extrapolation fallback (broadcaster quiet >500ms) unchanged.

Wingmen stay on linear lerp -- we don't broadcast individual wingman velocities (payload would balloon), but their motion is already smoothed by the broadcaster's lagged-follow filter on the send side, so direction changes are gentler to begin with.

**Hardware check:** still none needed. 10 Hz × 80 bytes × 4 wingman entries = ~1 KB/s per player. A 10-player Sol cluster = ~100 KB/s server-out total. Trivial for the DO basic plan.

Files: `star-shipper/src/utils/presence.js`; `star-shipper/src/components/system/SystemView.jsx`.

### 2026-05-28 — Multiplayer Phase 1 polish: buffered interpolation (smooth peer motion)

Replaced the naive linear extrapolation render with **buffered snapshot interpolation** -- the standard multiplayer netcode pattern.

**Before:** each peer's render position was `peer.x + peer.vx * (now - peer.ts) / 1000`. Snapshot arrives every 200ms (5Hz); each new snapshot caused a position discontinuity (extrapolation overshoot/undershoot got snapped to truth). Direction changes were dramatically jerky.

**After:** singleton stores `prev` + `next` snapshots per peer. New helper `getRenderState(peer, now)` returns a position lerped between them, evaluated at `now - 150ms` (RENDER_DELAY_MS). The render time is slightly in the past so we usually have prev+next bracketing it. Falls back to linear extrapolation if `next` is >500ms stale (broadcaster went quiet). Rotation uses shortest-arc angular lerp. Wingman positions interpolated per-index against the matched entry in `prev.fleet`.

**Cost:** ~150ms perceived render lag on peer motion. Acceptable for non-combat presence; Phase 3 (authoritative combat) will need lag-compensation on hit detection regardless. **Hardware bump not needed** -- this was a pure client-side rendering math issue, server bandwidth is nowhere near limits (10-player Sol cluster = ~5 KB/s server-out total).

Files: `star-shipper/src/utils/presence.js`; `star-shipper/src/components/system/SystemView.jsx` (swapped inline extrapolation for `presence.getRenderState(peer, now)`).

### 2026-05-28 — Multiplayer Phase 1 polish: wingmen broadcast + ship_visual auto-refresh

Two follow-ups on the same evening Phase 1 shipped.

**Wingmen broadcast.** Peer's fleet now renders the whole formation, not just the flagship. The wire protocol's `presence:pos` payload gains a `fleet: [{x, y, rot, hull_type_id}, ...]` array (denormalized -- hull id rides every snapshot so the receiver doesn't need a lookup table). Server caps at 4 entries + validates types per-entry as a defense against payload bloat. Client reads positions from `wingmenPosRef.current` (same source the local render + combat use -- single source of truth). Peer render adds one ghost per fleet entry with dimmer cyan glow than the flagship so the flagship still reads as "the player." Bandwidth bump: ~120 bytes per 5 Hz tick for a maxed 4-wingman fleet = 600 B/s extra per player. Negligible.

**`bumpShipVisual()` auto-wired.** When a player equips/unfits a module or changes their active ship, the presence singleton's monotonic `shipVisualVersion` counter ticks. The next pos broadcast carries the new version, the server detects the bump and re-emits a fresh `ship_visual` descriptor (with current hull + accent + ship name) to the room. Peers refetch lazily without reconnect. Hooked at the API-wrapper level (`fittingAPI.fitModule` / `unfitModule` / `setActiveShip`) via a try-wrapped lazy import so api.js stays usable in non-presence builds. Captures every caller for free.

Files: `star-shipper-server/src/realtime/presence.js`; `star-shipper/src/utils/presence.js`; `star-shipper/src/utils/api.js`; `star-shipper/src/components/system/SystemView.jsx`.

### 2026-05-28 — Realtime Presence Phase 1 (multiplayer ghost ships)

**First slice of real multiplayer.** Two players in the same procedural system see each other's ships moving in real time. Pure presence -- no shared enemies, no combat sharing, no PvP (those are Phases 2/3). Validated end-to-end with two accounts in Sol on 2026-05-28.

**Architecture (locked + shipped):**
- `socket.io` server + `socket.io-client`; same Node process via `io.attach(httpServer)` -- single port, no extra service to deploy.
- Per-system rooms keyed `presence:system:${id}` (disjoint from the legacy `hub:*` namespace from a prior design; that legacy code is dead but left in place for a follow-up cleanup).
- Client-authoritative position relay (Phase 1 doesn't validate -- cheaters can teleport a visual ghost with no gameplay impact). 5 Hz pos snapshots; server rate-limits to 10 Hz per socket as a defensive cap.
- No DB writes -- presence state lives in memory (`Map<userId, socketId>` + `Map<systemId, Map<userId, peerState>>`). Server restart = ~2s reconnect blip.
- One active socket per user; new connect kicks the old socket via `'kicked'` event so the kicked tab can toast + close gracefully.
- 5s stale-peer eviction sweep (covers silent TCP death faster than socket.io's 15s pingTimeout).

**Wire protocol:**
```
Client -> Server:    presence:enter / presence:leave / presence:pos
Server -> Client:    presence:snapshot (on enter) /
                     presence:peer_join (with ship_visual) /
                     presence:peer_leave /
                     presence:peers (single-peer batch, server-stamped ts) /
                     kicked
```

`ship_visual_v` (monotonic counter, bumped by `presence.bumpShipVisual()`) tells peers when to refetch a player's visual descriptor without sending hull data on every pos broadcast.

**Visual treatment:** peer ships render via the same `shipRenderer.js` silhouette as own fleet (so peers see your actual fit), with a cyan glow halo + name tag. Linear extrapolation between snapshots (`render = peer.pos + peer.vel * dt`) keeps motion smooth at 60fps despite 5 Hz updates. Wingmen not broadcast yet -- flagship only.

**Files:**
- Server: `src/realtime/presence.js` (~225 LOC), `src/realtime/socketHandler.js` (added `attachPresence` call alongside legacy), `src/index.js` (added `/api/diag/presence` diag endpoint -- unauthenticated, counts only).
- Client: `src/utils/presence.js` (~210 LOC singleton with lazy-connect + 5 Hz throttle + auto-reconnect re-enter), `src/components/system/SystemView.jsx` (lifecycle effect + sendPos in game loop + peer render block + kicked toast).
- Deps: added `socket.io-client ^4.7.2` to client.
- Feature flag: `VITE_PRESENCE_ENABLED=true` on the DO static site env vars (per pitfall #10, must rebuild after setting).

**Gotchas during deploy:**
- DO App Platform's `/socket.io` HTTP route had to be added to the server component's Routing rules alongside the existing `/api` -- without it, the WS handshake 404'd at the static site.
- "Preserve Path Prefix" matters: socket.io's server expects to receive `/socket.io/...` intact.

**Backlog (Phase 1 polish + Phases 2-4) -- see "Up next > Realtime multiplayer" above.**

### 2026-05-27 — Cargo skills branch (Bulk Cargo Bay + 2 skills, research-gated)

Cargo capacity + volume are now both trainable bonuses, locked behind a new Industry research subbranch. Adds the first research-gated *skills* in the game (previously only modules + recipes were gated). Migration **055**:

- **Industry research subbranch**:
  - `tech_bulk_process` (T2, was placeholder) — now actually unlocks `cargo_large_2` Bulk Cargo Bay module + recipe.
  - `tech_cargo_handling` (T2, prereq `tech_adv_mining`, 600 RP) — unlocks the Cargo Handling skill.
  - `tech_cargo_compression` (T3, prereq `tech_cargo_handling`, 1800 RP) — unlocks the Cargo Compression skill.
- **`cargo_large_2` Bulk Cargo Bay** — T3 cargo module, 500 cap (vs 250 on `cargo_large`), 6000 cr buy / Titanium+Iron+Copper craft, both gated by `tech_bulk_process`.
- **Two new wired skills**:
  - `ind_cargo_handling` (Industry, rank 4, +3%/lvl `cargo_capacity_pct`).
  - `log_cargo_compression` (Logistics, rank 4, -2%/lvl `cargo_volume_pct`).
- **Server**: `getCargoBonuses(userId)` helper aggregates both. `getPlayerCargoInfo` applies them at read time — capacity multiplies the fleet-wide computed_cargo sum, volume shrinks the per-stack usage. Returns the raw multipliers too so callers (harvester collect) can apply the same volume math to their per-unit fit calcs. No ship recalc required when skills change — training propagates instantly.
- **Skill gating scaffolding** — new `skill_definitions.requires_tech` column. `/skills` GET returns `requires_tech` + `requires_tech_name` + `tech_unlocked` per skill; `/skills/queue/add` 403s if the gate isn't met. Mirrors the existing buy-module + craft gates.
- **Skills window UI** — locked skills show a gold `🔒 {Tech Name}` pill in the list and a "→ Open Research" deep-link panel in the detail pane that jumps to the Research tab on the gating node. Queue Train button disables.
- `WIRED_BONUS_TYPES` extended to include the two new contracts so both skills render at full opacity (no `○ CATALOG` dim).

Files: `migrations/055_cargo_skills_branch.sql`; server `api/resources.js`, `api/skills.js`, `api/harvesters.js`; client `components/research/SkillsResearchWindow.jsx`.

### 2026-05-26 — Crafting cargo tooltip share + Skills window wired-vs-catalog signal

- **Shared `CargoSlotTooltip`** extracted from `InventoryWindow` to `/components/items/CargoSlotTooltip.jsx`. Both branches preserved: items defer to `ItemTooltipContent` via `normalizeItem` (same renderer the Fittable Modules pane uses), resources keep the per-stat quality bars + base price. Accepts a `resourceIcons` map so each caller passes its own 2-letter abbreviation lookup. `InventoryWindow` swaps its local component for the shared one; `CraftingCargoPanel` adds hover state + portals the same tooltip on cargo-tile hover. The native `title` attribute on tiles was removed to stop the browser tooltip from racing the rich one. Ready to drop into `HarvesterCargoPanel` next.
- **Skills window dims catalog-only skills.** New `WIRED_BONUS_TYPES` set lists every `bonus_per_level.type` that gameplay code actually reads (9 today: `fleet_damage_pct`, `mining_yield_pct`, `crafted_quality_flat`, `sensor_range_pct`, `scan_time_pct`, `survey_scanner_range_pct`, `area_scan_radius_pct`, `bulk_belt_cooldown_pct`, `sweep_cooldown_pct`). `WIRED_BY_ID` covers skills wired by id rather than by contract (currently just `lead_training_discipline`). Stub skills dim to 55% opacity in the skill list + render a `○ CATALOG` pill in the subtitle row with hover-tooltip explanation. When a new bonus contract gets plugged in, add it to the set and affected skills brighten automatically -- single place to update.

### 2026-05-25 — Tooltip + crafting + vendor data unification

- **Module tooltips share one data shape.** `/inventory` server query LEFT JOINs `module_types` so cargo items carry `module_stats` + `module_tier` folded into `item_data.base_stats`/`tier`. `normalizeItem` (`utils/itemShape.js`) now uses the shared `STAT_META` + `qualityMultiplier` + `fmtStatValue` for the stats array, matching the per-stat scaling (sqrt for range, inverted for cycle/lock/scan time) used by ShipBuilderWindow's SlotInfo. InventoryWindow's hand-rolled item tooltip retired in favor of `ItemTooltipContent` via `normalizeItem`. Three surfaces (cargo hover, Fittable Modules pane, fitted-slot SlotInfo), one source of truth — adding a stat to `module_types.stats` server-side automatically appears everywhere.
- **Crafting window data fixes**: server `/recipes` returns `item_description` (item-level, not the recipe-level "Craft an X" string) + `module_stats` JOINed from `module_types`. Top header now shows the item description; OutputPreview now finds stat numbers for module recipes (previously empty because `item_data_defaults` for modules is just `{slot_type}` — actual stats live in `module_types.stats`).
- **Crafting OutputPreview** reformatted to additive framing: `DAMAGE 6 +5 from quality → 11` (with sign + color showing direction). Q50 ingredients leave only the base value visible since delta is 0.
- **Vendor module rows** show a compact stats line under the description (`DAMAGE 10 · CYCLE TIME 2.0s · RANGE 300`). Row minHeight bumped 52→66 + accent bar 40→54 to fit cleanly.

### 2026-05-25 — Sensor sweep ping animation + sonar audio

- System Telemetry Array no longer instant-reveals. Click → 12s ping warm-up (3 expanding wave rings + 3 sonar audio pings at 4s intervals, mirrored on both SystemView and SystemMapWindow at the fleet position) → 30s reveal of every enemy in the system → 120s cooldown.
- `audio.js` registered `sonar_ping → freesound_community-sonar-ping-95840.mp3`.
- New `sweepStartedAt` in gameStore so SystemMapWindow can read the activation timestamp without coupling to SystemView refs. Map uses a `useSweepTick` hook that idles when no sweep is active and runs 30fps only during the ping window.
- Combat-effects SVG layer (mining sparks etc.) wrapped in `pointer-events: none` so the sparks no longer steal hover/click events from the asteroid `<g>` underneath.

### 2026-05-25 — Enemy fleets Phase 1+2

- Phase 1: spawn count `dangerLevel * 5 + rng(0..d*3)` — 5-star systems now field 25–40 pirates. Hull pool rebalanced toward destroyers + capitals at higher danger. Pirates spawn in **fleets of 2–4** (3–4 at danger 5) sharing a `patrolCenter` and a `fleetId`. Per-frame **fleet rally**: any patrol/returning member of an engaged fleet force-switches to chase when a fleet-mate spots the player.
- Phase 2: pirate combat stats now derive from a tiered **loadout catalog** (`PIRATE_WEAPONS` / `PIRATE_SHIELDS` / `PIRATE_ENGINES` + `PIRATE_LOADOUT_TIERS`) instead of hardcoded `PIRATE_HULLS.stats`. Hull is purely visual + base HP. Hull pool now mixes pirate visuals with player combat hulls (`fighter`, `scout`, `frigate`, `capital`). Display name reads "Pirate Destroyer (Heavy Cannon)" so threats parse at a glance. Loot scales × loadout tier.
- Phase 2b (formation flying with leader + lag-follow wingmen) specced in backlog; deferred until playtest validates the loadout work.

### 2026-05-25 — Module obtain paths + cross-window deep linking

- Migration 053 wires actual buy + craft paths for the 4 higher-tier scanners (T2 Advanced, T2.5 Wide-Field, T3 Elite, System Telemetry). Adds `requires_tech` column on `module_types` + `crafting_recipes`; server `/buy-module` + `/craft` enforce the gate.
- Vendor module rows show `🔒 Sensor Refinement` badge when research-locked (click → jumps to the research tree). Unlocked rows get a `⚒ Craft` button alongside the buy button.
- CraftingWindow auto-selects the deep-linked recipe; locked recipes show a yellow lock panel with a "→ Open Research" button.
- gameStore: `craftingTargetRecipeId` + `researchTargetTechId` state mirrors the cross-window navigation pattern.

### 2026-05-25 — Galaxy fog of war + station markers

- `player_system_visits` table (migration 051) + `/api/galaxy/{visits,visit}` endpoints. App.jsx `hydrateDiscoveredSystems` on login. Undiscovered systems render as bare gray dots (no name / faction / star type) on both the map and in-flight view; jump connection lines render only when at least one endpoint is discovered.
- `galaxyGenerator` now decorates every system with `hasStation` (Sol = true; procedural systems check `body.type === 'station'`). GalaxyMapWindow + GalaxyFlightView render a small gold rect + antenna line next to the star dot when discovered AND `hasStation`. GalaxyMapWindow info panel gains a "Station: Yes/None" row.

### 2026-05-25 — Scanner depth Tier B + Tier C

- Tier B: 3 new modules (Wide-Field Sensor Array T2.5 with `area_scan`; Elite Survey Grid T3 with `bulk_scan`; System Telemetry Array with `system_sweep`), 3 research nodes branching off Sensor Refinement, bottom-right ability tray with cancel toggles + cooldown countdowns.
- Tier C: 3 paired Astrometrics skills (`ast_area_scanning` +10% radius/level, `ast_bulk_belt_efficiency` -10% cooldown/level, `ast_telemetry_ops` -5% sweep cooldown/level).
- Asteroid scans now parallel + queued correctly: area scan uses scan_range (not sensor range) and runs every rock's timer simultaneously; bulk-belt scans the whole system in parallel with `unbounded: true` to bypass the per-rock distance-cancel.
- Training Discipline skill (Leadership, 7 levels) caps the queue at `3 + level` (max 10). Migration 054 adds `sp_per_level_override JSONB` so a skill can define exact per-level SP costs — Training Discipline uses this for L1=7d through L7=60d real-time training durations.

### 2026-05-22 — Active training indicator (top bar + Skills window header)

- Shared `ActiveTrainingIndicator` component shows the head queue skill (live progress bar driven by precomputed `finishes_at` + 1s ticker) and current RP balance. Compact variant in the GameFrame top bar (clickable → opens Skills & Research window). Expanded variant in the SkillsResearchWindow header next to the tab strip.
- When the head queue entry's `finishes_at` elapses, the indicator fires `fetchSkillsAndResearch` to commit the level bump server-side + advance the queue.
- First-load fallback fetches data on mount so the indicator works even before the player enters SystemView.
- Files: `src/components/ui/ActiveTrainingIndicator.jsx` (new); `src/components/ui/GameFrame.jsx`; `src/components/research/SkillsResearchWindow.jsx`.

### 2026-05-22 — Cargo-full lockout cleared on dock-state change

- `cargoFullRef` went stale: set to true when server returns `cargo_full`, only reset on system change. Selling at a station / collecting from a harvester / jettisoning cargo all left it stuck → subsequent mine clicks were blocked client-side with "Cargo full" even though cargo was empty.
- Fix: clear the ref on every dock-state change (dock or undock). Server stays authoritative; client just stops pre-blocking based on a stale observation.
- File: `src/components/system/SystemView.jsx`.

### 2026-05-22 — PlanetInteractionWindow widened 440 → 720

- Harvesters tab was cramped after the cargo pane added (440 - 220 cargo - gap - padding ≈ 190px for the slot column). Bumped width to 720 to give the slot column ~470px while leaving other tabs (Scan, Mine, City/Station) with extra breathing room.

### 2026-05-22 — Harvester cargo pane (click-to-deploy)

- Right-side cargo pane in HarvestersTab mirroring CraftingCargoPanel's chrome. Renders item-type stacks (harvesters + fuel cells) with InventoryWindow's item-branch visual code (slot-type color, quality dot, stack badge).
- Harvester tiles glow + accept click-to-deploy to the first empty slot. Drag-drop still works. Fuel cells render dimmed but draggable for refueling.
- Files: `src/components/system/PlanetInteractionWindow.jsx` (`HarvesterItemTile` + `HarvesterCargoPanel` + HarvestersTab restructure).

### 2026-05-22 — Crafting cargo pane (click-to-add + visual parity)

- Right-side cargo pane in CraftingWindow. After a false start with `ItemCell` (visual drifted from InventoryWindow), now uses **the exact same stack-render code as InventoryWindow** (`RESOURCE_ICONS` abbreviation, `TIER_BORDER` color, quality dot, stack badge) for true visual parity.
- **Click-to-add**: clicking a tile that matches one of the selected recipe's ingredients fires the same `handleIngredientDrop` codepath as drag-drop. Matching tiles glow + stay opaque; non-matching tiles dim to 55% so the player can scan their cargo and instantly see what's relevant. Click-to-remove via existing X-button on assigned-stack pills.
- ContextPanel width 460 → 720 to fit the new column.
- Drag-drop still works for users who prefer it.
- Bonus fixes: `itemShape.normalizeItem` no longer pulls `RESOURCE_TYPES.icon` (legacy filename strings that rendered as overflowing text); always uses the 2-letter abbreviation. `ItemCell`'s default drag payload backfills `item_type` from `item.kind` so resource drags carry the right shape everywhere.

### 2026-05-22 — Vendor: buy probes + fuel cells fixed

- `buySupply` called `/buy-module` for everything, which only special-cased `starter_kit`. `scanner_probe` / `advanced_scanner_probe` / `fuel_cell` fell through to a `module_types` lookup that 404'd → "Module not found" toast.
- Added a server-side `SUPPLIES_CATALOG` dict with authoritative prices. The buy-module handler matches against it first; if matched, deducts credits and stacks the supply into `player_resource_inventory` (the same table `/probes` reads from).
- File: `star-shipper-server/src/api/fitting.js`.

### 2026-05-22 — Asteroid mining cargo volume parity

- Asteroid-mined resources occupied ~1/50th the cargo of equivalent planet-mined units because the INSERT into `player_resource_inventory` omitted the `stat_*` columns, leaving `stat_density` NULL, collapsing the volume formula `GREATEST(stat_density, 1) / 100` to 0.01 per unit.
- Fix: asteroid mines now insert with baseline 50/50/50/50 stats (the q50 convention used everywhere else). Stack-find query matches on stats so asteroid stacks don't merge into planet-mined stacks of different quality.
- Not backfilling existing rows — silently pushing players over cargo cap mid-session is worse than the inconsistency.
- File: `star-shipper-server/src/api/resources.js`.

### 2026-05-22 — Harvester quest chain + supporting fixes

- Tutorial chain extension: `tutorial_survey_planet` → `tutorial_mine_deposit` → `tutorial_collect_minerals` → `tutorial_craft_harvester` → `tutorial_deploy_harvester` → `tutorial_collect_harvester`. Teaches the full planetary loop. New `craft_basic_harvester` recipe (20 Iron + 10 Copper).
- Mine tab `fetchData` deps bug: deps were `[body?.id]` but the function used `effectiveBodyId`. On reopen, first fetch fired with `effectiveBodyId=null` and deps never picked up the null→UUID flip. Added `effectiveBodyId` to deps + early-return guard.
- Quest description for survey quest now hints at the Luna vendor for probe restock.
- Migrations 037 (new chain + harvester recipe + backfill), 038 (probe hint), 039 (Cargo In Hand + chain rewire + backfill).

### 2026-05-22 — Pinned quests overlay (replaces Outliner Current Quest section)

- Persistent top-of-screen tiles for the player's pinned active quests. Tutorial quests auto-pin server-side; the player toggles pin/unpin from the Missions log. Slide+fade+pulse animation on entry, per-category accent colors.
- Migration 035 adds `player_quests.pinned BOOL` + backfills active tutorials.
- Server auto-pins tutorial quests on first-time activation AND on `triggers_quests` chain activation. `POST /quests/pin` toggle.
- Outliner Current Quest section deleted — the pinned overlay replaces it with a dedicated, animated focus surface.

### 2026-05-22 — Onboarding: grant Starter Scout on registration

- New players spawn already in a Starter Scout (pre-fitted engine + reactor) instead of having to buy one. `tutorial_buy_starter_scout` is retired; `tutorial_fly_to_luna` ("Into the Black") is the new opening quest.
- `util/starterShip.js` exposes `grantStarterShip(userId)`; called from both `createUser` (email/password) and `findOrCreateOAuthUser` new-user branch + from `/reset-account` so DEV reset matches a fresh registration.
- Starter Kit now includes `mining_basic` so the player can fit all 7 slots on the Scout (mining slot from migration 027 was added without updating the kit; "Ready for Launch" was stalled). Migration 036 backfills the laser for stuck players.
- Launch Game button no longer auto-opens Ship Builder (made sense when first quest was "buy your ship," now just clutter); Quest Log still auto-opens so "Into the Black" surfaces.
- Migrations 034 (retire buy-scout quest), 036 (Starter Kit mining laser + backfill).

### 2026-05-22 — Tutorial chain extension: mine + sell

- After scan, the player learns to mine and sell. `tutorial_mine_resources` ("Strike It Rich") fires on first asteroid mine; `tutorial_sell_at_luna` ("Cash Out") fires on first resource sale.
- Migration 033 + client hooks in SystemView mine response + PlanetInteractionWindow sellResource.

### 2026-05-21 — Skills + Research framework + 165-skill catalog

- **Skills**: EVE-style passive training. 10-slot queue, 30 SP/min, on-read commit (no cron). `player_skills` + `player_skill_queue` tables. Routes: `GET /skills`, `POST /skills/queue/{add,remove}`. Initial 20 skills across 6 categories — then expanded to **165 skills across 19 categories** (Gunnery, Missiles, Engineering, Navigation, Targeting, Drones, Astrometrics, Industry, Science, Trade, Social, Spaceship Command, Exploration, Rigging, Leadership, Planetary, Processing, Power, Logistics). Most bonus types are stubs — they're the implementation contract for future systems.
- **Research**: Civ-style tech tree. 5 trees × 3 tiers = 15 nodes, strict prereqs, single RP pool, 1 RP/min trickle, instant unlock on spend. Two real unlocks today: Sensor Refinement → `utility_scanner_adv`, Advanced Mining → `mining_laser_2`. The other 13 are placeholders waiting for matching gameplay.
- **UI**: Skills & Research window (90vw × 88vh modal) with 3-pane Skills tab (categories | list | detail) + queue strip, and Research tab with SVG tree visualizer (cubic-bezier prereq lines, status-colored nodes, click-to-research confirm).
- **Bonus wiring (Phase 1)**: Gunnery → fleet weapon damage; Industry → mining yield (server-applied); Astrometrics → sensor range. Other ~140 bonus types are stubs.
- Toolbar 🔬 Research button now opens the window.
- Migrations 031 (schema + initial content + 2 modules) + 032 (catalog expansion).
- Direction memory: skills/research catalog **defines** what gets built — check `skill_definitions.bonus_per_level->>'type'` before inventing new mechanics. Pitfall #15 captures the fleet-wide check convention.

### 2026-05-21 — Sensor range gate + scan tutorial

- `sensor_range: 500` on `utility_scanner`. SystemView filters enemy render + HUD count by `max(fleet scanner range)`; falls back to `INNATE_SENSOR_RANGE = 150` (matches PIRATE_ATTACK_RANGE) when no scanner fitted. AI keeps running on out-of-range enemies — they're just hidden.
- HUD enemy count split: local raw count drives the "clear sector" quest watcher; store/HUD shows visible count.
- New `tutorial_scan_asteroid` quest chained after `tutorial_fit_modules`. Fires on first successful asteroid scan.
- Migration 030.

### 2026-05-20 — Multi-laser per-asteroid mining (Phase A4)

- Every fitted mining laser is independently click-assigned to its own asteroid. Click a scanned rock → next idle laser locks. Click an already-mined rock → release one laser from it (LIFO). Max concurrent = total fitted lasers across fleet.
- Server: `/asteroids/mine` accepts `{ship_id, slot_key}` and yields per-laser (not fleet-sum). Validates laser exists + ship not stored.
- Client: `miningAssignmentsRef` Map (`laserKey → {asteroidId, cooldownMs, inFlight}`). Per-laser cooldown + fire + response handling. Cargo-full releases all; depletion releases all lasers on that asteroid. Beam-per-assignment. Asteroids show concentric rings + `N×` badge for stacked lasers.

### 2026-05-20 — Wingman lagged-follow movement

- Wingmen had rigid satellite math (`primary.pos + rotateOffset(slot, primary.rotation)`), causing them to pinwheel around the primary on hard turns. Now each wingman has its own world position that lerps toward the formation slot at `1 - exp(-WINGMAN_LAG_RATE * delta)` (~90% catch-up in ~600ms). Heading tracks actual movement direction while chasing; snaps to leader when settled. Trails, combat firing, render, and mining beams all read the lagged position so visuals + hitboxes stay aligned. System-change resets `wingmenPosRef`.
- User-confirmed: this is the right feel for fleet movement. Saved to memory as `feedback_fleet_movement_feel.md`.

### 2026-05-20 — Module-fit checks made fleet-wide

- "Has scanner / mining laser fitted?" was checking only the active ship — modules on wingmen were ignored. Same bug surfaced twice (mining laser, then scanner).
- New `fleetHas(predicate)` client helper reads `fleetShipsRef.current`. Scanner + mining click handlers use it. Server: `/asteroids/scan` rewritten to enumerate the fleet (matched mining's pre-existing pattern); both endpoints add `AND storage_body_id IS NULL` so stored ships don't grant in-space capability.
- Pitfall #15 in CLAUDE.md captures the convention for all future module gates.

### 2026-05-20 — Ship Storage Phase 1

- Fleet cap 5. Ships can be stored at a station (`ships.storage_body_id` UUID, nullable). Fleet window partitioned into Active + Stored sections; City/Station tabs gain a Ships sub-tab with Store-Here + Activate buttons. `buy-hull` auto-stores when fleet is full + dock body provided.
- Migrations 028 (schema) + 029 (luna_station alias for the buy-supply resolver).
- Various consumers of `ships` (SystemView, GalaxyFlightView, GameFrame HUD, Outliner, CharacterPanel) updated to filter `storage_body_id == null` so stored ships don't fly with the fleet.

---

## How to keep this file useful

End of each working session:

1. Move anything from **In progress** that shipped → **Recently shipped** (date + one-line gloss).
2. Move anything from **Up next** that you started → **In progress**.
3. Add new ideas to **Up next**, new bugs to **Known issues**.
4. Bump the **Last updated** date at the top.
5. Trim **Recently shipped** entries that are no longer load-bearing context (>2 weeks old, mostly).

If a session produces architectural changes, mirror those into `HANDOFF.md`. If it produces a new pitfall worth remembering, add it to `CLAUDE.md` § "Critical pitfalls".
