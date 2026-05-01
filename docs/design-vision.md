# Star Shipper — Design Vision

> **This is the aspirational design — the original 4X scope.** Many sections describe features not yet built (rooms-within-hulls, crew management, planetary colonies, room targeting in combat, faction reputation). For what's actually shipped and live, see [`HANDOFF.md`](../HANDOFF.md).
>
> Notable pivots from this doc:
> - Ship building is **hull-with-slots** (6 fixed hull types + module fitting), not cell-painting + interior rooms
> - No colonies, crew, or faction reputation yet
> - Combat is basic projectile combat with Void Reaver pirates — no room targeting, fires, or boarding

## Overview

A serious sci-fi space exploration and empire-building game combining deep ship customization with planetary development and galactic expansion. Players begin with a single ship in one solar system and progressively unlock new capabilities, ships, systems, and colonies.

**Genre**: 4X Space Sandbox (Explore, Expand, Exploit, Exterminate)  
**Inspirations**: Starsector (combat, factions), Stellaris (planetary management, expansion), FTL (ship interior building, crew management)  
**Visual Style**: Clean vector / flat design with atmospheric depth

---

## Visual Direction

### Style Guidelines
- **Palette**: Deep space backgrounds (dark blues, purples, blacks) with high-contrast UI elements and glowing accents
- **Aesthetic**: Geometric, crisp edges, minimal but purposeful gradients for depth
- **Ships**: Clean silhouettes with visible modular interiors, color-coded rooms by function
- **Planets**: Distinct visual identity per type (rocky, gas giant, ice, lava, terran)
- **UI**: Polished components with subtle animations, clear hierarchy, satisfying interactions

### Priority Elements
1. **Atmospheric Backgrounds**: Parallax starfields, nebulae, planetary rings, asteroid fields
2. **Ship & Planet Art**: Detailed vector illustrations, visible interior layouts, isometric previews
3. **Animations & Particles**: Thruster trails, weapon fire, explosions, mining lasers, jump effects
4. **Polished UI**: Beveled panels, glowing highlights, smooth transitions, responsive feedback

### Technical Implementation
- **SVG**: Ships, icons, UI elements, planets (infinitely scalable vectors)
- **Canvas 2D**: Starfields, particle effects, real-time rendering
- **CSS/Tailwind**: UI panels, buttons, gradients, glows, animations
- **Optional WebGL**: Advanced particles, shaders, lighting effects for polish

### Windowing System
The game uses a draggable, stackable window system for management interfaces:
- Draggable by title bar
- Resizable from corners/edges
- Minimize to dock, maximize, close
- Click to bring to front (z-index stacking)
- Window state persistence (position, size)
- Consistent styling: dark translucent panels, cyan accents, glowing borders

---

## Core Systems

### 1. Ship Construction System

The heart of the game. Ships are built in two layers: **hull shape** (exterior cells) and **interior rooms** (functional spaces within the hull). This FTL-inspired system gives players complete control over ship design.

#### 1.1 Hull Construction

Players define their ship's shape by placing hull cells on a grid. Hull shape affects:
- Total interior space available
- Ship silhouette and visual profile
- Armor distribution (edge cells are exterior armor)

**Hull Grid**
- Grid size: 24×24 cells maximum
- Cell size: 28px (visual representation)
- Players paint cells to define ship boundary
- Edge cells automatically render hull plating
- Interior cells available for room placement

**Hull Templates**
Pre-designed hull shapes for quick starts:

| Template | Description | Cells | Recommended Role |
|----------|-------------|-------|------------------|
| Scout Frame | Small, fast exploration vessel | ~25 | Recon, early game |
| Shuttle Frame | Compact utility vessel | ~30 | Transport, mining |
| Freighter Frame | Large cargo capacity | ~50 | Trade, hauling |
| Frigate Frame | Balanced combat vessel | ~55 | Combat, escort |
| Cruiser Frame | Large multi-role warship | ~80 | Fleet command |
| Carrier Frame | Massive with hangar space | ~100 | Fighter deployment |
| Custom | Design your own shape | Variable | Any |

**Hull Rules**
- Hull must be contiguous (all cells connected)
- Minimum hull size: 15 cells
- Maximum hull size varies by shipyard level
- Hull shape affects maneuverability (compact = agile, elongated = fast)

#### 1.2 Interior Rooms

Once hull is defined, players place functional rooms inside. Rooms provide all ship capabilities.

**Room Placement Rules**
- Rooms must fit entirely within hull cells
- Rooms cannot overlap
- Rooms are rectangular (drag to define size)
- Each room type has minimum and maximum cell sizes
- Room size affects capacity/effectiveness

**Room Types**

| Room | Icon | Color | Min/Max Cells | Power | Crew Slots | Description |
|------|------|-------|---------------|-------|------------|-------------|
| Cockpit | 🎯 | Blue | 4-6 | -2 | 2 | Ship control center. Required for piloting. |
| Crew Quarters | 🛏️ | Green | 4-12 | -1 | 4 | Living space. Determines max crew. |
| Cargo Bay | 📦 | Yellow | 4-20 | -1 | 1 | Storage for goods and resources. |
| Engine Room | 🔥 | Orange | 4-12 | 0 | 2 | Propulsion systems. Required for movement. |
| Reactor Core | ⚛️ | Cyan | 4-9 | +15 | 2 | Power generation. Supplies all systems. |
| Weapons Bay | 🔫 | Red | 4-12 | -4 | 2 | Weapon systems and ammunition. |
| Shield Generator | 🛡️ | Purple | 4-9 | -5 | 1 | Defensive shield systems. |
| Medical Bay | 💊 | Pink | 4-9 | -2 | 1 | Crew healing and cloning. |
| Mining Bay | ⛏️ | Violet | 6-16 | -4 | 3 | Resource extraction equipment. |
| Fighter Hangar | ✈️ | Gray | 9-25 | -3 | 4 | Fighter storage and deployment. |
| Research Lab | 🔬 | Teal | 4-12 | -3 | 2 | Technology research. |
| Sensor Array | 📡 | Light Blue | 4-6 | -2 | 1 | Detection and scanning. |

**Room Scaling**
Room effectiveness scales with size:
- Cargo Bay: +50 capacity per cell
- Crew Quarters: +1 crew slot per 2 cells
- Fighter Hangar: +1 fighter per 4 cells
- Weapons Bay: +1 weapon mount per 3 cells
- Mining Bay: +25% extraction rate per 2 cells above minimum

#### 1.3 Systems Within Rooms

Each room can contain specific systems/equipment that provide actual functionality.

**Cockpit Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Navigation Console | Enables piloting | -1 | Required |
| Sensor Terminal | +25% detection range | -1 | Stacks with Sensor Array |
| Autopilot Module | Enables auto-navigation | -1 | Quality of life |
| Combat Computer | +10% weapon accuracy | -2 | Combat bonus |

**Engine Room Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Basic Thruster | 100 base speed | -2 | Starting |
| Ion Drive | 150 base speed | -3 | Efficient |
| Fusion Engine | 250 base speed | -5 | Fast |
| Jump Drive | Inter-system travel | -8 | Required for expansion |
| Afterburner | +50% speed burst | -2 | Cooldown ability |
| Fuel Injector | +25% fuel efficiency | -1 | Extended range |

**Reactor Core Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Basic Reactor | +10 power output | — | Starting |
| Fusion Reactor | +18 power output | — | Standard |
| Antimatter Core | +35 power output | — | Volatile, explosion risk |
| Backup Capacitor | Emergency power reserve | — | 30 second backup |
| Coolant System | -20% reactor damage risk | -1 | Safety |

**Weapons Bay Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Pulse Cannon Mount | Medium damage, medium range | -3 | Balanced |
| Railgun Mount | High damage, long range, slow | -4 | Armor piercing |
| Missile Rack | High damage, guided, limited ammo | -3 | Requires reloading |
| Beam Turret | Sustained damage, shield bonus | -5 | Continuous fire |
| Point Defense | Anti-missile, anti-fighter | -2 | Defensive |
| Torpedo Launcher | Very high damage, slow, anti-capital | -6 | Heavy weapon |
| Ammo Feed | +50% ammo capacity | 0 | For missile/torpedo |

**Shield Generator Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Shield Emitter | +100 shield HP | -4 | Base shields |
| Advanced Emitter | +250 shield HP | -7 | Strong shields |
| Shield Capacitor | +50% recharge rate | -2 | Faster recovery |
| Hardened Shields | +25% resistance | -3 | Damage reduction |

**Mining Bay Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Mining Laser | Extracts resources | -2 | Base extraction |
| Heavy Mining Laser | +100% extraction rate | -4 | Faster mining |
| Ore Processor | Refines raw ore (+25% value) | -2 | On-board refining |
| Tractor Beam | Pulls cargo, asteroids | -2 | Utility |
| Deep Core Drill | Access rare deposits | -3 | Rare materials |

**Fighter Hangar Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Launch Tube | Deploy 1 fighter/30s | -2 | Per tube |
| Repair Arm | Repairs docked fighters | -2 | Maintenance |
| Fighter Rack | +2 fighter capacity | 0 | Storage |
| Pilot Ready Room | -25% scramble time | -1 | Faster deployment |

**Medical Bay Systems**
| System | Effect | Power | Notes |
|--------|--------|-------|-------|
| Med Station | Heals 1 crew/minute | -1 | Basic healing |
| Surgery Suite | Heals critical injuries | -2 | Trauma care |
| Cloning Pod | Revives dead crew (slow) | -3 | Crew recovery |
| Quarantine Cell | Contains infections | -1 | Disease control |

#### 1.4 Power Management

Ships require balanced power budgets:
- Reactor rooms generate power
- All other rooms and systems consume power
- Power deficit = systems shut down (player chooses which)
- Damaged reactors reduce output
- Backup capacitors provide emergency buffer

**Power States**
| State | Indicator | Effect |
|-------|-----------|--------|
| Surplus | Green | All systems operational, shields recharge faster |
| Balanced | Yellow | All systems operational |
| Deficit | Red | Must disable systems to match available power |
| Critical | Flashing Red | Core systems only, no weapons/shields |

#### 1.5 Crew Management

Crew members operate ship systems:
- Each system slot requires crew to function
- Crew have skills that improve system effectiveness
- Crew can be injured, killed, or incapacitated
- Crew Quarters determine maximum crew capacity

**Crew Roles**
| Role | Primary Station | Bonus |
|------|-----------------|-------|
| Pilot | Cockpit | +10% maneuverability |
| Engineer | Engine/Reactor | +15% efficiency, faster repairs |
| Gunner | Weapons Bay | +15% accuracy, faster reload |
| Medic | Medical Bay | +50% healing rate |
| Miner | Mining Bay | +25% extraction rate |
| Scientist | Research Lab | +20% research speed |
| Deck Chief | Fighter Hangar | +25% fighter effectiveness |

#### 1.6 Ship Statistics

Final ship stats derived from hull + rooms + systems + crew:

**Movement**
- Base Speed: From engine systems
- Maneuverability: Hull shape + pilot skill
- Jump Range: Jump drive + fuel capacity
- Fuel Efficiency: Engine type + crew skill

**Combat**
- Firepower: Sum of weapon damage ratings
- Shield HP: Shield emitter output
- Armor HP: Hull cells × armor value
- Evasion: Maneuverability + ECM systems

**Utility**
- Cargo Capacity: Cargo bay size × 50
- Crew Capacity: Crew quarters size ÷ 2
- Sensor Range: Base + sensor systems
- Mining Rate: Mining systems × bay size bonus

#### 1.7 Ship Builder UI

**Layout**
- Left Panel: Tool palette (Hull, Room, System, Delete tools)
- Center: Ship grid (24×24, zoomable, pannable)
- Right Panel: Ship stats, 3D preview, warnings

**Tools**
1. **Hull Tool**: Paint/erase hull cells
2. **Room Tool**: Select room type, drag to place
3. **System Tool**: Click room to add systems
4. **Delete Tool**: Remove rooms or systems
5. **Crew Tool**: Assign crew to stations

**Visual Feedback**
- Hull cells show exterior edges highlighted
- Rooms color-coded by type
- Power indicators on each room (+/- symbols)
- Crew slot indicators (dots)
- System icons within rooms
- Isometric 3D preview updates in real-time
- Warnings for missing critical systems (cockpit, engine, reactor)

**Ship Designs**
- Save/load ship designs
- Name and categorize designs
- Share design codes (import/export)
- Blueprint library for proven designs

---

### 2. Planetary Development

Planets are long-term investments that provide resources, manufacturing, and population.

#### Planet Types

| Type | Habitability | Resources | Notes |
|------|--------------|-----------|-------|
| **Barren** | 0% | Metals, Rare Earth | Mining only |
| **Rocky** | 10% | Metals, Crystals | Limited colonies |
| **Ice** | 20% | Water, Gases | Subsurface habitats |
| **Desert** | 40% | Metals, Energy (solar) | Domed cities |
| **Ocean** | 50% | Food, Water, Organics | Floating platforms |
| **Terran** | 100% | Balanced, Food | Ideal colonies |
| **Lava** | 5% | Rare Metals, Energy (geothermal) | Extreme hazard |
| **Gas Giant** | 0% | Fuel, Exotic Gases | Orbital stations only |

#### Colony Progression

**Phase 1: Outpost**
- Requires: Colony Module ship component
- Population: 0-1,000
- Buildings: Landing Pad, Basic Hab, Extractor
- Focus: Single resource extraction

**Phase 2: Settlement**
- Population: 1,000-10,000
- Unlocks: Factory, Greenhouse, Power Plant, Barracks
- Focus: Basic production chains

**Phase 3: Colony**
- Population: 10,000-100,000
- Unlocks: Shipyard, Research Lab, Trade Hub, Defense Battery
- Focus: Self-sufficiency, ship production

**Phase 4: City**
- Population: 100,000-1,000,000
- Unlocks: Megastructures, Orbital Ring, Sector Capital designation
- Focus: Specialization, sector management

**Phase 5: Metropolis**
- Population: 1,000,000+
- Unlocks: Wonders, Galactic Trade Center, Fleet Command
- Focus: Empire-wide bonuses

#### Buildings

**Extraction**
| Building | Input | Output | Notes |
|----------|-------|--------|-------|
| Metal Extractor | Power | Metals | Basic resource |
| Crystal Mine | Power | Crystals | Electronics component |
| Gas Harvester | Power | Gases | Fuel, chemicals |
| Rare Earth Drill | Power, Metals | Rare Earth | Advanced components |

**Production**
| Building | Input | Output | Notes |
|----------|-------|--------|-------|
| Factory | Metals, Power | Manufactured Goods | General production |
| Electronics Plant | Crystals, Metals | Electronics | Ship components |
| Fuel Refinery | Gases, Power | Fuel | Ship fuel |
| Component Forge | Rare Earth, Electronics | Ship Components | Advanced manufacturing |
| Shipyard | Components, Metals | Ships | Requires Colony phase |

**Population**
| Building | Effect | Notes |
|----------|--------|-------|
| Habitat Module | +1,000 pop capacity | Basic housing |
| Residential Block | +5,000 pop capacity | Settlement+ |
| Arcology | +50,000 pop capacity | City+ |
| Greenhouse | Food production | Required for growth |
| Medical Center | +10% growth rate | Health |
| Entertainment Hub | +Happiness | Prevents unrest |

**Infrastructure**
| Building | Effect | Notes |
|----------|--------|-------|
| Power Plant | +Power for buildings | Required |
| Solar Array | +Power (desert bonus) | Clean energy |
| Geothermal Tap | +Power (lava bonus) | Hazard world |
| Trade Hub | Enables resource trading | Economy |
| Spaceport | +Landing capacity, trade | Ship traffic |

**Defense**
| Building | Effect | Notes |
|----------|--------|-------|
| Militia Barracks | Basic ground defense | Population defense |
| Defense Battery | Anti-ship weapons | Orbital defense |
| Shield Generator | Planetary shield | Bombardment protection |
| Fortress | Strong ground defense | Military world |

#### Population Management
- Population grows based on: Habitability, Food, Happiness, Housing
- Population works buildings (each building needs workers)
- Unemployment causes unrest
- Specialization: Assign population to focus areas (mining, research, military)

---

### 3. Exploration & Progression

The unlock structure that paces the game from single ship to galactic empire.

#### Starting Conditions
- **Location**: Sol system (or procedurally generated starter)
- **Assets**: 1 Scout-class ship (pre-built), 1,000 credits, basic components
- **Known Space**: Home planet and immediate vicinity
- **Objectives**: Tutorial missions introducing core mechanics

#### Progression Milestones

**Tier 1: Lone Pilot** (0-2 hours)
- Learn flight controls, docking, basic trading
- First mining operation
- First combat encounter (pirates)
- Unlock: Ship Builder access, basic room types

**Tier 2: Independent Operator** (2-5 hours)
- Build custom ship design
- Explore full home system
- Discover jump point (inactive)
- Establish first outpost
- Unlock: More room types, crew hiring

**Tier 3: System Presence** (5-10 hours)
- Research Jump Drive technology
- First inter-system jump
- Encounter other factions
- Colony reaches Settlement phase
- Unlock: Advanced systems, frigate-class hulls

**Tier 4: Multi-System Operator** (10-20 hours)
- Control 3+ systems
- Build first Shipyard (planetary)
- Construct fleet (5+ ships)
- First major faction interaction (diplomacy or war)
- Unlock: Capital ship rooms, fleet commands

**Tier 5: Regional Power** (20-40 hours)
- Control 10+ systems
- Colony reaches City phase
- Research capital ship technology
- First fleet battle
- Unlock: Carrier/Cruiser hulls, megastructures

**Tier 6: Galactic Empire** (40+ hours)
- Control 25+ systems
- Metropolis-level colony
- Dreadnought construction
- Endgame crises / objectives
- Unlock: Dreadnought hulls, wonders

#### Exploration Mechanics

**System Contents**
Each solar system contains:
- 1 Star (type affects planets, hazards)
- 3-12 Planets (procedurally generated)
- Asteroid belts (mining locations)
- Stations (trade, services, faction presence)
- Jump points (connections to other systems)
- Anomalies (special encounters, discoveries)

**Fog of War**
- Unexplored areas are hidden
- Scanner range reveals nearby objects
- Sensor Array rooms reveal more detail
- Star maps can be purchased or discovered

**Anomalies**
- Derelict ships (salvage components, room blueprints, lore)
- Ancient ruins (research bonuses, artifacts)
- Resource caches (bonus materials)
- Hazards (minefields, radiation zones)
- Story encounters (faction contacts, mysteries)

#### Research System

Research unlocks new:
- Room types
- Systems and equipment
- Hull templates
- Buildings
- Abilities

**Research Resources**
- Research Points (generated by Research Labs, scientists)
- Artifacts (found through exploration)
- Data (recovered from anomalies, faction trade)

**Tech Trees**
- **Propulsion**: Speed, efficiency, jump range, new engine types
- **Weapons**: Damage types, range, special effects, new weapon systems
- **Defense**: Shields, armor, countermeasures, new defensive systems
- **Industry**: Production efficiency, building upgrades, new room types
- **Society**: Population growth, happiness, governance, crew skills

---

### 4. Combat Mechanics

Hybrid system: real-time travel and encounters, tactical pause for combat decisions.

#### Combat Flow

1. **Detection**: Sensor range determines when enemies appear
2. **Engagement**: Choose to engage, flee, or negotiate (if applicable)
3. **Tactical Mode**: Time slows/pauses for commands
4. **Resolution**: Battle plays out with issued orders
5. **Aftermath**: Salvage, repair, retreat

#### Tactical Commands
- **Move**: Set destination, formation
- **Attack**: Target selection, focus fire, target specific rooms
- **Ability**: Activate systems (afterburner, ECM, flares)
- **Stance**: Aggressive / Defensive / Evasive
- **Retreat**: Disengage and flee
- **Board**: Attempt to capture disabled ships

#### Damage System
- Weapons hit shields first, then armor, then hull
- **Room Targeting**: Can target specific enemy rooms (weapons, engines, reactor)
- **System Damage**: Individual systems can be damaged/destroyed
- **Hull Breaches**: Destroyed hull cells vent atmosphere, kill crew
- **Fires**: Spread between rooms, crew must extinguish
- Disabled ships can be salvaged or captured
- Ship destruction creates debris field (minor salvage)

#### Crew in Combat
- Crew operate weapon systems (affects accuracy, fire rate)
- Crew repair damaged systems during battle
- Crew fight fires and seal breaches
- Crew can be injured or killed by room damage
- Crew can be reassigned mid-battle (risk vs reward)

#### Fleet Combat
- Command multiple ships simultaneously
- Formation bonuses (defensive sphere, attack wedge)
- Flag ship provides command bonuses
- Larger battles require more tactical management
- Focus fire commands for coordinated attacks

#### AI Behavior
- Pirates: Aggressive, target weak ships, flee when outmatched
- Factions: Varies by faction personality
- Civilians: Flee immediately
- Defense Fleets: Protect territory, call reinforcements

---

## Resource System

Resources are the foundation of Star Shipper's economy. Players survey planets to discover deposits, harvest them manually or via automated harvesters, and use resources for crafting, trading, shipbuilding, and quests.

Every resource has four quality stats (0-100) that determine its value and effectiveness. Higher stats make resources more valuable for crafting and trading, creating a hunt for "perfect rolls" on rare materials.

### Resource Categories

#### 1. Raw Ores
Solid minerals extracted from rocky planets, moons, and asteroids.

| Resource | Primary Locations | Notes |
|----------|-------------------|-------|
| **Iron** | Rocky planets, asteroids | Common building material |
| **Titanium** | Barren moons, asteroids | Lightweight hull material |
| **Copper** | Rocky planets | Electronics, wiring |
| **Crystite** | Crystal caves, ice planets | Energy conductors |
| **Uranium** | Barren planets, moons | Fuel production, reactors |

#### 2. Gases
Atmospheric and nebula resources, collected from gas giants and space.

| Resource | Primary Locations | Notes |
|----------|-------------------|-------|
| **Hydrogen** | Gas giants, nebulae | Basic fuel component |
| **Helium-3** | Gas giants, moons | Advanced fuel, fusion |
| **Plasma** | Stars (dangerous!), nebulae | High-energy applications |
| **Nitrogen** | Atmospheric planets | Life support, chemicals |
| **Xenon** | Gas giants | Ion thrusters, lighting |

#### 3. Biologicals
Organic materials from life-bearing worlds.

| Resource | Primary Locations | Notes |
|----------|-------------------|-------|
| **Biomass** | Terrestrial planets | Food, organic compounds |
| **Spores** | Fungal worlds, caves | Medicine, bioweapons |
| **Coral** | Ocean planets | Decorative, structural |
| **Amber Sap** | Forest planets | Preservatives, luxury |

#### 4. Energy
Refined or naturally-occurring power sources.

| Resource | Primary Locations | Notes |
|----------|-------------------|-------|
| **Fuel Cells** | Stations (crafted) | Universal harvester fuel |
| **Solar Crystals** | Close to stars | Passive energy generation |
| **Dark Matter** | Anomalies, deep space | Rare, experimental tech |

#### 5. Exotic / Rare
Unusual materials with special properties, often found in dangerous zones.

| Resource | Primary Locations | Notes |
|----------|-------------------|-------|
| **Void Essence** | Black hole proximity | Reality-bending properties |
| **Ancient Alloy** | Ruins, derelicts | Precursor technology |
| **Quantum Dust** | Unstable anomalies | Unpredictable, powerful |
| **Neutronium** | Neutron stars (deadly!) | Impossibly dense |

### Quality Stats

Every resource instance has four stats ranging from 0-100:

| Stat | Description | Affects |
|------|-------------|---------|
| **Purity** | How free of contaminants | Refining yield, crafting efficiency |
| **Stability** | Molecular/atomic integrity | Crafting success rate, storage safety |
| **Potency** | Effectiveness/concentration | Recipe output quality, fuel efficiency |
| **Density** | Mass per unit volume | Cargo weight, structural applications |

#### Stat Generation

When a deposit spawns, each stat is rolled independently:

- **Base Roll**: 1-100 (uniform random)
- **Planet type match**: +10 to +20 bonus
- **Dangerous zone**: +15 to +30 bonus
- **Rare resource**: Stats tend toward extremes (very high or very low)

#### Quality Tiers

Quality tier is determined by the **average** of all four stats:

| Tier | Average Stats | Prefix | Color Code |
|------|---------------|--------|------------|
| 1 | 0-20 | Impure | Gray |
| 2 | 21-40 | Standard | White |
| 3 | 41-60 | Refined | Green |
| 4 | 61-80 | Superior | Blue |
| 5 | 81-100 | Pristine | Purple |

**Examples:**
- "Impure Iron" (Purity: 12, Stability: 18, Potency: 8, Density: 22) → Avg: 15
- "Pristine Titanium" (Purity: 92, Stability: 88, Potency: 85, Density: 91) → Avg: 89

#### Stat Importance by Category

While all resources have all 4 stats, certain stats matter more for specific crafting uses:

| Category | Primary Stats | Secondary Stats |
|----------|---------------|-----------------|
| Ores | Purity, Density | Stability, Potency |
| Gases | Potency, Stability | Purity, Density |
| Biologicals | All equal | — |
| Energy | Potency, Stability | Purity, Density |
| Exotic | All equal (all matter!) | — |

### Surveying System

#### Orbital Scan

**Requirements:** Ship in orbit around planet/moon
**Costs:** 1 Scanner Probe (consumed)

**Reveals:**
- List of resource TYPES present on the body
- Approximate abundance (Scarce / Moderate / Abundant)
- Number of harvestable deposits
- Presence of hazards (general warning)

**Does NOT reveal:**
- Exact resource quantities
- Quality stats
- Specific deposit locations

#### Ground Scanner

**Requirements:** Ship landed on planet OR drone deployed from orbit
**Costs:** 1 Advanced Scanner Probe (consumed)

**Reveals:**
- Exact deposit locations (marked on map)
- Resource type and quantity per deposit
- Stat RANGES per deposit (e.g., "Purity: 70-85")
- Hazard specifics (damage per hour, enemy types)

**Does NOT reveal:**
- Exact stats (revealed only when harvested)

### Harvesting

#### Deposits

Each planet/moon has a fixed number of **Harvesting Slots** (typically 2-6 based on body size):

- Small moon: 2 slots
- Medium planet: 4 slots
- Large planet: 6 slots
- Gas giant: 4 slots (orbital platforms)

Each slot contains one **Deposit** with:
- Resource type
- Quantity (slightly randomized, e.g., 500 units)
- Four quality stats (exact values)

**Respawn:** 24 hours after depletion, a new deposit spawns with:
- Possibly different resource type
- New randomized quantity
- New randomized stats

This makes discovering high-stat deposits extremely valuable!

#### Manual Harvesting (Ship Module)

**Requirements:**
- Ship landed at deposit
- Harvesting Module installed on ship

**Process:**
1. Player lands at deposit
2. Activates harvesting (can go AFK/offline)
3. Resources extracted over time
4. Extraction continues until deposit depleted or player stops

**Speed:** ~50 units/hour (affected by module quality)
**Hazards:** Environmental damage applies to ship hull during harvest

**Pros:** No fuel cost, faster than automated
**Cons:** Ship is occupied, vulnerable to hazards

#### Automated Harvester (Deployable)

**Requirements:**
- Harvester unit (crafted or purchased)
- Fuel Cells for operation

**Process:**
1. Player deploys harvester at deposit (from orbit or landed)
2. Harvester consumes fuel and extracts resources
3. Player returns later to collect
4. Harvester remains until retrieved

**Speed:** ~30 units/hour (slower than manual)
**Fuel Cost:** 1 Fuel Cell per 6 hours of operation
**Capacity:** 200 units (must collect before continuing)
**Max Deployed:** 5 harvesters per player (expandable via skill tree)

**Pros:** Passive income, can deploy multiple across planets
**Cons:** Fuel cost, slower, visible to other players

#### Harvesting Slots & Multiplayer

- Each deposit slot can have ONE harvester OR one player manually harvesting
- Multiple players can harvest DIFFERENT slots on same planet
- Players can see others' deployed harvesters (ownership visible)
- Cannot steal or destroy other players' harvesters
- Cannot harvest from a slot another player is using
- Deposits only visible after player scans (encourages exploration)

### Dangerous Zones

Certain areas have environmental hazards that damage ships/harvesters but offer better resources:

#### Hazard Types

| Hazard | Damage | Found At | Stat Bonus |
|--------|--------|----------|------------|
| Dust Storms | 2 hull/hour | Desert planets | +5 |
| Radiation | 5 hull/hour | Near stars, uranium deposits | +10 |
| Extreme Cold | 3 hull/hour | Ice planets, far orbits | +5 |
| Toxic Atmosphere | 4 hull/hour | Volcanic, gas giants | +10 |
| Gravitational Stress | 6 hull/hour | Near black holes, neutron stars | +20 |

#### Enemy Presence

Some zones have NPC pirates or hostile creatures:

- **Pirate Patrols:** Random attacks during harvesting, can destroy harvesters
- **Hostile Fauna:** Damage over time on biological worlds
- **Automated Defenses:** Ancient ruins have guardian drones

### Resource Spawning Rules

#### Planet Type Affinities

| Planet Type | Common Resources | Rare Resources |
|-------------|------------------|----------------|
| Rocky/Barren | Iron, Copper, Titanium | Uranium, Ancient Alloy |
| Gas Giant | Hydrogen, Helium-3, Xenon | Plasma |
| Ice/Frozen | Nitrogen, Crystite | Helium-3 |
| Volcanic | Iron, Copper | Plasma, Neutronium |
| Terrestrial | Biomass, Iron | Spores, Amber Sap |
| Ocean | Coral, Biomass | Spores |
| Anomaly/Special | Quantum Dust, Void Essence | Dark Matter |

#### Spawn Chances

For each deposit slot when generating:
- 70% - Roll from planet's Common pool
- 20% - Roll from planet's Rare pool
- 8% - Roll from ANY Common pool (random planet type)
- 2% - Roll from ANY Rare pool (includes Exotic)

This means most resources match the planet type, but there's a small chance of finding anything anywhere.

### Economy Integration

#### Base Prices

| Tier | Price Multiplier |
|------|------------------|
| Common resources | 1x |
| Rare resources | 5x |
| Exotic resources | 25x |

#### Quality Multiplier

Price = Base Price × Quality Multiplier

Quality Multiplier = 0.5 + (Average Stats / 100)

Examples:
- Impure (avg 15): 0.65x
- Standard (avg 35): 0.85x
- Refined (avg 50): 1.0x
- Superior (avg 70): 1.2x
- Pristine (avg 90): 1.4x

#### Location-Based Pricing (Future)

- Local Abundance: -30% to -50% price
- Same System: -10% price
- Adjacent Systems: Base price
- Far Systems: +20% to +50% price
- Scarcity: +100% or more

### Resource Items

#### Scanner Probes

| Item | Crafting Cost | Use |
|------|---------------|-----|
| Scanner Probe | 5 Iron, 2 Copper | Orbital scan |
| Advanced Scanner Probe | 3 Titanium, 5 Copper, 1 Crystite | Ground scan |

#### Harvesters

| Item | Crafting Cost | Stats |
|------|---------------|-------|
| Basic Harvester | 20 Iron, 10 Copper | 30 units/hr, 200 capacity |
| Advanced Harvester | 15 Titanium, 10 Copper, 5 Crystite | 50 units/hr, 500 capacity |
| Industrial Harvester | 30 Titanium, 20 Crystite, 5 Uranium | 100 units/hr, 1000 capacity |

#### Fuel

| Item | Crafting Cost | Use |
|------|---------------|-----|
| Fuel Cell | 10 Hydrogen, 2 Copper | Powers harvester for 6 hours |

### Inventory Rules

- Resources with identical stats stack together
- Resources with different stats stored separately
- Weight system limits cargo capacity (uses Density stat)

---

## UI/UX Specifications

### Main Views

**Galaxy Map**
- Stars as nodes, jump connections as lines
- Color coding: owned (green), explored (blue), unknown (gray), hostile (red)
- Click to zoom into system

**System View**
- Orbital paths shown
- Ships visible with trails
- Click planets/stations to interact
- Zoom from system-wide to close orbit

**Ship View (Interior)**
- Top-down view of ship interior
- All rooms and systems visible
- Crew positions shown
- Damage states visible
- Click rooms to interact

**Planet View**
- Colony overview
- Building grid
- Population stats
- Production queues

**Ship Builder**
- Hull painting grid
- Room placement tools
- System installation
- Stats preview (power, crew, capabilities)
- 3D isometric preview
- Save/load designs

### Management Windows
All management interfaces use draggable windows:
- Ship Builder
- Fleet Manager
- Planet Management
- Research Tree
- Trade Interface
- Inventory/Cargo
- Ship Status (detailed)
- Combat Tactical

### HUD Elements
- Resource bar (top center)
- Minimap (corner)
- Selected object info (bottom)
- Alert notifications (top-right)
- Speed controls / pause (bottom-right)
- Active ship status (left side)

---

## Technical Scope Notes

### For Browser Implementation (React/Canvas)

**Phase 1 MVP**
- Single system
- Ship builder with hull + rooms (no individual systems yet)
- 3-4 room types
- Basic mining and trading
- Simple combat (no room targeting)
- No colonies (stations only)

**Phase 2**
- Full room system with interior systems
- All room types
- Crew management
- Colony system (outpost/settlement)
- Room targeting in combat
- Basic research

**Phase 3**
- Jump drive, multiple systems
- Full colony progression
- Fleet management
- Advanced combat (boarding, fires, breaches)
- Faction interactions

**Phase 4**
- Capital ships
- Fighter hangars functional
- Advanced diplomacy
- Endgame content
- Polish and balancing

---

## Open Questions

1. **Saving**: ~~Local storage? Cloud saves? Export/import?~~ ✅ Cloud saves via PostgreSQL
2. **Multiplayer**: ~~Single player only, or future MP consideration?~~ ✅ Real-time multiplayer planned (hybrid: shared hubs, instanced missions)
3. **Procedural vs. Fixed**: Fully procedural galaxy, or handcrafted story systems?
4. **Faction depth**: How complex should AI factions be?
5. **Real-time pacing**: How fast should time pass? Adjustable speed?
6. **Room destruction**: Can rooms be completely destroyed, or just damaged?
7. **Crew permadeath**: Are dead crew gone forever, or can cloning recover them?

---

## System View Design

The System View is the main gameplay screen where players fly their ships through solar systems, visit planets and stations, and interact with other players.

### Core Specifications

- **Perspective**: Top-down 2D (like FTL, Asteroids)
- **Rendering**: SVG elements (sharp, scalable, easy to style)
- **Window Type**: Large draggable window (allows other management windows around it)
- **Camera**: Both follow mode (ship centered) and free camera (pan around), togglable

### Scale & Zoom

- Zoom level allows viewing 2-3 planets/points of interest at a time
- Scroll wheel to zoom in/out
- Minimap in corner showing most (not all) of the system
- Minimap helps navigation to off-screen points of interest

### Movement & Physics

- **Controls**: WASD/Arrow keys (direct control) AND click-to-move (autopilot)
- **Physics**: Floaty/drifty with momentum (space physics feel)
- **Autopilot**: Click on planet/station to auto-fly there, can cancel anytime
- **Stopping**: Can dock at stations/planets OR stop anywhere in open space

### Sol System Contents

Sol is **handcrafted** (not procedural) with:
- Sun (center, glowing effect)
- Mercury, Venus, Earth, Mars (inner planets)
- Asteroid Belt (between Mars and Jupiter)
- Jupiter, Saturn (outer planets — can add more later)
- Luna Station (orbiting Earth, starting location)
- Planets orbit the sun in real-time

### Procedural System Generation

All systems except Sol are procedurally generated using seeded randomness (system ID = seed). Generated data is stored in the database on first visit for persistence.

#### Star Types & Rarity

| Star Type | Rarity | Planet Count | Planet Types | Asteroid Belts | Notes |
|-----------|--------|--------------|--------------|----------------|-------|
| **Red Dwarf** | 50% | 1-3 | Rocky, Ice | 0-1 | Common, cold, small systems |
| **Yellow Star** | 25% | 4-8 | All types | 1-2 | Balanced, habitable zones |
| **Blue Giant** | 10% | 5-10 | Gas giants, Hot rocky | 1-3 | Hot inner zone, many moons |
| **White Dwarf** | 8% | 0-3 | Barren, Ice | 0-1 | Old, sparse, mostly dead |
| **Neutron Star** | 5% | 0-2 | Exotic, Barren | 0-1 | Dangerous, rare resources |
| **Black Hole** | 2% | 0-1 | Exotic | 0-2 (debris disks) | Very dangerous, extreme loot |

#### Space Stations
- 20-30% of systems have a station
- More likely in Yellow/Red star systems (civilized space)
- Less likely near Neutron Stars/Black Holes (frontier)
- Station presence stored in database for persistence

#### Generation Flow
1. First player to visit a system triggers generation
2. Server generates using system ID as seed
3. Generated data stored in database
4. All subsequent visits load from database

### Build Chunks

**Chunk 1: Basic Canvas**
- Large draggable window with SVG viewport
- Camera system (pan, zoom with scroll wheel)
- Starfield background
- Sun at center (glowing effect)

**Chunk 2: Celestial Bodies**
- Planets orbiting the sun (Mercury → Saturn)
- Asteroid belt between Mars and Jupiter
- Luna Station (orbiting Earth)
- Planets slowly orbit in real-time

**Chunk 3: Your Ship**
- Ship appears at Luna Station (starting dock)
- WASD controls with floaty/drift physics
- Ship rotation (point toward movement or mouse)
- Camera follow mode (toggle with a key)

**Chunk 4: Navigation**
- Minimap in corner (shows whole system, your position, major bodies)
- Click on planet/station to set autopilot destination
- Autopilot flies you there (can cancel anytime)
- Arrival/docking when you reach a destination

**Chunk 5: Polish**
- Zoom levels (scroll wheel)
- Free camera mode (middle-click drag or toggle)
- Visual effects (engine glow, trails)
- UI overlay (speed, destination, coordinates)

---

## Summary

Star Shipper is a serious 4X space sandbox with deep FTL-inspired ship construction at its core. Players design ships from hull shape to interior layout to individual systems, then crew those ships and send them to explore, trade, fight, and colonize.

The layered ship building (hull → rooms → systems → crew) provides enormous customization depth while remaining visually clear through the clean vector aesthetic. The windowed management interface allows players to handle complex multi-system empires without losing sight of their ships.

Progression flows naturally from lone pilot with a single scout to galactic emperor commanding fleets of custom-designed warships and managing a network of colonies. The hybrid real-time/tactical combat system creates tense battles where ship design decisions matter.

---

## Implementation status

For the actual current state of the codebase — what's built, what's deployed, what's deferred — see [`HANDOFF.md`](../HANDOFF.md) at the repo root. This document is the design vision; HANDOFF is the implementation truth.
