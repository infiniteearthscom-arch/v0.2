# Star Shipper — Status

Living doc. Skim this first when starting a new Claude Code chat — it's the snapshot of where the project is *right now*.

> **Here:** current state, in-flight work, queue, recent themes.
> **Not here:** architecture (→ `HANDOFF.md`), conventions/pitfalls (→ `CLAUDE.md`), aspirational scope (→ `docs/design-vision.md`).

**Last updated:** 2026-05-08

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

When you start something mid-session, jot it here so the next chat picks up cleanly. Format:

- **\<feature/fix\>** — what's done, what's left, which files. (started YYYY-MM-DD)

---

## Up next

Unranked queue. Pull from the top of the next session, or pick by interest.

- _(empty — add ideas as they come up)_

---

## Known issues / open threads

Bugs noticed but not fixed; rough edges to revisit.

- _(empty)_

---

## Recently shipped

Most recent first. Group by session/theme, not per-commit. Trim entries older than ~2 weeks once they stop being load-bearing context.

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
