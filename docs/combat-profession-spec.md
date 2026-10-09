# Combat Profession — Deep Class Spec

**Status:** APPROVED 2026-10-08 (decisions in §8). **Phase A SHIPPED 2026-10-08 (099); Phase B BUILT 2026-10-08 (migration 100)** — see STATUS; Phase C (EWAR + tackle) next.
**Owner brief:** "Ultimately, this should be like EVE, where you can go all in on one profession and get to its end game faster, but it benefits you more to mix up a little… We need to bring each deep class to the forefront and define its highest tier abilities, and build from there." Combat goes first because it has the most working systems to hang skills on, the largest unwired block of the catalog, and it is the risk side every other profession plays against.
**Guides:** EVE Online (the careers graph in `docs/eve skill tree.jpeg`: ratting, missions, incursions, piracy, gate/station camping, combat probing, solo vs fleet; the Operation → Specialization skill ladder; rigs with drawbacks; warfare links) and Stellaris (weapon classes with counters, ship sections and components, strike craft, combat computers / fleet stances, admiral traits, tech tiers).
**Sibling specs:** `combat-progression-spec.md` (damage triangle, zoning, crafting tie-in — built), `combat-attrition-spec.md` (pooled fleets — built), `enemy-factions-spec.md` (Swarm / Synod — built), `jump-gates-spec.md` (gates, camps, §11 travel ideas).

---

## 1. Goal

A pilot who goes **all in on combat** reaches a recognisable endgame — a named top-tier ability per sub-line, a hull that only that ladder can fly, fights that only that pilot can take — and reaches it **faster** than a generalist. A pilot who **mixes** (miner who fights, hauler who tanks, explorer who cloaks) reaches no single pinnacle as fast but earns more per hour and survives more, because the professions pay into each other: loot feeds crafting, crafting feeds fits, escorts make hauls pay, cloaks make deep mining possible.

Three rules follow:

1. **Every sub-line has one pinnacle.** A capstone skill at rank 4–5, a module or hull it unlocks, and a visible battlefield effect. The ladder below it is the path, not filler.
2. **Mixing is paid in multipliers, not duplicates.** Cross-profession bonuses are small percentage gains on the *other* profession's output (a combat pilot's salvage pays more, a miner's escort skill shortens alignment), never a second copy of the same ability.
3. **Nothing in the catalog stays dark.** Every combat-side skill row ends this programme wired or renamed to something that is. The Skills window already dims catalog-only skills; the target is zero dimmed rows in Gunnery, Missiles, Drones, Targeting, Engineering, Navigation, Rigging, Leadership and Spaceship Command.

PvP (player-vs-player damage) stays **deferred** per the social-first direction. "Piracy" in this spec means hunting and being hunted by the three NPC factions, camps, and bounties — EVE's *ratting*, *gate camping* and *combat probing* branches, with the player always on the hunter side of the ledger.

---

## 2. Grounding — what exists today (verified 2026-10-08)

**Wired bonus contracts** (`WIRED_BONUS_TYPES` in `SkillsResearchWindow.jsx`, server readers in `api/*.js` + `SystemView.jsx`): about 30 of 142 skills do something. On the combat side only `fleet_damage_pct` (Small Hybrid Turret Operation), `remote_rep_pct` (Fleet Support), `fleet_cap` (Fleet Command, Fleet Discipline V), the fit-gate reads of Small Energy / Small Projectile / Missile Launcher Operation, Shield Upgrades, Armor Layering (`fitGates.js`), the hull gates (Frigate / Industrial / Capital Command), `align_time_pct`, `jump_range_pct`, `sensor_range_pct`. **Zero wired:** every Missiles row, every Drones row, every Targeting row, every Rigging row, every Leadership row, Engineering beyond the two fit gates, Spaceship Command beyond the gates.

**Weapons** (`module_types`, slot `weapon`, `combat_tuned` stats): Pulse Laser T1 (laser), Autocannon T2 (kinetic), Missile Launcher T2 (missile, lock 2 s, ammo 6), Beam Laser T3, Railgun T3, Quantum Torpedo Launcher T4 (missile), Plasma Beam Lance T5 (laser), Mass Driver Cannon T5 (kinetic). Gaps: no T1 kinetic or missile, no T2 laser, no T4 laser or kinetic, no T3 or T5 missile. Damage triangle: laser → armor, kinetic → shield, missile → hull (`utils/combat.js`).

**Defense:** shield slot takes shields (Deflector T1, Barrier Web T2, Solar Barrier T3, Void Barrier T5) **or** armor (Plating T1, Composite T2, Alloy Lattice T4, Ancient Plate T5). Pooled fleet shield / armor / hull; shield regen 2 HP/s after 3 s; Repair Nanite Hive (T3 utility) heals hull/armor out of combat; station repair for credits.

**Hulls** (`hull_types`, grid slots): Starter Scout, Fighter (Strike, 2000 cr), Scout (Light), Shuttle (Light), Frigate (Medium, 40k, "stealth combat vessel" in its own description), Freighter (Medium), Prospector / Excavator / Leviathan (Industrial), Capital (Heavy, 200k). Fleet cap 2 + Fleet Command level, Fleet Discipline V → 6. No destroyer, cruiser, battleship, carrier or marauder line exists; the catalog has Command skills for all of them.

**Enemies:** server-assembled fleets from the player's own catalog, five behaviour tiers (simple → elite), three factions (Reavers; Swarm: armor + hull, missiles + kinetics, never flees, spawns; Synod: shields + reactors, lasers + railguns, kites, regroups, overclocks), named elites with loot tables, gate camps at danger ≥ 3, rally cap per tier, ambushes on contested hauls, guarded anomaly sites. Loot: server-validated credits, resource drops, module drops, flagship bonus. Player stakes: wrecks with 50 % cargo + modules, pod.

**Combat input:** hotbar 1–5, T targets nearest, designated target panel (fit, weak-to line), missiles need a held lock, no module activation beyond scans / orbit lock / sweep.

**Research:** `weapons` tree (Pulse Optimization T1, Heavy Ordnance T2, Advanced Munitions T3, Capital Weapons T3, Exotic Weaponization T4) and `defense` tree (Shield Theory T1, Armor Engineering T2, Reactive Defense T3, Capital Defense T3, Exotic Defenses T4) exist; most nodes are placeholders that unlock one module or nothing.

**Numbers in play:** aggro 350, attack range max(150, weapon range × 0.9), orbit 100, de-aggro 600, rally cap {1,2,2,3,3}, alignment hit penalty 0.25 s (cap +6), elite signature moves on an 18 s cooldown.

---

## 3. What EVE and Stellaris teach, and what we take

| Source | Mechanic | What we take | What we leave |
|---|---|---|---|
| EVE | Operation → Specialization ladder per weapon size | Three sizes (Small / Medium / Large) per damage type; Operation gates fitting, Specialization multiplies; capstone "Surgical Strike" style all-turret bonus at the top | Per-race turret families |
| EVE | Rigs with drawbacks, Jury Rigging reduces drawback | A third fitting layer: 1–2 rig slots per hull, permanent once fitted, each with a stat up and a stat down; Rigging skills shrink the down | Calibration points |
| EVE | Targeting: lock count, lock time, range | Multiple designated targets (today: one); lock time on missiles and on EWAR; the T key cycles | Signature radius maths beyond one factor |
| EVE | Tackle: webs, scramblers; gate camps | A new EWAR module family that slows, holds or blinds; camps fit it; the player can fit it to hold a fleeing elite | Bubbles (anchorable) — maybe later on nest lanes |
| EVE | Covert ops: cloak, scan-and-strike | A cloak module on light hulls; cloaked = invisible to aggro, no weapons, breaks on action; arrival cloak at gates | Cyno / black ops bridging |
| EVE | Warfare links / fleet boosts, Wing Command | Leadership skills apply fleet-wide % boosts (armored / skirmish / information / siege) that stack with the formation; a boosting hull | Titans, alliance-scale |
| EVE | Drones as a fourth weapon system; carriers | Drone bay module: launches autonomous combat / mining / repair drones with count, range, HP, damage from skills; Capital hull becomes the carrier | Fighter squadrons as separate UI |
| EVE | Ratting, escalations, combat probing | "Hunts": guarded sites that escalate (clear → elite spawns → named elite), bounties that chain, combat probes that find roaming elites | Incursions (needs multiplayer combat) |
| EVE | Marauder (T2 battleship) with bastion | Marauder Command capstone: a hull that can lock down (immobile, ×2 damage, ×2 repair, no align) — the solo-pilot pinnacle | Jump drives on subcaps |
| Stellaris | Weapon classes with hard counters (kinetic vs shields, energy vs armor, missiles vs hull, strike craft) | Already the damage triangle; add **strike craft = drones** as the fourth leg that ignores the triangle but is counterable by point defense | Exact Stellaris percentages |
| Stellaris | Ship sections / components | Hull slot grids already are sections; rigs become the "auxiliary" components | Core/bow/stern layouts |
| Stellaris | Combat computers (artillery / line / picket / swarm) and admiral traits | **Fleet doctrine** chosen on the Fleet window: Line (hold range), Swarm (close and orbit), Picket (stand off, point-defense), Artillery (max range, slow). Leadership skills unlock doctrines; wingmen obey | Admiral as a separate character |
| Stellaris | Tech tiers gating hull classes | The weapons / defense research trees get real nodes that unlock the new hulls, drone bay, EWAR, cloak, rigs | Random tech draws |

---

## 4. The sub-lines and their pinnacles

Each entry: pinnacle → ladder → modules / hulls → catalog skills wired (existing ids) → research → what it adds to the fight. Skill ranks follow the catalog (rank × base SP); capstones are rank 4–5.

### 4.1 Gunnery — turrets (energy = laser, projectile = kinetic, "hybrid" = railgun family)

**Pinnacle: Surgical Strike V + Large turrets.** Every turret fleet-wide +4 %/level damage on top of size bonuses; Large (T4–T5) turrets need Large Operation; a Mass Driver or Lance battery on a Battleship hull fires an **Alpha Volley** (hotbar ability, 20 s cooldown): one salvo at ×2.5 damage from every turret, the player's answer to the elite alpha strike.

Ladder: Small Operation (fit gate, exists) → Small Specialization (+dmg) → Medium Operation / Specialization → Large Operation / Specialization → Surgical Strike. Support: Rapid Firing (fire rate), Precision Optics (range), Motion Prediction (tracking: hit chance vs fast targets — new stat, today every shot hits), Sharpshooter (optimal), Trajectory Analysis (falloff: damage drops past optimal instead of a hard range), Controlled Bursts (capacitor — see 4.5).

Modules: fill the weapon ladder so each damage type has T1–T5 (new: Autocannon T1 "Light Cannon", Pulse Laser II T2 — Pulse Optimization already promises it —, T4 laser "Focused Beam", T4 kinetic "Coilgun", Large size flagged on T4–T5). Sizes: Small = T1–T2, Medium = T3, Large = T4–T5; a hull declares which sizes its weapon slots accept (Fighter small only, Frigate small + medium, Battleship medium + large).

Wired: `gun_small_energy`, `gun_small_projectile`, `gun_small_hybrid` (already fleet damage — becomes small-hybrid only), `gun_small_hybrid_spec`, `gun_medium_*` ×3, `gun_large_*` ×3, `gun_rapid_fire`, `gun_precision`, `gun_motion`, `gun_sharpshooter`, `gun_trajectory_analysis`, `gun_controlled_bursts`, `gun_surgical_strike`.
Research: Pulse Optimization T1 (Pulse Laser II), Heavy Ordnance T2 (Medium turrets), Advanced Munitions T3 (tracking / falloff stats live), Capital Weapons T3 (Large turrets + Alpha Volley), Exotic Weaponization T4 (T5 turrets craftable — exists).

### 4.2 Missiles — ordnance

**Pinnacle: Warhead Upgrades V + Torpedoes/Cruise + Missile Bombardment.** Choose the warhead per launcher (laser / kinetic / missile damage type — a missile boat that re-rolls the triangle), and the capstone ability **Bombardment** (hotbar): every launcher fires its full magazine in 2 s at +50 % flight time, then reloads 15 s. The anti-fleet opener.

Ladder: Missile Launcher Operation (fit gate, exists) → Rockets (T1 "Rocket Pod", short range, no lock) → Light Missiles (T2, exists) → Heavy (T3 "Heavy Missile Rack") → Cruise (T5 "Cruise Battery", longest range in the game) / Torpedoes (T4, exists; hull-breakers) → Warhead Upgrades. Support: Missile Projection (velocity), Missile Bombardment (flight time → range), Target Navigation Prediction (explosion velocity: full damage vs small fast hulls, today missiles always full-hit).

Wired: `mis_missile_launcher` (rof), `mis_rockets`, `mis_light_missiles`, `mis_heavy_missiles`, `mis_cruise_missiles`, `mis_torpedoes`, `mis_warhead_upgrades`, `mis_missile_bombardment`, `mis_missile_projection`, `mis_target_navigation`.
New: ammo as cargo (warheads already exist as a supply item: make launchers consume them; warhead *type* sets damage type), reload timer, magazine per launcher (`ammo_capacity` exists on the torpedo row).
Research: Heavy Ordnance T2 (Heavy rack), Advanced Munitions T3 (warhead types, Cruise), Exotic Weaponization T4 (T5 Cruise craftable).

### 4.3 Drones — strike craft (new subsystem)

**Pinnacle: Drone Interfacing V + the Carrier.** The Capital hull (or a new Carrier hull, see 4.8) launches **five** drones at once; Combat Drone Operation V makes them a damage source equal to a turret line, Logistic drones repair the fleet pool mid-fight, Mining drones mine without a laser slot (the miner's cross-over).

Mechanics: a **Drone Bay** module (new slot type `drone`, 1 bay on Frigate / Capital, none on Fighter / Scout) holds drones (items: Light Combat Drone T1, Medium T3, Heavy T5; Mining Drone T2; Repair Drone T3). Hotbar: Launch / Recall. Drones are fleet members with their own small pool (not the fleet pool), ignore the damage triangle (strike craft leg), die to **point defense** (a new utility module that shoots drones and missiles; the Synod gets it first), return at 30 % HP (Drone Durability raises it), speed from Drone Navigation, count from Drones (1 + level, capped by bay), control range from Drone Avionics (beyond it they idle and return).

Wired: `drn_drones` (count), `drn_drone_avionics` (range), `drn_drone_interfacing` (dmg + HP), `drn_drone_navigation` (speed), `drn_drone_durability` (HP), `drn_combat_drones`, `drn_mining_drones`, `drn_repair_drones`.
Research: new Society/Weapons node "Drone Control" T2 (bay + light drones), "Advanced Drone Systems" T3 (medium / mining / repair), Capital Weapons T3 adds Heavy drones, "Carrier Doctrine" T4 (5-drone launch).
Enemy side: Swarm Mantis / Mawqueen already spawn Needles — that becomes their drone bay; Synod Tender gets repair drones; point defense on Synod line ships. Server manifest mirrors the player rule (pitfall #16).

### 4.4 Targeting and electronic warfare — locks, tackle, blinding

**Pinnacle: Advanced Target Management + Interdiction.** Three designated targets at once (weapons split by doctrine), and the capstone module **Interdiction Field** (T5 EWAR): no enemy in 150 units can flee, regroup or jump; the player's gate camp. The thing that makes a named elite stay and die.

Mechanics: today one designated target and no lock. Add a **lock** with a time (Targeting / Signature Analysis shorten it; hull size lengthens it) that missiles and EWAR need; turrets keep firing at anything in range but prefer locked targets. Max locks = 1 + Targeting level (cap 3 with Multitasking, 5 with Advanced Target Management). Long Range Targeting raises the lock range past weapon range so a sniper doctrine works. Sensor Linking: faster lock on a target a wingman already locked.

EWAR module family (new slot type `ewar`? — no: utility slot, `ewar` stat flag): **Stasis Web** T2 (−50 % target speed in range), **Warp Scrambler** T3 (target cannot align / regroup / flee; versus the player: alignment PAUSES while scrambled — replaces the +0.25 s per hit on camp fleets that fit it), **Sensor Dampener** T3 (target attack range −40 %), **Target Painter** T2 (target takes +15 % missile damage, counters small fast hulls), **Interdiction Field** T5. Enemy camps and Synod line ships fit them from the manifest; the HUD shows a red lock icon on the flagship when tackled.

Wired: `tar_targeting`, `tar_multitasking`, `tar_advanced_target`, `tar_long_range`, `tar_signature_radius`, `tar_sensor_linking`, `nav_signature_analysis` (lock speed), `ldr_information_warfare` (fleet-wide EWAR strength).
Research: Society "Target Acquisition" T1 (locks), "Electronic Warfare" T2 (web / painter), "Signal Disruption" T3 (scrambler / dampener), "Interdiction Theory" T4.

### 4.5 Engineering and defense — the tank, capacitor, overheating

**Pinnacle: Reactive Defense + Thermodynamics.** Resists per damage type (Shield / Armor Compensation: −4 %/level incoming of the type that counters you — soften the triangle, never flip it) and **Overheat** (hotbar): every weapon and the shield booster run at +30 % for 10 s, then take heat damage (Thermodynamics reduces it). The duel-winning button.

Capacitor: today nothing costs energy. Add a fleet **capacitor** pool (reactors' `power`, today unused, becomes capacity + recharge): turrets, EWAR, cloak, overheat, drone launch and repair modules spend it; empty cap = modules cycle at half rate. Capacitor Management (capacity), Power Management (recharge), Controlled Bursts (turret cap cost), Fuel Conservation / High Speed Maneuvering (prop-mod cap cost — see 4.6). Reactors stop being dead slots.

Active defense modules: **Shield Booster** (utility, burst regen on cap), **Armor Repairer** (same for armor, slower, cheaper), the existing Repair Nanite Hive stays the passive one. Hull Upgrades / Hull Reinforcement (+hull %), Shield Operation (+max), Armor Layering (+max; today a fit gate only).

Wired: `eng_shield_ops`, `eng_armor`, `eng_hull_upgrades`, `eng_shield_upgrades` (keeps the gate + adds booster unlock), `eng_armor_layering`, `eng_shield_compensation`, `eng_armor_compensation`, `eng_capacitor`, `eng_capacitor_mgmt`, `eng_power_management`, `eng_electronics` (CPU: how many active modules can run at once), `eng_thermodynamics`.
Research: Shield Theory T1 (booster), Armor Engineering T2 (repairer), Reactive Defense T3 (compensation resists), Capital Defense T3 (capital booster), Exotic Defenses T4 (overheat).

### 4.6 Navigation — propulsion in combat

**Pinnacle: High Speed Maneuvering V + Microwarpdrive.** Two prop mods on the engine slot's companion utility: **Afterburner** (+60 % speed, cheap cap, Afterburner skill extends duration) and **Microwarpdrive** (+200 % speed for 8 s, heavy cap, signature bloom: +50 % missile damage taken, cannot activate while scrambled). The kiter's and the tackler's tool; Evasive Maneuvers (speed) and Acceleration Control (prop-mod speed) scale them. Alignment under fire pairs with this line (already wired).

Wired: `nav_afterburner`, `nav_acceleration`, `nav_evasion`, `nav_fuel_conservation`, `nav_high_speed`.
Research: Thruster Optimization T1 (afterburner), High-Energy Systems T3 (MWD).

### 4.7 Stealth — covert operations

**Pinnacle: Covert Ops hull + Cloak II.** A cloaked fleet is invisible to aggro and sensors, cannot fire, scan or mine, moves at 25 % speed (Cloak II: 60 %), and decloaks on any action or when an enemy comes within 60 units. **Ambush**: decloak within 150 units of a target → the first volley in 3 s does ×1.5 (Information Warfare raises it). The small-fleet answer to camps and the deep-space miner's insurance. Arrival cloak at gates (`jump-gates-spec` §11) is this module's passive form granted to everyone for 10 s.

Modules: **Cloaking Device** T3 (utility; Frigate and Scout only — the Frigate's description already calls it a stealth vessel), **Covert Cloak** T5 (any Light / Medium hull, 60 % speed, no decloak on scan). A **Covert Ops Frigate** variant hull (T4, craft-only) with a bonus to cloak speed and probe strength: combat probing — find roaming elites and camps from the Signals window (ties the Exploration line in).
Wired: `eng_electronics` (cloak CPU), `ldr_information_warfare` (ambush bonus), `nav_evasion` (cloaked speed), Exploration `exp_*` probing rows for combat probes.
Research: Society "Stealth Systems" T3, "Covert Operations" T4.

### 4.8 Spaceship Command — hull lines and the capital question

**Pinnacle: Marauder Command + Bastion.** The Marauder (T5 craft-only battleship) can enter **Bastion** (hotbar, 30 s, 60 s cooldown): immobile, cannot align or be tackled, ×2 turret damage, ×2 repair, immune to EWAR. The solo pilot's answer to a nest. Capital Ship Command keeps the Carrier (4.3) as the fleet pilot's pinnacle.

Hull lines to add (combat only; industrial line stays as is): **Destroyer** (T2, 8 small turrets, glass cannon; Destroyer Command), **Cruiser** (T3, medium turrets, first drone bay; Cruiser Command), **Battlecruiser** (T4, medium + 2 large, the boosting hull for Leadership; Battlecruiser Command), **Battleship** (T4–T5, large turrets, Alpha Volley; Battleship Command), **Marauder** (T5 Battleship variant), **Carrier** (Capital variant with a 5-drone bay). Each Command skill: +hull stats per level for that class (today the skills are placeholders beyond the fit gates); Spaceship Command / Advanced Spaceship Command: +2 % / +3 % all hull stats per level, the generalist's reward. Scout Frame Command: +sensor / +cloak speed for Scouts.

Wired: `cmd_spaceship`, `cmd_adv_spaceship`, `cmd_scout`, `cmd_frigate` (bonus beyond the gate), `cmd_destroyer`, `cmd_cruiser`, `cmd_battlecruiser`, `cmd_battleship`, `cmd_marauder`, `cmd_capital` (bonus beyond the gate), `cmd_wing_command` (6-ship fleets split into two wings with separate doctrines), `cmd_warfare_link` (boost strength).
Research: Propulsion Capital Drive Theory T3 (Battleship + Carrier hulls — the placeholder already promises the capital tier), Weapons Capital Weapons T3 (Marauder), new Military "Hull Engineering" T2 (Destroyer, Cruiser), "Heavy Hulls" T3 (Battlecruiser).

### 4.9 Leadership — fleet doctrine and boosts

**Pinnacle: Fleet Commander (Leadership V + a warfare link module).** The **Command Burst** module (Battlecruiser / Capital utility) applies one of four boosts fleet-wide while cycling: Armored (+resists), Skirmish (+speed, −signature), Information (+lock range, +EWAR strength, +ambush), Siege (+turret damage, −speed). Each Leadership skill unlocks and scales one; Leadership itself extends boost range past formation range (today formation is the fleet; later, boosts for a docked-together group of players).

**Fleet doctrine** (Stellaris combat computers), set on the Fleet window per fleet or per wing: Line (hold at weapon range, turrets), Swarm (close to orbit range, kinetics / drones), Picket (stand off, point defense, protect the flagship), Artillery (max range, retreat from anything closer than 60 % of it). Wingmen already follow the flagship's state; doctrine changes the slot geometry and their firing preference. Mining Foreman: +yield for the whole fleet while the flagship holds Line — the miner-with-escort link.

Wired: `ldr_leadership`, `ldr_armored_warfare`, `ldr_skirmish_warfare`, `ldr_information_warfare`, `ldr_siege_warfare`, `ldr_mining_foreman`, `cmd_fleet_command` IV–V (today nothing above III: IV +1 doctrine slot, V second wing).
Research: Society Crew Training Protocols T2 (doctrines), Imperial Command T3 (Command Burst) — both exist as placeholders.

### 4.10 Rigging — the third fitting layer

**Pinnacle: Jury Rigging V.** Every hull gains 1 rig slot (2 on Medium+, 3 on Capital). Rigs are **permanent** (crafted, destroyed on removal), each +X to one stat and −Y to another: Burst Aerator (+turret rate, −capacitor), Trimark (+hull, −speed), Core Defense Field (+shield regen, −signature… +missile damage taken), Drone Speed Augmentor (+drone speed, −CPU), Warhead Calefaction (+missile damage, −reload), Low Friction Nozzle (+agility, −hull). The matching Rigging skill shrinks the −Y by 10 %/level; Jury Rigging shrinks all of them. The min-maxer's layer, and the biggest crafting sink the combat line has (rigs need processed materials from the Foundry — the industry link).

Wired: all six `rig_*`. Research: Industry "Rig Fabrication" T2, "Advanced Rigging" T3.

---

## 5. Careers on top of the lines (the EVE graph, player-side)

These are the **loops** a combat pilot runs; each needs only the sub-lines above plus small content.

- **Belt and anomaly ratting.** Already there: faction fleets, nests, guarded signatures. Add **escalation**: clearing a guarded site at danger ≥ 3 has a chance to spawn a second wave led by a named elite, and clearing *that* drops a "site key" that pins a T+1 site in a neighbouring system (EVE escalations). Ties Exploration in.
- **Bounty hunting.** Bounty contracts exist (server-verified). Add **chained bounties** (kill the lieutenant → the captain's location is revealed → the elite) and **combat probing**: with a Covert Ops hull, probe a roaming elite's position from the Signals window.
- **Camp busting.** Gate camps exist; with tackle they become real. A busted camp (all camp fleets dead) lifts the lane's danger for one bucket (4 h): contracts through it pay less, haulers love you. Ticker event.
- **Escort.** A hauling contract can be *escorted*: a second pilot (or your own fleet, mixing) in the same system at delivery time adds a combat multiplier to the pay. First real two-profession loop; two-player version rides on presence.
- **Salvage.** Salvaging skills (one wired) become the loot multiplier: salvage drop % on wrecks, plus a **Salvager** utility module that pulls rig components from wrecks — the only source of some rig materials.
- **Convoy raids (NPC).** Rare roaming Synod / Swarm convoys with freight — the pirate loop against NPCs: tackle the hauler, kill the escort, loot sealed cargo you can sell at an island station. The "piracy" branch without PvP.

---

## 6. All-in versus mixed — the SP economics

- **Capstones are expensive and exclusive.** Each sub-line's rank-4/5 capstone costs more SP than the whole ladder below it; a pure combat pilot reaches one capstone in roughly the time a mixed pilot reaches rank 3 in two lines. Training Discipline (queue length) is the generalist's friend.
- **Mixing pays in output, not in power.** Cross-links, all small and all multiplicative: Mining Foreman (combat Leadership → mining yield), Salvaging (combat → crafting materials), Fleet Support (combat → repair), Freighter Operation + escort pay (hauling ↔ combat), combat probing (exploration ↔ combat), rigs from Foundry materials (industry ↔ combat), Negotiation on bounty payouts (social ↔ combat). A pure combat pilot never earns more per hour than a combat + salvage + foundry pilot; they just win harder fights.
- **Gates are hard, bonuses are soft.** Hull and module gates (what you can fly and fit) are the only binary walls; everything else is a percentage, so a 60 / 40 pilot is never locked out of a fight, only slower in it.
- **Named rewards.** Every capstone grants a title on the profile and a ship-name badge visible to peers (Marauder pilots show it on the presence tag) — EVE's "you can tell what someone trained" at a glance.

---

## 7. Build order (each phase shippable, each wires a visible block of the catalog)

| Phase | Scope | Migration | Est. |
|---|---|---|---|
| **A. Turrets + Targeting** | Sizes on weapons, fill the T1–T5 ladder, tracking + falloff stats, lock with time + up to 3 designated targets, T cycles locks, all Gunnery + Targeting skills wired, Alpha Volley | yes (modules, skill text, research nodes) | 1–2 sessions |
| **B. Tank + capacitor** | Capacitor pool from reactors, shield booster / armor repairer, resists, overheat, Engineering + Rigging-ready stat plumbing; every Engineering skill wired | yes | 1–2 sessions |
| **C. EWAR + tackle + camps** | Web / painter / scrambler / dampener, camps and Synod fit them, scramble pauses alignment, Interdiction Field; `jump-gates-spec` §11 tackle item closed | yes | 1 session |
| **D. Missiles** | Rocket / heavy / cruise ladder, ammo as cargo with warhead types, reload, Bombardment; every Missiles skill wired | yes | 1 session |
| **E. Hull lines + doctrine + Leadership** | Destroyer / Cruiser / Battlecruiser / Battleship hulls + sprites (Desktop preview workflow first), fleet doctrines on the Fleet window, Command Burst + four boosts, Fleet Command IV–V, Wing Command | yes | 2 sessions |
| **F. Drones** | Drone bay slot, drone items, launch / recall, point defense, Carrier; Swarm / Synod drone behaviour in the manifest | yes | 2 sessions |
| **G. Stealth + covert ops** | Cloak modules, Covert Ops Frigate, ambush, combat probing, arrival cloak | yes | 1 session |
| **H. Rigs + careers** | Rig slots + rig crafting from Foundry materials, Marauder + Bastion, escalations, chained bounties, camp busting, salvager, NPC convoys | yes | 2 sessions |

Every phase: wire the skills in the same migration that adds the modules (pitfall #19, three rows per module), add the research nodes, extend `enemyManifest.js` so the factions use the new modules too (pitfall #16), update `WIRED_BONUS_TYPES`, and `db:verify` the new rows. Sprites for new hulls go through the Desktop preview workflow before any game code.

---

## 8. Settled with the owner (2026-10-08)

1. **Hull lines:** NEW hulls — Destroyer, Cruiser, Battlecruiser, Battleship, Marauder, Carrier (the catalog's Command skills each get a real class).
2. **Capacitor:** YES — energy is a real resource; reactors set capacity + recharge; active modules spend it.
3. **Ammo:** missiles CONSUME warheads from cargo; warhead type sets the damage type.
4. **Doctrines:** TWO to start — Line and Swarm. Picket / Artillery later.
5. **Drones:** the FULL subsystem (bay slot, combat / mining / repair drones, point defense, Carrier).
6. **Rigs:** EVE-style — permanent, destroyed on removal, a real crafting sink.
7. **Order:** as written — A turrets + targeting → B tank + capacitor → C EWAR + tackle → D missiles → E hulls + doctrine + Leadership → F drones → G stealth → H rigs + careers.

**Status:** spec APPROVED; Phase A is next.
