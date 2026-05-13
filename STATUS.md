# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-12 (Phase A city seeding)

---

## Current state — one-liner

Live in prod. Full core loop (mine → craft → fit → fly → trade → fight → explore) functional across 200 procedural systems. Recent sessions have been **UI polish + Quest system surfacing**, not new gameplay systems.

- Live URL: https://star-shipper-fjrrq.ondigitalocean.app
- Branch: `main` (auto-deploys on push)
- Working tree: clean
- DB schema: through migration **016**; next new migration is **017** (009 was skipped)

---

## In progress

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

- **Podding — Phase 2: wreckage + cargo ejection.** Add `wrecks` table + spatial entity, eject ~50% of player inventory + destroyed ship's modules into a wreck on death, pod can salvage. Pirates contest wrecks (Phase 3 polish).
- **CLAUDE.md migration counter is stale** — says "next migration is 017", but 017/018 exist. Bump pitfall #8 to "next is 020" once 019 ships.
- **Hardcoded `localhost:3001` audit** — pitfall #9 violation existed in the old respawn code; sweep the rest of the client for similar stragglers.

---

## Known issues / open threads

Bugs noticed but not fixed; rough edges to revisit.

- **`/repair-cost` server endpoint is now dead code** — kept for backward compat. Safe to remove once we confirm no client references remain after deploy.
- **`ShipBuilderWindow.jsx:837` also calls `fittingAPI.buyHull()`** but doesn't refresh the global ships array on success. If we ever surface that flow to a podded player it'll have the same auto-disembark staleness bug as the vendor did. Worth a defensive `fetchShips()` if the path becomes reachable from the podded state.

---

## Recently shipped

Most recent first. Group by session/theme, not per-commit. Trim entries older than ~2 weeks once they stop being load-bearing context.

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
