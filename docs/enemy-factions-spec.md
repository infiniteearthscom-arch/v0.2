# Enemy Factions — The Swarm and The Synod

> **Status:** Design, not started. Drafted 2026-10-07 from the sprite previews in `Desktop\star-shipper-sprites\alien\` (owner: "spec option 2, the Swarm and Synod as enemy factions"). Adds two non-human hostile factions beside the Void Reavers, each with nine hulls that mirror the nine player hulls by role and scale.
> **Owner constraints already locked (2026-10-07):** original names only (nothing from Warhammer 40,000); the Swarm is bio (tentacles, chitin, glowing sacs); the Synod is machine (silver, bronze, red, blue neon, antennae, robot arms); the kept rust-red "forge" sprite set is reserved for a later human faction or skins and is NOT part of this spec. **Nests are IN.** **All three factions appear at every tier from T3 up** — high-tier space is not Swarm-only. **A system fields ONE faction**; fleets of different factions are never mixed within a system in v1. **No enemy fleet ever loots a player wreck** — the 30-minute wreck window belongs to players only.
> **Design intent:** factions are the galaxy's second axis after tier. Tier says how hard; faction says *how* — which damage type to bring, how the fleet behaves, what it drops. Everything rides the existing Phase 2 template pipeline (`enemy_templates` → `enemyManifest.js` → `POST /combat/enter-system` → client `hydrateEnemies`); no new combat sim.

---

## 1. What exists today (the hooks this plugs into)

| Piece | Where | Relevance |
|---|---|---|
| `hull_types` rows for pirate hulls (price NULL = never sold) | migration 069 §1 | Swarm / Synod hulls are the same kind of row |
| `enemy_templates` (`faction` column, default `'void_reavers'`, unused for selection) + `enemy_template_modules` | migration 069 §2 | templates already carry a faction; the manifest just never filters by it |
| `composeFleet` / `pickTemplates` pools by `(tier, role)` only | `server/src/game/enemyManifest.js` | needs a faction dimension |
| `FLEETS_BY_DANGER`, `FLEET_SIZE_BY_TIER`, `ELITE_CHANCE_BY_TIER`, `T5_GUARANTEED_ELITE`, `LOOT_TIER_MULT` | same file | per-faction modifiers hang off these |
| `buildAmbushFleet` (contested hauls, anomaly guards) | same file | must pick the route system's faction |
| `loot_table` entries `{module_type_id, chance, quality}` | migration 077, `api/combat.js /claim-loot` | Swarm needs a resource-drop entry type |
| `hydrateEnemies` hardcodes `faction: 'pirate'`, icons via `lookupHull` → `FALLBACK_HULL_ID` | `star-shipper/src/utils/enemyManifest.js` | read faction from the manifest; new hulls need renderer entries |
| `FACTIONS = { player, pirate }` | `star-shipper/src/utils/shipRenderer.js` | add two entries |
| `BEHAVIOR_TUNING` rows + `behaviorFor(behavior_mode, tier)` | `SystemView.jsx`, `utils/enemyManifest.js` | two new behaviour modes |
| `RALLY_CAP_BY_TIER` | `SystemView.jsx` | Swarm modifier |
| `DAMAGE_MATRIX` (laser→armor, kinetic→shield, missile→hull) | `utils/combat.js` | the counterplay the factions are built around |
| Regions: `sys.regionId / regionName / regionTier` on every system | `galaxyGenerator.js` (client + verbatim server copy) | faction territory keys off the region |
| `db:verify` counts templates (≥ 18) and loot tables | `server/src/db/verify.js` | raise the floor |

---

## 2. The factions

### 2.1 The Swarm (bio)

Hive organisms that treat ships as prey. Armour-and-hull creatures: thick chitin (armor plates in the shield slot), no shields, fast, close-range. **Bring lasers.** They never kite, never regroup, and fight to the last sac. Fleets run one ship larger than the tier norm. Wrecks are carcasses: they drop biological and exotic *resources*, rarely modules.

| Player hull | Swarm hull id | Name | Role in fleets | Notes |
|---|---|---|---|---|
| fighter | `swarm_needle` | Needle | escort | T1–T2 |
| scout | `swarm_stalk` | Stalk | escort | fast, long feelers |
| shuttle | `swarm_grub` | Grub | escort / line | T1–T3 |
| freighter | `swarm_bloat` | Bloat | line | slow, huge hull pool, drops the most resources |
| frigate | `swarm_mantis` | Mantis | line / flagship | wings, claws; T2–T4 |
| capital | `swarm_matriarch` | Matriarch | flagship | T4–T5 |
| prospector | `swarm_borer` | Borer | escort | belts and gas; T2–T3 |
| excavator | `swarm_gnasher` | Gnasher | line | T3–T4 |
| leviathan | `swarm_mawqueen` | Mawqueen | elite | T5 named elite hull |

### 2.2 The Synod (machine)

A machine congregation that salvages dead ships for parts (its own and the Reavers'; never a player's — see §9). Shield-and-reactor ships: strong shields, lasers and a few railguns, slow but precise. **Bring kinetics.** They kite when shields drop, regroup when hull drops, and call every idle fleet in the system from T3 up. Fleets run one ship smaller than the norm but a tier higher in module quality. Wrecks drop *modules* (shield, laser, reactor) and processed materials.

| Player hull | Synod hull id | Name | Role in fleets | Notes |
|---|---|---|---|---|
| fighter | `synod_sprocket` | Sprocket | escort | T1–T2 |
| scout | `synod_dowser` | Dowser | escort | sensors, dish |
| shuttle | `synod_tender` | Tender | escort / line | repairs the pool slowly (see §5.2) |
| freighter | `synod_ledger` | Ledger | line | heavy shields |
| frigate | `synod_caliper` | Caliper | line / flagship | T2–T4 |
| capital | `synod_orrery` | Orrery | flagship | T4–T5 |
| prospector | `synod_auger` | Auger | escort | T2–T3 |
| excavator | `synod_mattock` | Mattock | line | T3–T4 |
| leviathan | `synod_anvilcrown` | Anvilcrown | elite | T5 named elite hull |

### 2.3 Void Reavers (unchanged)

Stay as the human pirate baseline: mixed fits, the existing behaviour ladder, credit-heavy loot. Nothing in 069/077 changes.

---

## 3. Territory — which faction a system fields

Deterministic, server-authoritative, mirrored on the client for the galaxy map (same rule as `warp.js`: one small module in both trees).

**Rule.** `factionFor(system)`:
1. Core Worlds (Sol's region, always T1) → Reavers only.
2. Each region rolls a **dominant faction** from `hash(regionId)` with tier weights:

| Region tier | Reavers | Synod | Swarm |
|---|---|---|---|
| 1 | 1.00 | 0 | 0 |
| 2 | 0.70 | 0.30 | 0 |
| 3 | 0.40 | 0.30 | 0.30 |
| 4 | 0.34 | 0.33 | 0.33 |
| 5 | 0.34 | 0.33 | 0.33 |

   From T4 up the three factions are equally likely per region, so deep space is a patchwork, not a Swarm monoculture; the Swarm only reads as "the deep threat" because it is absent from T1–T2.
3. **One faction per system.** Each system follows its region's dominant faction with probability 0.85 from `hash(systemId)`; otherwise the WHOLE system rolls a contesting faction from the same table. Fleets of different factions never share a system in v1 (`composeFleet` takes the system's faction; there is no per-fleet roll). A Swarm region therefore still holds a few all-Reaver or all-Synod systems, which is what makes its borders feel contested.
4. **Nests (locked in).** The highest-tier Swarm region becomes the **Hive Nest** and the highest-tier Synod region the **Forge Choir**: every system fields that faction (the 0.85 rule is skipped), fleet count +1, the T5 named elite is guaranteed in the nest's highest-danger systems, and the region label on the galaxy map carries a faction glyph. If no region of the needed faction exists at T4+ in a given galaxy seed, promote the deepest region of that faction instead; the dry run must confirm both nests exist at seed 12345.

The manifest records `faction` per fleet (it already records it per enemy). Ambush fleets use the faction of the system they spawn in.

**Galaxy map.** Region rows gain "Threat: Swarm" / "Threat: Synod" / "Threat: Reavers" once the region is discovered (fog rule as today). The flight-view hover panel shows the same line.

---

## 4. Data — migration 094

1. **18 `hull_types` rows**, class `'Swarm'` / `'Synod'`, `price NULL`. `base_hull` follows the player hull it mirrors × a faction factor (Swarm 1.35, Synod 0.85); `base_speed` Swarm +25 %, Synod −15 %. `grid_w / grid_h` copy the mirrored player hull (the manifest uses them for `displaySize`). `slots` copy the mirrored player hull's slot list so fits are expressible with existing `module_types`.
2. **~34 `enemy_templates`** (17 per faction) across T1–T5 with roles escort / line / flagship / elite, `faction` set to `'swarm'` / `'synod'`, `behavior_mode` `'swarm'` / `'synod'` (see §5). Two named elites:
   - `swarm_mawqueen_hollow` — **The Hollow Mother**, T5, Mawqueen hull, `is_elite`.
   - `synod_anvilcrown_nine` — **Calibrant Nine**, T5, Anvilcrown hull, `is_elite`.
   - Plus one T4 elite each (a Matriarch "Brood Sovereign", an Orrery "Choir Primus") so T4 regions can roll a named fight the way Reaver T4 rolls Dread Captain Orsk.
3. **`enemy_template_modules`** using only existing module ids:
   - Swarm: armor plates in the shield slot (every template), missile launchers (the "spore" flavour) + kinetic autocannons, high-tier engines, no shields anywhere. Quality bands as Reavers.
   - Synod: shields in the shield slot (every template), lasers with one railgun per flagship, reactors, low-tier engines. Quality bands **one tier up** (T2 fleets roll T3 bands).
4. **`loot_table` extension.** Entries gain an optional `kind`: `{ "kind": "resource", "resource_name": "Spores", "quantity": [20, 60], "quality": [55, 80], "chance": 0.8 }`. `/claim-loot` routes resource entries through `addResourceStack` (the same path player wrecks use) and reports them in `resources_awarded`. Module entries are unchanged.
   - Swarm templates: Spores / Amber Sap on T1–T3, Plasma on T3–T4, Void Essence 25 % on T5; elites add Dark Matter.
   - Synod templates: Copper Ingot / Iron Ingot on T1–T2 (processed materials, so the Foundry has a second source), shield / laser / reactor module drops 10–25 % from T3, elites drop a T5 shield and a T5 lance at Q80–95.
5. `db:verify`: templates ≥ 52, hulls with class Swarm/Synod = 18, every `swarm_*` template has an armor-type module and no shield, every `synod_*` has a shield.
6. Dev `POST /combat/reload-templates` already drops the cache; no new endpoint.

---

## 5. Behaviour

### 5.1 Two new behaviour modes

`behaviorFor(behavior_mode, tier)` today maps the seed value `'aggressive'` to the tier ladder. Add two modes that **override by faction** and keep the tier ladder's rank for everything not listed:

| Mode | Based on tier ladder | Overrides |
|---|---|---|
| `swarm` | tier ladder for orbit / speed | `fleeHull: 0` (never flee), `kiteShield: null`, `regroupHull: null`, `speedMult +0.15`, `orbitMult 0.8` (closer), rally: a Swarm fleet may engage even when the system is AT the rally cap (cap +1 for Swarm only). T5 signature move: **Spawn** — the flagship ejects two Needle escorts at 30 % pooled hull (once per fight; they join the pool with their own thresholds). |
| `synod` | tier ladder, minimum rank `coordinated` even at T1–T2 | `kiteShield 0.35` (kite earlier), `regroupHull 0.5`, regroup shield regen ×4 as today, calls every idle fleet in the system from T3 (not just within 900 units). T5 signature move: **Overclock** — SHIELD SURGE +40 % and fire rate ×1.5 for 6 s on an 18 s cooldown. |

All numbers live in `BEHAVIOR_TUNING` / the constants under it, like the Phase 4a tiers.

### 5.2 Pool rules by faction (one line each in `fleetEntities.js`)

- Swarm: pooled **hull regenerates** 0.5 %/s while no member has been hit for 10 s (carcass knitting); shields are always 0.
- Synod: a fleet with a Tender in it regenerates pooled **shield** ×1.5 (the Tender is the repair boat); armor is always 0.

Both are small, visible, and reinforce the damage-type lesson.

---

## 6. Spawning

Per faction modifiers applied in `composeFleet` / the fleet loop after the faction is chosen:

| Knob | Reavers | Swarm | Synod |
|---|---|---|---|
| fleet size | `FLEET_SIZE_BY_TIER` | +1 (max 5) | −1 (min 1) |
| fleets per system | `FLEETS_BY_DANGER` | +1 in nests | +1 in nests |
| module quality band | as template | as template | +1 tier |
| elite chance T4 / T5 | 0.2 / 0.1 | 0.2 / 0.1 | 0.2 / 0.1 |
| credit loot (`LOOT_TIER_MULT`) | ×1 | ×0.4 (carcasses carry no credits; resources instead) | ×1.1 |
| wreck source tag | `pirate` | `swarm` | `synod` |

Dry-run target before shipping: average payout per full clear within ±20 % of the Reaver numbers in STATUS (T1 1.6k … T5 24k) once resource drops are valued at vendor price, so no faction becomes the farm.

---

## 7. Client

1. **`FACTIONS`**: add `swarm { name: 'The Swarm', color: '#5ef0a8', hostile: true }` and `synod { name: 'The Synod', color: '#3ad8ff', hostile: true }`. Name tags, the designated-target panel header, the HUD hostile count and the activity ticker read the faction colour. Battlefield tint (front defence layer) is unchanged, which is the point: a Swarm fleet glows amber (armor), a Synod fleet blue (shield).
2. **Sprites**: port `renderHive` / `renderForge` from `_generator_alien_fleets.mjs` into a new `utils/alienShipRenderer.js` (same bake pipeline as `structureRenderer.js`), registered in `lookupHull` so `getShipIcon` / `getShipImage` work for the 18 ids. Sprites are drawn nose-up like today's icon canvas, so the SVG `+90` rule (pitfall #3) is untouched. System-view size = `displaySize` from the mirrored hull; tentacles are clipped to 1.6× the body height at system scale and shown in full only in the target panel and bounty cards.
3. **`hydrateEnemies`**: `faction: e.faction || 'pirate'`; `behaviorFor` gains the two modes; `fleetEntities.buildFleets` applies §5.2.
4. **Galaxy map / flight hover**: the "Threat" row (§3) from the mirrored `factions.js`.
5. **Bounty board**: `TARGET_HULLS` gains `'swarm'` and `'synod'` as class targets so player-posted bounties can target a faction.
6. **Contracts**: bounty contracts stay tier-based; `progressBounties` already carries `templateId`, so "Destroy N Swarm ships" is a one-line generator addition if wanted (not in v1).

---

## 8. Build order

| Phase | Scope | Migration | Est. |
|---|---|---|---|
| **A. Data + server** | 094 (hulls, templates, modules, loot tables); `factions.js` server copy; faction dimension in `composeFleet`; spawn modifiers; resource loot entries in `/claim-loot`; `db:verify` checks; dry-run script | 094 | 1 session |
| **B. Client** | `FACTIONS`, `alienShipRenderer.js` + `lookupHull`, `hydrateEnemies` faction, two behaviour modes, pool rules, target panel | none | 1–2 sessions |
| **C. Territory UI** | client `factions.js` mirror, galaxy map + flight hover Threat row, nest glyphs | none | ½ session |
| **D. Elites + polish** | signature moves, named-elite loot, ticker events ("first Hollow Mother kill"), bounty class targets | text-only migration if names change | ½ session |

A and B must deploy together (a manifest naming `swarm_needle` before the client knows the hull falls back to the pirate interceptor sprite; harmless but ugly). C and D can trail.

---

## 9. Risks and open questions

- **Balance.** Swarm armour + no shields means kinetic-fitted players bounce; the game must say so. The target panel already lists the fit; add a one-line "weak to: Lasers" / "weak to: Kinetics" under the faction name, derived from the pooled profile, not hand-tagged.
- **Resource flood.** Bloat carcasses dropping 60 Spores per kill could undercut mining in T3. Start quantities low (§4.4) and read the dry run.
- **Existing manifests.** Changing `composeFleet` changes every system's roster. `MANIFEST_VERSION` bumps to 3 so loot-claim indexes rebuild on entry; players mid-fight at deploy time see the usual "refresh" 404 on claim, as with Phase 2.
- **Region re-roll.** Territory is derived from existing region ids, so the galaxy itself is untouched. No fog-of-war or base impact.
- **Settled by the owner (2026-10-07):** nests are on at launch; every tier from T3 up can field any of the three factions; one faction per system, never mixed; **no enemy fleet ever loots or claims a player wreck** — the Synod "strips wrecks" in flavour text only, and nothing in `/wrecks/claim` or the contested-salvage rule changes.
- **Open:** faction standing (kills lower it, nothing raises it yet) is a natural later hook into the skill catalogue's social contracts. Whether the T3 weights should lean Reaver (0.40) or be flat like T4–T5 is a dry-run call.
