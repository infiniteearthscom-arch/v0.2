# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-10

---

## Current state — one-liner

Live in prod. Full core loop (mine → craft → fit → fly → trade → fight → explore) functional across 200 procedural systems. Recent sessions have been **UI polish + Quest system surfacing**, not new gameplay systems.

- Live URL: https://star-shipper-fjrrq.ondigitalocean.app
- Branch: `main` (auto-deploys on push)
- Working tree: clean
- DB schema: through migration **016**; next new migration is **017** (009 was skipped)

---

## In progress

- **Podding — Phase 1 (pod state + flying back)** — first deploy 500'd on `/enter-pod` due to Postgres `FOR UPDATE` + `LEFT JOIN` bug; **fix written, awaiting redeploy + retest**. (started 2026-05-09, bug fix 2026-05-10)
  - Bug was a Postgres restriction: `FOR UPDATE` is rejected on the nullable side of a `LEFT JOIN`. Both endpoints split into two queries (lock user row, then read ship). New pitfall #14 in `CLAUDE.md`.
  - Migration `019_pod_hull.sql` still needs to run on prod if it hasn't. After redeploy, run `npm run db:migrate` in DO Console → `v0-2-star-shipper-server`. If `/enter-pod` now succeeds → migration was already applied; if it returns `"Pod hull missing -- run migration 019"` → migration step still pending.
  - Manual test on live URL: take active ship to 0 HP via pirates → expect ejection into orange capsule, no Luna teleport, pirates disengage; fly to any station/planet → auto-board next fleet ship (toast); if fleet empty → toast nudges player to vendor.
  - Files this fix touches: `src/api/fitting.js` (split FOR UPDATE queries in `/enter-pod` + `/exit-pod`); `CLAUDE.md` (added pitfall #14); `STATUS.md`.

---

## Up next

Unranked queue. Pull from the top of the next session, or pick by interest.

- **Podding — Phase 2: wreckage + cargo ejection.** Add `wrecks` table + spatial entity, eject ~50% of player inventory + destroyed ship's modules into a wreck on death, pod can salvage. Pirates contest wrecks (Phase 3 polish).
- **CLAUDE.md migration counter is stale** — says "next migration is 017", but 017/018 exist. Bump pitfall #8 to "next is 020" once 019 ships.
- **Hardcoded `localhost:3001` audit** — pitfall #9 violation existed in the old respawn code; sweep the rest of the client for similar stragglers.

---

## Known issues / open threads

Bugs noticed but not fixed; rough edges to revisit.

- **Stranded-captain edge case (post-podding):** if a podded player has 0 reserves and <2000 cr, no purchasable hull is affordable (Scout = 2000, Fighter = 3000). `starter_scout` is gated to brand-new players (existing-ship check), so they can't fall back to it. Phase 2 may want a cheap "rescue hull" or insurance payout.
- **`/repair-cost` server endpoint is now dead code** — kept for backward compat. Safe to remove once we confirm no client references remain after deploy.

---

## Recently shipped

Most recent first. Group by session/theme, not per-commit. Trim entries older than ~2 weeks once they stop being load-bearing context.

### 2026-05-09 — Podding Phase 1 (code only — not deployed)

- Escape Pod hull + EVE-style death flow scaffolded; player ejects into untargetable pod on ship destruction, auto-boards next fleet ship on dock. Cargo ejection + wrecks deferred to Phase 2.
- Files (uncommitted at write time): `star-shipper-server/migrations/019_pod_hull.sql` (new), `star-shipper-server/src/api/fitting.js`, `star-shipper/src/utils/api.js`, `star-shipper/src/utils/shipRenderer.js`, `star-shipper/src/components/system/SystemView.jsx`, `STATUS.md`.

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
