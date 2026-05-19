# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-14 (Wreckage Phase 1)

---

## Current state — one-liner

Live in prod. Full core loop (mine → craft → fit → fly → trade → fight → explore) functional across 200 procedural systems. Recent sessions have been **UI polish + Quest system surfacing**, not new gameplay systems.

- Live URL: https://star-shipper-fjrrq.ondigitalocean.app
- Branch: `main` (auto-deploys on push)
- Working tree: clean
- DB schema: through migration **016**; next new migration is **017** (009 was skipped)

---

## In progress

- **Mining UX fixes: store-sync on fit + click-to-mine** — code written, **needs commit + push** (no migration). (2026-05-19)
  - Bug 1: After fitting a module in Ship Builder, the global store's `ships` array wasn't refreshed, so SystemView's `playerShip.fitted_modules` stayed stale. `hasMiningLaserFitted` / `hasScannerFitted` returned false, so no firing / scanning. Fix: `handleSlotDrop` + `handleSlotClick` now call `fetchShips()` after success.
  - Bug 2: Mining was auto-fire-on-proximity. User wants click-to-mine on a specific scanned asteroid. Refactored: `miningTargetRef` holds the explicit lock. Click a scanned asteroid (in range, laser fitted, cargo not full) → mining starts on it. Click same again → stop. Click different one → switch. Out-of-range automatically releases lock. Depletion clears lock. Orange dashed ring marks the active target.
  - Files: `src/components/ship/ShipBuilderWindow.jsx` (fetchShips on fit + unfit); `src/components/system/SystemView.jsx` (miningTargetRef, click handler refactor, loop reads target not nearest, target visual); `STATUS.md`.

- **Mining fitting fixes** — code written, **needs commit + push + DO migrate**. (2026-05-18)
  - Scout + starter_scout get a mining slot (mng1, at the bow). Without it the starter ship literally couldn't fit a mining laser since only Shuttle + Capital had mining slots.
  - Server `unfit-module` was writing item_data without slot_type. The Ship Builder's FittableModulesPanel filters cargo by `item_data.slot_type` — so unfit modules became invisible in the ship builder (still in regular Cargo, just hidden from the fit panel). Fixed: unfit now looks up + includes slot_type.
  - Migration 027 backfills existing cargo items with slot_type so previously-stranded modules reappear in the Ship Builder.
  - Files: `migrations/027_scout_mining_slot.sql` (new); `src/api/fitting.js` (unfit-module slot_type include); `CLAUDE.md` (migration counter); `STATUS.md`.

- **Asteroid mining — Phase A3 (mining laser + respawn)** — code written, **needs commit + push + DO migrate + live-URL test**. (2026-05-18)
  - Migration `026_mining_laser_stats.sql` adds `mine_range:120`, `mine_yield:5`, `mine_cycle:2` to `mining_basic.stats`.
  - Server: `POST /resources/asteroids/mine` validates fitted laser, picks first resource with remaining > 0, decrements asteroid + adds to inventory in a transaction, checks fleet cargo capacity (returns 409 `cargo_full` for client to halt). Depletes asteroid + sets `respawn_at = NOW() + 10min` when emptied. `GET /resources/asteroids` now runs a lazy respawn pass before listing — depleted asteroids whose respawn timer has passed get fresh contents (re-rolled, non-deterministic) at the same position. Resource names enriched server-side.
  - Client: auto-fire mining loop in the game loop. While a `mining_basic` is fitted and an asteroid is within `MINE_RANGE = 120`, fires every 2s with an orange beam visual (`#ffaa44`). Server response patches the local asteroid contents; depleted ones drop from `asteroidsRef`. On `cargo_full`, sets a ref that halts mining + pushes an error toast. Reset on system change.
  - **Phase A complete** with this push — A1 (presence), A2 (scan reveal), A3 (mining). Follow-up items in "Up next" cover the tier upgrades (advanced/elite scanner), bulk-scan, system-wide sweep, and the cargo-volume model.
  - Files: `migrations/026_mining_laser_stats.sql` (new); `src/api/resources.js` (mine endpoint + lazy respawn + name enrichment helper + roll-contents extraction); `src/utils/api.js` (asteroidsAPI.mine); `src/components/system/SystemView.jsx` (mining loop + helper); `CLAUDE.md` (migration counter); `STATUS.md`.

- **Asteroid mining — Phase A2 (per-asteroid scan)** — code written, **needs commit + push + DO migrate + live-URL test**. (2026-05-18)
  - Migration `025_scanner_stats.sql` adds `scan_range: 80` + `scan_time: 8` to `utility_scanner.stats` and creates `player_asteroid_scans` table.
  - Server: `GET /resources/asteroids` now LEFT JOINs `player_asteroid_scans` and returns contents only for asteroids THIS player has scanned (data-layer gate, not just UI). `POST /resources/asteroids/scan` validates the player has a `utility_scanner*` module fitted, records the reveal, returns contents.
  - Client: click an asteroid → range + scanner check → starts an 8s client-side timer with a yellow progress arc visual on the asteroid → server call on completion records + reveals. Scanned asteroids render with a green tint + outline. Click a scanned asteroid to re-toast its contents.
  - Module-quality tier upgrades (advanced/elite + bulk-scan flag) deferred per spec — listed in "Up next".
  - Files: `migrations/025_scanner_stats.sql` (new); `src/api/resources.js` (gated GET + POST scan); `src/utils/api.js` (asteroidsAPI.scan); `src/components/system/SystemView.jsx` (click handler, scan game-loop block, progress arc render); `CLAUDE.md` (migration counter); `STATUS.md`.

- **Asteroid mining — Phase A1 (presence + render)** — code written, **needs commit + push + DO migrate + live-URL test**. (2026-05-18)
  - Migration `024_asteroids.sql` adds the `asteroids` table (system_id, belt_body_id, x, y, size, rotation, contents JSONB, depleted_at, respawn_at).
  - Server: `GET /resources/asteroids?system_procedural_id=X` lazily generates 20–40 asteroids per belt on first request, deterministic from system seed + belt index. Resource pools rolled 70% common / 25% rare / 5% exotic per resource slot; 1–3 resources per asteroid. SRng helper now exported from `util/seed.js`.
  - Client: `asteroidsAPI.list(...)` + a `useEffect` in SystemView fetching on system change. Rendered as small irregular gray polygons (rotation per asteroid for variety) between celestial bodies and projectiles in the SVG.
  - **Phase A2 (next):** per-asteroid scan endpoint + UI to reveal contents. Bulk-scan module is the upgrade path.
  - **Phase A3 (later):** mining laser as auto-fire weapon — server-side mine tick, cargo capacity check, depletion → respawn.
  - Files: `migrations/024_asteroids.sql` (new); `src/util/seed.js` (export SRng); `src/api/resources.js` (asteroid endpoint + generator); `src/utils/api.js` (asteroidsAPI); `src/components/system/SystemView.jsx` (fetch + SVG render); `CLAUDE.md` (migration counter); `STATUS.md`.

- **Wreckage Phase 1.5 (random module drops)** — code written, **DROP RATE TEMPORARILY 100% for verification — must dial back to 0.25 after testing**. (2026-05-14)
  - Server: `/wrecks/spawn` now rolls 25% chance to drop a random module (tier ≤ 2, low-mid quality 30-60 per stat) into `contents.modules`. `/wrecks/claim` deposits modules into the player's next free inventory slot using the existing buy-module pattern, returns `modules_awarded` names.
  - Client: wrecks with modules render an extra cyan dashed ring + "+ MOD" suffix on the credit label so players can spot them at a distance. Salvage toast lists the module name (e.g. `Salvaged: +50 cr + Pulse Laser`).
  - Tunable: `MODULE_DROP_CHANCE` constant in resources.js (currently 0.25). Quality range hardcoded 30-60 — easy to tune later.
  - No new migration required — the `contents` JSONB schema already supports modules.
  - Files: `src/api/resources.js` (spawn roll + claim deposit); `src/components/system/SystemView.jsx` (visual ring + toast wording); `STATUS.md`.

- **Wreckage Phase 1 (pirate-kill loot drops)** — ✓ deployed and verified working. (2026-05-14)
  - Migration `021_wrecks.sql` adds the `wrecks` table (system_id, x, y, JSONB contents, source, expires_at, claimed_by). Indexes for active-by-system and unclaimed-by-system lookups.
  - Server: 3 new endpoints — `POST /resources/wrecks/spawn` (caps credits at 1000, ensures system row), `GET /resources/wrecks` (active list, filtered by claimed/expired), `POST /resources/wrecks/claim` (atomic race-safe claim).
  - Client: `wrecksAPI` in `api.js`. SystemView replaces `fittingAPI.awardLoot` with `wrecksAPI.spawn` on enemy kill. Polls `/wrecks` every 3s. Renders gold credit chips at wreck positions in the SVG (between enemies and projectiles). Game loop checks proximity each frame; flying within `PICKUP_RANGE = 30px` fires a claim, awards credits, toasts "+N cr salvaged".
  - Locally-spawned wrecks added immediately so the salvage target appears before the next poll.
  - Despawn: 5-min server-side TTL via `expires_at`, filtered out of list endpoint.
  - Multiplayer trust caveat: spawn + claim trust client position (same as old `awardLoot`). Tighten when pirates move server-side.
  - Files: `migrations/021_wrecks.sql` (new); `src/api/resources.js` (3 endpoints + system resolver helper); `src/utils/api.js` (wrecksAPI); `src/components/system/SystemView.jsx` (kill→spawn, polling, proximity claim, SVG render); `CLAUDE.md` (migration counter); `STATUS.md`.

- **Cities — Phase A (presence + tab restructure)** — code written, **needs commit + push + DO migrate + live-URL test**. (started 2026-05-12)
  - Migration `020_city_planets.sql` adds `has_city BOOLEAN` to `celestial_bodies` and sets Earth = TRUE.
  - Server: `ensureBody` now computes `has_city` deterministically from `system_seed + system_planet_count + body_client_id` (40% chance per system, picks one random planet index). New helper `src/util/seed.js`.
  - Client: ensureBody call passes seed + planet count; `PlanetInteractionWindow` stores `has_city` in state.
  - UI: Vendor tab renamed/gated. Stations always show "Station" tab; planets show "City" tab only if `has_city`. Inside is sub-tabbed: Vendor (existing) / NPCs (stub) / Buildings (stub).
  - Phase B (per-city vendor variance — faction-driven inventory + resource-availability pricing) deferred.
  - Files: `migrations/020_city_planets.sql` (new); `src/util/seed.js` (new); `src/api/resources.js` (ensureBody); `src/utils/api.js` (comment); `src/components/system/PlanetInteractionWindow.jsx` (state + UI restructure); `CLAUDE.md` (migration counter); `STATUS.md`.

---

## Up next

Unranked queue. Pull from the top of the next session, or pick by interest.

- **Asteroid mining Phase A3** — mining laser as auto-fire weapon. Server-side mine tick, cargo capacity check, asteroid depletion → respawn timer. The schema for depletion + respawn already exists in migration 024.
- **Scanner tier upgrades** (Phase A2 follow-up): add `utility_scanner_adv` (tier 2) and `utility_scanner_elite` (tier 3) to `module_types`. Stats per design — wider `scan_range`, shorter `scan_time`, elite gets `bulk_scan: true` flag.
- **Bulk-scan-belt action** — when elite scanner is fitted, a button appears in SystemView that scans every asteroid in the current belt at once. UI affordance + server endpoint variant.
- **System-wide sensor sweep** — late-game module that reveals all enemies on the system map regardless of proximity. Likely a new module type (`utility_systemscan` or similar) with a cooldown. Pairs with wiring `sensor_range` to enemy render visibility so basic-sensor ships can be jumped.
- **Wire `sensor_range` to enemy detection** — pirates currently render at all distances; gate visibility on the fleet's totalSensorRange.
- **Podding — Phase 2: wreckage + cargo ejection.** Add `wrecks` table + spatial entity, eject ~50% of player inventory + destroyed ship's modules into a wreck on death, pod can salvage. Pirates contest wrecks (Phase 3 polish).
- **Hardcoded `localhost:3001` audit** — pitfall #9 violation existed in the old respawn code; sweep the rest of the client for similar stragglers.

---

## Known issues / open threads

Bugs noticed but not fixed; rough edges to revisit.

- **Wreckage server-side parked until multiplayer matters** — `/wrecks/spawn` and `/wrecks/list` returned PG `42P01` despite migrations 021 + 022 being recorded as applied. Root cause not pinned down (schema, DATABASE_URL routing, schema cache, or something stranger). **Doesn't matter today** — gameplay works via the client-only wreck workaround (see 2026-05-17 entry below). Revisit when multiplayer ships and we need race-safe server-side claims across players. At that point: add a `GET /api/diag/db` probe endpoint that dumps what the runtime sees vs what migrations tracker recorded.
- **`/repair-cost` server endpoint is now dead code** — kept for backward compat. Safe to remove once we confirm no client references remain after deploy.
- **`ShipBuilderWindow.jsx:837` also calls `fittingAPI.buyHull()`** but doesn't refresh the global ships array on success. If we ever surface that flow to a podded player it'll have the same auto-disembark staleness bug as the vendor did. Worth a defensive `fetchShips()` if the path becomes reachable from the podded state.

---

## Recently shipped

Most recent first. Group by session/theme, not per-commit. Trim entries older than ~2 weeks once they stop being load-bearing context.

### 2026-05-17 — Local-only wreckage (workaround for missing wrecks table)

- Re-enabled the "loot dropped on kill, fly to salvage" gameplay without depending on the server-side `wrecks` table (still busted). Wrecks spawn in client memory (`wrecksRef`) on enemy destruction (laser AND projectile branches), render via the existing SVG block, and on proximity-claim award credits via the working `fittingAPI.awardLoot` endpoint. 5-min TTL filtered each game-loop frame.
- Trade-offs vs the server-persisted design: client-only (each player sees their own wrecks if multiplayer is added later), wrecks vanish on reload / system change, no module drops (would need a server endpoint to grant a random module — defer). Identical visuals + UX otherwise.
- Server wreck endpoints, table, migration, and `wrecksAPI` client methods all remain in place. When the wrecks-table issue is resolved, swap the local `wrecksRef.current.push(...)` calls back to `wrecksAPI.spawn(...)` and re-enable the polling useEffect.
- File: `star-shipper/src/components/system/SystemView.jsx`.

### 2026-05-17 — Fix latent laser-kill-no-credits bug

- Long-standing bug surfaced during wreckage debugging: the laser weapon branch in `SystemView.jsx` applied damage instantly (`nearest.hull -= dmg`) but **never checked if the enemy just died**. The destruction handler (explosion VFX, sound, `awardLoot`) lived only in the projectile-hit loop, which lasers bypass since they don't spawn projectiles. So laser kills silently zeroed enemy hull with zero feedback or reward. Pre-existing bug; the Starter Kit's `weapon_laser` made it 100%-reproducible from a new captain.
- Fix: mirror the destruction block inside the laser branch, right after `nearest.hull -= dmg`. Plays sounds, pushes explosion effect, fires `fittingAPI.awardLoot`.
- This is the real cause of the "still not working" reports across the wreckage-debugging arc. The wreckage system added on top of broken kill plumbing — even after reverting wrecks, lasers still didn't pay out.
- File: `star-shipper/src/components/system/SystemView.jsx`.

### 2026-05-13 — Audio scaffold (Howler) + mute toggle

- Howler.js added as dep. New `src/utils/audio.js` exposes a single `playSound(eventId)` API; reads volume + mute from gameStore.audio (persisted via Zustand). Missing audio files silently no-op so the scaffold ships before assets land.
- 5 events wired: `weapon_fire`, `weapon_hit`, `ship_destroyed`, `dock_complete` (in `SystemView.jsx`), `button_click` (in `GameFrame.jsx` LeftToolbar).
- Mute toggle (🔊/🔇) added to top bar next to outliner toggle. Volume sliders deferred — mute alone covers the common need.
- Drop `.mp3` files in `star-shipper/public/sounds/` matching the names listed in the `README.md` there. They activate on next page load — no code change needed.
- Files: `package.json` (howler dep); `src/utils/audio.js` (new); `src/stores/gameStore.js` (audio state + actions + persist); `src/components/ui/GameFrame.jsx` (mute toggle, button_click); `src/components/system/SystemView.jsx` (weapon_fire / weapon_hit / ship_destroyed / dock_complete); `public/sounds/README.md` (new).

### 2026-05-13 — Fix invisible fitted modules in Ship Builder

- `getShipDetail`'s `moduleDetails` entries were missing `slot_type`. The client's `normalizeFittedModule` keys into `SLOT_TYPE_META[slot_type]` to resolve the proper icon + color; without `slot_type` it fell back to gray `#64748b` + `📦`, which on the dark ship canvas looked like empty slots. Modules were persisted correctly — just invisible.
- Single-line server fix: include `slot_type: modType.slot_type` in the moduleDetails entries.
- File: `star-shipper-server/src/api/fitting.js`.

### 2026-05-12 — Game is multiplayer (4–8 players)

- User clarified scope: this is a multiplayer game, not single-player. World state must be authoritative on the server. New memory `project_multiplayer.md` captures the implications. Phase A city seeding is the first feature designed under this constraint.

### 2026-05-12 — Fix Auto tab blue-screen crash

- `HarvestersTab` and `MineTab` were referencing `effectiveBodyId` from the parent's scope without it being defined locally. `HarvestersTab`'s `useCallback` deps array `[effectiveBodyId]` evaluated synchronously during render → uncaught `ReferenceError` → React error boundary blue screen on click. (`MineTab` had the same bug but its references were inside async try/catch blocks so it failed silently with the error in the in-tab message bar.)
- Fix: pass `effectiveBodyId` as a prop from the parent to both child tabs and destructure it.
- File: `star-shipper/src/components/system/PlanetInteractionWindow.jsx`.

### 2026-05-11 — Global font-size bump (system-view canvas exempt)

- Bumped `html` font-size from 16px → 18px (12.5%) so Tailwind's rem-based `text-*` classes scale proportionally across the whole UI. (Started at 17px; user requested bumping to 18px.)
- Added a `.system-view-canvas` reset class on SystemView's wrapper so the in-map combat log + controls hint overlays stay at their original size. SVG text (planet/ship labels) is unaffected by CSS font-size regardless. Vendor UI / PlanetInteractionWindow renders as a sibling to the canvas wrapper, so it does pick up the bump.
- Files: `star-shipper/src/index.css`, `star-shipper/src/components/system/SystemView.jsx`.

### 2026-05-11 — Ready for Launch quest auto-completes on full fit

- ShipBuilderWindow's `handleSlotDrop` now reads the server's `all_slots_filled` flag and calls `completeQuest('tutorial_fit_modules')` when the last empty slot fills. Counts the Starter Scout's pre-fit engine + reactor, so the player no longer has to redundantly swap in identical kit modules to satisfy the quest.
- File: `star-shipper/src/components/ship/ShipBuilderWindow.jsx`.

### 2026-05-11 — Vendor buyHull triggers fleet refresh

- Buying a hull from the station vendor while podded now refreshes the global `ships` array, which lets `SystemView`'s auto-disembark useEffect see the new ship and board it (retiring the pod). Before this fix, the buy succeeded server-side but the pod stayed active alongside the new ship in the fleet.
- File: `star-shipper/src/components/system/PlanetInteractionWindow.jsx` (added `fetchShips()` call in `buyHull`'s `finally` block).

### 2026-05-10 — Starter Scout safety net for podded players

- Relaxed `starter_scout` buy gate: now ignores pod ships when checking "no existing hulls", so a podded captain with no reserves can fall back to the free Starter Scout. Closes the stranded-captain edge case where <2000 cr + 0 reserves = no path forward.
- Fixed a subtle auto-disembark bug: the "no reserves" toast guard was also blocking the exit-pod path, so buying a hull mid-dock left the player stuck in the pod with the new ship sitting in the fleet. Split into two separate refs.
- "No reserve" toast now mentions the free Starter Scout explicitly so players know the fallback exists.
- Files: `star-shipper-server/src/api/fitting.js`, `star-shipper/src/components/system/SystemView.jsx`, `STATUS.md`.

### 2026-05-09 → 2026-05-10 — Podding Phase 1 deployed + working

- Escape Pod hull + EVE-style death flow shipped: player ejects into an untargetable pod on ship destruction, no respawn-at-Luna, pirates disengage, auto-boards next fleet ship on dock. Cargo ejection + wreckage deferred to Phase 2.
- First deploy 500'd on `/enter-pod` due to a Postgres restriction (`FOR UPDATE` rejected on the nullable side of a `LEFT JOIN`). Fixed by splitting into two queries — see `CLAUDE.md` pitfall #14.
- User confirmed working on live URL after the FOR UPDATE fix.
- Files: `star-shipper-server/migrations/019_pod_hull.sql` (new), `star-shipper-server/src/api/fitting.js`, `star-shipper/src/utils/api.js`, `star-shipper/src/utils/shipRenderer.js`, `star-shipper/src/components/system/SystemView.jsx`, `CLAUDE.md`, `HANDOFF.md`, `STATUS.md`.

### 2026-05-08 — Quests + UI polish

- **Current Quest outliner section + quest-completed toast** (`8267993`)
- App.jsx update (`206257e`), docs touch-up (`27bd396`)
- Toast system fix (`90d73fc`); weapon equip fix on top (`d3cb855`)
- Item tooltip render rewrite for faster load + follow-up tooltip fix (`a6a2514`, `cb91169`)
- ShipBuilderWindow updates ×2 (`b361178`, `2b72cd7`)
- PlanetInteractionWindow refactors + fixes (`98426a6`, `0a90a00`, `09755b7`)
- gameStore + window-pane fixes, credits update (`59286d7`, `d88f4fa`, `c4578e3`, `fecabad`)
- Earlier UI sweep: `3d40c6c`, `6335c35`

---

## How to keep this file useful

End of each working session:

1. Move anything from **In progress** that shipped → **Recently shipped** (date + commit SHA + one-line gloss).
2. Move anything from **Up next** that you started → **In progress**.
3. Add new ideas to **Up next**, new bugs to **Known issues**.
4. Bump the **Last updated** date at the top.
5. Trim **Recently shipped** entries that are no longer load-bearing context (>2 weeks old, mostly).

If a session produces architectural changes, mirror those into `HANDOFF.md`. If it produces a new pitfall worth remembering, add it to `CLAUDE.md` § "Critical pitfalls".
