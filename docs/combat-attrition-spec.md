# Fleet-Entity Combat & Attrition — Sub-Spec

> **Status:** Design, not started. Drafted 2026-06-03. Detailed mechanic for the fleet-vs-fleet rebuild called for in `combat-progression-spec.md` §A2 (the headline combat lift). This doc specifies the data model, the hull-pool → ship-death mapping, the player-attrition ↔ pod interaction, and a safe incremental build order.
> **Locked by the user:** both fleets are collective entities; visual attrition (ships peel off as the pool degrades); player fleet gets attrition too; fleets can be size 1; defense profile emerges from composition.

---

## 1. The fleet entity (unified — both sides)

A **fleet** is one logical combatant rendered as a formation of 1–N ships:

```
fleet = {
  id, faction,
  members: [ ship, ... ],        // each: { id, hullClass, hullHp, weapons[], slot, ... }
  flagshipId,                     // dies LAST; killing it = killing the fleet
  deathOrder: [memberId, ...],    // precomputed; flagship is the final element

  // pooled defense (the three bars)
  shield, maxShield,              // fleet-wide buffer (regenerates)
  armor,  maxArmor,               // fleet-wide buffer (no regen)
  hull,   maxHull,                // = Σ members' hullHp; partitioned into death thresholds

  // AI / render
  state, patrolCenter, formation, leaderPos, ...
}
```

- **maxShield / maxArmor** = sum of each member's shield/armor contribution → a fleet of shield-loadout hulls reads as a "shield fleet," armor hulls as an "armor fleet," mixed as blended. The profile *emerges*; nothing is hand-tagged.
- **maxHull** = Σ member `hullHp`. Today's per-ship values: `PIRATE_HULL_BASE_HP = {light:60, medium:140, heavy:280}` (enemy); player ships use `base_hull` + module hull (already summed in `fleetStats.totalHull`).
- The shipped `applyDamage(target, rawDmg, weaponType)` (`utils/combat.js`) already walks shield→armor→hull on **any** `{shield, armor, hull}` object — it now points at the fleet pool, unchanged.

## 2. Defense resolution

Damage to a fleet resolves through the existing triangle on the **pool**:
1. While `shield > 0` → damage hits shield (×triangle mult; kinetic favored). **No ship dies.**
2. `shield == 0`, `armor > 0` → damage hits armor (×mult; laser favored). **No ship dies.**
3. Both gone → damage hits the **hull pool** → triggers ship-death thresholds (§3).

So shields + armor are *fully stripped before any ship dies*. The triangle becomes a readable sequence: **kinetic to drop the blue bar → laser to crack the amber → then ships start dying as the hull bar falls.**

> **Pacing risk (tuning):** strictly-sequential buffers can feel like "a wall, then a sudden collapse." Knobs to tune: buffer sizes *relative to* hull (keep shield+armor a modest fraction of total EHP so the kill phase isn't an anticlimax), or later allow a small fraction of hull "chip" damage to bleed through armor. Start strict + sequential (simplest, most legible); tune on playtest.

## 3. The attrition mechanic — hull pool → ship deaths

**One hull pool, fixed death order, threshold-triggered deaths.** Precompute at spawn:

- Order members by death priority → `deathOrder = [m1 … mN]`, `mN = flagship`.
- Each member `k` has hull `h_k`. Its **death threshold** is the pool level at/below which it's dead:

  `T_k = maxHull − (h_1 + h_2 + … + h_k)`

  Thresholds descend; `T_N = 0` (flagship dies → fleet destroyed).
- Each frame after hull damage: for every still-alive member `k` in order, if `hull ≤ T_k` → **member k dies** (explosion VFX at its formation slot, removed from the formation, its weapons go offline). Process in order so multiple deaths in one big hit resolve cleanly.

**Worked example — a "Marauder pack" (2 light escorts + 1 medium flagship):**
| | hull | death order | threshold `T_k` |
|---|---|---|---|
| Escort A | 60 | 1st | 260 − 60 = **200** |
| Escort B | 60 | 2nd | 260 − 120 = **140** |
| Flagship (medium) | 140 | last | 260 − 260 = **0** |

`maxHull = 260`. Say the fleet also has `maxShield 60`, `maxArmor 49`. The player strips 60 shield (kinetic) + 49 armor (laser), *then* chews 260 hull: Escort A pops at hull 200, Escort B at 140, and the flagship (and fleet) dies at 0. Each escort death drops a little loot + removes its guns; the flagship is the payout.

### Death-order rule
- **Flagship always last.** Flagship = the formation leader. Enemy: the heaviest member (the "Destroyer" in a pack), or the named boss for elite fleets (B4). **Player: the active ship** (`users.active_ship_id`) — you keep flying your command ship until the end, so no mid-fight active-ship swap.
- **Non-flagship members: lightest hull first**, tie-break by formation position (outermost/screen ships first). Thematically the escorts die screening the core; mechanically the fleet stays dangerous until late, and DPS decays gradually.

## 4. DPS decay

Fleet outgoing fire = sum over **alive** members' weapons. A dead member's weapons stop firing immediately. So as escorts peel off, the fleet's threat ramps *down* — natural difficulty rampdown that rewards focusing one fleet to completion. (Applies to the player fleet too: losing wingmen weakens your fire — a real cost.)

## 5. Visual + readout

- Render alive members in formation around the flagship (reuse the player's lagged-follow formation math — `WINGMAN_LAG_RATE` — for enemy fleets too; fully symmetric). On a member death: explosion at its slot, remove from the formation; survivors hold/retighten slots.
- **Primary UI: per-FLEET 3-segment bar** (shield/armor/hull) floating above the fleet (above the flagship or centroid). Local to each threat → scales to many fleets without pretending there's one answer. Expandable to the roster (which ships remain), not per-ship HP (hull is one pool).
- Optional: tint a fleet's ships by dominant defense layer (blue=shielded, amber=armored) for at-a-glance reading.

## 6. Targeting

- Player **designates a fleet** (click → `designatedFleetId`); weapons focus that fleet (fire at its nearest alive member / centroid), and the readout highlights its bars. Default = nearest fleet. With multiple fleets the player switches focus. (Replaces today's "fire at nearest enemy.")
- v1 focuses one fleet at a time; splitting weapon groups across fleets (mining-laser-style per-weapon assignment) is a later option.

## 7. Player-side specifics — attrition ↔ pod/disembark

The player fleet is *already* a single pool (`playerShieldRef/ArmorRef/HullRef` + maxes from `fleetStats`). Add the same threshold logic, mapped to real DB ships:

- **Roster + order:** fleet ships = `fleetShipsRef` (active + wingmen, all `storage_body_id IS NULL`). `deathOrder` = wingmen sorted lightest-first, **active ship (flagship) last**. Per-ship hull from each ship's `base_hull` + module hull.
- **Wingman death:** when `playerHull` crosses a wingman's threshold → explosion at its formation slot, remove from `fleetShipsRef`/`wingmenPosRef` (DPS drops), and **destroy it server-side + eject its loot into a wreck** (per the Full-stakes decision — losing a wingman is losing that ship).
- **Flagship death:** when `playerHull` hits the flagship threshold (0) → the **existing `enter-pod` flow fires** (destroys the active ship → pod → auto-disembark on dock). Unchanged endpoint; it's just now the *final* step of attrition rather than a lone hull-zero event.
- **⚠ Server gap (build item):** there is **no endpoint today to destroy a specific wingman** — `enter-pod` only destroys the active ship. Need a new `POST /fleet/lose-ship { ship_id }` that validates the ship belongs to the user and is **not** the active ship, destroys it, and spawns its wreck (cargo/module ejection share). Client calls it per wingman death, fire-and-forget (same pattern as `enter-pod`), then `fetchShips()` reconciles the roster; `fleetStats` recomputes the pools from survivors.
- **Consistency model:** combat is client-local, so the client shows the death immediately and the server reconciles (matches how `enter-pod` already works). If a `lose-ship` call fails, the ship reappears on the next `fetchShips` — the server is the truth for what was actually lost. Guard each call with an in-flight ref like `podEntryInFlightRef`.
- **Stakes escalation:** a losing fight can now cost *multiple* ships, not just the flagship. This is the intended teeth — flag enemy-damage tuning as even more important.

## 8. Loot on attrition

- Each enemy member that dies drops a **small wreck** (loot scaled by its tier/hull). The **flagship death = the "fleet killed" event** → main payout + the claimable kill for bounty/ticker.
- Ties into the Full-stakes server manifest (A3): the per-system manifest becomes **per-fleet** — `{ fleetId, members:[{id, loot}], flagshipPayout }`. Killing the flagship marks the fleet claimed; `award-loot` validates against it (caps farming to the real spawn).

## 9. Spawning refactor

`generatePiratesForSystem` → `generateFleetsForSystem(seed, danger, bodies)` returns an array of **fleet entities**. For each: pick size (1–M scaled by danger), pick member hulls + loadouts (reuse `PIRATE_LOADOUT_TIERS` / `PIRATE_WEAPONS/SHIELDS/ENGINES`), designate the flagship (heaviest, or boss), sum member contributions into `maxShield`/`maxArmor`, build the `hullHp` list + `deathOrder` + thresholds, set `patrolCenter`/formation. The scaffolding already present (`fleetId`, `fleetSize`, `patrolCenter`, the rally pre-pass at `SystemView.jsx:2791`) is the starting point — we're promoting loose groups to real entities.

## 10. Build sub-sequence (incremental, each shippable + playtestable)

- **F1 — Enemy fleet entity + pooled defense, NO attrition yet.** Refactor spawn into fleet entities with pooled S/A/H; player damage hits the pool; the **whole fleet pops at once** when hull = 0 (all members explode together). Add the per-fleet 3-bar readout + per-fleet targeting. *Proves the entity model with the smallest change.*
- **F2 — Enemy attrition.** Add the hull-threshold ship-death logic: members peel off one at a time (escort-first), DPS decays, per-member loot drops.
- **F3 — Player attrition + pod.** Player wingmen die on thresholds (new `lose-ship` endpoint + wreck), pod fires on flagship death. Mirrors F2 to the player side.
- **F4 — Polish.** Loot manifest + flagship payout (ties to A3 stakes), battlefield tint, targeting refinements.
- *(Then the deep-enemy roster (B4) and the rest of the zoning thread tune difficulty against this model.)*

This order de-risks: F1 is a contained model swap (no new death mechanic), F2 adds peel-off, F3 mirrors it to the player with the one new server endpoint, F4 is polish.

## 11. Open questions / risks

- **New server endpoint** `lose-ship` (destroy a non-active fleet ship + eject wreck) — doesn't exist; needed for F3.
- **Protected systems:** this rewrites the enemy half of the in-system combat loop + rendering. Respect the angle/time/refs-vs-state conventions in CLAUDE.md (pitfalls #3, #5, #6, #7). Change render + physics as a calibrated set.
- **Pacing** of shield+armor-then-hull (§2 risk) — tune buffer sizes; playtest gate.
- **Performance:** net win (fewer logical entities than dozens of independent pirates), but still N members rendered per fleet — keep the per-frame work bounded (ties to the perf hygiene already done; see `project-perf-delta-clamp`).
- **No migration** for the client model. Loot manifest (F4 / A3) is server-side, later.

## 12. Tuning knobs (settle by live playtest)

Fleet sizes per tier; member hull HP; shield/armor buffer sizes *relative to* hull (pacing); the death-order rule; per-member loot + flagship payout; player wingman-loss salvage %; enemy fleet TTK per tier.
