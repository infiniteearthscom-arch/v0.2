# Combat & Module System — Scaling Review

**Generated 2026-09-04** from a full code extraction (client + server + migrations, final effective
values after all UPDATEs). Purpose: one document showing every number in the combat/module/enemy
system and how they multiply together, as the basis for the balance redesign. Companion to
`docs/combat-progression-spec.md` (intent) — this doc is what's *actually implemented*.

Structure: §1–6 raw catalogs · §7 derived math (the interesting part) · §8 where the curve
breaks · §9 intent-vs-implementation gaps · §10 ideation prompts.

---

## 1. Player hulls

| Hull | Class | Price | Hull HP | Speed | Maneuver | Sensors | Slots (eng/rea/wpn/shd/crg/utl/mng) |
|---|---|---|---|---|---|---|---|
| Starter Scout | Light | free | 200 | 120 | 85 | 500 | 1/1/1/0/1/2/1 |
| Fighter | Strike | 3,000 | 80 | 160 | 95 | 200 | 1/1/1/0/0/1/0 |
| Scout | Light | 2,000 | 200 | 120 | 85 | 500 | 1/1/1/0/1/2/1 |
| Shuttle | Light | 5,000 | 350 | 90 | 70 | 350 | 1/1/2/0/2/1/1 |
| Prospector | Industrial | 15,000 | 400 | 60 | 35 | 250 | 1/1/1/0/2/1/2 |
| Freighter | Medium | 25,000 | 600 | 55 | 35 | 250 | 1/1/2/1/4/1/0 |
| Frigate | Medium | 40,000 | 500 | 75 | 55 | 400 | 1/1/4/1/1/1/0 |
| Excavator | Industrial | 80,000 | 800 | 50 | 25 | 350 | 1/1/2/0/6/2/3 |
| Capital | Heavy | 200,000 | 2,000 | 25 | 10 | 800 | 1/2/4/1/4/2/1 |
| Leviathan | Industrial | 250,000 | 1,500 | 30 | 12 | 500 | 1/1/3/0/10/3/4 |
| Pod | — | n/a | 1 | 100 | 100 | 200 | none |

Observations baked into the data:
- **Only 4 hulls have a shield/defense slot** (freighter, frigate, capital — and every defense
  module fits that one slot as a shield-vs-armor choice). Fighters, scouts, and all industrials
  fly with zero fitted defense.
- The `hull_types` table has **no shield/armor/cargo/mass columns** — those come from client
  fallback math (`fleetStats.js`): shield fallback `hull_size × 1.6`, mass `hull_size × 1.2`.
- Combat-hull price ladder: 2k → 5k → 40k → 200k. There is nothing between Frigate (40k) and
  Capital (200k), and no hull is tier-tagged — hulls sit outside the 5-tier system entirely.

## 2. Module catalog (combat-relevant; final values)

### Weapons — DPS = damage / fire_rate (fire_rate = seconds per shot), at Q50

| Tier | Module | Type | Dmg | Cycle | Range | DPS | Obtain |
|---|---|---|---|---|---|---|---|
| 1 | Pulse Laser | laser | 6* | 0.45s* | 200* | **13.3** | buy 1,000 |
| 2 | Autocannon | kinetic | 12* | 0.7s* | 180* | **17.1** | buy 4,000 |
| 2 | Missile Launcher | missile | 22 | 1.4s | 500† | **15.7** | buy 5,500 (+30cr/warhead, mag 40) |
| 3 | Beam Laser | laser | 9 | 0.45s | 230 | **20.0** | craft (Solar Crystals 8) |
| 3 | Railgun | kinetic | 18 | 0.7s | 210 | **25.7** | craft (no exotics) |
| 4 | Quantum Torpedo | missile | 34 | 1.5s | 550† | **22.7** | craft (Quantum Dust 3; mag 6) |
| 5 | Plasma Beam Lance | laser‡ | 15 | 0.5s | 280 | **30.0** | craft (Plasma 12, Dark Matter 3, Solar Cr. 8) |
| 5 | Mass Driver Cannon | kinetic‡ | 30 | 0.8s | 240 | **37.5** | craft (Ancient Alloy 6, Plasma 8) |

\* T1/T2 vendor weapons use hardcoded `WEAPON_DEFAULTS` per type — their DB stats (Pulse Laser's
"damage 10, range 300") are **ignored in combat** (only `combat_tuned` modules read their own
stats). What the vendor tooltip shows and what the gun does can differ.
† Missile nominal range exceeds actual projectile reach (see §8).
‡ Weapon *type* is a keyword guess on the name ("Beam"→laser, "Cannon"→kinetic) — no explicit
damage_type field is honored.

**Quality scaling on DPS is superlinear:** damage ×Q, cycle ÷√Q → **DPS scales ×Q^1.5**.
Q100 (mult 2.0) ⇒ ×2.83 DPS. A Q100 Mass Driver = **106 DPS**; a Q100 Pulse Laser (37.7) beats a
Q50 Mass Driver. Quality is a bigger lever than two module tiers.

### Defense (all compete for the single shield slot)

| Tier | Module | Grants | Obtain |
|---|---|---|---|
| 1 | Deflector Screen | +40 shield (flat — NOT its DB 100; not combat_tuned) | buy 1,500 |
| 1 | Armor Plating | +30 armor, +8 mass | buy 1,200 |
| 2 | Composite Plating | +50 armor | craft, T2 tech |
| 2 | Barrier Web | +65 shield | craft (Solar Crystals 3), T1 tech |
| 3 | Solar Barrier Array | +95 shield | craft (Solar Crystals 12), T3 tech |
| 4 | Alloy Lattice Plating | +90 armor | craft (Ancient Alloy 3), T4 tech |
| 5 | Ancient Plate | +140 armor | craft (Ancient Alloy 8, Void Essence 2) |
| 5 | Void Barrier Matrix | +160 shield | craft (Void Essence 4, Solar Cr. 10, Plasma 5) |

Ship shield also gets +15 per reactor (fleet-stats role bonus) and a per-ship base fallback
(~48). Shield regen: flat **2 HP/s after 3s** — global constant, no module/tier/quality input.
Armor never regenerates.

### Engines / reactors (speed & future power budget)

Engine speed bonus ladder: 0 → +30 → +50 → +75 → +110 (T1→T5, ×Q).
Reactor power ladder: 10 → 25 → 45 → 80 — **power is not consumed by anything yet** (no power
budget system), so reactors are today a +15-shield stick with a placeholder number.

### Mining ladder (income driver)

| Tier | Module | mine_yield | cycle | Obtain |
|---|---|---|---|---|
| 1 | Mining Laser | 5 | 2s | buy 1,200 |
| 2 | Mining Laser II | 10 | 2s | **UNOBTAINABLE** (no price, no recipe — see §8) |
| 3 | Resonance Mining Laser | 18 | 1.6s* | craft (Helium-3 8), T3 tech |

\* Client mining loop hardcodes a 2s cycle — the `mine_cycle` stat is inert.

## 3. Enemy system

### Loadout tiers (procedural systems)

| Tier | Weapons in pool (dmg/cycle → DPS) | Shield | Engine | Mean DPS |
|---|---|---|---|---|
| E-T1 | Pulse 8/0.8→10, Autocannon 18/1.0→18 | 20 | 150 spd | **14.0** |
| E-T2 | Burst 14/0.6→23.3, Autocannon→18, L.Missile 35/1.8→19.4 | 60 | 130 | **20.3** |
| E-T3 | H.Cannon 28/0.8→35, H.Missile 55/2.4→22.9, Burst→23.3 | 140 | 100 | **27.1** |

Danger → loadout tier: d≤2 all E-T1 · d3–4 50/50 T1/T2 · d≥5 25% T2 / 75% T3.
Hull class HP (procedural): light 60 / medium 140 / heavy 280, with armor carved out of that
base (heavy 35%, medium 20%, light 0%). Region tier is stamped on the *name* ("T3 Pirate
Destroyer") but does not itself change stats — danger drives everything.

### Spawn & fleet scaling

- Count: `danger×5 + rng(0..danger×3)` → d1: 5–8 pirates, d3: 15–24, d5: 25–40.
- Fleet size: d≥5 → 3–4 ships; d≥3 → 2–3; else 1–2. Fleets pool shield/armor/hull into one
  entity; escorts die lightest-first as pooled hull crosses thresholds; flagship (highest HP)
  dies last and kills the fleet.
- **No respawn timer** — kills stay dead until the player re-enters the system (re-entry also
  resets the server loot-claim set; this is the scriptable-loot loop flagged in the audit).
- **Sol is running a deliberate "TEST BUFF"** (2026-06-03): 5 zones / 26 pirates incl. a
  4-destroyer siege wing, all kinetic-typed. Comment says revert to small single/duo patrols
  before real new players. Sol also uses a separate legacy stat path (weaker: ~10–11 DPS each).

### Loot

`round(rng(20..80) × displaySize/6 × (1 + danger×0.3) × loadoutTier)` + flagship pays +50% of
escorts' combined loot. Sol drops the danger & tier multipliers entirely (≈ 20–80 × size only).
Approx per-kill averages: d1 light E-T1 ≈ 50 cr · d3 medium E-T2 ≈ 250 cr · d5 heavy E-T3
≈ 690 cr. A full d5 4-ship fleet ≈ 2,700–3,400 cr with the flagship bonus.

### Damage triangle (live)

| | vs Shield | vs Armor | vs Hull |
|---|---|---|---|
| Laser | 0.5 | **1.5** | 1.0 |
| Kinetic | **1.5** | 0.5 | 1.0 |
| Missile | 0.75 | 1.0 | **1.5** |

Resolution: shield → armor → hull, overflow carried in raw terms (weak-vs-layer weapons burn
extra budget clearing that layer).

## 4. World scaling (where resources come from)

- **Regions:** 10–15 Voronoi regions over 200 systems, tier 1–5 by centroid-rank quantile ±
  jitter; Sol's region pinned T1. Verified seed-12345 spread: **54/43/44/41/18** systems per
  tier. Tier N ⇒ danger (N−1)..N.
- **Planet/belt deposits scale with danger:** rare/exotic bucket 2%→35%, quantity ×1→×2.25,
  quality bonus +6/danger (+30 all stats at d5), exotics roll ±20 extreme swings. Deposits
  respawn re-rolled after 24h depletion.
- **Belt asteroids do NOT scale:** fixed 70/25/5 common/rare/exotic weights and no danger
  quality bonus, in every system. Asteroids respawn 10 min after depletion.
- **Exotics required by every T4/T5 recipe** (Dark Matter, Ancient Alloy, Quantum Dust, Void
  Essence, plus Plasma/Helium-3/Solar Crystals) — practically only from deep-zone deposits.

## 5. Income rates (credits/hour, order-of-magnitude)

| Activity | Rate math | ≈ cr/hr |
|---|---|---|
| Asteroid mining, T1 laser, q50 Iron (5 cr/u sale) | 2.5 u/s × 5cr × 0.5 sell-mult... → 150 u/min → 750 cr/min | **~45,000** |
| Same but q50 Crystite (37.5 cr/u) | supply-limited by rare rocks | **~100,000+ burst** |
| Planet harvest (manual, post-fix) | 50 u/hr flat | ~250–2,000 |
| Deployed harvester (basic→industrial) | 30→100 u/hr | ~150–5,000 passive |
| Combat, d5 system, clearing ~8 fleets | ~25k cr per full clear, ~20–30 min incl. travel/fighting | **~50,000–75,000 (at real risk)** |
| Combat, d1–2 | 5–8 kills × ~50 cr | **~1,000–3,000** |

Two things jump out: (a) **T1 asteroid mining in the starter system already yields ~45k/hr
risk-free**, which is within range of end-game d5 combat income — mining has no danger-scaled
ceiling because sell price scales only with quality, and belt asteroids don't scale; (b)
low-danger combat pays essentially nothing relative to the time it takes.

## 6. Progression pacing (time-gates)

**Credits anchors:** start 1,000 + tutorial chain ~6,000. Frigate 40k ≈ one hour of mining.
Capital 200k ≈ an evening. (Module costs are trivial next to this: the entire T1/T2 vendor
combat fit is < 20k.)

**Research (1 RP/min base, ×1.25 with maxed Research Methodology):**

| Node tier | Cost | Time @1/min |
|---|---|---|
| T1 | 200 | 3.3 h |
| T2 | 800 (few at 250–600) | 13.3 h |
| T3 | 2,400 (sensor line 350–400) | 40 h |
| T4 | 6,000 | 100 h (~4.2 days) |

Path to unlock **T5 weapons** = 200+800+2400+6000 = 9,400 RP ≈ **6.5 days of passive trickle**
(5.2 with the skill). Whole 27-node tree ≈ 52,000 RP ≈ 36 days. Research is purely
time-gated — no resource cost, no activity input, unlock is instant on spend.

**Skills (30 SP/min):** rank-1 L5 = 7.2 days; rank-5 L5 = 36 days. So a *single skill* maxed
takes longer than the *entire research tree* to T4. The two time-gate systems are wildly
different in steepness.

**The real T5 gate is materials, not research:** Mass Driver needs Ancient Alloy 6 + Plasma 8 →
a d4–5 deposit expedition. That's the intended risk→resource→craft loop — and it works on
paper, *except* travel gating (warp range) isn't built, so any starter ship can fly straight
to a T5 system today; the only deterrent is the 25–40 pirates there.

## 7. Derived math — who kills whom, and how fast

**Player effective fleet examples (Q50 modules):**

| Stage | Fleet | Pooled S/A/H | Total DPS |
|---|---|---|---|
| Fresh (starter scout + kit) | 1 ship, no shield slot | ~63 / 0 / 200 | 13.3 (laser) |
| Early (scout + fighter wingman) | 2 ships | ~126 / 0 / 280 | 26.6 |
| Mid (frigate + 2 wingmen, T2 fit) | Barrier Web + mixed weapons | ~250 / 0–50 / 780 | ~65 (4 weapons + escorts) |
| Late (capital + 4 escorts, T5 fit) | Void Barrier + Ancient Plate on slots that have them | ~700 / 200 / 3,300 | ~150–200 |

**Time-to-kill, player → enemy fleet** (sustained fire, right-ish weapon choices):

| Player stage | vs d1 duo (E-T1) | vs d3 trio (E-T2) | vs d5 quad (E-T3) |
|---|---|---|---|
| Fresh (13 DPS) | ~25 s | ~2 min | not practical |
| Mid (~65 DPS) | ~5 s | ~25 s | ~90 s |
| Late (~175 DPS) | instant | ~9 s | ~30 s |

**Time-to-kill, enemy fleet → player:**

| Enemy | DPS at player | Fresh (263 EHP) | Mid (~1,050 EHP) | Late (~4,200 EHP) |
|---|---|---|---|---|
| d1 duo | ~28 | ~12 s | ~45 s | minutes |
| d3 trio | ~60 | **~5 s** | ~20 s | ~80 s |
| d5 quad | ~108 | **~2.5 s** | **~10 s** | ~45 s |
| d5 two fleets aggro | ~215 | instant | ~5 s | ~22 s |

Reading of the matrix:
- The **relative-difficulty rule** (+1 tier crafty / +2 hard / +3 deadly) roughly holds for
  *single-fleet* engagements, mostly because enemy count and fleet size scale with danger.
- But the punishment curve is asymmetric: enemy→player TTK collapses much faster than
  player→enemy TTK improves, because player defense pools grow slowly (one defense slot on
  three hulls; +160 max from the best T5 shield) while enemy DPS stacks linearly with fleet
  size and multiple fleets rally together. **Deep-zone deaths are near-instant ambushes**
  rather than losable-but-readable fights.
- Shield regen (2 HP/s both sides) is irrelevant during combat at these DPS numbers — it's a
  between-fights mechanic only.
- Weapon-type choice (triangle) swings TTK by ~2–3× vs mono-typing into the wrong layer, which
  is meaningful — but the player can fit at most a handful of weapon slots, and the fleet-wide
  pool means there's no per-ship targeting depth.

## 8. Where the implementation breaks its own curve (bugs/anomalies)

1. **Mining Laser II is unobtainable** — no buy_price, no recipe. The T1 Industry research
   node ("Advanced Mining", the first thing most players research) unlocks nothing.
2. **`mine_cycle` is inert** — client hardcodes 2s, so Resonance Laser's 1.6s cycle silently
   doesn't apply (T3 mining is 3.6× T1 by yield only, not the intended 4.5×).
3. **Vendor weapon stats are display-only** — non-`combat_tuned` modules use type defaults;
   the Pulse Laser tooltip numbers (10 dmg / 300 range) aren't what the gun does (6 / 200).
4. **Weapon typing is a name-keyword guess** — fine today, but a renamed module silently
   changes damage type; there's no honored `damage_type` field.
5. **Fleet-mass speed penalty is dead code** (audit finding) — armor/cargo mass never actually
   slows the fleet, removing the intended cost of tank/hauling fits.
6. **Two competing shield computations** — server `computed_max_shield` (shield_hp × Q; basic
   Deflector = 100) vs client fleet pool (flat +40 for non-tuned modules). HUD and combat can
   disagree by 2.5× on the same fit.
7. **Enemy projectile reach ≈ 224 units** (speed 280 × 0.8s lifetime) regardless of weapon
   range — "range 320" heavy missiles can't actually hit at range; AI closes to attack range
   150 anyway, masking it.
8. **Sol loot skips the danger/tier multipliers** the procedural formula has, while the Sol
   TEST BUFF fleets are the hardest content a new player sees. Risk-reward inverted at the
   exact place new players learn the game. (And the buff needs the mirrored server manifest
   updated when reverted — pitfall #16.)
9. **Belt asteroids don't danger-scale** (fixed 70/25/5, no quality bonus) — undermines the
   "deep space = better rocks" pillar for the *main* mining activity; only planet deposits
   got the zoning treatment.
10. **Module resale is a flat 5 cr** (dead `item_type === 'module'` branch) — crafting for
    resale is dead, and every module purchase is ~100% sunk. (Known; interacts with any
    economy tuning.)
11. **No respawn timer + client-driven enter-system reset** — clearing loot is farmable by
    system-hopping; also means a cleared system stays empty for the session (no ambient
    danger returning).
12. **Placeholder tech nodes still point at nonexistent modules** (`engine_thruster_2`,
    `weapon_laser_2`) — two of the five T1 research nodes unlock nothing.

## 9. Intent vs implementation (spec §-by-§)

| Spec intent | Status |
|---|---|
| One 1–5 tier ladder for modules/resources/zones/enemies | ✅ modules+resources+zones; ⚠ enemies show tier in name but stats derive from danger; ❌ hulls untouched by tiers |
| +1 crafty / +2 hard / +3 deadly relative difficulty | ⚠ roughly holds vs single fleets; multi-fleet rally + ambush TTK breaks it deep |
| T3+ craft-only as the hard gate | ✅ (and exotics gate T4/T5 hard) |
| Zone loot multipliers ×1 → ×6-8 | ⚠ implemented as (1+0.3d)×tier ⇒ effective ×1 → ×7.5 max — close; but Sol pays LESS than formula |
| Deep zones = only practical top-quality source | ⚠ true for deposits; false for belt asteroids (not scaled) |
| Warp-range travel gating / chokepoints | ❌ not built — tiers currently gated only by pirate density |
| Combat income rebalanced above mining | ❌ T1 mining ≈ d5 combat per hour, risk-free |
| Stakes: cargo/module ejection into salvageable wrecks | ❌ wingman/flagship deaths destroy everything, no wreck (pod path works) |
| Elite/named bosses with guaranteed drops | ❌ not built (flagship exists mechanically, no special drops) |
| Faction-specific fleet types per region | ❌ not built |
| Power budget (reactors meaning something) | ❌ stat exists, nothing consumes it |

## 10. Ideation prompts (for the redesign discussion)

1. **Defense slots are the scaling bottleneck.** One slot on three hulls caps late-game EHP
   growth at ~+160. Options: per-tier hull variants with more defense slots; make armor stack
   in cargo/utility slots; hull tiering (T1–T5 hulls with slot growth); or per-ship shields
   mattering in the pooled model.
2. **Pick the income curve first.** Everything else tunes against cr/hr by zone tier. Current
   reality: mining flat ~45k/hr everywhere. Decide the target curve (e.g. T1 zone ~5k/hr →
   T5 zone ~50k/hr regardless of activity, combat ~1.5× mining at equal tier for the risk),
   then derive resource prices, asteroid scaling, and loot tables from it.
3. **Make danger scale belt asteroids** (the main loop) the same way deposits scale — that
   single change implements "deeper = richer" for the activity players actually do.
4. **RP curve:** if T4 unlocks should land mid-game rather than week one, either steepen the
   ladder (e.g. 200/1k/5k/25k/100k with a T5 research tier) or make research consume
   resources/artifacts as well as time (ties research into the risk loop, like everything
   else). Currently research is the only progression axis with zero gameplay input.
5. **Honest damage typing:** add a real `damage_type` stat to module_types, drop the keyword
   guess, and surface it in tooltips — prerequisite for any triangle-based enemy design.
6. **Enemy scaling depth:** danger currently scales *count* more than *quality* (E-T3 tops out
   at 35 DPS/280 HP). If late-game fights should be readable rather than swarm-ambushes,
   shift scaling toward fewer/tankier/typed fleets with elite flagships (spec B4) and cap
   simultaneous fleet rally.
7. **Respawn + loot integrity:** a server-side respawn timestamp per system (even coarse)
   fixes both the farm loop and the empty-system problem, and is the prerequisite for
   bounty/kill validation later.
8. **Quality is a stealth tier system** (×2.83 DPS at Q100). Decide whether that's intended —
   if yes, surface it (Q-colored DPS in tooltips, quality-gated crafting goals); if no, damp
   the exponent. It currently rivals two module tiers.
9. **Sol:** revert the TEST BUFF as part of the balance pass (small patrols, correct loot
   multipliers, mirror the server manifest — pitfall #16).
10. **Quick wins to fold into any next batch regardless of direction:** obtainable Mining
    Laser II, wire `mine_cycle`, fix the module-resale branch, honest vendor weapon tooltips,
    the two placeholder T1 tech nodes.
