# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-28 (Realtime Presence Phase 1 SHIPPED end-to-end — two-account multiplayer verified in prod)

---

## Current state — one-liner

Live in prod. Full core loop (mine → craft → fit → fly → trade → fight → explore) works across 200 procedural systems. Onboarding is a 12-step tutorial chain that walks the player from "land in a Starter Scout" → "build + deploy a harvester" → "collect passive output." Recent sessions added **Skills + Research framework** (EVE-style training queue + Civ-style tech tree, 165 skills + 15 tech nodes), **multi-laser per-asteroid mining**, **wingman lagged-follow movement**, **pinned quests overlay**, and **embedded cargo panes** in Crafting + Harvesters tabs.

- Live URL: https://star-shipper-fjrrq.ondigitalocean.app
- Branch: `main` (auto-deploys on push)
- DB schema: through migration **055**; next new migration is **056** (009 was skipped)

---

## In progress

*Nothing currently in flight.* Realtime Presence Phase 1 shipped end-to-end (verified 2026-05-28 with two accounts in Sol, ghost ships rendering correctly). Phase 1 polish + Phase 2 (server-owned enemies) are queued -- see below.

---

## Up next

Unranked queue. Pull from the top of the next session, or pick by interest.

### User-prompted, coming next

- **Outliner restructure** — user flagged it's due for changes (specifics TBD when work starts). Density, section priority, what shows when, etc.
- **System map changes** — user flagged the in-system SVG view needs work (specifics TBD).
- **Grow the research tree as we build systems** — every new gameplay system (colonies, factions, advanced combat, etc.) should land with new tech nodes that gate it. The skill catalog (165 entries) is already broad — research nodes should expand to match. Per pitfall #15, check `skill_definitions.bonus_per_level->>'type'` for existing bonus contracts before inventing new ones.

### Realtime multiplayer

Phase 1 SHIPPED 2026-05-28. Phases 2-4 still ahead. See the "Recently shipped" entry for the full Phase 1 architecture; this is the forward-looking backlog.

**Phase 1 polish (remaining):**
- **Hover-to-identify** — clicking/hovering a peer ship currently does nothing. Should at least open a small panel: pilot name, ship class, maybe shared-system-time. Spec'd as `> PROFILE` link, deferred.
- **Galaxy-map presence** — Phase 1 only covers SystemView. Peers vanish during galaxy-fly transits. Phase 2-ish polish: also broadcast on the galaxy map (separate room key, e.g. `presence:galaxy`).
- **Cleanup legacy `hub:*` / `mission:*` socket code in `socketHandler.js`** — dead code from a prior design, no client consumers. Safe to remove now that Phase 1 is proven.

**Phase 2 — Shared enemies (~2-3 weeks):**
Pirates owned by server. New `system_combatants` table (or in-memory map keyed by system_id). Server tick at ~10 Hz runs pirate AI (chase / patrol / fire) -- currently ~600 LOC of AI in `SystemView.jsx`, ports server-side. Pirates spawn server-side on first player entering an empty system, persist while ≥1 player is in-system, despawn after grace period. Client stops generating pirates; renders from server snapshots. Important: pitfall #5 (shared time source) gets harder -- server's tick clock becomes truth, client interpolates. Big refactor; ship under a feature flag so single-player keeps working during migration.

**Phase 3 — Authoritative combat (~3-4 weeks):**
"Fire weapon" becomes a request, not a local event: `POST /combat/fire {weapon_slot, target_id}` → server validates range/cooldown/quality/LOS → computes hit + damage → broadcasts to room. Pirate kills credit the firing fleet (existing loot endpoint, rewire trigger). PvP gate: opt-in flag per player or per-system (high-sec vs null-sec analog) -- design call. Wreckage cleanup: the parked server-side wreck endpoints (Known Issues) become required, not optional.

**Phase 4 — Polish:**
Client prediction + reconciliation so your own ship feels snappy despite round-trip. Lag compensation on hit detection. Sweep telemetry handling for spectators. DO dev DB → managed prod plan; WS connection count starts to matter.

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
