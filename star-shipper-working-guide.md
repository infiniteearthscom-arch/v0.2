# Star Shipper: Working Relationship Guide
## Updated: 2026-02-19 (Session 8)

This document helps new Claude chats understand how we work together on this project. Upload this alongside `star-shipper-design-document-v2.md` at the start of each new chat.

---

## Project Overview

Star Shipper is a 4X space sandbox game (browser-based) with:
- **Frontend**: React 18 + Vite + Tailwind CSS, running on `localhost:5173`
- **Backend**: Node.js + Express + PostgreSQL 18, running on `localhost:3001`
- **Database**: PostgreSQL 18 (note: user has v18, not v16)
- **State**: Zustand (with immer middleware for immutable updates)
- **No TypeScript, no ORM** — plain JS and raw SQL throughout

Local paths:
- Server: `C:\Dropbox\Star-shipper\v0.2\star-shipper-server\`
- Client: `C:\Dropbox\Star-shipper\v0.2\star-shipper\`

---

## How We Work Together

### 1. Chunked Development

We break features into small, testable chunks. Each chunk:
- Has a clear scope (1-3 files typically)
- Can be tested immediately after implementation
- Gets delivered as individual files to `/mnt/user-data/outputs/`

The project evolved from ZIP delivery to individual file delivery with a mapping table.

### 2. File Delivery Convention

All files are delivered to `/mnt/user-data/outputs/` mirroring project structure. Every delivery includes a mapping table:

```
| File              | Destination                                      |
|-------------------|--------------------------------------------------|
| `gameStore.js`    | `star-shipper/src/stores/gameStore.js` (replace)  |
| `shipRenderer.js` | `star-shipper/src/utils/shipRenderer.js` (new)    |
```

**Always state whether the file is new or a replacement.** Use `present_files` tool to make files downloadable.

### 3. Database Migrations

PostgreSQL migrations go in `star-shipper-server/migrations/`, numbered sequentially (currently `001` through `014`). Run with:
```bash
"C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d star_shipper -f migrations/XXX_name.sql
```

**Important**: User has PostgreSQL 18, not 16. Always use `PostgreSQL\18` in paths.

When creating migrations: check existing schema by reading the most recent migration files. Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` for idempotency.

### 4. Testing Flow

After delivering code:
1. User copies files to local project
2. User runs migrations (if any)
3. User restarts server (`Ctrl+C` then `npm run dev`)
4. User refreshes browser
5. User tests and reports results

### 5. Debugging

When something doesn't work:
- Ask user for the **exact error message** from browser console or server terminal
- Don't guess — read the actual error
- Trace the issue systematically before applying fixes
- Fix ALL reported issues in one delivery, not one at a time

---

## Communication Style

### What Works Well
- **Be direct**: User prefers concise responses, not verbose explanations
- **Show, don't tell**: Provide code, not descriptions of code
- **Fix everything at once**: When user reports multiple bugs, address them all in a single delivery
- **Read skills first**: Always read SKILL.md files before creating documents/presentations
- **Post-delivery brevity**: After presenting files, give a concise summary. Don't over-explain what's in the code

### What to Avoid
- Don't apply random fixes one at a time — analyze the full problem first
- Don't over-explain after delivering code — user can read it
- Don't assume features work — wait for user confirmation
- Don't use PostgreSQL 16 in paths (it's 18!)
- Don't ask "what's wrong?" when user gives terse feedback like "that's a start" — dig into likely issues yourself

---

## Code Patterns We Use

### Window Management
All game windows use the centralized system in `gameStore.js`:
```js
// Register in initialState.windows:
windows: {
  myWindow: { open: false, x: 100, y: 100, minimized: false },
}

// Toggle (toolbar buttons use this):
toggleWindow('myWindow')  // opens if closed, closes if open

// Programmatic open/close:
openWindow('myWindow')
closeWindow('myWindow')
```

### API Calls
Client API calls go through `src/utils/api.js` which handles auth headers and base URL:
```js
const request = async (path, options = {}) => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // session cookies
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
};
```

### Auth Middleware
Server routes use `authMiddleware` from `../auth/index.js`:
```js
import { authMiddleware } from '../auth/index.js';
router.get('/endpoint', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  // ...
});
```

### Database Queries
```js
import { query, queryOne, queryAll } from '../db/index.js';
const rows = await queryAll('SELECT * FROM table WHERE x = $1', [value]);
const row = await queryOne('SELECT * FROM table WHERE id = $1', [id]);
await query('INSERT INTO table (x) VALUES ($1)', [value]);
```

---

## CRITICAL TECHNICAL KNOWLEDGE

### Coordinate System (caused multiple bug cycles — read carefully!)

The system view uses a specific coordinate convention:

- **Ship rotation**: Standard math angle in degrees. `0 = right`, `-90 = up`, `90 = down`, `180 = left`
- **Thrust angle**: `thrustAngle = shipRotationRef.current * (PI / 180)` — **NO offset**
- **Autopilot target angle**: `targetAngle = atan2(dy, dx) * (180 / PI)` — **NO offset**
- **SVG ship icon rotation**: `rotate(shipRotationRef.current + 90)` — the +90 converts math angle to SVG because ship icon images point UP
- **Formation offsets**: Ship-local coords: `x = lateral (+ right)`, `y = longitudinal (+ behind)`. Converted via heading vector decomposition.

**If you need to change flight physics, be extremely careful with angle conventions. The system was broken multiple times by adding/removing 90° offsets.**

### Time Synchronization (another previous bug source)

Physics and rendering MUST use the same time source:
- Physics loop writes `gameTimeRef.current = frameNum / 60`
- Rendering reads `const time = gameTimeRef.current`
- DO NOT use `frameCount` state for time — it lags behind due to React batching

### State Architecture
- **Zustand store (`gameStore.js`)** — windows, ships, resources, credits, autopilot target
- **Refs in SystemView** — real-time physics (position, velocity, rotation, trails). Updated every frame, bypass React rendering.
- **Component-local state** — UI-only (rename inputs, loading spinners)
- **The game loop runs in `useEffect([], [])`.** It reads mutable refs. Any derived physics constants from active ship stats MUST be read from `shipPhysicsRef.current`, not closure variables.

### Quality System
Module quality from crafting ingredients (purity, stability, potency, density):
- `scaled_stat = base_stat * (avg_quality / 50)`
- Q50 = baseline, Q100 = 2x, Q25 = 0.5x
- Colored bars: gray < green < blue < purple

---

## Project Structure

```
star-shipper/                    # Vite React client
  src/
    App.jsx                      # Auth gate, window rendering, toolbar
    stores/
      gameStore.js               # Zustand — all shared state + actions
      authStore.js               # Auth state (login, session)
    components/
      system/
        SystemView.jsx           # ~1600 lines — SVG solar system, flight physics,
                                 # autopilot, fleet rendering, contrails, camera
        PlanetInteractionWindow.jsx  # Planet/station — scan, harvest, vendor tabs
      ship/
        ShipBuilderWindow.jsx    # Ship fitting — canvas hull, slot management
        FleetWindow.jsx          # Fleet list, rename, active ship, formation badges
      ui/
        DraggableWindow.jsx      # Reusable window frame (drag, resize, minimize)
        InventoryWindow.jsx      # Cargo with module quality display
        CraftingWindow.jsx       # Crafting with drag-drop ingredients
        NavigationWindow.jsx     # System overview, body list, autopilot
        ResourceBar.jsx          # HUD — credits + active ship
        Toolbar.jsx              # Menu buttons (toggle windows)
    utils/
      api.js                     # All API calls
      shipRenderer.js            # Procedural ship art (detail + icon modes)
    systems/
      gameData.js                # Legacy constants (mostly unused now)

star-shipper-server/             # Express API
  index.js                       # Server setup, session, routes
  migrations/                    # SQL migrations 001-014
  api/
    resources.js                 # Scanning, harvesting, crafting, cargo
    ships.js                     # Ship CRUD
    fitting.js                   # Fleet, modules, purchasing, credits
    harvesters.js                # Automated harvester management
```

### Database Schema (key tables)
```
users              — id, username, password_hash, credits (default 1000), active_ship_id
resources          — user resource balances (iron, silicon, carbon, etc.)
cargo_items        — inventory items: volume, type, quality metrics
ships              — hull_type_id, name, fitted_modules (JSONB), FK to hull_types
hull_types         — 6 types (fighter→capital): slots, stats, price
module_recipes     — 12 module types with ingredient requirements
deposits           — planet resource deposits (scanned/unscanned)
harvest_sessions   — active mining sessions
harvesters         — deployed auto-harvesters with fuel/hopper
player_presence    — multiplayer presence tracking
ship_designs       — LEGACY (old cell-painting system, kept for FK compat)
```

---

## Feature State

### ✅ Working
| System | Notes |
|--------|-------|
| Auth (login/register/session) | express-session + bcrypt |
| Resource scanning (orbital + ground) | Reveals deposits on planets |
| Manual harvesting | Click-to-mine with cargo limits |
| Automated harvesters | Deploy with fuel, auto-collect |
| Crafting | Drag-drop ingredients, quality inheritance |
| Ship fitting | Canvas hulls, drag modules from cargo |
| Fleet management (up to 3 ships) | Rename, set active, formation badges |
| Station vendor | Buy hulls, modules, supplies with credits |
| Credits economy | Deducted on purchase, shown in HUD |
| Module quality | Affects stats, visible in tooltips everywhere |
| System view flight | WASD controls, autopilot with approach tuning |
| Fleet rendering | Flying-V formation, tiny procedural ship icons |
| Engine contrails | Per-ship, engine-colored, fading trails |
| Window management | Drag, resize, minimize, z-order, toggle from toolbar |

### ❌ Not Yet Built
| System | Priority | Notes |
|--------|----------|-------|
| Combat | High | Weapon module slots exist, no mechanics |
| Trading (sell resources) | High | Vendor sells but doesn't buy from player |
| Multiple star systems | High | Only Sol, no jump gates |
| Research/tech tree | Medium | UI placeholder, no mechanics. Fleet size expansion planned here. |
| NPC factions & reputation | Medium | No NPCs beyond static stations |
| Per-ship cargo capacity | Low | Inventory is global, should tie to active ship cargo stat |

---

## Dead Code & Cleanup Notes

### Removed (Session 8)
- Old cell-painting ship builder (`shipBuilder` state, hull cell actions, `computeShipStats`)
- Old selectors: `useShipBuilder`, `useShipBuilderStats`, `useShipDesigns`
- Old window entries: `myDesigns`, `myShip`, `fleetManager`
- Old `ShipGraphics.js` SVG components (replaced by `shipRenderer.js`)

### May Still Exist in User's Local Project
- `ShipGrid.jsx`, `MyDesignsWindow.jsx`, `MyShipWindow.jsx` — can be deleted
- `ShipGraphics.js` — replaced by `shipRenderer.js`
- `ship_designs` table and related server endpoints — legacy, unused by UI

---

## Common Pitfalls

1. **Angle math in SystemView** — Any change to rotation/thrust/autopilot angles risks breaking flight. Verify all four formulas (thrust, target, SVG rotation, formation) are consistent.

2. **useEffect closure staleness** — Game loop captures initial values. Physics constants MUST come from `shipPhysicsRef.current`, not closure scope.

3. **Refs vs state for real-time data** — Position/velocity/rotation = refs. Window/UI state = React state. Don't mix.

4. **Migration numbering** — Check highest existing number before creating. User runs manually.

5. **Hull shape data** — `shipRenderer.js` is the single source of truth. Don't duplicate hull shapes in other files.

6. **Credit transactions** — Server uses `FOR UPDATE` locks. Client should refresh credits after purchases.

7. **PostgreSQL 18** — Not 16. Always use `PostgreSQL\18` in paths.

---

## Session Log

| # | Date | Focus | Key Deliverables |
|---|------|-------|------------------|
| 1 | 02-13 | Schema, deposits, scanning | DB init, resource system foundation |
| 2 | 02-14 | Manual harvesting, cargo, nav | Mining mechanics, inventory, system map |
| 3 | 02-15 | Crafting, cargo items | Unified crafting, drag-drop, trash |
| 4 | 02-17 | Volume cargo, harvesters | Density system, automated mining |
| 5 | 02-18a | Ship builder redesign | Hull-with-slots, canvas renderer |
| 6 | 02-18b | Ship fitting, vendor | Fitting window, module recipes, vendor tab |
| 7 | 02-19a | Active ship, credits, quality | Physics scaling, economy, quality display |
| 8 | 02-19b | Fleet rendering, polish | Fleet in system view, coord fixes, contrails, toolbar toggle, dead code cleanup, this document |

---

## Starting a New Chat

Upload these files:
1. **This document** (`star-shipper-working-guide.md`)
2. **Design doc** (`star-shipper-design-document-v2.md`)
3. Any specific source files needed for the task

Say something like:
> "Star Shipper project. Read the working guide and design doc. Continue with [specific task]. Ask me for any files you need."

The new Claude should:
1. Read both documents first
2. Ask for specific files it needs (don't upload everything)
3. Check `/mnt/user-data/uploads/` for any uploaded source files
4. Read relevant transcripts from `/mnt/transcripts/journal.txt` if needing deep historical context
