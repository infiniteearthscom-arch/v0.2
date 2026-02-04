# Star Shipper: Revised Design Document

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

## Resource Economy

### Resources

| Resource | Source | Primary Use |
|----------|--------|-------------|
| Credits | Trade, missions | Universal currency |
| Metals | Asteroids, planets | Construction, ships, hull cells |
| Crystals | Asteroids, planets | Electronics, advanced systems |
| Gases | Gas giants, ice planets | Fuel, chemicals |
| Rare Earth | Specialized extraction | Advanced tech, rare systems |
| Fuel | Refined from gases | Ship operation |
| Food | Terran/Ocean planets | Population |
| Electronics | Manufactured | Systems, buildings |
| Components | Manufactured | Ships, advanced buildings |

### Production Chains

```
Gases → Fuel Refinery → Fuel

Metals + Crystals → Electronics Plant → Electronics

Rare Earth + Electronics → Component Forge → Ship Components

Ship Components + Metals → Shipyard → Ships/Rooms/Systems
```

### Trade
- Stations buy/sell at varying prices
- Supply and demand affects prices
- Trade routes can be automated (mid-game)
- Faction relationships affect trade access

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

1. **Saving**: Local storage? Cloud saves? Export/import?
2. **Multiplayer**: Single player only, or future MP consideration?
3. **Procedural vs. Fixed**: Fully procedural galaxy, or handcrafted story systems?
4. **Faction depth**: How complex should AI factions be?
5. **Real-time pacing**: How fast should time pass? Adjustable speed?
6. **Room destruction**: Can rooms be completely destroyed, or just damaged?
7. **Crew permadeath**: Are dead crew gone forever, or can cloning recover them?

---

## Summary

Star Shipper is a serious 4X space sandbox with deep FTL-inspired ship construction at its core. Players design ships from hull shape to interior layout to individual systems, then crew those ships and send them to explore, trade, fight, and colonize.

The layered ship building (hull → rooms → systems → crew) provides enormous customization depth while remaining visually clear through the clean vector aesthetic. The windowed management interface allows players to handle complex multi-system empires without losing sight of their ships.

Progression flows naturally from lone pilot with a single scout to galactic emperor commanding fleets of custom-designed warships and managing a network of colonies. The hybrid real-time/tactical combat system creates tense battles where ship design decisions matter.
