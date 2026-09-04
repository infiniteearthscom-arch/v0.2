# Combat & Progression Redesign — Reconciled Plan

**Date:** 2026-09-04
**Sources reconciled:**
- `COMBAT_PROGRESSION_SPEC.md` (root) — design philosophy + approach (written against ~migration-019 knowledge)
- `docs/combat-scaling-review.md` — full extraction of what's actually implemented + where the curve breaks
- `docs/combat-progression-spec.md` — the earlier in-repo spec (warp gating, chokepoints, stakes)
- `BACKLOG.md` — game-balance items (RP curve, income/value curve) + audit quick-wins

This document supersedes the philosophy sections of both older specs for planning purposes.
It has three parts: **A. what we keep** (settled), **B. decisions needed** (rule on each before
building), **C. the build plan** (phases, each independently shippable).

---

## A. Settled — adopted without further debate

1. **Fixed World.** Region tiers 1–5 are permanent, geographic, readable on the map. Already
   shipped (Voronoi regions, danger derives from tier). No level scaling, ever. A T2 system is
   always T2 — the player trusts the map.
2. **Capability > statistics.** Deep zones should demand *qualitatively* different fits
   (weapon-type coverage, defense choices, fleet composition), not just bigger numbers.
   The damage triangle is the primary lens.
3. **Materials pull the player forward.** T3+ craft-only + exotics-in-deep-zones is shipped
   and correct. Every progression axis should eventually route through the risk→resource→
   craft loop (this is the argument for research costing resources too — see B6).
4. **Enemies use the player's systems.** Adopt the template system (C, Phase 2): enemy ships
   assembled from `module_types` + `hull_types` with quality ranges, stored server-side.
   Kills the hand-mirrored `pirateManifest.js` (pitfall #16) structurally.
5. **The sim stays client-local.** Server authority only at persistence boundaries (spawn
   manifests, loot claims, deaths, ejection). No server-tick combat. (Standing decision.)
6. **Fleet-vs-fleet collective entities stay.** Pooled S/A/H, attrition lightest-first,
   flagship last. Shipped, playtested, works.
7. **Behavior scales with tier, not just count.** Adopt the behavioral ladder (simple →
   evasive → coordinated → tactical → elite). This is the fix for "deep zones are 2.5-second
   swarm ambushes" — difficulty should get *smarter*, and fleet counts should grow slower
   than they do today.

---

## B. Decision points — rule on each (recommendation included)

**B1. Triangle direction.** Old spec: laser>shield, kinetic>armor. Shipped: laser>armor,
kinetic>shield, missile>hull.
→ **Recommend: keep the shipped matrix.** Months of playtest, the battlefield-tint UX teaches
it ("blue shield → bring kinetic"), and the server manifest mirrors it. Update the old spec's
table; also add an honest `damage_type` field to module_types and drop the name-keyword guess
(review §8.4) so the triangle is data, not string-matching.

**B2. ECM as a defense layer?** Old spec wants a 3×3 triangle (shield/armor/ECM). Shipped is
shield/armor/hull with missile as the hull-finisher.
→ **Recommend: no ECM *layer*.** The shield→armor→hull stack is legible and works. Instead,
if we want the fit-diversity, add ECM as a *utility-slot effect* later (reduces enemy missile
lock/accuracy) — an active counter, not a fourth HP pool. Defer to Phase 4+.

**B3. Capability gating: skills gate what you can FIT?** Old spec's core mechanism (Laser I →
can fit T1 lasers; Advanced Defenses → two defense types; Fleet Command → fleet size). Today:
tech tree gates *acquisition*, skills are passive %, fleet cap is a flat 5.
→ **Recommend: adopt selectively — gate by TIER, not by existence, and don't double-gate.**
- Weapon/defense/hull *tier* fitting requires the matching skill level (e.g. fitting any T3
  weapon requires Gunnery III trained). Research still gates crafting the thing; skills gate
  flying it. Different resources (RP vs time) gate different halves — that's a feature.
- **Fleet Command gates fleet size** (start at 2, train to 5): adopts the spec's best idea,
  gives Leadership a real spine, and softens the early "5-ship pool" power spike.
- Do NOT lock the starter loadout behind skills (new player friction) — T1 fits free.
- Hull classes: gate Medium/Heavy/Industrial-large behind Spaceship Command levels (catalog
  already has the skills; they're stubs today).

**B4. Defense-slot bottleneck.** Review's biggest structural finding: 3 hulls have one defense
slot; late EHP caps at ~+160 while enemy DPS stacks.
→ **Recommend: two moves.** (a) Give every combat hull at least one defense slot and give
frigate/capital a second (migration touching `hull_types.slots`); (b) revive the fleet-mass
penalty (audit fix — single writer for `shipPhysicsRef`) so stacking armor has a real speed
cost. Do NOT add hull-tier variants yet — slot surgery on existing hulls is cheaper and
testable. Hull tiering can be a later expansion.

**B5. Income curve targets.** Everything tunes against this. Current: T1 mining ≈ 45k cr/hr
risk-free ≈ d5 combat income.
→ **Recommend these targets** (playtest numbers, but commit to the *shape*):

| Zone tier | Mining cr/hr | Combat cr/hr | Rationale |
|---|---|---|---|
| T1 | ~4–6k | ~5–8k | early game measured in minutes-to-next-thing, not seconds |
| T2 | ~8–12k | ~12–18k | combat pulls ahead of mining at equal tier (risk premium) |
| T3 | ~15–25k | ~25–35k | |
| T4 | ~30–45k | ~50–70k | |
| T5 | ~50–70k | ~90–120k | endgame hour is ~10–15× a starter hour |

Levers to hit it: danger-scale belt asteroids (quality + rarity, same as deposits — single
biggest fix), lower common resource sell prices OR raise per-unit volume (slows early cr/hr),
tier-scale loot as shipped but re-anchor the base roll, revert the Sol TEST BUFF + give Sol
the standard loot formula.

**B6. RP curve.** Current: T5 weapon research = 6.5 days of pure passive trickle; no gameplay
input; meanwhile one rank-5 skill = 36 days.
→ **Recommend: hybrid gate.** Steepen the ladder to 200 / 1,000 / 4,000 / 15,000 (+ a future
T5 research tier at 50,000), AND give T3+ nodes a material cost (e.g. Exotic Weaponization =
6,000 RP + 5 Quantum Dust + 10 Plasma) so research routes through the risk loop like
everything else. Keep the trickle at 1/min — the skill (`rp_rate_pct`) and future station
Research Lab modules become meaningful accelerators. (Skill training times stay EVE-style
long; the old spec's "minutes to hours" instinct is answered by the hybrid gate instead —
research is the fast lane, skills are the slow prestige lane, materials are the shared toll.)

**B7. Quality exponent.** Q100 = ×2.83 DPS (damage ×Q, cycle ÷√Q) — a stealth tier system
rivaling two module tiers.
→ **Recommend: keep quality strong but linearize DPS.** Change cycle scaling from ÷√Q to
flat (quality doesn't speed up guns), leaving damage ×Q → Q100 = ×2.0 DPS. Quality stays the
crafting endgame chase without eclipsing the tier ladder. (Mining yield stays ×Q linear.)

**B8. Respawn.** No timer today; re-entry is the respawn event → farmable + empty-session
systems.
→ **Recommend:** server-side respawn stamp per (user, system): `/combat/enter-system` only
issues a fresh manifest if `now - last_spawn > 15 min` (tier-scalable later). Client keeps
its deterministic spawn; the server just refuses to re-arm the loot manifest early. Fixes the
farm loop with ~20 lines and no gameplay feel change.

**B9. Warp-range travel gating** (from the in-repo spec, still unbuilt): tiers are currently
gated only by pirate density.
→ **Recommend: build it in this arc (Phase 3)** — it's the difference between "difficulty
zones" and "progression map." `warp_range` from drive tier (+ skill), reachable = in-range OR
gate-connected, gate topology connects tiers in sequence. Prerequisite for the galaxy-map v2
route planner already queued.

**B10. Sol reset.** TEST BUFF (26 pirates, 4-destroyer siege wing) vs newbie starter system,
paying sub-formula loot.
→ **Recommend:** revert to small single/duo T1-loadout patrols, standard loot formula,
mirror `pirateManifest.js` in the same commit (pitfall #16). Fold into Phase 1.

---

## C. Build plan — phases, each shippable + testable

### Phase 0 — Quick wins (no design dependencies; one batch)
- Obtainable Mining Laser II (price or recipe + fix the dead T1 research unlock)
- Wire `mine_cycle` into the client mining loop
- Fix module resale (dead `item_type === 'module'` branch → real buy_price × 0.4)
- Honest vendor tooltips (show the stats combat actually uses)
- Replace the two placeholder T1 tech nodes with real unlocks (or repoint them)
- Fleet-mass penalty single-writer fix (B4b)
- Respawn stamp (B8)
- `damage_type` column on module_types + honor it in weapons.js (B1, mechanical half)

### Phase 1 — Rebalance pass (numbers only, no new systems)
- Sol reset (B10) + server manifest mirror
- Danger-scale belt asteroids (rarity weights + quality bonus, mirroring deposits)
- Income curve retune to B5 targets (resource prices / loot base / harvest rates)
- RP ladder + material costs per B6 (migration: tech_definitions cost updates + new
  `material_cost` JSONB; server unlock endpoint consumes materials)
- Quality DPS linearization (B7) — client weapons.js + tooltip surfaces
- Enemy fleet-count flattening: reduce d4–5 spawn counts ~30–40% ahead of Phase 2's
  smarter-not-more scaling (playtest lever)

### Phase 2 — Enemy template system (the structural piece)
- `enemy_templates` + `enemy_template_modules` tables (old spec §6.1 shapes, adapted to
  current schema: hull_type_id VARCHAR, module ids VARCHAR, tier + quality ranges)
- Server generates per-system spawn manifests FROM templates (seeded, deterministic);
  client fetches manifest on enter-system instead of hand-rolled catalogs
- **Deletes `pirateManifest.js` hand-mirroring entirely** — server manifest becomes the
  single source; client renders/simulates from it
- Enemy fits become inspectable (hover/target panel shows hull + modules — reuses the
  player tooltip pipeline since they're the same module rows)
- Faction field on templates (data only for now; Void Reavers default)
- Elite/named flagship templates with guaranteed-drop loot table hooks (drops land in
  Phase 4 with wrecks)

### Phase 3 — Capability gating + travel gating
- Tier-fitting skill gates (B3): fit-module endpoint + Ship Builder UI check skill level
  for module tier; grandfather existing fits
- Fleet Command: fleet cap 2→5 by skill level (B3); grandfather existing 5-ship fleets or
  grant the skill retroactively at the level matching their fleet
- Hull-class gates via Spaceship Command skills
- Warp-range + gate routing (B9) + galaxy-map range ring / route planner tie-in

### Phase 4 — Behavior tiers + stakes
- Behavioral ladder by template behavior_mode: T1 simple → T2 evasive → T3 coordinated
  (focus-fire, triangle-aware targeting) → T4 tactical (retreat, reinforcements) → T5
  elite (per-template mechanics)
- Rally cap: max N fleets converge simultaneously (readability at depth)
- Stakes completion: cargo/module ejection into server wrecks on ship loss (the wrecks
  table exists — endpoints need the rewrite recommended by the audit), pirates contest
  wrecks, elite guaranteed drops go through the same pipeline

### Phase 5 — Depth (post-arc, pull-based)
- ECM utility modules (B2), power budget consuming reactor output, faction reputation
  hooks on templates, hull tier variants if slot surgery proves insufficient, boss
  mechanics library

---

## Tuning appendix — first-pass numbers to playtest against

- Triangle: keep 0.5 / 1.5 / 1.0 (+ missile 0.75/1.0/1.5). If wrong-weapon still feels
  viable in T3+, harshen disadvantage to 0.35 (old spec §8.1).
- Enemy fleet sizes post-Phase 2: T1 solo/duo · T2 duo/trio · T3 trio · T4 trio/quad +
  elite · T5 quad + named flagship. Counts per system roughly halved from today at d4–5.
- TTK targets (equal-tier, right-typed fits): player kills a fleet in 20–40s; fleet kills
  an inattentive player in 30–60s; +2 tiers ≈ deadly within ~10s of focus fire.
- Defense slots post-B4: fighter 1, scout 1, shuttle 1, frigate 2, freighter 1, capital 2,
  industrials 1.
- Respawn: 15 min flat first; consider tier-scaling (T5 = 10 min) later.
