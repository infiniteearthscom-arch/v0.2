# Combat Depth & Galaxy Progression — Consolidated Spec

> **Status:** Design approved, not started. Drafted 2026-06-02 with the user.
> **Scope:** Two coupled threads — (A) combat depth, (B) galaxy difficulty-zoning — joined by (C) the crafting loop they feed.
> **Source of truth for live state:** `STATUS.md`. This is a forward design doc; verify file:line refs against current code before coding (they're accurate as of drafting).

---

## 1. Why this exists

The core loop's bookends are thin (see the build's honest weak-point review): **combat has no challenge and no stakes**, and **progression dead-ends after the tutorial**. The three damage types and three defense layers exist in data but never interact. Deeper space is more dangerous but not more rewarding, so there's no reason to take risk. This spec fixes both with one coupled system.

### The unified loop this builds

```
 better warp drive ── unlocks ──► deeper, chokepoint-gated tiers
        ▲                                    │
        │                          tankier / typed / elite / coordinated enemies
   superior modules                          │
   + drive + fleet                  rare + high-quality resources (hard-gated to deep tiers)
        ▲                                    │
        │                          high-tier recipes that REQUIRE those exotics
        └──────────────── crafted into ──────┘
```

Combat depth gives the player the **tools** (damage triangle + power pips); zoning gives the **reason to use them and the reward for doing so**. Neither half is worth much alone.

---

## 2. Decisions locked (with the user)

| Area | Decision |
|---|---|
| **Combat feel** | **Starfield-style multi-pip** power allocation (LAS / BAL / MIS / SHD / ENG) |
| **Stakes** | **Full** — eject cargo + modules into a recoverable wreck on death, AND server-validated loot |
| **Zoning structure** | **Chokepoint-gated** 5 tiers — cross tier N to reach N+1 |
| **Rarity coupling** | **Hard gate** — rarest exotics + top-quality rolls practically only in tier III+ |
| **Enemy scaling** | **All four** — tankier/typed defenses, elite bosses, coordinated formations, faction enemy types |
| **Travel model** | **Warp-drive range + gate routing** — reach becomes a progression axis |
| **Architecture** | Real-time sim stays **client-local**; server authority only at persistence boundaries (kills→loot, death→ejection). Server-authoritative combat remains deferred. |

---

## 3. Current-state grounding (verified)

### Combat
- **Weapons** (`weapons.js`): laser 6 dmg / 0.45s / 200 range, kinetic 12 / 0.7 / 180, missile 22 / 1.4 / 500. Type detected heuristically from module name keywords.
- **Damage resolution is flat 2-layer**: `shield -= min(shield,dmg); hull -= rest`, at `SystemView.jsx:3023` (laser), `:3184` (projectile), `:3229` (player-hit). `weapon_type` is carried on projectiles but **never read at impact**.
- **Armor is computed but unused** — `fleetStats.js:189` sums `totalArmor` (`MODULE_BONUSES.armor = {armor:25, mass:8}`), nothing in combat reads it.
- **Reactors produce nothing consumable** — `MODULE_BONUSES.reactor = {shield:15, repair:0.5}` (`fleetStats.js:71`); no power budget gates anything. Empty hook for the pip system.
- **Shield regen** is a global constant: `SHIELD_REGEN_RATE = 2`/s after `SHIELD_REGEN_DELAY = 3`s (`SystemView.jsx:44-45`).
- **Death** (`enter-pod`, `fitting.js:1211`): destroys active ship + fitted modules, creates Escape Pod, **no cargo/module ejection, no credit loss**. Loot is a client-local credits wreck (`SystemView.jsx:3061`).
- **Loot** (`award-loot`, `fitting.js:1171`): **trusts the client**, caps 1000/call. Cheatable (mint credits, zero an enemy in DevTools).
- **Pirate AI**: aggro 350 / attack 150 / orbit 100 / deaggro 600 (`SystemView.jsx:36-39`). Loadout tiers T1–T3 by danger (`PIRATE_LOADOUT_TIERS`). Spawn count `floor(danger×5 + rng(0..danger×3))`.

### Galaxy & resources
- **Danger is radial** — `galaxyGenerator.js:236-240`: `base 0 + floor(dist/radius×3) + 2 if void_reavers + rng(-1,1)`, clamped 0-5. Core ≈ 0-1, rim ≈ 2-5.
- **Star types placed randomly**, decoupled from region (`STAR_TYPE_WEIGHTS`, weighted but not regional). Exotic-rich neutron/black-hole stars can sit at danger 0.
- **Deposit quality already rises with danger** — `deposits.js:256`: `dangerBonus = danger_level × 3` added to every quality stat roll (additive, caps 100).
- **Rarity controls quantity (inverse) + price** — `QUANTITY_RANGES`: common 300-800 / rare 150-400 / exotic 50-150.
- **Rare/exotic spawn chance is FIXED ~2%** regardless of danger — `SPAWN_CHANCES` (`deposits.js:10-15`): 70% planet-common / 20% planet-rare / 8% any-common / 2% any-rare-exotic.
- **Star-type category bias** exists (`STAR_RESOURCE_MULTIPLIERS`, `deposits.js:124`): e.g. black_hole exotic ×3.0, neutron energy/exotic ×2.0, blue_giant energy ×1.8.

### Resource catalog (19 resources, `003_resource_system.sql:178-209`)

| Rarity | Resources (base price) |
|---|---|
| **common** | Iron 10, Copper 15, Titanium 25, Hydrogen 8, Nitrogen 12, Xenon 35, Biomass 18, Coral 30 |
| **rare** | Crystite 75, Uranium 120, Helium-3 90, Plasma 150, Spores 85, Amber Sap 110, Solar Crystals 95 |
| **exotic** | Dark Matter 500 (energy), Ancient Alloy 400, Quantum Dust 600, Void Essence 750 ("from black holes") |

### Crafting (audit result)
- **12 recipes** (`013_module_recipes.sql`), all module-category. **Every recipe uses only common ores + Crystite/Uranium** (e.g. Ion Drive = Titanium 20 + Copper 10 + Crystite 5; Quantum Reactor = Titanium 15 + Crystite 10 + Uranium 3).
- **The 4 exotics + most rares are used by NO recipe.** The hard-gate currently has nothing to bite on — this is the single biggest crafting gap to close.

---

## 4. Part A — Combat depth

### A1. Damage triangle + armor layer

Three defense layers deplete **top-down**: **Shield → Armor → Hull** (hull 0 = death). Shield regenerates; armor and hull do not. Each weapon type has a per-layer effectiveness multiplier.

**Proposed matrix** (honors existing tooltip flavor; all values tunable):

| | vs **Shield** | vs **Armor** | vs **Hull** |
|---|---|---|---|
| **Laser** | 0.5× | 1.5× | 1.0× |
| **Kinetic** | 1.5× | 0.5× | 1.0× |
| **Missile** | 0.75× | 1.0× | 1.5× |

Because layers deplete in order, a **mixed loadout** (kinetic strips shields → laser cracks armor → missiles gut hull) beats mono-weapon — that's the decision we want. Pirate loadouts already tag weapon type, so enemy typing is free.

**Implementation:** one shared helper `applyDamage(target, rawDmg, weaponType) → {layerHit, killed}` replaces the four copy-pasted damage sites. Add the armor layer to both enemy objects and the player pool (read `totalArmor` already summed in `fleetStats`). Ship first with an all-1.0 matrix (zero feel change, pure plumbing = **P0**), then turn the matrix on (**P1**). Surface the matrix in the Ship Builder weapon tooltip + an in-combat damage-type readout. No migration.

### A2. Power management — Starfield multi-pip

A fleet-wide **pip pool** (the captain's command over the shared fleet) allocated in real time across five subsystems:

| Subsystem | Effect of pips |
|---|---|
| **LAS / BAL / MIS** | Each weapon family has a **capacitor**; pips set its recharge rate. Firing drains the cap. 0 pips ≈ that family can't sustain fire → you choose *what you're shooting through* a target's layers. |
| **SHD** | Shield regen rate + incoming-damage resist (small % per pip). |
| **ENG** | Top speed + a boost/afterburner dodge. |

**Pool size scales with fitted reactors × reactor quality** — closes the pending "Reactor power ×Q" item in STATUS and finally makes reactors matter. `computed_power` column on ships (migration 062), filled by `recalcShipStats`; fleet pool = sum, converted to N pips.

**UI:** a combat power panel (click/scroll to move pips + hotkeys), fleet-wide. Presets + a sensible default allocation.

**The loop it creates:** "shields dropping → dump pips to SHD and kite on ENG while the weapon cap refills → reallocate to BAL and burst through their shields." This is the active resource-management layer the game is missing.

**Tuning knobs (playtest on live):** power-per-reactor curve, pips→cap-recharge math, whether 0 pips = hard-off vs trickle, resist % per SHD pip, speed bonus per ENG pip, total pip count at each progression stage. Enemy time-to-kill must be re-tuned so allocation matters without making fights a slog.

### A3. Stakes — ejection + server-validated loot

- **Cargo + module ejection on death.** Extend `enter-pod` to eject a % of cargo + the destroyed ship's fitted modules into a **server** wreck the player (or a rival) can salvage. **Blocker:** the wrecks table has a parked `42P01` error (migrations 021/022 recorded as applied but endpoints 500). Fix first — add the `GET /api/diag/db` probe from STATUS known-issues to compare runtime schema vs migration tracker.
- **Server-validated loot via pirate manifest.** The deterministic galaxy generator already exists server-side; have the server generate the same per-system pirate manifest (ids + loot table) and validate `award-loot` against it: enemy id must be in the manifest and not already claimed. Caps farming to the real spawn and kills the credit-mint exploit **without** moving the combat sim server-side.
- **Rewards rebalanced above mining** so combat is a viable income path.
- **Unblocks** kill events in the activity ticker + server-validated bounty claims (both were blocked on "no server-validated kill").

### A4. Active depth (later, iterate)

Subsystem targeting (disable enemy weapons/engines), ECM jam + repair-burst active modules (both already in `MODULE_BONUSES`, unused), heat. First combat hooks for the ~140 dormant skills.

---

## 5. Part B — Galaxy difficulty-zoning

### B1. Five tier bands

Formalize the existing radial gradient into discrete, readable tiers. Each tier is a **bundle** of knobs, not just "more pirates."

| Tier | Danger | Enemies | Resources | Loot mult |
|---|---|---|---|---|
| **I — Secure** (core) | 0-1 | small T1 fleets, passive | common only, q~50 | 1× |
| **II — Patrolled** | 1-2 | T1-2, 2-3 fleets | + occasional rare | ~1.5× |
| **III — Contested** | 2-3 | T2, coordinated | rare common, exotic rare, q+ | ~2.5× |
| **IV — Frontier** | 3-4 | T3 + elites | exotic uncommon, high qty, q++ | ~4× |
| **V — Lawless** (rim) | 4-5 | T3-4, boss fleets, formations | exotic common, top quality | ~6-8× |

### B2. Three generator changes to make tiers mean something

1. **Bias star-type placement by region** — push neutron / black-hole / blue-giant (the exotic/energy stars) toward outer rings in `generateGalaxy`, so rare *categories* cluster in danger.
2. **Scale rare/exotic spawn chance by danger** — the fixed ~2% becomes a danger-scaled curve (~2% core → ~35% deep). Add a quantity multiplier by tier.
3. **Amplify the quality danger-bonus** — today's flat +3/level so deep-zone mining is the *only* practical path to top-quality inputs (pairs with the hard-gate).

> **Caveat:** editing danger / star-placement re-rolls the deterministic galaxy (same seed, different output). Fog-of-war survives (keyed by stable `sys_N` index) but specific systems change character. Acceptable for a live dev game — **warn the user before the push.**

### B3. Travel model — warp-drive range + gate routing

Makes chokepoints real. Today travel is fully open (warp point in every system + direct WASD/autopilot to any system in galaxy flight), which bypasses any gating.

- New ship stat **`warp_range`** (from drive module tier + skill + fuel reserve). In galaxy flight, the reachable set = systems within `warp_range` of current position **OR** gate-connected.
- Deep systems sit **beyond free-flight range**, reachable only by chaining jump gates through frontier hubs.
- **Gate topology must connect tiers in sequence** — `generateGalaxy` step 2 (the Kruskal-ish gate builder) needs tier-awareness so you can't gate-skip core→rim. Frontier hubs become the gateways.
- **Reach = progression**: a better drive unlocks deeper space. Galaxy map shows reachable vs out-of-range (fog overlay already exists; add a range ring).
- **Touches the protected "four views" travel system** — galaxy map + galaxy-flight autopilot. Spec carefully, change map/flight/range as a calibrated set.

### B4. Enemy scaling — all four mechanics

1. **Tankier + typed defenses** — deep enemies carry heavy armor *or* strong shields (some shield-heavy → need kinetic, some armor-heavy → need laser). **Forces** mixed-damage loadouts + pip allocation. Highest synergy with Part A; **depends on A1 landing first.**
2. **Elite / named mini-bosses** — occasional unique pirate, +HP, custom loadout, guaranteed high-tier/unique drop. Memorable targets + bounty-board fodder.
3. **Coordinated formations** — revive the deferred enemy-fleet Phase 2b: leader (`formationSlot 0`) + lag-following wingmen (mirror the player's `WINGMAN_LAG_RATE` system), focus-fire, promote next member on leader death.
4. **Faction-specific enemy types** — beyond Void Reavers: Astral Collective drones, rogue Terran patrols, each with a distinct loadout/behavior signature so regions feel different.

---

## 6. Part C — Crafting tie-in (the payoff)

The audit (§3) shows the gap: **no recipe requires deep-zone exotics**, so risk currently buys nothing craftable. To close the loop:

- **Author high-tier module recipes that require exotics** (Void Essence / Ancient Alloy / Quantum Dust / Dark Matter) + rares (Plasma, Helium-3, Solar Crystals) — currently unused. These become the recipes for the best weapons/shields/drives, gated by both research *and* exotic availability (which is now zone-gated).
- **Quality ceiling via zone** — deep-zone resources roll higher quality (amplified danger bonus), so the **best-quality** modules are only craftable from deep-zone mining, even for recipes whose ingredients exist elsewhere.
- **Player-market activation** — the hard-gate creates a real supply chain: deep-space miners sell exotics to safe-space crafters via the existing per-station market (Social Step 6). Risk specialization + trade emerge naturally.
- **Synergy** — the **Manufacturing Excellence** skill (migration 048, `crafted_quality_flat`) already lifts crafted quality; a maxed crafter + deep-zone exotics = the top of the gear ladder.
- **Drive recipes feed travel** — better `warp_range` drives are themselves high-tier crafts requiring exotics, so reaching deeper space is gated behind crafting from deeper space. Self-reinforcing.

---

## 7. Unified build sequence

Smallest-risk first; combat depth precedes the deep-enemy roster because typed defenses need the triangle to interact with. Each step independently shippable + playtestable on live.

| # | Step | Migration | Notes |
|---|---|---|---|
| 1 | **Combat P0+P1** — armor layer + damage triangle | none | First playtestable slice; loadout suddenly matters |
| 2 | **Exotic recipe pass** — author exotic/rare-requiring high-tier recipes | 063 | Crafting audit done; gives the hard-gate something to bite |
| 3 | **Zoning generator** — tier bands + star bias + danger-scaled rarity/quantity/quality | (mostly code; recipe/resource tweaks via migration) | Re-rolls galaxy — warn before push |
| 4 | **Travel gating** — `warp_range` stat + galaxy-flight range + tier-aware gate topology | 062 (computed stats) | Touches protected travel views |
| 5 | **Combat P2 (pips) + deep-enemy roster** — typed/tanky/elite/formation/faction enemies | 062 (`computed_power`) | Difficulty + the tools to handle it ship together |
| 6 | **Stakes (Combat P3)** + tier map visualization | 064+ | Fix wrecks `42P01` first; unblocks ticker/bounty kills |
| 7 | **Combat A4** — targeting, ECM/repair, heat, skill hooks | later | Iterate after playtest |

*(Migration numbering approximate — next free number is 062; renumber sequentially when authored. 009 is skipped; current highest applied is 061.)*

---

## 8. Open tuning numbers (decide by playtesting on live)

- Damage matrix values (§A1 table is a starting point).
- Pip pool size per reactor + quality; pips→cap-recharge curve; SHD resist %/pip; ENG speed bonus/pip; total pips per progression stage.
- Tier loot multipliers; danger→rarity-chance curve; quantity multipliers; amplified quality-bonus slope.
- `warp_range` base + per-drive-tier increments + skill/fuel contribution.
- Enemy TTK at each tier; elite spawn frequency; ejection % on death.

---

## 9. Risks & caveats

- **Galaxy re-roll** when the generator changes (§B2) — warn the user; one-time character shift across procedural systems.
- **Travel rework touches a protected system** (the "four views") — calibrate map + flight + range together, per CLAUDE.md pitfall #4/#13.
- **Pip UI + TTK tuning** is the highest-iteration part — expect several live playtest passes.
- **Wrecks `42P01`** is an unsolved server bug blocking ejection — must be diagnosed before Step 6.
- **No local dev** — every step is tested on the live URL after deploy; migrations run via DO console.

## 10. Explicitly out of scope (for now)

- Server-authoritative real-time combat (deferred indefinitely — protects single-player feel).
- PvP combat.
- Auto-matching market engine, drone/probe exploration, player-owned stations (tracked separately in STATUS).
