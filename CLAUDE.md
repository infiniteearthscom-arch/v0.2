# Star Shipper — Claude Working Notes

Browser-based 4X space game. Mine → craft → fit → fly → trade → fight → explore across a 200-system procedural galaxy. **Live in production** — every push to `main` auto-deploys.

For deep architectural and operational context, see @HANDOFF.md.

---

## Live deployment

- **URL:** https://star-shipper-fjrrq.ondigitalocean.app
- **GitHub:** `infiniteearthscom-arch/v0.2` (branch `main`)
- **Host:** DigitalOcean App Platform — auto-deploys on every push (~3–5 min)
- **DB:** PostgreSQL 18 dev database, only reachable from inside the app
- **Run new migrations** via DO Console → `v0-2-star-shipper-server` → `npm run db:migrate`. **Not** from local — local can't reach the prod DB.

The user does commits and pushes via **GitHub Desktop**, not the command line. When code changes ship to prod, write down what's in the diff so the user has a commit message to use.

---

## Tech stack

- **Client** (`star-shipper/`): React 18 + Vite, Zustand (immer + persist), Tailwind CSS, no router, no TypeScript. Dev server: `localhost:5173`.
- **Server** (`star-shipper-server/`): Node 22 + Express, raw SQL (no ORM, `pg` client), JWT auth (jsonwebtoken + bcrypt). Dev server: `localhost:3001`.
- **DB:** PostgreSQL 18. **Not 16** — paths use `PostgreSQL\18\bin\psql`.

Local migration command (Windows):
```
"C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d star_shipper -f migrations/XXX_name.sql
```

---

## Critical pitfalls — read before editing

These have all caused real bugs. Don't relearn them:

1. **`hull_type_id`, NOT `hull_id`** — ships from the API. Using the wrong field made all ships invisible in `GalaxyFlightView` for several debug cycles. Match `SystemView`'s working pattern when touching ship-rendering code.

2. **`DraggableWindow` props are `initialWidth` / `initialHeight`** — not `defaultWidth` / `defaultHeight`. Wrong names silently fall back to 400×300.

3. **System View angle conventions** — `0=right, -90=up, 90=down, 180=left` (math degrees). Thrust and autopilot target use NO offset; SVG ship icon adds `+90` because the icon points UP. **Don't add or remove 90° offsets ad hoc** — flight has been broken multiple times this way. All four formulas (thrust, target, SVG rotation, formation) must stay consistent.

4. **Galaxy-map vs galaxy-flight visual constants are calibrated as a pair.** Map uses small `STAR_SIZES` (4–9) at zoom ~0.58; flight view uses large ones (12–36) at zoom ~2.0. Touching one without the other will desync them. Same for window dimensions and viewBox in `GalaxyFlightView` — tuned together, change together.

5. **Time source must be shared.** Physics writes `gameTimeRef.current = frameNum / 60`; rendering reads the same ref. Never use React `frameCount` state for time — batching makes it lag and planet positions desync between physics and visuals.

6. **Refs vs state.** Position, velocity, rotation, trails → refs. Window state, UI toggles, docked body → React state. Mixing causes lag (state for physics) or invisible updates (refs for UI).

7. **`useEffect([], [])` closure staleness** — the game loop captures initial values. Anything derived from active-ship stats must be read from `shipPhysicsRef.current` each frame, not from closure scope.

8. **Migrations: no `CREATE EXTENSION`** — DO dev DB blocks it. Use `gen_random_uuid()` (built into PG 18), not `uuid_generate_v4()`. Highest existing migration is `016_procedural_systems.sql`. **Migration 009 was skipped** — next new migration should be `017`.

9. **`api.js` must use `VITE_API_URL`** — never hardcode `localhost:3001`. The env var is baked into the bundle at build time, so changing it in DO requires a rebuild (push a commit or Force Rebuild — redeploy alone won't update the client).

10. **Vite env vars bake at build time.** Same point, worth a second mention. `VITE_API_URL` change → must rebuild.

11. **`shipRenderer.js` is the single source of truth for hull shapes.** `FleetWindow` and `ShipBuilderWindow` both import from it. Never inline hull-shape data elsewhere.

12. **Body IDs.** Client uses string names (`"mars"`); DB uses UUIDs. Server has `resolveBodyId()`. Procedural systems call `ensureBody()` on first dock to register a row.

13. **When the user says "only change X" — change ONLY X.** Don't touch viewBox calculations when resizing a window, don't change star sizes when adjusting zoom. If a change has cascading effects, ask first rather than guessing through iterations.

---

## Code patterns

### Windows (Zustand store in `star-shipper/src/stores/gameStore.js`)
```js
// Register in initialState.windows:
windows: { myWindow: { open: false, x: 100, y: 100, minimized: false } }

toggleWindow('myWindow')   // toolbar buttons
openWindow('myWindow') / closeWindow('myWindow')
```

### Server route — auth middleware
```js
import { authMiddleware } from '../auth/index.js';
router.get('/endpoint', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  // ...
});
```

### Server — DB queries (raw SQL via `pg`)
```js
import { query, queryOne, queryAll } from '../db/index.js';
const rows = await queryAll('SELECT * FROM t WHERE x = $1', [v]);
const row  = await queryOne('SELECT * FROM t WHERE id = $1', [id]);
await query('INSERT INTO t (x) VALUES ($1)', [v]);
```

### Client API calls
All calls go through `star-shipper/src/utils/api.js`. It reads `VITE_API_URL` and falls back to `http://localhost:3001`. Don't fetch the server from anywhere else.

---

## Repo layout (top level)

```
star-shipper/                  Vite React client
star-shipper-server/           Express API + migrations/ (001-016, 009 skipped)
docs/design-vision.md          Aspirational 4X design (rooms, crew, colonies — unbuilt)
HANDOFF.md                     Deep operational reference (deployment, architecture, full state)
README.md                      Repo overview / quickstart
CLAUDE.md                      This file
```

The biggest files: `SystemView.jsx` (~2400 lines), `PlanetInteractionWindow.jsx` (~1600), `GalaxyFlightView.jsx` (~720), `GalaxyMapWindow.jsx` (~500). Read targeted sections, not the whole thing.

---

## Working with this user

- **Windows + GitHub Desktop.** Give exact commands and step-by-step instructions for terminal/git/DO work. Don't assume CLI git fluency.
- **Direct, terse, show-don't-tell.** Concise responses. Code over prose.
- **Fix all reported issues in one pass.** Don't drip fixes one at a time.
- **Read before guessing.** Ask the user for the exact error message rather than speculating.
- **Ask clarifying questions upfront.** Better to ask once than iterate three times in the wrong direction.
- **Watch for "keep everything else the same."** Means it literally — only the named change.

---

## Aspirational vs. shipped

`docs/design-vision.md` describes the original 4X scope: rooms-within-hulls ship interiors, crew management, planetary colonies, room targeting in combat, faction reputation. **Most of that is not built.** The actual ship system is hull-with-slots (6 fixed hull types + module fitting), and there are no colonies, crew, or faction mechanics yet. Treat the design doc as direction, not as truth about current state. HANDOFF.md is the truth about current state.
