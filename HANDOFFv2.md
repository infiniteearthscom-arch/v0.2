# STAR SHIPPER — Project Handoff Document
## Last updated: 2026-03-05 (Session 11)

---

## EXECUTIVE SUMMARY

Star Shipper is a browser-based 4X space game built with React+Vite (client) and Node+Express+PostgreSQL 18 (server). The player mines resources on planets, crafts modules, fits them to ships, builds a fleet, trades with vendors, fights pirates, and explores a procedurally generated galaxy of 200 star systems connected by jump gates and warp points.

**Current state:** The full core gameplay loop is functional — mine → craft → fit → fly → trade → fight → explore. The game is **deployed and live** on DigitalOcean App Platform with auto-deploy from GitHub. The player starts in Sol, can travel to any of 200 procedurally generated systems via an interstellar flight view or galaxy map, dock at planets/stations, scan for resources weighted by star type, and engage Void Reaver pirates with scaling danger levels.

**Live URL:** `https://star-shipper-fjrrq.ondigitalocean.app`

---

## ⚠️ CRITICAL: LOCAL vs PRODUCTION

The game now runs in two environments. Understanding this is essential before making any changes.

### Local Development
- Client: `http://localhost:5173` (Vite dev server)
- Server: `http://localhost:3001` (Express)
- Database: Local PostgreSQL 18 instance
- `api.js` uses `import.meta.env.VITE_API_URL || 'http://localhost:3001'` — falls back to localhost when no env var is set

### Production (DigitalOcean App Platform)
- **Live URL:** `https://star-shipper-fjrrq.ondigitalocean.app`
- **GitHub repo:** `infiniteearthscom-arch/v0.2` (branch: `main`)
- **Auto-deploy:** Every push to `main` triggers a rebuild and deploy (~3-5 minutes)
- All components share one domain — routing rules separate them:
  - `/api` → Web Service (Node server)
  - `/` → Static Site (React client)
- Database: DigitalOcean Dev Database (PostgreSQL 18, 512MB RAM, 1GB disk, free tier)
- Database is only accessible from within the app (NOT from local machine)

### Environment Variables (Production)

**Server component (`v0-2-star-shipper-server`):**
| Variable | Value | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | `${db.DATABASE_URL}` (auto-linked) | PostgreSQL connection string |
| `NODE_ENV` | `production` | Enables SSL for DB, disables query logging |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` | Accepts self-signed certs (dev DB workaround) |
| `CLIENT_URL` | `https://star-shipper-fjrrq.ondigitalocean.app` | CORS origin |
| `JWT_SECRET` | (set, hidden) | Signs auth tokens |

**Static site component (`v0-2-star-shipper`):**
| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_API_URL` | `https://star-shipper-fjrrq.ondigitalocean.app` | API base URL baked into build |

### CRITICAL: Vite Env Vars Are Baked at Build Time
`VITE_API_URL` is embedded into the JS bundle during `npm run build`. If you change it in DigitalOcean, you MUST trigger a rebuild (push a commit or Force Rebuild). Simply redeploying won't update the client.

### How to Deploy Changes
```bash
# Make changes locally, test locally
git add -A
git commit -m "Description of changes"
git push origin main
# Auto-deploys in ~3-5 minutes
```

### How to Run New Migrations
New migrations CANNOT be run from your local machine (dev DB blocks external connections). Use the DigitalOcean app console instead:
1. Go to your app → **Console** tab → select **v0-2-star-shipper-server**
2. Type: `npm run db:migrate`

The migrate script (`src/db/migrate.js`) tracks which migrations have already run and skips them.

**Migration constraints for DigitalOcean Dev Database:**
- `CREATE EXTENSION` is NOT allowed — the dev DB doesn't grant these privileges
- Use `gen_random_uuid()` (built into PostgreSQL 18) instead of `uuid_generate_v4()` (requires uuid-ossp extension)
- Do NOT include `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` or `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` in migration files

### Cost
| Component | Plan | Monthly Cost |
|-----------|------|-------------|
| API Server (Web Service) | 1 GB RAM, 1 Shared vCPU | $12 |
| Static Site | Starter | $0 |
| Dev Database | PostgreSQL 18, 512MB | $7 |
| **Total** | | **~$19/month** |

---

## PROCESSES & METHODS THAT WORK WELL

### 1. File Delivery Convention
All files are delivered to `/mnt/user-data/outputs/` mirroring the project structure. The user manually copies them into their local project. Every delivery MUST include the exact destination path:

```
GalaxyFlightView.jsx → client/src/components/galaxy/GalaxyFlightView.jsx (replace)
016_procedural_systems.sql → star-shipper-server/migrations/016_procedural_systems.sql (new)
```

**Always state whether the file is new or a replacement. Always state the full destination path. The user should never have to ask "where does this go?"**

After copying files, the user commits and pushes via GitHub Desktop to deploy.

### 2. Database Migrations
Migrations live in `star-shipper-server/migrations/` numbered sequentially (`001_initial_schema.sql` through `016_procedural_systems.sql`). Each migration is idempotent-ish — uses `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.

**Locally:** The user runs them against their local PostgreSQL instance.
**Production:** Run via DigitalOcean Console → `npm run db:migrate`. The migrate script tracks completed migrations and skips them.

**When creating migrations:**
- Always check existing schema first by reading the most recent migration files
- Do NOT use `CREATE EXTENSION` — DigitalOcean dev DB doesn't allow it
- Use `gen_random_uuid()` instead of `uuid_generate_v4()`
- Migration 009 is missing (was never created or was skipped) — the next migration should be 017

### 3. Incremental Edits vs Full Rewrites
- **For files < 200 lines:** Often faster to rewrite entirely via `create_file`
- **For large files (SystemView.jsx = 2400+ lines):** Use `str_replace` for surgical edits. Read the relevant sections first with `view` to understand context.
- **For new features:** Build in the working directory, test mentally, then deliver. Don't create temp test files — deliver production-ready code.

### 4. When Only One Thing Should Change, Only Change That One Thing
This was a hard lesson in Session 10. When the user says "make the window 50% smaller" and explicitly states "keep everything else the same" — change ONLY the two dimension values. Do not touch viewBox calculations, zoom ranges, star sizes, or anything else. If you're unsure whether a change has cascading effects, ask first. Do NOT create multiple iterations guessing wrong.

### 5. Coordinate System (CRITICAL — caused multiple bug cycles)
The system view uses a specific coordinate convention that was debugged extensively:

- **Ship rotation:** Standard math angle in degrees. `0 = right`, `-90 = up`, `90 = down`, `180 = left`
- **Thrust angle:** `thrustAngle = shipRotationRef.current * (PI / 180)` — NO offset
- **Autopilot target angle:** `targetAngle = atan2(dy, dx) * (180 / PI)` — NO offset
- **SVG ship icon rotation:** `rotate(shipRotationRef.current + 90)` — the +90 converts from math angle to SVG rotation because the ship icon image points UP
- **Formation offsets:** Ship-local coordinates where `x = lateral (+ right of heading)`, `y = longitudinal (+ behind heading)`. Converted to world coords via heading vector decomposition.

**If you need to change flight physics, be extremely careful with angle conventions. The system was broken multiple times by adding/removing 90° offsets.**

### 6. Time Synchronization (Another bug source)
Physics and rendering MUST use the same time source:
- Physics loop writes `gameTimeRef.current = frameNum / 60`
- Rendering reads `const time = gameTimeRef.current`
- Previously used separate `frameCount` state which caused planet position desync between physics and visuals

### 7. State Architecture
- **Zustand store (`gameStore.js`)** — global state: windows, ships, resources, credits, autopilot target, ship position, view mode, galaxy position, discovered systems, arrival type
- **Refs in SystemView/GalaxyFlightView** — real-time physics state (position, velocity, rotation, trails). These update every frame and bypass React re-rendering for performance.
- **Component-local state** — UI-only state like rename inputs, loading spinners, hover/selected states

### 8. The User's Working Style
- Gives broad feature requests, expects implementation with reasonable defaults
- Prefers to see things working quickly, then iterate on feedback
- Gives specific feedback and expects it followed precisely — if they say "only change X", only change X
- When they say "fix X, Y, and Z" — fix ALL of them in one delivery, don't do one at a time
- Values documentation and handoff quality for future sessions
- Gets frustrated by unnecessary iterations — ask clarifying questions upfront rather than guessing wrong multiple times
- Will tell you when things are working well — take note of those parameters and don't change them
- Not deeply experienced with git/devops — provide exact commands and step-by-step instructions for anything involving terminal, git, or DigitalOcean configuration
- Uses **GitHub Desktop** for commits and pushes (not command line git)
- Uses **Windows** — provide PowerShell/CMD commands, not bash

### 9. Ship Field Name Convention (Bug Source)
The API returns ship objects with `hull_type_id` (from the `ships` table). SystemView uses `ship.hull_type_id`. This was a source of a major bug in GalaxyFlightView where `ship.hull_id` was used instead, causing all ships to be invisible. **Always check SystemView's working pattern before writing ship-related code in other components.**

---

## ARCHITECTURE

### Tech Stack
- **Client:** React 18 + Vite 4, Zustand (state with immer + persist middleware), Tailwind CSS, no router
- **Server:** Node.js 22 + Express, PostgreSQL 18, JWT auth (jsonwebtoken + bcrypt)
- **No ORM** — raw SQL queries with `pg` client
- **No TypeScript** — plain JavaScript throughout
- **Deployment:** DigitalOcean App Platform, auto-deploy from GitHub

### Local Paths (user's machine)
- Repo root: `C:\Dropbox\Star-shipper\v0.2\`
- Server: `C:\Dropbox\Star-shipper\v0.2\star-shipper-server\`
- Client: `C:\Dropbox\Star-shipper\v0.2\star-shipper\`
- Client runs on `localhost:5173`, server on `localhost:3001`

### GitHub Repository
- **Repo:** `infiniteearthscom-arch/v0.2`
- **Branch:** `main`
- **Structure:** Monorepo with `/star-shipper` (client) and `/star-shipper-server` (server) at root
- `.gitignore` at repo root covers `node_modules/`, `.env`, `.DS_Store`, `dist/`

### Project Structure
```
star-shipper/                    # Vite React client
  src/
    App.jsx                      # Main app — auth gate, view mode switching, toolbar
    stores/
      gameStore.js               # Zustand store — all shared state + actions
      authStore.js               # Auth state (login, session, user data)
    components/
      galaxy/
        GalaxyFlightView.jsx     # Interstellar flight — WASD between systems, autopilot (~720 lines)
      system/
        SystemView.jsx           # THE BIG FILE (~2400 lines) — SVG solar system, flight, combat, pirates
        PlanetInteractionWindow.jsx  # Planet/station — scan, harvest, vendor tabs (~1600 lines)
      ship/
        ShipBuilderWindow.jsx    # Ship fitting — canvas hull renderer, slot management (~800 lines)
        FleetWindow.jsx          # Fleet management — ship list, rename, active ship (~230 lines)
      ui/
        DraggableWindow.jsx      # Reusable window frame (drag, resize, minimize) (~215 lines)
        GalaxyMapWindow.jsx      # Galaxy overview — click systems, set autopilot (~500 lines)
        InventoryWindow.jsx      # Cargo with module quality display (~730 lines)
        CraftingWindow.jsx       # Crafting with drag-drop ingredients (~660 lines)
        NavigationWindow.jsx     # In-system map — body list, warp/gate icons (~430 lines)
        ResourceBar.jsx          # HUD — credits + active ship name (~40 lines)
        Toolbar.jsx              # Menu buttons (toggle windows) (~80 lines)
    utils/
      api.js                     # All API calls (~290 lines) — uses VITE_API_URL env var
      shipRenderer.js            # Procedural ship art — detail + icon modes (~320 lines)
      galaxyGenerator.js         # Deterministic 200-system galaxy generation (~475 lines)

star-shipper-server/             # Express API server
  package.json                   # "type": "module", start script: "node src/index.js"
  migrations/                    # SQL migrations 001-016 (009 missing)
  src/
    index.js                     # Server setup, CORS, routes, Socket.IO
    db/
      index.js                   # PostgreSQL pool — supports DATABASE_URL with SSL
      migrate.js                 # Migration runner (npm run db:migrate)
    auth/
      index.js                   # JWT token generation, auth middleware
    game/
      deposits.js                # Resource deposit generation with star-type multipliers (~470 lines)
    api/
      auth.js                    # Login, register, OAuth endpoints
      resources.js               # Scanning, harvesting, crafting, cargo, ensure-body (~1750 lines)
      ships.js                   # Ship CRUD, design management (~350 lines)
      fitting.js                 # Fitting, hull/module purchasing, credits, selling (~730 lines)
      harvesters.js              # Automated harvester deployment and management (~700 lines)
```

### Database Schema (key tables)
```
users                 — id, username, password_hash, credits (default 1000), active_ship_id
resources             — user resource balances (iron, silicon, carbon, etc.)
cargo_items           — inventory items with volume, type, quality metrics
ships                 — built ships with hull_type_id, name, fitted_modules (JSONB)
hull_types            — 6 hull types (fighter→capital) with slots, stats, price
module_recipes        — crafting recipes for 12 module types
ship_designs          — LEGACY table (old cell-painting system, kept for FK compatibility)
deposits              — planet resource deposits (scanned/unscanned, quantity, quality)
harvest_sessions      — active mining sessions
harvesters            — deployed automated harvesters with fuel/hopper state
player_presence       — multiplayer presence tracking
star_systems          — procedural system DB registration (procedural_id, star_type)
celestial_bodies      — procedural body DB registration (for scan/mine on procedural planets)
```

### Migrations (001-016)
```
001_initial_schema.sql    — Users, auth tables (NO extensions — removed for DO compatibility)
002_add_oauth.sql         — OAuth additions
003_resource_system.sql   — Resources, deposits, surveys, harvesters
004_scanner_probes.sql    — Scanner probe inventory
005_seed_sol_system.sql   — Sol system bodies + resource seeding
006_harvest_status.sql    — Harvest session tracking
007_cargo_slots.sql       — Cargo slot system
008_unified_cargo_items.sql — Unified cargo items with volume
(009 — missing, was never created)
010_cargo_volume.sql      — Volume-based cargo
011_harvester_system.sql  — Automated harvester tables
012_hull_modules.sql      — Hull types, module slots, ships table redesign
013_module_recipes.sql    — Crafting recipes for modules
014_active_ship.sql       — Active ship tracking on users table
015_fleet_cargo.sql       — Fleet-wide cargo capacity system
016_procedural_systems.sql — procedural_id on star_systems, star_type on celestial_bodies
```

### Key Server Configuration Files

**`src/db/index.js`** — Database connection:
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```
The `ssl` line uses `DATABASE_URL` presence (not `NODE_ENV`) to decide SSL. This was changed because `NODE_ENV` wasn't reliably set during early startup in DigitalOcean.

**`src/index.js`** — CORS configuration:
```javascript
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
```

**`api.js` (client)** — API URL:
```javascript
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

---

## CURRENT FEATURE STATE

### ✅ Working Systems
| System | Status | Notes |
|--------|--------|-------|
| Auth (register/login/JWT) | ✅ | JWT tokens, bcrypt passwords — working in production |
| Resource scanning (orbital + ground) | ✅ | Reveals deposits on planets |
| Manual harvesting | ✅ | Click-to-mine with cargo limits |
| Automated harvesters | ✅ | Deploy with fuel, auto-collect |
| Crafting (resources → items/modules) | ✅ | Drag-drop ingredients, quality inheritance |
| Ship fitting (hull + module slots) | ✅ | Canvas-rendered hulls, drag modules from cargo |
| Fleet management | ✅ | Up to 3 ships, rename, set active |
| Station vendor | ✅ | Buy hulls, modules, supplies with credits |
| Resource/item selling | ✅ | Sell resources back at vendors for credits |
| Credits economy | ✅ | Deducted on purchase, shown in HUD |
| Module quality system | ✅ | Affects ship stats, visible in tooltips |
| System view flight | ✅ | WASD/arrow controls, autopilot to planets |
| Fleet rendering (system view) | ✅ | Flying-V formation, ship icons, per-hull engine colors |
| Fleet rendering (galaxy flight) | ✅ | Same formation, scaled with uiScale * 1.2 |
| Contrails | ✅ | Engine-colored, fading, per-ship trails |
| Window management | ✅ | Draggable, resizable, minimize, z-order, toggle |
| Planet interaction | ✅ | Tabs: scan, harvest, vendor (stations) |
| Fleet-wide cargo | ✅ | Total cargo capacity = sum of all ships |
| Combat (basic) | ✅ | Projectile-based, player fires with Space, pirates fire back |
| Pirate AI | ✅ | Void Reavers — aggro/chase/orbit/de-aggro, 3 hull types |
| Galaxy generation | ✅ | 200 systems, 4 factions, 7 star types, jump gates, warp points |
| Interstellar flight | ✅ | WASD between systems, autopilot, dock to enter systems |
| Galaxy map | ✅ | Strategic overview, click to set autopilot, route planning |
| Warp points | ✅ | Universal system exit (every system has one, purple vortex) |
| Jump gates | ✅ | Fast-travel between connected systems (~60% have gates) |
| Resource variation by star type | ✅ | Neutron=exotic, blue giant=energy, red dwarf=biological |
| Procedural system registration | ✅ | Planets register in DB on first dock for scanning/mining |
| Arrival type system | ✅ | Spawn at warp point or jump gate based on how you traveled |
| **Production deployment** | ✅ | **Live on DigitalOcean with auto-deploy from GitHub** |

### ❌ Not Yet Implemented
| System | Priority | Notes |
|--------|----------|-------|
| Google OAuth (production) | Medium | Works locally but needs callback URL updated for DO domain |
| Research/tech tree | Medium | Toolbar button exists, opens nothing |
| NPC factions & reputation | Medium | Factions defined in galaxy generator but no gameplay effect |
| Per-system station content | Medium | All stations generate same vendor inventory |
| Per-system pricing | Medium | All vendors use same prices |
| Module repair/upgrade | Low | Modules are fit/unfit only |
| Sound effects | Low | Silent game currently |
| Tutorial/onboarding | Low | New player guidance needed |
| Mobile touch controls | Low | Keyboard-only for flight |
| Jump drive fuel | Low | Travel is free currently |
| Custom domain | Low | Currently using `.ondigitalocean.app` URL |
| Proper SSL cert handling | Low | Using `NODE_TLS_REJECT_UNAUTHORIZED=0` workaround |

---

## THE FOUR VIEWS

Star Shipper has four distinct map/navigation modes. Understanding how they relate is critical.

### 1. System View (`SystemView.jsx`, ~2400 lines)
The main in-system gameplay view. Full SVG solar system with:
- Planets orbiting the star with proper orbital mechanics
- Stations orbiting planets
- Ship flight physics (WASD, acceleration, drag, braking, rotation)
- Autopilot system with intercept prediction
- Fleet rendering in V-formation with contrails
- Combat with pirate AI (Void Reavers, scaling with danger level)
- Docking at planets/stations to open interaction windows
- Warp points (purple vortex, every system) and jump gates (green ring, ~60% of systems)
- Docking at warp point or jump gate transitions to galaxy flight
- Uses `ResizeObserver` for viewport sizing (reads actual SVG container dimensions)

### 2. Navigation Window (`NavigationWindow.jsx`)
In-system minimap overlay showing:
- All bodies in current system with orbit rings
- Click-to-autopilot navigation
- Warp point (purple diamond) and jump gate (green diamond) indicators
- Ship position indicator

### 3. Galaxy Flight View (`GalaxyFlightView.jsx`, ~720 lines)
Interstellar flight between star systems. Same WASD controls as SystemView but at galaxy scale:
- Star systems rendered as colored dots with faction halos
- System names always visible
- Jump gate connections as dashed lines
- Click a system to set autopilot
- Autopilot flies to target, auto-enters system on arrival
- Ship fleet visible with formation, scaled proportionally to zoom
- **ViewBox uses `window.innerWidth/Height` — NOT the DraggableWindow container size**
- **Zoom range: 2.0 (max zoom out) to 8.0 (max zoom in), default 2.0**
- **Multiplicative scroll zoom (factor 0.85/1.18), not linear**
- **Window size: ~32.5% × ~35% of screen (min 600×400) — carefully tuned, don't change casually**
- **Ship physics: max speed 20, accel 12, drag 0.985, rotation 90°/s**
- **STAR_SIZES: large values (12-36) because uiScale = 1/zoom ≈ 0.5 at default zoom**
- **Labels: 14px × uiScale, always visible, monospace font**

### 4. Galaxy Map (`GalaxyMapWindow.jsx`, ~500 lines)
Strategic galaxy overview in a large draggable window:
- All 200 systems with star-type coloring and faction halos
- Drag to pan, scroll to zoom (multiplicative)
- Click system → info panel with star type, faction, danger, jump connections, resource profile
- "Fly to" button sets autopilot in galaxy flight mode (map stays open)
- "Jump to" button for gate-connected systems in system mode
- Current system marked with rotating green ring
- Ship position shown as pulsing "YOU" dot in galaxy flight mode
- **Initial zoom: 0.58, zoom range: 0.01 to 2.0**
- **Window size: 65% × 70% of screen (min 1200×800)**
- **Auto-opens when entering galaxy flight mode**
- **STAR_SIZES: small values (4-9) because uiScale = 1/zoom ≈ 1.7 at default zoom**
- **Labels: 9px × uiScale, shown when zoom > 0.12 or system is current/selected/target**
- **Background: #030308 with 400 seeded background stars (seed 777)**
- Info panel (right sidebar) with system details, resource profile, and legend

### CRITICAL: Why Galaxy Map and Flight View Have Different Constants
Both views aim to look visually similar on screen, but they operate at very different zoom levels:
- Galaxy map default zoom: 0.58 → `uiScale = 1/0.58 ≈ 1.72` → small base sizes get multiplied up
- Flight view default zoom: 2.0 → `uiScale = 1/2.0 = 0.5` → large base sizes get multiplied down

If you change one view's zoom range or star sizes, the other will look wrong by comparison. They were calibrated together as a pair.

### View Mode Transitions
```
System View → dock at warp_point → enterGalaxyFlight(sysX, sysY) → Galaxy Flight View (arrivalType: 'warp')
System View → dock at jump_gate → enterGalaxyFlight(sysX, sysY) → Galaxy Flight View (arrivalType detected)
Galaxy Flight → autopilot arrival → enterSystem(id, getArrivalType(id)) → System View
Galaxy Flight → click system in range → enterSystem(id, getArrivalType(id)) → System View
Galaxy Map → "Fly to" button → sets galaxyAutopilotTarget (stays in current mode)
Galaxy Map → "Jump to" button → setPendingJump (autopilots to gate, then jumps)
```

Both SystemView and GalaxyFlightView share `windowId="systemView"` so they use the same DraggableWindow slot, preventing flicker during transitions.

The store tracks `viewMode: 'system' | 'galaxy'` and `arrivalType: 'warp' | 'jump_gate'`:
- `enterGalaxyFlight(x, y)` — sets galaxy mode, positions ship, auto-opens galaxy map
- `enterSystem(id, arrivalType)` — sets system mode, records arrival type
- SystemView reads `arrivalType` to decide spawn position (warp point body vs jump gate body, with fallback chain)

### Arrival Type Detection
GalaxyFlightView has `getArrivalType(targetSystemId)` which checks if both the origin system and target system have jump gates connected to each other. If yes → `'jump_gate'`, otherwise → `'warp'`. This is called at all three entry points: autopilot arrival, Enter key dock, and dock button click.

---

## GALAXY GENERATION

### Galaxy Generator (`galaxyGenerator.js`)
Deterministic seed-based generation (seed 12345, 200 systems). Same seed always produces the same galaxy.

**Factions (4):**
| Faction | Color | Traits |
|---------|-------|--------|
| Terran Accord | #4488ff | Military, core systems, more weapon/hull vendors |
| Free Merchants Guild | #ffaa22 | Trade-focused, operates jump gate network, better prices |
| Astral Collective | #aa44ff | Research-focused, outer systems |
| Void Reavers | #ff4444 | Pirates, hostile, high danger, no friendly stations |

**Star Types (7):**
| Type | Color | Resource Bias | Size (map/flight) |
|------|-------|---------------|-------------------|
| Red Dwarf | #ff6644 | Biological 1.5×, ore 1.2× | 4 / 16 |
| Yellow Star | #ffdd44 | Balanced (Sol-type) | 6 / 24 |
| Orange Star | #ffaa33 | Slightly warm | 5 / 20 |
| Blue Giant | #4499ff | Energy 1.8×, gas 1.5× | 9 / 36 |
| White Dwarf | #eeeeff | Compact, moderate | 4 / 16 |
| Neutron Star | #88ccff | Energy 2.0×, exotic 2.0× | 3 / 12 |
| Black Hole | #8844aa | Exotic 3.0×, almost nothing else | 7 / 28 |

**System Features:**
- Every system has a warp point (universal exit, purple vortex)
- ~60% of systems have jump gates connecting to 1-3 other systems
- Danger level 0-5 (scales pirate count and hull types)
- Each system gets a procedural seed for generating internal content (planets, stations)
- `generateSystemContent(systemData)` creates planets, stations, jump gates, warp points

**Resource Multipliers (`deposits.js`):**
The `STAR_RESOURCE_MULTIPLIERS` table in `server/game/deposits.js` scales resource spawn weights by category based on star type.

### Procedural Body Registration
When the player docks at a planet in a non-Sol system for the first time, the client calls `POST /api/resources/ensure-body` which:
1. Creates a `star_systems` row (if not exists) with `procedural_id`
2. Creates a `celestial_bodies` row with `star_type` for resource weighting
3. Returns a `body_db_id` UUID used for all subsequent scan/mine API calls

---

## COMBAT SYSTEM

### Overview
Basic projectile combat with Void Reaver pirates. Implemented entirely client-side in SystemView.

### Player Combat
- **Fire:** Spacebar (when not docked)
- **Projectile:** Fires from ship nose in heading direction
- **Damage:** Based on active ship's fitted weapon modules
- **Health:** Hull (no regen) + Shield (regens after not taking damage)
- **Death:** Hull reaches 0 → resets position (no permadeath yet)

### Pirate AI
Three hull types with escalating stats:
| Hull | Speed | Damage | HP | Fire Rate |
|------|-------|--------|----|-----------|
| Interceptor | Fast | Low | Low | Fast |
| Marauder | Medium | Medium | Medium | Medium |
| Destroyer | Slow | High | High | Slow |

AI behavior states: Patrol → Aggro (350px) → Chase → Orbit (100px, fires weapons) → Deaggro (600px)

### Pirate Spawning
- **Sol:** Hardcoded spawn zones (Belt Raiders, Outer Patrol, Jupiter Ambush, Saturn Corsairs)
- **Procedural systems:** `generatePiratesForSystem(seed, dangerLevel, bodies)` scales count by danger level (0 = none, 5 = many)
- Hull type selection scales with danger: low danger = interceptors only, high danger = destroyers

### Pirate Rendering
Pirates use `PIRATE_HULLS` from `shipRenderer.js` — distinct shapes from player hulls, rendered with the same icon/detail system.

---

## KEY TECHNICAL DETAILS

### SystemView.jsx — The Big File (~2400 lines)
This is the most complex component. It contains:
- Solar system data (Sol — star, 8 planets, asteroid belt, 2 stations)
- Procedural system content generation from galaxy data
- Planet/Star/Station/WarpPoint/JumpGate SVG components with orbital animation
- Ship flight physics (acceleration, drag, braking, rotation)
- Autopilot system (intercept prediction, approach speed control, docking)
- Fleet rendering (pre-rendered ship icons in V-formation)
- Contrail system (position history per ship, fading segments)
- Combat system (projectiles, player weapons, pirate AI, damage, hull/shield)
- Camera controls (follow mode, free pan, zoom)
- Keyboard input handling (WASD, arrows, Space to fire, Enter to dock)
- HUD overlays (speed, autopilot status, fleet count, hull/shield bars)
- Warp point and jump gate docking → galaxy flight transitions

**The game loop runs in a `useEffect([], [])` closure.** It reads mutable refs for all state. React re-renders are triggered by `setFrameCount(f => f + 1)` every frame.

### GalaxyFlightView.jsx — Interstellar Flight (~720 lines)
Similar architecture to SystemView but for galaxy-scale flight:
- Uses `window.innerWidth/Height` for viewBox (NOT the window container size — this is intentional so content doesn't change when window is resized)
- Fixed star sizes independent of container: `STAR_SIZES` scaled by `uiScale = 1/zoom`
- Ship icons scaled by `uiScale * 1.2` for visibility
- Same `requestAnimationFrame` game loop pattern as SystemView
- Multiplicative zoom (scroll wheel factor 0.85/1.18), not linear
- Labels always visible (zoom range 2.0-8.0 keeps them readable at all times)
- Background color `#030308`, 400 seeded background stars matching galaxy map

### Ship Renderer (`shipRenderer.js`)
Two render modes from the same hull shape data:
- **`getShipImage(hullId, scale)`** — Full detail for fleet window thumbnails. Multi-pass: base fill, panel lines, edge lighting, stripe, viewport, engine glow.
- **`getShipIcon(hullId)`** — Tiny silhouette for system/galaxy views. Renders at exact pixel `displaySize` (5-14px). Solid fill + nose highlight + engine dots.

Both are cached via `Map` keyed by hull+scale. Hull shapes are defined as 2D grids (0=empty, 1=armor, 2=hull interior).

Player hulls (6): fighter, scout, corvette, hauler, frigate, capital
Pirate hulls (3): pirate_interceptor, pirate_marauder, pirate_destroyer

Also exports: `HULL_SHAPES` (per-hull metadata including engine colors), `FORMATION_OFFSETS`, `MAX_FLEET_SIZE`, `PIRATE_HULLS`, `FACTIONS`

### Galaxy Generator (`galaxyGenerator.js`)
- Seeded RNG class for deterministic generation
- `generateGalaxy(seed, count)` → `{ systems, systemMap, stats }`
- `generateSystemContent(systemData)` → `{ star, bodies[] }` with planets, stations, gates, warp points
- Exported constants: `FACTIONS`, `STAR_DISPLAY`
- Cached: both GalaxyFlightView and GalaxyMapWindow use `getGalaxy()` which generates once

### Autopilot Approach Tuning (System View)
- **Slowdown starts at 200px** from target
- **Minimum approach speed: 20** (prevents crawling)
- **Docking trigger: within 50px at speed < 40**
- **Final snap speed: 150/s** (fast lock-on once in range)
- **Intercept prediction** for moving targets (70% prediction factor)

### Quality System
Module quality comes from crafting ingredient quality metrics (purity, stability, potency, density). Average quality affects module stats:
- `scaled_stat = base_stat * (avg_quality / 50)`
- Q50 = baseline (1.0x), Q100 = 2.0x, Q25 = 0.5x
- Displayed as colored bars (gray < green < blue < purple)

---

## ZUSTAND STORE STATE SHAPE

Key state fields (as of Session 10):
```javascript
{
  // Core gameplay
  ships: [],                          // From API — hull_type_id, name, fitted_modules (JSONB)
  activeShipId: null,                 // UUID of active ship
  resources: { credits, metals, ... },// Synced from server
  fleet: [],                          // Fleet composition
  
  // In-system navigation
  currentSystem: 'sol',               // System ID string
  currentLocation: null,              // Docked body ID
  autopilotTarget: null,              // { id, name, type } for in-system autopilot
  pendingJump: null,                  // { targetSystemId } when jumping via gate
  shipPosition: { x, y },            // Updated by SystemView game loop
  shipSpeed: 0,
  gameTime: 0,                        // Shared time for planet position sync
  
  // Galaxy navigation
  viewMode: 'system',                 // 'system' | 'galaxy'
  arrivalType: 'warp',                // 'warp' | 'jump_gate' — spawn location on system entry
  galaxyShipPosition: { x, y },       // Position in galaxy world coordinates
  galaxyShipSpeed: 0,
  galaxyAutopilotTarget: null,         // { id, name } — target system
  discoveredSystems: ['sol'],          // Array of visited system IDs
  
  // UI
  windows: {                           // Open/closed/position state for all windows:
    shipBuilder, fleet, systemView, planetView, inventory,
    navigation, crafting, research, planetInteraction, galaxyMap
  },
  windowZIndex: {},
  topZIndex: 10,
}
```

**Key actions:**
- `enterGalaxyFlight(x, y)` — transition to galaxy mode, position ship, auto-open galaxy map
- `enterSystem(id, arrivalType)` — transition to system mode, set arrival type
- `fetchShips()` — load ships from API
- `openWindow(id)` / `closeWindow(id)` / `toggleWindow(id)`
- `setAutopilotTarget(target)` / `setGalaxyAutopilotTarget(target)`
- `setPendingJump(systemId)` — triggers autopilot-to-gate-then-jump sequence

**Debug access:** `window.__STORE__` is exposed in gameStore.js:
```javascript
const s = window.__STORE__.getState();
console.log(s.ships.length, s.viewMode, s.currentSystem);
```

---

## DEAD CODE & LEGACY NOTES

### Legacy Files That Can Be Deleted (may still exist in user's project)
- `ShipGrid.jsx` — old cell-painting grid component
- `MyDesignsWindow.jsx` — old designs list window
- `MyShipWindow.jsx` — old ship viewer
- `ShipGraphics.jsx` — old SVG ship components (replaced by `shipRenderer.js`)

### Legacy DB Tables
- `ship_designs` — old cell-painting system, kept for FK compatibility. No longer used by UI.
- Associated API endpoints in `ships.js` (`getDesigns`, `saveDesign`, etc.) still exist server-side but are unused.

### Old Prototypes in Output Directory
These files exist in `/mnt/user-data/outputs/` but are NOT part of the game — they were early prototypes:
- `ShipArtDemo.jsx` — early ship art experimentation
- `ShipBuilderPrototype.jsx` — first ship builder prototype
- `ShipBuilderV2Demo.jsx` — second prototype iteration

---

## COMMON PITFALLS

1. **Angle math in SystemView** — Any change to rotation, thrust, or autopilot angles risks breaking the coordinate system. Always verify: thrust formula, target angle formula, SVG rotation formula, and formation offset transform are all consistent.

2. **useEffect closure staleness** — The game loop captures initial values. Any derived physics constants (from active ship stats) MUST be read from refs, not closure variables.

3. **React state vs refs for real-time data** — Position, velocity, rotation, trails = refs. Window state, UI toggles, docked body = React state. Mixing causes lag (state for physics) or invisible updates (refs for UI).

4. **Migration ordering** — Always check the highest existing migration number (currently 016) before creating new ones. Next migration should be 017. Migration 009 does not exist — it was skipped.

5. **Hull shape data duplication** — `shipRenderer.js` is the single source of truth for hull shapes. FleetWindow and ShipBuilderWindow both import from it. Don't create inline copies.

6. **API error handling** — Server endpoints use `FOR UPDATE` locks on credit transactions. Client-side should always refresh credits/inventory after purchases.

7. **Ship field names** — Ships from the API use `hull_type_id` (NOT `hull_id`). This caused ships to be invisible in GalaxyFlightView for multiple debugging iterations. Always match SystemView's working pattern.

8. **ViewBox and window sizing are decoupled** — GalaxyFlightView uses `window.innerWidth/Height` for its viewBox, independent of DraggableWindow dimensions. This was a deliberate design decision so the view content doesn't change when the window is resized. **Do not change window dimensions, viewBox, star sizes, or zoom ranges independently** — they were all tuned as a set.

9. **Galaxy map vs flight view visual constants** — These views use DIFFERENT star size constants because they operate at different zoom levels. Galaxy map uses small sizes (4-9) at zoom ~0.58; flight view uses large sizes (12-36) at zoom ~2.0. Both are calibrated to look similar on screen.

10. **Zustand persist + new windows** — New windows must be merged with persisted state. Check the `merge` function in store creation.

11. **Body IDs** — Client uses string names ("mars"), DB uses UUIDs. Server has `resolveBodyId()` helper. Procedural systems use `ensureBody()` to create DB rows on first dock.

12. **DraggableWindow prop names** — Uses `initialWidth`/`initialHeight` (NOT `defaultWidth`/`defaultHeight`). Using wrong prop names silently falls back to 400×300.

13. **Changing one thing means changing ONLY one thing** — When the user says "keep everything else the same" they mean it literally. Don't touch viewBox calculations when resizing a window. Don't change star sizes when adjusting zoom range. Ask a clarifying question rather than guessing and creating broken iterations.

14. **DigitalOcean migrations: no CREATE EXTENSION** — Dev databases don't allow creating extensions. Use `gen_random_uuid()` instead of `uuid_generate_v4()`. Never include `CREATE EXTENSION` in migration files.

15. **DigitalOcean routing: path preservation matters** — The server route is `/api` with "Full path preserved" enabled. This means the server receives the full `/api/auth/login` path. If path trimming is on, the server only receives `/auth/login` and routes break.

16. **VITE_API_URL must be baked in** — Changing this env var in DigitalOcean requires a rebuild of the static site. A redeploy alone won't update the client JS bundle. Push a commit or use Force Rebuild.

17. **api.js must use env vars** — The client's `api.js` was originally hardcoded to `localhost:3001`. It now uses `import.meta.env.VITE_API_URL` with localhost fallback. If adding new API URLs anywhere, always use `SERVER_URL` from api.js — never hardcode localhost.

---

## SESSION LOG

| # | Date | Focus | Key Deliverables |
|---|------|-------|------------------|
| 1 | 02-13 | Schema, deposits, scanning | DB init, resource system foundation |
| 2 | 02-14 | Manual harvesting, cargo, nav | Mining mechanics, inventory UI, system map |
| 3 | 02-15 | Crafting, cargo items | Unified crafting, drag-drop, trash |
| 4 | 02-17 | Volume cargo, harvesters | Density system, automated mining |
| 5 | 02-18a | Ship builder redesign | Hull-with-slots, canvas renderer |
| 6 | 02-18b | Ship fitting, vendor | Fitting window, module recipes, station vendor |
| 7 | 02-19a | Active ship, credits, quality | Flight physics scaling, economy, quality display |
| 8 | 02-19b | Fleet rendering, polish | Fleet in system view, coordinate fixes, contrails, toolbar, dead code cleanup, first handoff doc |
| 9 | 02-20/24 | Fleet cargo, trading, combat, galaxy | Fleet-wide cargo (migration 015), sell endpoints, Void Reavers combat with pirate AI, 200-system galaxy generation with factions/jump gates, initial galaxy map |
| 10 | 02-24/27 | Resource variation, 4-view nav, visual tuning | Star-type resource multipliers (migration 016), warp points in every system, GalaxyFlightView with WASD flight, GalaxyMapWindow world-coordinate rewrite, hull_type_id fix for fleet visibility, arrival type system (warp vs jump gate), extensive zoom/size/font calibration between views, interstellar window sizing |
| 11 | 02-27/03-05 | **Deployment to DigitalOcean** | Deployed to DO App Platform (server + static site + dev DB). Fixed: SSL for DB connection, api.js hardcoded localhost→env var, CORS origin, routing rules (`/api` with path preserved), migration compatibility (removed `CREATE EXTENSION`, replaced `uuid_generate_v4` with `gen_random_uuid`), JWT_SECRET env var. All 16 migrations run on production DB. Auth working in production. |

---

## WHAT TO BUILD NEXT (suggested priorities)

### Tier 1 — High Impact
1. **Per-system station content** — Procedural stations with different vendor inventories/prices per system. Currently all stations generate the same content. Would create trade route incentives.
2. **Research/tech tree** — Unlock better modules, hull types, fleet capacity increases. Toolbar button exists but opens nothing. Framework could use the `resources` table for research points.
3. **NPC factions & reputation** — Reputation system affecting prices, access, hostility. Factions are defined in `galaxyGenerator.js` with full metadata but have zero gameplay effect currently.

### Tier 2 — Depth
4. **Per-system pricing** — Different resource values at different stations, based on star type and faction. Creates the classic "buy low, sell high" trading loop.
5. **More enemy types** — Faction-specific enemies beyond Void Reavers (e.g., Astral Collective drones, Terran patrols that attack low-rep players).
6. **Ship cargo capacity enforcement** — Inventory is currently global. Should be bounded by fleet's total cargo stat from fitted cargo modules.
7. **Jump drive fuel consumption** — Warp/gate travel is free. Adding fuel costs would make ship fitting (engine modules) more meaningful.

### Tier 3 — Polish & Infrastructure
8. **Sound effects** — Engine hum, docking, crafting, combat shots/impacts, UI clicks
9. **Visual effects** — Jump/warp animations, weapon impact particles, shield shimmer
10. **Tutorial/onboarding** — New player guidance for the mine→craft→fit→fly loop
11. **Mobile touch controls** — Currently keyboard-only for both flight modes
12. **Google OAuth for production** — Update Google Cloud Console callback URL to the DO domain
13. **Custom domain** — Connect a real domain instead of `.ondigitalocean.app`
14. **Proper SSL handling** — Replace `NODE_TLS_REJECT_UNAUTHORIZED=0` with CA cert when upgrading to managed database
15. **Downsize server costs** — Current server is $12/mo (1GB RAM). Could try $5/mo (512MB) tier.

---

## STARTING A NEW CHAT

**Upload this file (`HANDOFF.md`) plus any source files relevant to the task.**

**Say:** *"Star Shipper project. Read the handoff doc. Continue with [specific task]. Ask me for any files you need."*

**Key source files the next chat will likely need (ask user to upload):**
| Task Area | Files Needed |
|-----------|-------------|
| Any state changes | `gameStore.js` |
| In-system features | `SystemView.jsx`, `gameStore.js` |
| Interstellar features | `GalaxyFlightView.jsx`, `gameStore.js` |
| Galaxy map changes | `GalaxyMapWindow.jsx`, `gameStore.js` |
| Galaxy/system content | `galaxyGenerator.js` |
| Ship rendering | `shipRenderer.js` |
| Resource generation | `deposits.js` (server) |
| New API endpoints | `api.js` (client) + relevant server API file |
| New DB tables | Latest migration files for schema reference |
| Planet interaction | `PlanetInteractionWindow.jsx` |
| Ship fitting/vendor | `ShipBuilderWindow.jsx`, `fitting.js` (server) |
| Deployment/infra changes | `src/db/index.js`, `src/index.js` (server), `vite.config.js` |

**Critical reminders for the next chat:**
- **The game is live** at `https://star-shipper-fjrrq.ondigitalocean.app` — changes push to production on every `git push origin main`
- Ships use `hull_type_id` not `hull_id`
- DraggableWindow uses `initialWidth`/`initialHeight` not `defaultWidth`/`defaultHeight`
- Galaxy flight view uses large STAR_SIZES (12-36), galaxy map uses small ones (4-9) — different zoom ranges make them look the same on screen
- When user says "only change X" — ONLY change X, nothing else
- PostgreSQL 18 — NO `CREATE EXTENSION` in migrations, use `gen_random_uuid()`
- Server source is in `star-shipper-server/src/` (not root)
- New migrations run via DigitalOcean Console: `npm run db:migrate`
- Client `api.js` uses `import.meta.env.VITE_API_URL` — never hardcode localhost
- The user uses **GitHub Desktop** on **Windows** — give exact commands when terminal work is needed
- All files delivered to `/mnt/user-data/outputs/` with explicit destination paths and new/replace labels
- Read the user's request carefully before implementing — ask clarifying questions rather than guessing wrong
