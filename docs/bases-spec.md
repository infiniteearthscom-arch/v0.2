# Player Bases — Phase 1

Built 2026-09-22, migration 082. Follows the locked design in STATUS ("Player-owned orbital stations"): a modular fitting grid like a hull, anchored to a body, tiered construction, gated by Planetary skills and research. Raids are Phase 2.

## What a base is

- One structure per pilot on a planet (cap = 1 + Interplanetary Consolidation level), **surface** (planetary base) or **orbital** (star base). In Phase 1 the kind is placement flavor; both take the same modules.
- Tiers: **Framework** (1 slot, 10 min, 5 k cr + 200 Iron / 100 Titanium / 50 Copper) → **Outpost** (2 slots, 45 min, 20 k + 400 Titanium / 200 Crystite) → **Station** (3 slots, 3 h, 80 k + 300 Crystite / 100 Uranium / 50 Plasma). Costs are paid in bulk from cargo; construction is a real-time timer evaluated lazily.
- Gates: `tech_base_construction` (Industry T2, 450 RP) to build; `tech_base_expansion` (Industry T3, 1 800 RP) for tiers 2–3; Command Center Upgrades I to build.
- Modules are ordinary `module_types` rows with `slot_type = 'base'` — bought at any vendor or crafted — carried in cargo and fitted at the base. They never fit a ship (slot type mismatch) and the Ship Builder ignores them.

| Module | Tier | Effect |
|---|---|---|
| Cargo Depot | 1 | 1 500 cargo units of base storage; deposit / withdraw while docked (stat-tuple merge like cargo) |
| Base Refinery | 2 | refining at this planet has no fee and +5 % yield (works on plain planets, not only stations/cities) |
| Research Lab | 2 | +0.5 RP/min passive while fitted (added to the research trickle) |

## Managing it

Everything happens while docked at the planet: the planet window gets a **Base** tab (build form or the base panel: construction status, slots with FIT / UNFIT from cargo, UPGRADE, depot). The galaxy map marks systems with your bases (🏠) and lists them in the info panel.

## API (`/api/bases`)

`GET /mine` · `GET /here` (docked body: base, build eligibility with reasons, tier costs, base modules in cargo, cargo resources) · `POST /build {kind, name}` · `POST /:id/upgrade` · `POST /:id/fit {slot, inventory_id}` · `POST /:id/unfit {slot}` · `POST /:id/depot/deposit {inventory_id, quantity}` · `POST /:id/depot/withdraw {stack_id, quantity}`. Exports `baseRpPerMin(userId)` (research.js) and `baseAtBody(userId, bodyId)` (refining.js).

## Public bases + starbases (2026-09-25)

- Bases are visible to everyone: `GET /bases/system/:id` (public projection: owner, name, kind, tier, planet, fitted module names), `GET /bases/galaxy` (mine + others) for the map, and `/here` lists other pilots' bases on the planet. The Base tab shows "Other bases on this planet"; the galaxy map marks systems with other pilots' bases (grey) and lists them in the info panel.
- **Orbital bases are starbases.** Not allowed on a planet that already has a station in orbit (Earth / Luna Station in Sol; generator stations elsewhere). A built orbital base becomes a station body orbiting its planet in every pilot's system view, drawn with the station sprite and an owner tag, dockable by anyone. Docking opens a Starbase view (owner, tier, fitted modules). Owner-run vendors, storage access and services are the next base phase.

## Phase 2 (not built)

Defense slot + turrets / shield; pirate raids (server cron, damaged modules go offline until repaired); Med Bay respawn override; automated haulers; local market / trade post; manufacturing queue; sensor array; influence radius / system claim (first-priority harvester slots). Surface vs orbital should diverge here (surface: harvester bonuses; orbital: acts as a contract port).
