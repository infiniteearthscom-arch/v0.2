# Star Shipper — Claude Working Notes

Browser-based 4X space game. Mine → craft → fit → fly → trade → fight → explore across a 200-system procedural galaxy. **Live in production** — every push to `main` auto-deploys.

**Start each session by skimming @STATUS.md** — it tracks current state, in-flight work, and recent themes across chats. For deep architectural and operational context, see @HANDOFF.md.

---

## Live deployment

- **URL:** https://star-shipper-fjrrq.ondigitalocean.app
- **GitHub:** `infiniteearthscom-arch/v0.2` (branch `main`)
- **Host:** DigitalOcean App Platform — auto-deploys on every push (~3–5 min)
- **DB:** PostgreSQL 18 dev database, only reachable from inside the app

**There is no local dev environment.** No local PostgreSQL, no `npm run dev` servers — everything runs on DO. The first place to test a change is the live URL after deploy.

The user commits and pushes via **GitHub Desktop**, not the command line. When code changes ship to prod, write down what's in the diff so the user has a commit message to use.

### Deploy + migrate flow

1. Edit files (Claude, locally — repo is just a working copy).
2. User commits + pushes via GitHub Desktop.
3. DigitalOcean auto-deploys in ~3–5 min.
4. **If the change includes a new migration:** after deploy completes, run it from **DO Console → `v0-2-star-shipper-server`**:
   ```
   npm run db:migrate
   ```
   The migrate script tracks completed migrations and skips them.
5. Test on the live URL.

---

## Tech stack

- **Client** (`star-shipper/`): React 18 + Vite, Zustand (immer + persist), Tailwind CSS, no router, no TypeScript.
- **Server** (`star-shipper-server/`): Node 22 + Express, raw SQL (no ORM, `pg` client), JWT auth (jsonwebtoken + bcrypt).
- **DB:** PostgreSQL 18 (DO managed dev DB).

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

8. **Migrations: no `CREATE EXTENSION`** — DO dev DB blocks it. Use `gen_random_uuid()` (built into PG 18), not `uuid_generate_v4()`. **Migration 009 was skipped.** Highest applied is `052_computed_scan_range.sql` — next new migration is `053`.

9. **`api.js` must use `VITE_API_URL`** — never hardcode `localhost:3001`. The localhost fallback in `api.js` is dead-code only (no local dev). The env var is baked into the bundle at build time, so changing it in DO requires a rebuild (push a commit or Force Rebuild — redeploy alone won't update the client).

10. **Vite env vars bake at build time.** Same point, worth a second mention. `VITE_API_URL` change → must rebuild.

11. **`shipRenderer.js` is the single source of truth for hull shapes.** `FleetWindow` and `ShipBuilderWindow` both import from it. Never inline hull-shape data elsewhere.

12. **Body IDs.** Client uses string names (`"mars"`); DB uses UUIDs. Server has `resolveBodyId()`. Procedural systems call `ensureBody()` on first dock to register a row.

13. **When the user says "only change X" — change ONLY X.** Don't touch viewBox calculations when resizing a window, don't change star sizes when adjusting zoom. If a change has cascading effects, ask first rather than guessing through iterations.

14. **`FOR UPDATE` cannot be applied to the nullable side of a `LEFT JOIN`.** Postgres rejects this at parse time, regardless of data — even if the joined row would exist. Symptom: server-side 500 with a generic error message and a `console.error` log of the actual PG error. Fix: split into two queries — lock the parent row with single-table `FOR UPDATE`, then read the joined row separately. Or use `FOR UPDATE OF parent_table` to scope the lock. Bit the `/enter-pod` and `/exit-pod` endpoints on first deploy of migration 019.

15. **Module-fit checks must be FLEET-WIDE, not active-ship-only.** "Does the player have a scanner / mining laser / sensor sweep fitted?" must enumerate every active fleet ship, not just `playerShip`. A wingman carrying the module satisfies the gate exactly like the primary. Bit mining-laser-on-non-primary, then again with scanner-on-non-primary. Client: use the `fleetHas(predicate)` helper in `SystemView.jsx` (reads `fleetShipsRef.current` — always-current, no closure staleness). Server: `SELECT fitted_modules FROM ships WHERE user_id = $1 AND storage_body_id IS NULL`. The `storage_body_id IS NULL` clause is mandatory — stored ships are parked at a station and must NOT contribute capability in space. Every future module gate (salvager, tractor beam, system-wide sweep, ...) should follow this pattern out of the gate.

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
All calls go through `star-shipper/src/utils/api.js`, which reads `VITE_API_URL` (set on the DO static site). Don't fetch the server from anywhere else.

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
