# Star Shipper — Combat & Progression Design Spec

**Status:** Design Spec (not yet implemented)
**Date:** September 2026
**Context:** This document captures the design philosophy, methodology choices, and implementation plan for Star Shipper's combat difficulty and player progression systems. It is intended as a handoff document for implementation work.

---

## 1. Design Philosophy

Star Shipper's combat and progression system is built on two established game design methodologies, chosen deliberately after evaluating five common approaches used across the genre.

### 1.1 Chosen Methodologies

**Fixed World** (as used in Freelancer, Dark Souls, The Witcher 3): Every system in the galaxy has a permanent, fixed threat rating determined at galaxy generation time. A Threat 1 system is always Threat 1, regardless of the player's progression. The galaxy is a knowable, permanent challenge map. Players feel their growth by expanding the geographic area they can operate in — zones that once terrified them become comfortable territory. The risk of content obsolescence (high-level players finding low-threat zones boring) is accepted as a trade-off for the visceral sense of progression.

**Ability/Knowledge Gating** (as used in EVE Online, Zelda, Metroidvanias): Progression is primarily about gaining new capabilities rather than inflating numbers. A player who only has lasers hitting an armored enemy has a *qualitative* problem — they need a kinetic weapon, not a better laser. The skill tree unlocks new weapon types, defense types, and fitting options that expand *what the player can do*. Knowledge of the weapon triangle, fleet composition, and enemy behavior patterns matters more than raw stat advantages. EVE Online's security status system is the north star here — geographic risk gradients driven by rules of engagement, not enemy level inflation.

### 1.2 Rejected Methodologies

**Full Level Scaling** (Oblivion-style): Rejected because it undermines the entire crafting/research loop. If enemies scale with the player, there's no reason to invest in quality crafting or skill training — the treadmill never ends.

**Soft/Hybrid Scaling** (Skyrim named bosses, Everspace 2): Rejected to keep the design clean. Rubber-banding enemies upward within a threat band adds implementation complexity and muddies the Fixed World contract. If a system is Threat 2, its enemies should always be Threat 2 — no exceptions, no "but if the player has T3 gear the enemies get a little harder." The player should be able to trust the map.

**Difficulty Tiers / New Game+** (Diablo 2 Normal/Nightmare/Hell): Not applicable to an open-world galaxy structure. However, the *principle* of escalating challenge through changing rules (resistances, immunities, behavioral complexity) is borrowed and applied to the threat level system.

### 1.3 Core Design Tenets

1. **The galaxy is the difficulty curve.** Threat ratings are geographic, permanent, and readable on the map. The player plans their progression by looking at the map and deciding where to go next.

2. **Enemies use the same systems as players.** Enemy ships are fitted from the same module pool (hulls, weapons, defenses, engines). The player can inspect an enemy loadout and understand *why* it's dangerous and *what* they'd need to counter it.

3. **Capability > Statistics.** A player with three weapon types at Q50 is more capable than a player with one weapon type at Q90. The skill tree gates access to capabilities, not stat bonuses.

4. **Materials pull the player forward.** Higher-tier blueprints require materials only found in higher-threat systems. The player must venture into danger to progress — but they choose *when* and *how* prepared they want to be.

5. **The weapon triangle is the primary ability gate.** Laser>Armor>Shield, Kinetic>Shield>Armor, Missile>Armor>ECM. Every encounter can be analyzed through this lens. Diversity of loadout is more important than raw power.

---

## 2. Existing Systems and How They Align

### 2.1 What Already Exists and Fits

| System | Current State | Alignment |
|--------|--------------|-----------|
| Galaxy generator | 200 systems with star types, factions, `danger` property | `danger` is the natural threat rating — currently cosmetic, needs to drive spawning |
| Weapon triangle | Locked decision: Laser>Armor>Shield, Kinetic>Shield>Armor, Missile>Armor>ECM | Perfect ability gate — not yet implemented in damage calc |
| Module fitting | Hull slots, typed modules, quality system (Q25=0.5x to Q100=2x) | Enemies should use the same system — quality provides vertical depth within capability tiers |
| Fleet system | Collective HP pool, per-ship firing | Fleet *composition* is an ability gate — specialist ships covering the triangle |
| Blueprint chain | 4-gate progression locked as design decision | Gates should map to material availability by threat zone |
| EVE-style skills | Real-time training, queue UI — locked decision, no implementation yet | Should gate capability access (weapon types, defense types) not stat bonuses |
| Per-ship firing | `weapons.js` utility, SystemView combat loop | Foundation for triangle damage — needs multiplier system added |
| 14 universal stats | Locked: includes offensive, defensive, mobility stats | Enemy templates can be defined in terms of these stats |
| Pirate spawning | Void Reavers with basic behavior in SystemView | Single enemy type, flat loadout — needs to be replaced by template system |

### 2.2 What Needs Tweaking

**`danger` property → `threat_level`:** The galaxy generator's `danger` value should be formalized as `threat_level` (integer 1-5) and made the authoritative driver for enemy spawning, resource distribution, and vendor stock. The generation algorithm may need rebalancing to ensure a clear, readable gradient from Sol outward with interesting irregularities (safe pockets in dangerous space, dangerous pockets in safe space from pirate bases or faction borders).

**Pirate spawning rework:** Currently one enemy type (Void Reavers) with one behavior. Needs to be replaced by a template-driven system where the system's `threat_level` determines what enemy templates can spawn. Templates define hull type, module loadout (with quality range), and behavior mode.

**Combat damage model:** Currently flat damage. Needs weapon-type vs defense-type multiplier system. This is the foundation of ability gating and the single most important missing piece.

**Resource distribution:** Star-type resource multipliers exist but aren't intentionally tied to the blueprint chain. Specific materials needed for T2/T3 blueprints should only (or primarily) appear in corresponding threat zones.

---

## 3. Missing Pieces — What Needs to Be Built

### 3.1 Weapon Triangle Damage Model

**Priority: HIGHEST — this is the foundation of ability gating.**

The combat damage formula should be:

```
effective_damage = base_damage × quality_modifier × triangle_modifier
```

Where `quality_modifier` comes from the existing quality system (Q25=0.5x, Q50=1.0x, Q100=2.0x).

Triangle modifier table:

| Weapon → Defense | Advantaged | Neutral | Disadvantaged |
|-----------------|-----------|---------|---------------|
| Laser vs Shield | 1.5x | — | — |
| Laser vs Armor | — | — | 0.5x |
| Laser vs ECM | — | 1.0x | — |
| Kinetic vs Armor | 1.5x | — | — |
| Kinetic vs Shield | — | — | 0.5x |
| Kinetic vs ECM | — | 1.0x | — |
| Missile vs ECM | 1.5x | — | — |
| Missile vs Armor | — | — | 0.5x |
| Missile vs Shield | — | 1.0x | — |
| Any vs No Defense | 1.0x | — | — |

**Defense layer resolution:** When a target has multiple defense types (e.g., both Shield and Armor), damage is applied to each layer sequentially. Shields absorb first (reduced by the weapon's triangle modifier against shields), then armor absorbs (with its own modifier), then hull takes remaining damage. This means an enemy with both Shield AND Armor has no single-weapon-type weakness — the attacker needs multiple weapon types or must deplete one defense layer before the other becomes the primary target.

**Design note:** These exact multiplier values (0.5x/1.0x/1.5x) are starting points for playtesting. The important thing is that disadvantaged matchups feel *bad enough* that the player recognizes the problem is qualitative (wrong weapon type), not quantitative (not enough damage). If 0.5x isn't punishing enough, consider 0.35x.

### 3.2 Enemy Template System

**Priority: HIGH — required for Fixed World to function.**

Enemy ships should be assembled from the same fitting system the player uses. A template defines:

```
enemy_template:
  id: "void_reaver_t2_kinetic"
  name: "Void Reaver Gunship"
  threat_level: 2
  hull_type: "fighter"          # same hull types available to player
  modules:
    weapon_1: { type: "kinetic", tier: 2, quality_range: [40, 65] }
    defense_1: { type: "armor", tier: 1, quality_range: [35, 55] }
    engine_1: { type: "engine", tier: 1, quality_range: [40, 60] }
  behavior: "aggressive"
  bounty_range: [150, 300]
  loot_table: "t2_kinetic_drops"
```

**Templates per threat level (rough sketch):**

**Threat 1 — "Learning to fight"**
- Void Reavers only
- Single T1 weapon (usually laser), no defenses beyond hull
- Q35-55 range
- Behavior: simple aggressive (fly toward player, shoot)
- Player requirement: any weapon works, just shoot back
- Found in: ~60 systems nearest Sol

**Threat 2 — "The triangle matters"**
- Void Reavers with defenses, basic faction patrols
- T1 weapons + one defense type (either armor OR shield, not both)
- Q45-65 range
- Behavior: aggressive with some evasion
- Player requirement: at least two weapon types trained, or one weapon type with high quality
- Found in: mid-ring systems (~60-120)

**Threat 3 — "Fleet composition matters"**
- Faction military ships, elite pirates
- T2 weapons + two defense types (armor AND shield)
- Q50-75 range
- Mixed groups: a patrol might have a laser/shield ship + kinetic/armor ship
- Behavior: coordinated (focus-fire weakest target, triangle-aware targeting)
- Player requirement: multiple weapon types, multiple defense types, fleet of 2-3 ships
- Found in: outer-mid systems (~100-160)

**Threat 4 — "Mastery required"**
- Faction capital defenders, pirate warlords
- T2-T3 weapons + full triangle coverage (armor + shield + ECM)
- Q60-85 range
- Behavior: tactical (retreat when damaged, call reinforcements, target player's weakest ship)
- Player requirement: T2+ gear across multiple weapon/defense types, 3-4 ship fleet, trained combat skills
- Found in: outer rim and faction capitals (~140-190)

**Threat 5 — "Endgame content"**
- Unique named enemies, anomaly guardians, faction flagships
- T3 weapons + T2-T3 defenses + full triangle
- Q75-95 range
- Behavior: elite (all T4 behaviors + unique mechanics per enemy type)
- Player requirement: T3 gear, maxed relevant skills, optimized fleet composition
- Found in: ~10-15 specific systems at the galaxy's edge and special locations

**Spawn mechanics:** Each system's threat level determines which template pool it draws from. Systems can have a primary enemy faction (Void Reavers, faction military, etc.) and a secondary chance for elite/random encounters. Spawn frequency can also be tied to threat level — Threat 1 systems have sparse, infrequent patrols; Threat 4 systems have dense, frequent patrols.

**Key principle:** Enemy templates are FIXED per threat level. A Threat 2 system always spawns Threat 2 enemies. The player can trust the map.

### 3.3 Skill Tree as Capability Unlocks

**Priority: HIGH — core ability gating mechanism.**

The skill tree should primarily unlock *new things the player can do*, with stat bonuses as secondary effects. Proposed structure:

**Combat Skills Branch:**

```
Laser Weapons I      → Unlocks: ability to fit T1 laser weapons
                       Bonus: +3% laser damage
Laser Weapons II     → Unlocks: ability to fit T2 laser weapons
                       Bonus: +5% laser damage
                       Prereq: Laser Weapons I
Laser Weapons III    → Unlocks: ability to fit T3 laser weapons
                       Bonus: +8% laser damage
                       Prereq: Laser Weapons II

Kinetic Weapons I    → Unlocks: ability to fit T1 kinetic weapons
                       Bonus: +3% kinetic damage
Kinetic Weapons II   → Unlocks: ability to fit T2 kinetic weapons
                       (same pattern)

Missile Systems I    → Unlocks: ability to fit T1 missile launchers
                       (same pattern)
```

**Defense Skills Branch:**

```
Shield Systems I     → Unlocks: ability to fit T1 shield modules
                       Bonus: +5% shield HP
Shield Systems II    → Unlocks: T2 shields
                       Prereq: Shield Systems I

Armor Plating I      → Unlocks: ability to fit T1 armor modules
                       Bonus: +5% armor HP
                       
ECM Operations I     → Unlocks: ability to fit T1 ECM modules
                       Bonus: +5% ECM effectiveness

Advanced Defenses    → Unlocks: ability to fit TWO defense types simultaneously
                       Prereq: any two defense skills at level I
                       (Without this, a ship can only fit one defense type)
```

**Fitting/Engineering Branch:**

```
Power Grid Mgmt I    → Unlocks: +1 module slot usable on fitted ships
                        (or increased power grid capacity)
Hull Engineering I    → Unlocks: ability to fly medium hulls
Hull Engineering II   → Unlocks: ability to fly heavy hulls
Fleet Command I      → Unlocks: ability to control 2 ships
Fleet Command II     → Unlocks: 3 ships
Fleet Command III    → Unlocks: 4 ships (max)
```

**Design notes:**
- New players start with Laser Weapons I pre-trained (starter loadout uses lasers)
- Training into a second weapon type is the first major ability gate unlock
- Training into a defense type is the second major unlock
- The tree naturally creates progression: weapon → defense → second weapon → advanced defenses → fleet → heavy hulls
- Training is EVE-style real-time (continues while offline), so the player can queue up skills and go do other things
- Stat bonuses are small (3-8%) — the capability unlock is the real reward

### 3.4 Material Geography and Blueprint Chain

**Priority: MEDIUM — drives the economic pull toward harder content.**

The 4-gate blueprint chain should map to material availability by threat zone:

```
Gate 1 (T1 blueprints):
  Materials: Iron, Copper, Silicon
  Found in: Threat 1-2 systems (abundant)
  Player state: starter gear, first weapon type

Gate 2 (T2 blueprints):
  Materials: Iron, Copper + Titanium, Crystite
  Found in: Titanium in Threat 2-3, Crystite in Threat 3+
  Player state: 2 weapon types, 1 defense type, entering mid-game

Gate 3 (T3 blueprints):
  Materials: Titanium, Crystite + Uranium, Exotic Alloys
  Found in: Uranium in Threat 3-4, Exotic Alloys in Threat 4+
  Player state: full triangle coverage, fleet of 2-3, pushing outer systems

Gate 4 (T3 refined / endgame blueprints):
  Materials: Exotic Alloys + Quantum Crystals, Dark Matter
  Found in: Threat 5 systems only
  Player state: endgame, optimizing fleet composition
```

**The pull loop:** The player needs Titanium to craft T2 weapons. Titanium is found in Threat 2-3 systems. To safely mine in Threat 2-3 systems, the player needs at least two weapon types and a defense module (because Threat 2 enemies have defenses). To train those skills, they need time and credits. To get credits, they can bounty-hunt in Threat 1 systems or trade. This creates a natural progression loop that the player drives through their own decisions about when to push into harder territory.

**Risk-reward layer:** A bold player can venture into a Threat 3 system with only T1 gear to grab Crystite early. They'll face enemies they're not well-equipped to fight, but if they succeed, they get a massive crafting advantage. The galaxy doesn't stop them — it just presents the honest challenge. This is where Fixed World shines: the player can see the threat level, assess their own capabilities, and make a meaningful choice about risk.

### 3.5 Enemy Behavioral Tiers

**Priority: LOWER — enhances knowledge gating but not strictly required for MVP.**

Enemy behavior should become more sophisticated at higher threat levels, creating knowledge gates where the player must learn *how* enemies at each tier fight:

**Behavior Mode: Simple Aggressive (Threat 1)**
- Fly directly toward the nearest player ship
- Fire when in range
- No evasion, no target switching
- Die in place (no retreat)

**Behavior Mode: Evasive Aggressive (Threat 2)**
- Fly toward player but with some lateral movement
- Break off and re-approach if taking heavy damage from an advantaged weapon type
- May switch targets if one player ship is out of range

**Behavior Mode: Coordinated (Threat 3)**
- Groups of 2-3 ships that arrive together
- Focus-fire the player's weakest ship (lowest HP or fewest defenses)
- Triangle-aware: the kinetic enemy ship preferentially targets the player's shielded ship
- Retreat when group HP drops below 30% — player must chase to finish them

**Behavior Mode: Tactical (Threat 4)**
- Groups of 3-4 with mixed loadouts
- All Coordinated behaviors plus:
- Call reinforcements if the fight lasts more than 30 seconds
- Retreat damaged ships behind healthier allies
- Attempt to separate the player's fleet by engaging from multiple angles

**Behavior Mode: Elite (Threat 5)**
- All Tactical behaviors plus:
- Unique per-enemy-type mechanics (e.g., a cloaking ship that disappears and re-engages from a different angle, a carrier that launches drone waves)
- Adaptive targeting: if the player's fleet is all-lasers, the elite prioritizes armor modules to maximize disadvantaged matchups

---

## 4. How the Player Experiences This

A narrative walkthrough of what progression feels like under this system:

**Early game (hours 0-3):** The player starts at Sol with a Starter Scout fitted with a T1 laser and no defenses. They can handle Threat 1 Void Reavers in nearby systems — simple pirates with weak weapons and no defenses. They earn credits from bounties and mine Iron/Copper from safe planets. They start training "Kinetic Weapons I" (takes ~30 min real-time).

**Early-mid game (hours 3-8):** Kinetic Weapons I completes. The player crafts a T1 Railgun and fits it alongside their laser. They notice that some Threat 2 systems on the map have Titanium deposits they need for T2 blueprints. They venture into a Threat 2 system and encounter a Void Reaver with armor plating. Their laser does reduced damage (0.5x) but their new railgun tears through the armor (1.5x). They realize "oh, THAT'S why I needed kinetics." They start training Shield Systems I.

**Mid game (hours 8-15):** The player has 2 weapon types, a shield module, and has started training Fleet Command I to control a second ship. They're operating comfortably in Threat 2 systems and eyeing the Threat 3 zone where Crystite is found. They push into a Threat 3 system and encounter a faction patrol: two ships, one with shields and one with armor. Their single ship can only counter one at a time. They realize they need a second ship with a different weapon type. They retreat, finish Fleet Command training, buy a second hull, fit it with complementary weapons, and return. With two ships covering the triangle, they can handle the patrol.

**Late-mid game (hours 15-25):** The player has a 3-ship fleet with full triangle coverage (laser/shield boat, kinetic/armor boat, missile/ECM boat). They're farming Threat 3 systems for T2 materials and crafting T2 weapons. They see a Threat 4 system with a juicy Uranium deposit. They decide to risk it. The Threat 4 enemies have T2 weapons and full defense coverage — the fight is hard but winnable with good fleet composition and manual target prioritization. They get the Uranium and start on T3 blueprints.

**Late game (hours 25+):** The player has T3 weapons, a 4-ship fleet, and maxed combat skills. They can operate in Threat 4 systems comfortably. Threat 5 systems remain challenging due to elite enemy behaviors and unique mechanics. The endgame is about optimizing fleet composition, chasing Q90+ crafted gear, and tackling the hardest content the galaxy offers.

---

## 5. Implementation Order

Roughly prioritized by dependency chain and design impact:

### Phase 1: Combat Foundation
1. **Weapon triangle damage multipliers** — modify `weapons.js` and the SystemView combat loop to apply triangle modifiers when calculating damage. This is the single change that creates ability gating overnight.
2. **Defense layer system** — implement shield/armor/ECM as damageable layers that absorb damage before hull HP. Currently defenses exist as modules but may not function as damage absorption layers.

### Phase 2: Enemy Diversity
3. **Enemy template system** — create a template configuration (JSON or DB table) that maps threat levels to hull+module loadouts. Replace the current flat Void Reaver spawning with template-driven spawns.
4. **Threat-level-driven spawning** — wire the system's `threat_level` (from galaxy generator `danger` property) to the template system so each system spawns appropriate enemies.

### Phase 3: Progression Gating
5. **Skill tree design and implementation** — define skill tree structure, implement EVE-style real-time training, wire skill completion to capability unlocks (weapon type access, defense type access, fleet size).
6. **Material geography** — audit and adjust resource distribution so blueprint-chain materials map to threat zones as described in section 3.4.

### Phase 4: Polish and Depth
7. **Enemy behavioral tiers** — implement behavior modes (simple aggressive → evasive → coordinated → tactical) per threat level.
8. **Threat level UI** — show threat ratings on the galaxy map with clear color coding, show enemy loadout info on targeting/inspection.
9. **Bounty and loot scaling** — tie bounty values and loot drop tables to threat level so economic incentives match risk.

### Phase 5: Endgame
10. **Elite enemy variants** — unique named enemies in Threat 5 systems with special mechanics.
11. **Fleet composition UI** — tools for the player to plan and manage multi-ship fleets with triangle coverage visualization.

---

## 6. Database / Data Model Implications

### 6.1 New Tables Likely Needed

```sql
-- Enemy template definitions
CREATE TABLE enemy_templates (
  id SERIAL PRIMARY KEY,
  template_key VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  threat_level INTEGER NOT NULL CHECK (threat_level BETWEEN 1 AND 5),
  faction VARCHAR(64),               -- 'void_reavers', 'hegemony', 'federation', etc.
  hull_type_id INTEGER REFERENCES hull_types(id),
  behavior_mode VARCHAR(32) NOT NULL, -- 'aggressive', 'evasive', 'coordinated', 'tactical', 'elite'
  bounty_min INTEGER DEFAULT 0,
  bounty_max INTEGER DEFAULT 0,
  loot_table_key VARCHAR(64)
);

-- Modules fitted to enemy templates
CREATE TABLE enemy_template_modules (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES enemy_templates(id) ON DELETE CASCADE,
  slot_type VARCHAR(32) NOT NULL,     -- 'weapon', 'shield', 'armor', 'ecm', 'engine', etc.
  module_type_id INTEGER REFERENCES module_types(id),
  tier INTEGER NOT NULL DEFAULT 1,
  quality_min INTEGER NOT NULL DEFAULT 30,
  quality_max INTEGER NOT NULL DEFAULT 60
);

-- Skill definitions
CREATE TABLE skill_definitions (
  id SERIAL PRIMARY KEY,
  skill_key VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(32) NOT NULL,      -- 'combat', 'defense', 'engineering', 'navigation'
  max_level INTEGER NOT NULL DEFAULT 3,
  prereq_skill_id INTEGER REFERENCES skill_definitions(id),
  prereq_level INTEGER DEFAULT 1,
  training_time_seconds INTEGER NOT NULL  -- base time per level
);

-- Skill effects (what each skill level unlocks/grants)
CREATE TABLE skill_effects (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER REFERENCES skill_definitions(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  effect_type VARCHAR(32) NOT NULL,   -- 'unlock_weapon_type', 'unlock_defense_type', 'unlock_hull_class', 'stat_bonus', 'fleet_size'
  effect_key VARCHAR(64),             -- e.g., 'kinetic', 'shield', 'medium_hull'
  effect_value NUMERIC                -- e.g., 0.05 for +5% bonus, or 3 for fleet size
);

-- Player skill training state
CREATE TABLE player_skills (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  skill_id INTEGER REFERENCES skill_definitions(id),
  current_level INTEGER NOT NULL DEFAULT 0,
  training_started_at TIMESTAMPTZ,    -- null if not currently training
  training_completes_at TIMESTAMPTZ,  -- null if not currently training
  UNIQUE(user_id, skill_id)
);
```

### 6.2 Existing Table Modifications

```sql
-- Systems table: formalize threat_level
ALTER TABLE systems ADD COLUMN threat_level INTEGER
  DEFAULT 1 CHECK (threat_level BETWEEN 1 AND 5);
-- Populate from existing danger property during migration

-- Module types: may need weapon_category and defense_category columns
-- if not already present, to support triangle lookups
ALTER TABLE module_types ADD COLUMN weapon_category VARCHAR(16);
  -- 'laser', 'kinetic', 'missile' (null for non-weapons)
ALTER TABLE module_types ADD COLUMN defense_category VARCHAR(16);
  -- 'shield', 'armor', 'ecm' (null for non-defenses)
```

---

## 7. Locked Decisions (from prior sessions, still in effect)

These decisions were made in earlier sessions and this spec builds on top of them:

- 14 universal stats for ships
- Collective fleet HP pool
- Mass/mobility tradeoff
- Weapon/defense triangle: Laser>Armor>Shield, Kinetic>Shield>Armor, Missile>Armor>ECM
- Per-ship firing required
- EVE-style real-time skill training
- 4-gate blueprint chain
- Ships use `hull_type_id` not `hull_id`
- PostgreSQL 18 — no CREATE EXTENSION
- Next migration = 019
- Quality system: Q25=0.5x, Q50=1.0x, Q100=2.0x

---

## 8. Open Questions for Implementation

1. **Triangle multiplier values:** 0.5x/1.0x/1.5x is the starting proposal. May need playtesting. Consider whether disadvantaged should be harsher (0.35x) to make the ability gate more obvious.

2. **Defense stacking rules:** Can a ship fit both shield AND armor without the Advanced Defenses skill? Current proposal says no — single defense type until that skill is trained. This is a major ability gate and needs to feel right.

3. **Starter skill loadout:** Players likely start with Laser Weapons I and maybe Shield Systems I pre-trained. Do they start with any defense, or are they completely undefended until they train into one?

4. **Threat level distribution:** How many systems at each threat level? Rough proposal: T1=60, T2=50, T3=40, T4=30, T5=20. But the exact distribution needs to feel right on the galaxy map.

5. **Fleet size progression:** Is 4 ships the right max? EVE has no real cap but Star Shipper's per-ship firing makes each ship meaningful. 4 might be the sweet spot for covering the triangle with a utility/support ship.

6. **Skill training times:** EVE's longest skills take weeks real-time. Star Shipper is a smaller game — training times should probably be minutes to hours, not days. Suggested range: 5 min for level I basic skills, 30 min for level II, 2 hours for level III. These need playtesting.

7. **Enemy respawn mechanics:** Do enemies respawn in a system after being cleared? If so, how quickly? Fixed World suggests they should respawn on a timer so systems remain persistently dangerous, but the timer should be long enough that the player can complete their objective (mine, dock, trade) before new enemies arrive.
