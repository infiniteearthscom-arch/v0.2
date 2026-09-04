# Star Shipper — Audit Backlog

Deep-dive code audit, 2026-09-02. Six parallel review passes: game loop/rendering, UI windows,
client stores/utils, server API + economy, realtime + sync-copies, DB schema + migrations.
Every finding below was verified against actual code (file + approx line), not speculated.

> **Status update 2 (2026-09-04):** batches 2–6 shipped as merge commits — server
> stability (auth try/catch, pool error, skills lock), client session (socket brick,
> logout teardown, 401), DB hygiene (migration 066 + lazy expiry w/ refunds + corp
> invites + market body-id resolution), UI correctness (toolbar overlap, store syncs,
> double-click guards, chat scroll, hooks defusals, market buy-order identity
> validation), and the perf pass (Starfield/AsteroidBelt memo + CSS twinkle, lazy
> asteroid tooltips, scan-loop Map, cached galaxy, galaxy-flight store throttle,
> SystemMapWindow mount-gate, 10s credits poll). Deferred from the perf list: mining-
> tick / weapon-targeting / contrail micro-allocations, the Set/Map-per-frame reuse,
> and the delta-clamp/gameTime clock unification.
>
> **Status update (2026-09-02, branch `audit/economy-hardening`):** all six P0s fixed
> (P0-3 cheat-craft kept per owner decision but gated to the dev account, server + client),
> plus these P1s: starter-kit server-side claim gate, craft negative/duplicate-ingredient
> validation, and the 72× DEV harvest rate (now 50/hr). Remaining P1s (quests, combat
> cooldown, auth crash, skills lock, wrecks removal, migrations, corp invites, client
> session fixes) go in the next branches per the attack order.

**Severity key:**
- **P0** — exploitable right now or actively corrupting data. Fix before anything else.
- **P1** — live bug or correctness risk players can hit in normal/adversarial play.
- **P2** — performance, economy-design, or behavior issues; degrade experience but bounded.
- **P3** — cleanup, dead code, polish, latent landmines.

---

## P0 — Economy exploits (server)

All five are reachable by any logged-in player with curl. Recommended: fix as one "economy
hardening" pass and deploy together.

1. **Arbitrary resource mint — `src/api/resources.js` ~433 (`POST /inventory/add`).**
   Body `{resource_type_id, quantity, purity:100, ...}` is inserted verbatim — no source check,
   no cargo check. Mint 100k q100 Crystite, sell or market-dump for unbounded credits.
   **Fix: delete the endpoint.** No legitimate client flow adds inventory without a server-side
   source (mining/craft/trade/market all have their own inserts).

2. **Negative-quantity "trash" grows stacks — `src/api/resources.js` ~904 (`POST /inventory/trash`).**
   `quantity: -1e9` passes the `>= item.quantity` check and `SET quantity = quantity - (-1e9)`
   commits (INTEGER column, no positivity CHECK). Mine 1 rare unit → grow it to a billion.
   **Fix:** reject non-integer or `<= 0` quantity.

3. **DEV cheat-craft live in prod — `src/api/resources.js` ~940 (`POST /craft/cheat`) +
   `CraftingWindow.jsx` 1368–1399 (visible "🐛 DEV: Cheat Craft" button, shown to every player).**
   Crafts any recipe with zero ingredients and no `requires_tech` check.
   **Fix:** delete the endpoint (or env-flag + specific dev user), and hide the client button
   behind the same flag.

4. **Fractional-quantity sale mints credits — `src/api/fitting.js` ~1022 (`/sell-resource`),
   same hole in `/sell-item`.** `quantity: 0.4` passes the `<= 0` check; credits pay out on the
   fraction while the INTEGER inventory `UPDATE` rounds to no change. Loopable forever.
   **Fix:** `Number.isInteger(quantity)` validation on both endpoints.

5. **Trade offer with duplicate stack ids dupes items — `src/lib/trade.js` ~322–440 (`executeSwap`).**
   `setOffer` never dedupes; `[{stack_id:X, quantity:10}, {stack_id:X, quantity:10}]` validates
   per-entry, DELETEs the stack once but credits the receiver **twice**. Two colluding accounts
   duplicate any stack. **Fix:** reject repeated `stack_id` in `setOffer` AND apply cumulative
   debits per stack in `executeSwap`.

6. **Trade double-confirm race runs the swap twice — `src/lib/trade.js` ~248–295.**
   `session.status = 'completed'` is set only *after* `await executeSwap()`; two concurrent
   `POST /:id/confirm` both see `status === 'active'` and both execute. Credits-only offers
   transfer double. **Fix:** flip status to `'executing'` synchronously *before* the await;
   reject confirms while set.

---

## P1 — Live bugs & correctness risks

### Server — economy / validation

- **Starter-kit "one per account" gate is client-enforced — `src/api/fitting.js` ~565–631.**
  The guard checks `tutorial_buy_starter_kit = completed`, but the *client* completes that quest
  in a separate call after the buy. Never call `/quests/complete` (or fire N parallel buys — no
  lock) → unlimited free kits. **Fix:** flip the claimed state server-side inside the buy
  transaction (complete the quest row there, or a `starter_kit_claimed` users flag).

- **Quest completion is entirely client-asserted — `src/api/quests.js` 62–176.**
  Any player can curl the whole tutorial chain and collect every reward instantly. Bounded
  (once per quest) but free credits. **Fix (incremental):** verify cheap conditions server-side
  where data exists; longer-term, complete quests from server-observed events.

- **Combat loot: `enter-system` reset is client-driven and free — `src/api/combat.js` 42–98.**
  Loop enter-system → claim all 25–40 manifest enemies → repeat; pays full-system loot with no
  fight (the "nothing verifies the fight happened" gap is known, but the free visit-reset makes
  it a scriptable loop, not just a cap). **Fix until server combat:** per-user per-system
  cooldown on `enter-system` ≥ the 10-min respawn timer.

- **Craft accepts negative ingredient quantities — `src/api/resources.js` ~736–796.**
  `[{A:15},{B:-5}]` sums to the requirement; negative stat-weighting lets players push output
  quality above their best ingredients. **Fix:** per-entry integer `> 0` validation.

- **DEV harvest rate live in prod — `src/api/resources.js` 1127.**
  `harvestRate = 3600 // DEV: 1 unit/sec (change to 50 for production)` — planet mining runs at
  72× the intended rate for everyone. **Fix:** set to the intended value (deliberate tuning
  decision — confirm the number first).

- **Auth middleware can crash the whole server — `src/auth/index.js` 223–244, 247–266.**
  No try/catch around `findUserById`; Express 4 doesn't catch async rejections, so any transient
  DB error during auth (pool timeout, failover blip) terminates the Node process for all players.
  **Fix:** wrap both middlewares in try/catch → 500/`next(err)`. Related: `src/db/index.js` 22–25
  `pool.on('error') → process.exit(-1)` hard-kills on idle-client errors — log + continue instead.

- **Concurrent `GET /skills` corrupts queue positions — `src/api/skills.js` ~95–165.**
  Two simultaneous reads (client fires from several components) both pop the finished head entry
  and both decrement positions → negative/desynced queue. **Fix:** `FOR UPDATE` on the user's
  queue rows (or lock the users row) inside `loadAndCommit`.

- **Wrecks endpoints: delete rather than fix — `src/api/resources.js` 1956–2057.**
  (Known issue, new angle.) `/wrecks/spawn` + `/wrecks/claim` are parked on the 42P01 bug, but if
  ever "fixed" they're an instant mint: client-driven spawn, up to 1000 cr per pair,
  `MODULE_DROP_CHANCE = 1.0`. The F4 claim-loot flow superseded them. **Fix:** remove endpoints;
  also stop leaking `error.message` in the 500 response.

### Server — infra / DB

- **Migration chain is broken for any fresh database — `migrations/003` + `011`.**
  011 re-creates `deployed_harvesters` with a different shape via `CREATE TABLE IF NOT EXISTS`
  (no DROP) — on a fresh 001→065 run, 003's table survives and 011's
  `CREATE UNIQUE INDEX ... (celestial_body_id, slot_index)` errors on undefined columns,
  aborting the run. Prod evidently had the 003 table dropped out-of-band. Also: the
  one-harvester-per-deposit UNIQUE index may not actually exist (name collision with 003's
  non-unique index → `IF NOT EXISTS` no-op). Likely the same disease as the wrecks 021/022
  42P01 mystery. **Fix:** new migration that idempotently asserts/repairs the 011 shape;
  convention going forward: `DROP TABLE IF EXISTS` when intentionally replacing a table.

- **Expired corp invites permanently block re-inviting — `migrations/059` + `src/lib/corp.js` 176–186.**
  `UNIQUE (corp_id, invitee_id)` + expired rows never deleted + invitee can't see/reject expired
  invites → after 7 days of being ignored, that corp can never invite that pilot again ("Invite
  already pending", forever). **Fix:** delete expired rows before insert in `inviteToCorp`
  (or `ON CONFLICT DO UPDATE SET expires_at = ...`).

### Realtime

- **`presence:enter` race leaves permanent zombie peers — `src/realtime/presence.js` 296–366.**
  The handler awaits `fetchShipVisual` mid-flight; two rapid enters interleave → user inserted
  into TWO systems' peer maps + both rooms. The orphan has `ts === 0`, which the stale sweep
  *skips forever* — ghost ship, wrong population counts, cross-system chat leakage until server
  restart. **Fix:** per-socket enter sequence number (abort if changed after await) + evict
  `ts === 0` entries after a 30s grace.

### Client

- **Socket layer bricks permanently if the first connect fails — `src/utils/socket.js` ~39, 74–113.**
  (Found independently by two audits.) `connecting = true` is only cleared in the `'connect'`
  handler; `connect_error`/`disconnect` leave it set, so every later `ensureSocket()`
  short-circuits and returns the dead socket. Stale token at page load → chat/presence/trade
  never come online, even after re-login, until a full reload. **Fix:** clear `connecting` in
  `connect_error` + `disconnect`; also listen for `reconnect_failed` and null the socket.

- **Logout doesn't tear down the socket or reset the store — `src/stores/authStore.js` ~105–113.**
  The socket stays authenticated as the old account (still "online" to peers; a second login in
  the same tab reuses it — chat/presence attributed to the *previous* user). `gameStarted`
  persists across accounts; account B briefly sees account A's ships/quests, and A's
  `discoveredSystems` leak into B's session fog-of-war (union-only merge). **Fix:** `logout()`
  disconnects + nulls the socket (add `socketBus.teardown()`) and calls `resetGame()`.

- **No 401 handling anywhere — `src/utils/api.js` ~28–35.**
  Expired JWT mid-session → every call fails generically, polls fail silently forever, player
  sits in a frozen game with no re-login prompt. **Fix:** in `request()`, on 401 clear the token
  and flip authStore to logged-out (routes to AuthScreen).

- **Fleet-mass speed penalty is dead — `SystemView.jsx` ~1191 vs ~1667.**
  Two writers fight over `shipPhysicsRef`: the render body overwrites it every frame with the
  no-mass-penalty value, clobbering the fleet-stats effect one frame after every fleet change.
  Armor/cargo mass never actually slows the fleet. **Fix:** single writer — fold the fleet-stats
  math into the render-body calc (or gate the render-body write).

- **Expanded left toolbar covers the Planet window's tab column — `GameFrame.jsx` ~324–368 +
  `PlanetInteractionWindow.jsx` ~3562–3575.** Toolbar (expanded, default true, 160px wide,
  z-40) overlaps the planet window's icon tabs (left:56, z-30) — clicks aimed at
  Scan/Mine/Auto/City hit toolbar buttons. `ContextPanel` already shifts to `left:178` when
  expanded; PlanetInteractionWindow hardcodes 56. **Fix:** same `toolbarExpanded ? 178 : 56`
  anchor.

- **FleetWindow "Set Active"/"Activate" never refresh the global ships store — `FleetWindow.jsx` 267–285.**
  Server flips the flagship but SystemView keeps flying the old primary; an activated stored
  ship doesn't join the fleet until an unrelated `fetchShips` fires. **Fix:** call store
  `fetchShips()` after both actions (mirror ShipsTab).

- **ShipBuilder `handleBuyHull` misses store refresh — `ShipBuilderWindow.jsx` 800–814.**
  (Already in STATUS.md Known issues — confirmed.) Podded player buying here stays stuck in the
  pod. Also calls retired quest `tutorial_buy_starter_scout` (dead since migration 034).
  **Fix:** add `fetchShips()`, drop the dead quest call.

- **No double-click guard on vendor/hull purchases — `PlanetInteractionWindow.jsx` 2140–2190 +
  `ShipBuilderWindow.jsx` 409–421.** Double-click buys two hulls (thousands of credits) or two
  modules. **Fix:** per-action busy flag disabling the button until the promise settles.

- **Latent Rules-of-Hooks crashes (two components) — `GalaxyFlightView.jsx:91` and
  `CraftingWindow.jsx` 987 vs 1010–1021.** Both have early returns before hook declarations,
  masked only because the parents mount them conditionally. First refactor to unconditional
  mounting (the GameFrame social-window pattern) throws "Rendered fewer hooks than expected"
  and white-screens. **Fix:** delete the in-component guard (GalaxyFlightView) / hoist the
  `useState` calls above the return (CraftingWindow).

---

## P2 — Performance, economy design, behavior

### Performance — game loop (the "long sessions get slower" follow-up)

Concrete per-frame allocation hotspots in `SystemView.jsx`, worst first:

- **~4839–4904** — full tooltip JSX tree built for **every asteroid every frame** (nested divs,
  `Object.values().filter().map()`, `getQualityTier`) even when nothing is hovered. Thousands of
  allocations/frame in a belt. Build lazily in `onMouseEnter`.
- **895–923 (Starfield)** — 1,600 `<circle>` elements re-created per frame with per-star
  `Math.sin`; **853–889 (AsteroidBelt)** not memo'd (300 circles/belt re-diffed per frame).
  `React.memo` both; drive twinkle via CSS animation.
- **3711–3736** — scan progress: `[...activeScansRef.entries()]` + `asteroidsRef.find()` per
  scan per frame + `fleetScanRange()` per entry → O(scans × asteroids) during bulk-belt scans.
  Build one `Map(id→asteroid)` per frame; hoist `fleetScanRange()`.
- **3557–3580, 3634** — mining tick: `enumerateFleetLasers()` + `new Set()` every frame while
  mining; `find()` per assignment per frame (also per beam at 4779).
- **3197–3226, 3397–3398** — weapon targeting: O(enemies) sweeps per weapon per frame; each
  homing missile does `enemies.find` per frame.
- **2961–2968, 2743–2749** — fresh `Set`/`Map`/`{x,y}` objects per frame; mutate in place.
- **4268–4293** — contrail render allocates a segments array + up to 17 `<line>`s per ship per frame.

Other perf:

- **`GalaxyFlightView.jsx` 322–324** — `updateGalaxyShipPosition()` every frame = Zustand set +
  immer + persist `JSON.stringify` + `localStorage.setItem` at 60 Hz, and forces the 200-system
  GalaxyMapWindow SVG (auto-opened during flight) to re-render at 60 fps. Throttle (`%10`) +
  skip when unchanged.
- **`SystemView.jsx:1247`** — belt-registration calls `generateGalaxy(12345, 200)` instead of the
  cached `getGalaxy()` — regenerates the whole galaxy on every non-Sol system entry with belts.
- **`GalaxyFlightView.jsx` 420–433** — `nearbySystem` memo: dead code, O(200) sqrt per frame. Delete.
- **`SystemMapWindow.jsx` 444–484** — mounted unconditionally; 1s tick + 6–12 Hz store
  subscriptions keep it re-rendering forever while closed. Mount-gate it in GameFrame.
- **`GameFrame.jsx` 158–164** — 3s credits poll for the whole session, on top of 5s inventory
  polls (3 components), 10s recipes/harvesters, 60s mail. Lengthen / visibility-gate.
- **Time-domain desync (documented mechanism, new detail)** — `SystemView.jsx:2461` delta clamp
  (below 20 fps = slowdown) PLUS `gameTime = frameNum/60` means orbits slow below 60 fps while
  ship physics stay real-time until 20 fps — autopilot chases bodies orbiting at 2/3 speed at
  40 fps. Any fix should unify the two clocks.

### Performance / scaling — DB

- **`activity_events` has no `user_id`/`event_type` index and leaderboards + profiles do live
  aggregates over the whole table** (`leaderboards.js`, `profile.js` 80–110 — rank CTEs scan it
  twice per request). Scaling cliff arrives well before the ticker's "~1M rows" note.
  **Fix now (cheap):** `CREATE INDEX ON activity_events(event_type, user_id)` and
  `(user_id, created_at)`. **Later:** counters table or retention window.
- **No sweep for any expirable table — and expiry is unenforced at read time:**
  - `market_orders`: neither list nor fulfill checks `expires_at` — expired orders stay listed
    **and fulfillable** forever; filled/cancelled rows accumulate forever (STATUS's "retained
    60s" claim is wrong — nothing deletes them).
  - `bounties`: `listOpenBounties` doesn't filter expiry — expired bounties render open, claims
    400 without marking `expired` or refunding; poster escrow stays locked invisibly.
  - **Fix (lazy first):** add `AND expires_at > NOW()` to market list/fulfill + bounty list;
    mark+refund on the rejected-claim path. Cron sweep later.
- `chat_messages` / `mail_messages`: unbounded growth, but index-covered reads — disk-only
  concern, defer (eventual 30d chat retention sweep).

### Economy design / server correctness

- **Module sale price branch is dead code — `src/api/fitting.js` ~1097–1150 (`/sell-item`).**
  Modules are stored as `item_type='item'`, so every module sells at the flat 5-cr fallback —
  a 6000-cr Bulk Cargo Bay sells for ~5–10 cr. NOTE: the starter-kit-mint math currently *relies*
  on this underpayment — fix together with the kit gate (P1 above).
- **Stored ships contribute cargo capacity — `src/api/resources.js` 84–90 (`getPlayerCargoInfo`).**
  Missing `storage_body_id IS NULL` (pitfall #15 violation) — parked ships inflate in-space
  capacity for mining/harvest/market/trade checks. (All other capability endpoints verified clean.)
- **NULL-price hulls purchasable free — `src/api/fitting.js` ~181.** `price > 0` skips the charge
  for `price IS NULL` hulls (e.g. pod) — mint free pod ships. Reject null-price except starter path.
- **Dock state is client-asserted — `src/realtime/presence.js` 377–391.** A modified client emits
  `presence:dock` for any station from anywhere → market/trade "must be docked" gates defeated.
  Also in-memory: server restart silently undocks everyone. Validate against server-side position
  when server-authoritative position exists; until then, accept as bounded.
- **Harvester quality laundered to 50 on pickup — `src/api/harvesters.js` ~664.** Low-q harvester
  upgrades to q50 via deploy+remove; high-q loses its quality. Store original quality on the
  deployed row.
- **`price_per_unit × quantity` unbounded — `src/lib/market.js` 106–107.** Values near 2^53 pass
  `Number.isInteger` → float-precision escrow math. Cap both (≤ 1e12).
- **`/scan_area` radius unvalidated — `src/api/resources.js` 2544.** `radius: 1e9` scans the
  whole system with the T2.5 module. Clamp to module `scan_range` × skill bonus.
- **Legacy `/api/ships` economy still mounted — `src/api/ships.js` + seeded `player_resources`.**
  Build/scrap/designs run the 001-era economy: scrap deletes ANY owned ship (active/stored, no
  guard) paying into legacy `player_resources`; build creates hull-less ghost ships the modern
  client can't render. `/me` still reads `player_resources`. **Fix:** unmount/delete the legacy
  routes; stop seeding + returning `player_resources`.
- **`ship_visual_v` bump is a DB/broadcast amplifier — `src/realtime/presence.js` 441–449.**
  Malicious client incrementing it per tick sustains 10 DB fetch chains + 10 room broadcasts/sec
  forever. Rate-limit descriptor refreshes (min 2s per socket).
- **`presence:pos` admits NaN/Infinity — `src/realtime/presence.js` 414–435.** `typeof === 'number'`
  passes NaN → peers' Hermite interp propagates it (glitched ghosts). Use `Number.isFinite()`.
- **OAuth callback puts the JWT in the redirect URL — `src/api/auth.js` 175.** Lands in history/
  referrer/access logs. Prefer a one-time code exchanged via POST.

### Client behavior

- **Chat yanks readers to the bottom on every message — `ChatPanel.jsx` 355.**
  `key={activeChannel-renderTick}` remounts MessageList per message, resetting sticky-scroll —
  the exact behavior the 30px check was written to prevent. Key on channel only.
- **Closing the planet window mid-scan orphans the scan — `PlanetInteractionWindow.jsx` 3352–3490.**
  `scanning` only clears on body change; on completion with the window closed,
  `orbitalScan(null)` fires and fails (probe handling diverges from the code comment's promise).
  Add `isOpen` to the cancellation paths.
- **Stale `sellQuantities` after partial sale — `PlanetInteractionWindow.jsx` 2718–2789.**
  Surviving stack keeps the old quantity value → next sale submits more than owned. Clamp at
  render + clear on success.
- **Planet banner hardcodes "· Sol System" — `PlanetInteractionWindow.jsx` 210.** Every body in
  all 199 procedural systems is labeled Sol. Interpolate the current system name.
- **Reload-missiles row reads store without subscribing — `PlanetInteractionWindow.jsx` 2619–2625.**
  Fitting/unfitting a launcher doesn't show/hide the row until an unrelated re-render.
- **`fetchShips` has no in-flight sequencing — `gameStore.js` ~359–383.** Concurrent calls
  (hydration, lose-ship, vendor, pod flows) can resolve out of order — an older snapshot clobbers
  a newer one (lost wingman reappears; fresh fit vanishes). Monotonic request id, discard stale.
- **Trade invite toast expiry blocks all future invites — `TradeInviteToast.jsx` 48–52 +
  `utils/trade.js` 52–58.** The local expiry fallback clears the toast but not the singleton's
  `pendingInvite` → every later invite is dropped until reload. Export + call `clearPendingInvite()`.
- **Missing sound file → fresh Howl + HTTP request per `playSound()` — `utils/audio.js` 59–79.**
  A 404'd `weapon_fire` re-fetches several times per second all fight. Retry with cooldown.
- **`response.json()` before ok-check — `utils/api.js` 28–29.** DO edge 502 (HTML body) surfaces
  as "Unexpected token '<'" instead of "server unavailable (502)". Parse text defensively; include
  status in the thrown error. (Also: no timeout/AbortController — a hung request hangs its caller
  forever; `AbortSignal.timeout(15000)` is a one-liner.)
- **Fitted-module tooltip scales inverted stats the wrong way — `utils/itemShape.js` 263–277
  (`normalizeFittedModule`, used by ShipBuilder SlotInfo).** Inline linear math instead of
  `qualityMultiplier`+`STAT_META`: a Q100 module's tooltip shows cycle time *doubled* while
  combat actually halves it; range gets linear instead of sqrt; clamp missing. Route through the
  shared helper like `normalizeItem` does.
- **Reconnect gives up permanently after ~50s offline — `utils/socket.js` 91 + `utils/presence.js`
  282–310.** After 10 reconnection attempts nothing calls `ensureSocket()` again until a system
  change — player sitting in one system stays silently offline. Rebuild from the trailing-flush
  interval or on `reconnect_failed`.
- **DraggableWindow discards user height on resize — `DraggableWindow.jsx` 32–37.** Grow-to-fit
  keeps max width but resets height. Mirror the width logic. (Affects MyShip/MyDesigns only.)

---

## P3 — Cleanup, dead code, hardening

**Server:**
- `sell-resource`/`sell-item`/`wrecks` catch-alls return raw `error.message` (leaks PG internals).
- Only global rate limit (1000 req/15min/IP); no per-endpoint limits on `mail/send`,
  `bounty/post`, `market/order`, `trade/invite` — spam surface.
- Non-UUID `:id` params (mail, bounty, corp invite, market order, deposits) → PG 500 instead of
  400; only `profile.js` guards. Add a shared UUID-regex middleware.
- `src/db/index.js:11` `ssl: { rejectUnauthorized: false }` — pin the DO CA when convenient.
- OAuth links to an existing account by email without checking Google's `verified_email`.
- `combat.js` `claimsByUser` outer map never evicted (bounded by users×systems; acknowledged).
- `sell-resource` `FOR UPDATE` on a JOIN also locks the shared `resource_types` row
  (cross-player serialization on popular resources); `/craft` locks stacks in client order
  (theoretical same-user deadlock).
- `GET /resources/types` endpoints unauthenticated (harmless catalog; inconsistent).
- Socket JWT checked only at handshake — long-lived socket survives token expiry/password change.
- Dead legacy realtime code (confirmed safe to remove): `hub:*` (socketHandler 112–234),
  `mission:*` (240–317), `gameState.hubs/missions`, `leaveHub`, the 20 Hz tick + hub-cleanup
  interval, and the `player_presence`/`is_online` writes (no readers; also carries a kick/refresh
  race that corrupts the row — moot once deleted). Keep: auth middleware, attach* wiring,
  `io.presence`.
- `/repair-cost` dead endpoint (already in STATUS known issues).

**DB / migrations:**
- Reset-account footnotes (pitfall #17 list otherwise in sync through 065): legacy
  `player_resources` never reset (stale legacy currencies survive); `activity_events` survives
  reset (Top Crafters rank persists through a "fresh start" — decide + comment intent);
  **market/bounty escrow loophole**: park items/credits in open orders → reset → cancel to
  recover on the fresh account.
- FK `ON DELETE` gaps blocking any future user hard-delete: `chat_messages.sender_id`,
  `corporations.founder_id`, `mission_instances.leader_id` (NO ACTION). Fix when user deletion
  becomes real. `activity_events.user_id` CASCADE would seq-scan without the index fix above.
- Missing CHECK constraints on code-assumed enums: `chat_messages.channel_type`,
  `harvest_sessions.status`, `deployed_harvesters.status`, `ships.location_type`.
- `crew_members` / `research_queue` never written by any code — drop-migration candidates.

**Client:**
- Immer landmine: `gameStore.spendResource` (~342–348) both mutates draft and returns a value —
  first future caller throws. No current callers.
- Dead code: `App.jsx` `QuestToast` (`questNotification` never set); `InventoryWindow` 319–334
  (11 unused layout vars); `ResourceBar.jsx` + `Toolbar.jsx` (only imported by unreferenced
  `app-backup.js`); `StarShipperMockupV5/V6.jsx` (~1,900 lines); `SystemView.jsx.backup`.
  Delete or move out of `src` — they pollute greps and audits.
- Zustand persist: no `version`/`migrate`; custom `serialize`/`deserialize` Set handlers are dead
  (deprecated in v4, removed in v5). Add `version: 1`.
- `utils/chat.js` `messages` Map grows one channel per visited system, never pruned (200 msgs
  each). Evict in `resetSystemChannel()`.
- `chat.js` + `activity.js` hand-roll fetch + API_URL instead of `api.js` `request()` — any
  future 401/timeout fix won't cover them.
- `recordVisit` fired from inside an immer producer (gameStore ~272, ~663) — move after `set()`.
- `completeQuest` swallows errors to console only (siblings toast).
- `shipsAPI` vs `fittingAPI` overlap (`renameShip` in both) — consolidate.
- Client presence `peers` map: `ts === 0` ghosts never swept (mirror of the server P1; slow leak).
- `socket.js` blanket `socket.off(event)` on rebind would strip bus lifecycle handlers if a
  module ever subscribes to `'kicked'`/`'disconnect'` via `onSocketEvent` — off per-fn instead.
- Audio: sweep sonar `setTimeout`s not cleaned up (pings play over galaxy view after warp-out,
  SystemView 2186–2189); `mining_laser` loop has no unmount stop (1765–1768 — add to cleanup).
- Missile lock ring reads unscaled `lock_time` while the firing gate uses the quality-scaled
  value (SystemView 4697 vs weapons.js 155) — ring lies for high-q launchers. Also
  `weapons.js:155` computes `lock_time = NaN` for laser/kinetic (harmless today, landmine).
- Enemy fleets >5 ships overlap formation slots (`fleetEntities.js:87` — FORMATION_OFFSETS has
  5 entries; Sol's 6-ship zones stack two wingmen). Extend/derive offsets.
- `SystemMapWindow` `SOL_SYSTEM` is a hand-copy of SystemView's (values match today) — export
  from one module.
- GalaxyFlightView arrival fires `enterSystem` once per frame until unmount (idempotent today) —
  one-shot `arrivedRef`.
- Leftover `console.log('🚀 Docked at:')` on every dock (SystemView 2589); redundant `sweepTick`
  1s repaint (1481); commented-out wreck polling block (2225–2237).
- Raw-px font stragglers (ignore UI font scale): `PlanetInteractionWindow.jsx:1468`,
  `InventoryWindow.jsx:476–478`, `CraftingWindow.jsx:639` — all cargo-tile glyphs.
- Cargo-panel duplication is **6** implementations, not 4: the known four plus TradeWindow's
  `StackTile` and VendorTab's sell list (CraftingWindow also re-declares `RESOURCE_ICONS`/
  `TIER_BORDER`). Strengthens the planned shared `<CargoPanel>` extraction.
- `WindowDock` title map stale (lists windows that no longer use DraggableWindow); its
  bottom-center slot collides with the Toaster (toasts render over docked buttons).
- Skills window header hardcodes "Training Queue (n/10)" — real cap is dynamic `maxQueue`
  (shows "3/10" to a new player whose cap is 3). `SkillsResearchWindow.jsx:485`.
- DepositCard hardcodes "Start Mining (50/hr)" while the rate is server-driven
  (`PlanetInteractionWindow.jsx:735`) — currently ALSO wrong because of the 72× DEV rate above.
- Vendor Supplies list hardcodes prices client-side, duplicating server `SUPPLIES_CATALOG`
  (drift shows one price, charges another). `PlanetInteractionWindow.jsx` 2118–2124.
- CorpWindow invite success is silent → users double-invite. One toast.
- ActivityTicker expanded panel doesn't subscribe to new events (updates only on the 30s tick).
- Stale comments: `GameFrame.jsx:496` references the removed BottomBar; `LeaderboardsWindow.jsx`
  66–68 claims a ModalOverlay it no longer uses (its catalog fetch also fires at login for every
  player regardless of window use).

---

## Game balance / tuning (owner-flagged, 2026-09-02)

Not bugs — economy/progression design work. Both need a numbers pass with live playtest
feedback, and both touch the same lever: how fast players climb tiers.

1. **Research Point curve vs. tree depth.** RP accrual (1 RP/min base, +5%/level from
   Research Methodology) outpaces the tech-tree costs — deep research unlocks too easily.
   Rework the RP-cost curve so descending the tree takes meaningfully longer per tier
   (steeper node costs at T3+/T4+, or slower effective accrual, or both). Values to touch:
   `tech_definitions` RP costs (migrations 031/053/055/062 — currently up to 2400/6000 RP at
   tier 4), the 1 RP/min trickle in `api/research.js`, and the `rp_rate_pct` bonus contract.

2. **Resource value / collection time vs. item value — full progression curve.** Balance
   what resources are worth (base_price, rarity spawn rates), how long they take to gather
   (mining yield, harvester rates — note the 72×→50/hr fix already landed), and what items
   cost to buy/craft, so that: early progression is slower than today (but not grindy),
   higher-tier items take meaningfully longer to reach, and each step still feels rewarding.
   Related knobs: recipe ingredient quantities, vendor buy/sell prices + the 50% vendor
   spread, T3+ craft-only gating, exotic spawn rates (danger-scaled since the zoning pass),
   loot payouts (client `fleetEntities.js` + server `pirateManifest.js` — pitfall #16: change
   together). NOTE: the Sol "TEST BUFF" pirate-spawn block (watch item below) should probably
   revert as part of this same pass.

---

## Watch items (not bugs today)

- **Sol "⚠ TEST BUFF (2026-06-03)" in `PIRATE_SPAWN_ZONES` (`SystemView.jsx:55–58`)** — when
  reverted, `server/src/game/pirateManifest.js:107–118` MUST be re-mirrored in the same pass or
  Sol loot claims break (pitfall #16).
- STATUS.md corrections found during audit: market rows are NOT retained "for 60s post-completion"
  (never deleted); the ticker growth note understates urgency because leaderboards/profiles
  aggregate over `activity_events`.

---

## Verified clean (audited, no issue)

- **Sync-copies (pitfall #16): CLEAN.** Server `galaxyGenerator.js` byte-identical to client
  (header comment only); `pirateManifest.js` matches the client RNG stream call-by-call (Sol +
  procedural), hull constants, flagship rule, and `FLAGSHIP_FLEET_BONUS_FRAC`.
- Angle conventions consistent everywhere (thrust/target no offset; all SVG +90; all four
  formation bases match). Rendering reads `gameTimeRef`, never React frame state.
- Fleet-wide module gates (pitfall #15) clean client-side and on all capability endpoints —
  the ONE violation is `getPlayerCargoInfo` (listed in P2).
- No pitfall #14 (`FOR UPDATE` on LEFT JOIN) violations. All SQL parameterized — no injection.
- Socket auth solid (identity from verified JWT, never from payloads); presence/chat rate limits
  + fleet payload caps enforced server-side; presence map eviction correct except the P1 race.
- DraggableWindow prop names, hull-shape single-source, no hardcoded localhost, drag-drop
  JSON.parse all guarded.
- Hot-path DB indexes adequate (ships, inventory stacks, market, bounties, chat, visits);
  no `CREATE EXTENSION`/`uuid_generate_v4()` anywhere.
- Trade in-memory sessions: restart-safe (no escrow held), timers consistent, undock auto-cancel
  fires on undock/disconnect/kick. (The two trade P0s are the exceptions.)
- Presence interp clock domain consistent (client receive-time stamping); hydration ordering
  correct on login/register/reset; chat/activity/toast buffers bounded as documented.

---

## Suggested attack order

1. **Economy hardening pass (all six P0s + starter kit + craft negatives + harvest rate)** —
   one deploy. Server-only, no migration.
2. **Server stability**: auth middleware try/catch + pool error handling + skills queue lock.
3. **Client session robustness**: socket `connecting` fix + logout teardown + 401 handling
   (one small PR, fixes four P1/P2s in two files).
4. **Migration repair** (003/011 harvesters) + `activity_events` indexes + lazy expiry
   enforcement (market/bounty) — one migration (066) + small server diffs.
5. **UI correctness batch**: toolbar overlap, FleetWindow refresh, double-click guards,
   chat scroll, sell quantities, Sol label.
6. **Perf pass**: SystemView allocation hotspots + galaxy-flight 60 Hz persist +
   SystemMapWindow mount-gate (directly attacks the known slowdown).
7. P3 cleanup opportunistically alongside whatever files each pass touches.
