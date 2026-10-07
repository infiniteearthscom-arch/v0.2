# Jump Gates — Lanes, Alignment, Journeys, Islands, and Late-Game Warp

> **Status:** BUILT 2026-10-07 (all four phases, one push; migration 095 pending the owner's console step). Drafted 2026-10-07 after the owner verified that flying to a gate by hand today just opens galaxy flight with the lanes ignored. Makes gates the primary way to move in the early and mid game, with time and risk per hop, and turns free warp into a late-game capability.
> **Owner direction (2026-10-07):** gate dock opens a lane picker with a small map (current system centred, lanes and neighbours drawn, pick from list or map); a fleet alignment timer before every jump, as a risk factor at guarded gates and a hook for future cloaking; multi-gate journeys that align and jump at every hop; galaxy-map lines must be the real lanes; some outer-rim systems unreachable by gate (internal gates only), giving warp drives real value; warping becomes a much later mechanic so the early game cannot bypass gates.
> **Already true today (verified):** the galaxy map and flight view draw lines from `jumpConnections`, which are the actual lanes, fog-gated to lines with at least one discovered endpoint. No change needed there beyond the legend in §4.

---

## 1. What exists today

| Piece | Where | Today |
|---|---|---|
| Gate body per gated system, Warp Point in every system | `galaxyGenerator.generateSystemContent` | gate at outer orbit + 200, warp point + 400 |
| Lane network | `galaxyGenerator` step 2 (client + verbatim server copy, pitfall #16) | spanning tree over tier-adjacent pairs + ≥3 frontier links per tier pair + 15 % redundancy; every system gate-reachable from Sol |
| Travel rules | `utils/warp.js` ↔ `server/src/game/warp.js` (pitfall #18) | gate = instant, tier ≤ class + 2; free warp = ring by engine class, tier ≤ class + 1; class 0 (no engine) still warps 600 |
| Gate dock | `SystemView` dock handler | with a pending map target: instant jump; otherwise galaxy flight, lanes ignored |
| Map "Jump to" / route planner | `GalaxyMapWindow`, `utils/routePlanner.js`, SystemView route-follow effect | sets pending target, autopilots to the gate, instant hop on dock; route advances per hop |
| Server validation | `POST /galaxy/visit` | allows gate-connected OR in-ring; never asks which exit was used |
| Contracts | `game/contracts.js` `bfs` / `pathBetween` | gate BFS for hops, danger and ambush placement |
| Skills | `nav_jump_calibration` (+5 % ring, wired); `nav_warp_drive`, `nav_warp_efficiency`, `nav_evasion` (unwired) | the two Warp Drive Operation rows are stubs |
| Research | `tech_warp_theory` (placeholder), `tech_capital_drive` (placeholder), `tech_high_energy` (Plasma Drive) | Warp Theory unlocks nothing |
| Hull agility | `hull_types.base_maneuver` | fighter 95, scout 85, shuttle 70, frigate 55, freighter 35, prospector 35, excavator 25, leviathan 12, capital 10 |

---

## 2. The lane picker (gate dock)

Docking at a Jump Gate opens **`GateWindow`** instead of galaxy flight. Galaxy flight is reached only from the Warp Point (and only with a warp core, §6).

**Left: lanes list.** One row per connected system: name (or "Unknown" if undiscovered), region tier badge, danger stars, Threat faction and nest tag when the region is discovered (Phase C data), and the lock state from the gate tier rule (`tier ≤ driveClass + 2`): locked rows show "needs drive class N". Selecting a row selects the lane. A plotted route pre-selects its next hop.

**Right: lane map.** An SVG with the current system at the centre. Connected systems sit at their true bearing and relative distance, scaled so the farthest fits; lanes are drawn as lines. Second-ring neighbours (connections of connections) appear as faint dots and thin lines so the player sees which way the network continues; undiscovered systems are grey dots. Clicking a node selects that lane. The compass bearing to Sol is marked so "inward / outward" reads at a glance.

**Footer.** The selected system's summary, the fleet's alignment time (§3), and **ALIGN & JUMP**. "Plot a course…" opens the galaxy map with this system selected. Escape or undocking closes the window with no jump.

Window registration: `windows.gate` in `gameStore`, opened by the dock handler, closed on jump or undock. The pending-jump plumbing stays as the single jump path: the picker sets `pendingJump` and triggers alignment.

---

## 3. Fleet alignment

Every jump takes time. From **ALIGN & JUMP** the fleet holds position at the gate while a timer runs; at zero the fleet jumps along the lane.

**Duration.** Per ship: `ALIGN_BASE + (100 − base_maneuver) / 100 × ALIGN_SPAN` with `ALIGN_BASE = 2 s`, `ALIGN_SPAN = 10 s`. Fleet time = slowest ship + `0.5 s` per additional active ship. A solo fighter aligns in about 2.5 s, a capital in about 11 s, a five-ship mining fleet with a Leviathan in about 13 s. A skill shortens it (§7).

**Rules while aligning.**
- Any thrust input cancels the alignment (same lever as orbit lock).
- Taking a hit on the fleet pool adds `ALIGN_HIT_PENALTY = 0.25 s`, capped at `+6 s` per alignment ("alignment disrupted" toast). Owner (2026-10-07): 1.5 s per hit would be a death sentence at current combat balance; 0.25 s keeps a camp meaningful without making it lethal. Lever to revisit with balance.
- Undocking from the gate, docking elsewhere, or the pod state cancels it.
- Visuals: a progress ring around the gate body, "ALIGNING 7.2 s" in the HUD readout, a rising hum; the jump itself keeps the existing warp sound and system transition.

**Arrival.** The fleet appears at the destination's gate body as today. No arrival grace in v1: a camped gate is dangerous on both ends by design. Cloaking (later tech) grants `N` seconds of arrival and departure invisibility to enemy aggro; the hook is a single `cloakUntil` on the player fleet checked by the aggro test.

**Server.** Alignment is client-side feel; the server keeps validating each entry against `last_system_id` as today. Because gate entry is unchanged server-side, Phase A deploys with no migration.

---

## 4. Multi-gate journeys

The route planner already produces hop lists. Changes:
- Each hop is a real hop: autopilot to this system's gate, dock, align, jump, arrive at the next gate, repeat. Journey time is the sum of flight plus alignment per hop.
- The gate window opens on every hop with the route's next hop pre-selected. An **Auto-jump along route** toggle (default ON for plotted routes, remembered in localStorage) starts alignment on dock without a click; the player can still cancel with a thrust key. Alignment is always visible: the progress ring around the gate body plus a small timer bar in the HUD (owner: "some sort of animation or small timer bar").
- The HUD route strip (queued since Phase 3b) ships here: "Hop 3 / 7 · Pale March · aligning 4.1 s" with a cancel.
- Route planning uses gate hops only unless the fleet has a warp core (§6); warp hops are shown as a separate dotted segment as today.
- Galaxy map legend gains two entries: solid grey = gate lane, dotted cyan = route preview / warp hop. Lanes leaving a discovered system toward undiscovered ones draw faint, so exits are visible before the far end is known.

**Guarded gates.** The server manifest places one patrol per system of danger ≥ 3 with its patrol centre near the gate body (`enemyManifest.buildProcedural`: fleet 0's `patrolCenter` = gate position ± 120 when the system has a gate). Combined with alignment, arriving fleets face a fight they cannot instantly leave. Nest regions place two.

---

## 5. Islands — rim clusters with no lane in

Generator step 2 gains a final pass, mirrored verbatim on the server:
- `ISLAND_REGIONS = 2`: the two highest-tier regions that are not Core Worlds and not a faction nest (so the Hive Nest and Forge Choir stay gate-reachable at class 3). Deterministic by tier then region hash. Owner: two is fine until an end-game T6 faction arrives.
- Every lane between an island region and the outside is removed. Lanes inside the island are kept, and if removal left the island disconnected internally, a spanning tree is rebuilt inside it.
- The frontier guarantee (≥3 links per tier pair) is recomputed excluding island regions so the main network keeps its chokepoints.
- Islands are reached only by free warp (§6), which is the warp drive's value.

**Knock-on effects (all deterministic, no DB change):**
- Contracts: `bfs` cannot reach island ports, so they offer and receive nothing until warp. Island stations later get their own local boards (not v1).
- Route planner: island targets need a warp hop; the map says "No gate lane — needs a warp core".
- Positions, stars, regions, bodies, bases and harvesters are untouched; a handful of Jump Gate bodies disappear in island systems, as happened in 073.
- `sim:factions`-style dry run prints island regions and confirms every non-island system is still gate-reachable from Sol.

---

## 6. Warp as a late-game capability

Free galaxy flight requires a **Warp Core** fitted anywhere in the active fleet (fleet-wide, pitfall #15; stored ships never count).

- New module `utility_warp_core_3`: utility slot, tier 3, **craft-only** (Helium-3, Plasma, Titanium, Copper), gated by `tech_warp_theory`, which stops being a placeholder and unlocks it. Three rows per pitfall #19. A tier 5 **Deep Warp Core** later extends range; not v1.
- Range stays `WARP_RANGE_BY_CLASS[driveClass]` by engine class, stretched by Jump Drive Calibration. Without a core: no ring at all. The Warp Point still exists as a body; docking there without a core shows "No warp core fitted — this fleet travels by gate" and nothing else.
- Server: `getFleetWarpProfile` reads fitted modules for the core; `warpCheck` returns `reason: 'core'` when free warp is attempted without one. The galaxy map's Fly To and Warp To buttons gate on it with the same text.
- **The pod always has a warp core** (owner 2026-10-07). A podded pilot can warp home from an island; any active fleet without a fitted core travels by gate only. No migration-time grant is needed — a pilot who is podded in an island simply warps out.
- **Island vendors sell the Warp Core** at a prohibitive price (`ISLAND_CORE_PRICE`, start at 250,000 cr): a pilot standing in an island station reached the island with a core, so the vendor is a safety net, not a shortcut. Vendors elsewhere do not stock it; craft-only there for now. The owner expects the warp mechanic to grow with the specialisation trees — the module's sourcing may change.
- Tutorial check during the build: confirm no onboarding quest requires free warp (the chain goes Sol → Luna → asteroids → harvester → contracts; "Dig Site" and "Something on the Band" can be done in Sol).

---

## 7. Skills and research

- **Warp Drive Operation** (`nav_warp_drive`, currently "+10 % warp speed", unwired) → **Fleet Alignment**: `align_time_pct` −8 % per level, 5 levels; applied to the fleet alignment time. Text + bonus rewrite in the migration; the client reads the bonus type and adds it to `WIRED_BONUS_TYPES`.
- **Jump Drive Calibration** stays as is and joins `WIRED_BONUS_TYPES` (it was wired but shown as catalog-only).
- **Warp Theory** → unlocks the Warp Core. **Capital Drive Theory** stays a placeholder for the Deep Warp Core.
- The second "Warp Drive Operation" row (`nav_warp_efficiency`, "−10 % capacitor cost per warp") is renamed **Warp Core Tuning**: +4 % free-warp range per level, bonus `jump_range_pct` so it stacks with Calibration. Text-only change.
- Cloaking is a later research node off Warp Theory; not in this spec beyond the `cloakUntil` hook.

---

## 8. Build order

| Phase | Scope | Needs migration | Est. |
|---|---|---|---|
| **A. Lane picker + alignment** | `GateWindow` (list + lane map), dock handler opens it instead of galaxy flight, alignment timer with cancel / hit penalty / HUD ring, `align_time_pct` read (zero until the skill row changes), map legend | no | 1 session |
| **B. Journeys + camps** | per-hop gate window with auto-jump toggle, HUD route strip, gate-camp patrol placement in the manifest (server, no schema) | no | ½–1 session |
| **C. Islands** | generator pass in both copies, frontier recompute, route planner / map messaging, contracts check, dry-run script | no | ½ session |
| **D. Warp Core gating** | module rows + Warp Theory unlock + skill rewrites + stranded-pilot grant (**migration 095**), server profile `hasWarpCore`, warp point behaviour, map button gating | **yes** | ½ session + console step |

A, B and C are safe to push while the owner is remote. D's code can be written early behind a schema probe (the module row's absence means "feature not live"), but the simplest plan is to push D last and run 095 at the end of the session.

---

## 9. Settled with the owner (2026-10-07)

1. Alignment: 2 s + up to 10 s by agility; **+0.25 s per hit**, capped at +6 s (1.5 s judged lethal at current balance).
2. Auto-jump along a plotted route: **ON**, with a visible ring + timer bar.
3. Islands: **two**, never a nest, until an end-game T6 faction exists.
4. Warp Core: **craft-only** outside islands; island vendors sell it at a prohibitive price. Warp intricacies to be revisited as the specialisation trees grow.
5. Stranding: **the pod carries a warp core**; no migration grant. Fleets without a fitted core are gate-bound.
