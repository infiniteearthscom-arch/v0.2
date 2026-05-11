# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-11

---

## Current state — one-liner

Live in prod. Full core loop (mine → craft → fit → fly → trade → fight → explore) functional across 200 procedural systems. Recent sessions have been **UI polish + Quest system surfacing**, not new gameplay systems.

- Live URL: https://star-shipper-fjrrq.ondigitalocean.app
- Branch: `main` (auto-deploys on push)
- Working tree: clean
- DB schema: through migration **016**; next new migration is **017** (009 was skipped)

---

## In progress

_Nothing in flight._

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
