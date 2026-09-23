# Contract Board — Hauling (v1)

Spec written 2026-09-22. Built the same day (migration 078). This is the framework that find-resource and bounty contracts will land on next.

## Goal

Give pilots something to do besides mining that pays a little more than mining per minute of play, because it is harder: it needs cargo capacity, route planning, a deadline, and it exposes the run to failure (deadlines, warp-range gating, pirates on the route). Note: in v1 the sealed container is an ITEM stack, and wreck ejection only drops resource stacks — freight survives a podding. Ejecting it is a one-line follow-up in lib/wrecks.js if playtest wants harder stakes.

## Design rules

1. **Procedural, deterministic, server-authoritative.** Every station rolls its board from `hash(system id, station name, time bucket)`. All players see the same offers at the same station; the board refreshes every `BOARD_BUCKET_HOURS` (4 h). Rewards are computed on the server from the seed and never trusted from the client.
2. **Stations only.** A "port" is any body of type `station` in a system (Sol = Luna Station). Cities are not ports in v1.
3. **Pay scales with four things** — volume, hop distance on the gate network, the most dangerous region tier crossed, and the deadline.
4. **Player scaling comes from the Trade tree.** `trd_contracting` (Contracting): contract tier cap = 1 + level, active-contract cap = 2 + level. `soc_negotiation` (Negotiation, already in the catalog as `mission_reward_pct`): +5 % payout per level.
5. **Worth a little more than mining.** Calibrated so a same-tier haul run beats an equal-length mining-and-sell loop by roughly 30 % per minute, while a starter scout can only take the small parcels.

## Generation

Per station, per bucket, `BOARD_SIZE` (7) offers, index `i`:

| Field | Rule |
|---|---|
| tier | weighted around the origin region tier: `clamp(regionTier + pick(-1, 0, 0, +1), 1, 5)`; tier-1 systems always get at least two T1 offers |
| destination | a port in another system whose gate-hop distance from the origin is in the tier's band: T1 1–2, T2 2–3, T3 3–4, T4 4–6, T5 5–8 (nearest band if empty) |
| volume | T1 40–80 · T2 100–200 · T3 250–450 · T4 500–900 · T5 900–1500 cargo units |
| rush | 30 % of offers: deadline × 0.6, pay × 1.4 |
| deadline | `8 + 5 × hops` minutes from acceptance (× 0.6 if rush) |
| cargo label | flavor text from a per-tier list (medical supplies, reactor parts, survey data cores, …) |

Hop distance = BFS over `jumpConnections` (the gate network is a spanning tree plus frontier links, so every port is reachable). Danger = the highest `regionTier` on that BFS path.

## Reward

```
reward = volume × RATE[tier] × (1 + 0.25 × hops) × DANGER[maxTierOnPath] × (rush ? 1.4 : 1)
RATE   = {1: 22, 2: 25, 3: 28, 4: 30, 5: 32}         credits per cargo unit -- nearly flat: volume + distance carry the scaling
DANGER = {1: 1.0, 2: 1.2, 3: 1.45, 4: 1.75, 5: 2.1}
payout = reward × (1 + mission_reward_pct / 100)   (Negotiation skill, applied at delivery)
```

Reference points (Q50 vendor prices): a starter mining Iron nets ~250 cr/min after travel and selling; a T1 haul of 60 units over 2 hops pays ~1.9 k for a ~6-minute run (≈ 320 cr/min). A T3 haul of 350 units over 3 hops through tier-3 space pays ~25 k for a ~10-minute run, against ~3 k/min for a rare-ore miner with a T2 laser (cargo-limited). Galaxy-wide dry run (all 148 ports): average offer T1 ≈ 2.2 k, T2 ≈ 8 k, T3 ≈ 32 k, T4 ≈ 88 k, T5 ≈ 210 k. The first tuning pass had multiplicative hop × danger factors that put T5 at 1.4 M -- keep the multipliers soft.

## Flow

- **Board** (`GET /contracts/board`): the server reads the docked body from presence, resolves it to (system, station), regenerates the board, and marks offers the pilot already holds. Includes `limits {tier_cap, active_cap, active_count}`.
- **Accept** (`POST /contracts/accept {contract_key}`): must be docked at the origin; tier ≤ cap; active < cap; cargo space ≥ volume. Inserts a `sealed_cargo` item stack (quantity = volume, 1 volume per unit, `item_data {contract_id, label, dest}`) and a `player_contracts` row.
- **Deliver** (`POST /contracts/:id/deliver`): must be docked at the destination with the full sealed stack still in cargo. Past the deadline → status `failed`, cargo removed, no pay. Otherwise pays and marks `delivered`.
- **Abandon** (`POST /contracts/:id/abandon`): removes the sealed cargo, status `abandoned`, no penalty in v1.
- **Mine** (`GET /contracts/mine`): active contracts with time left; anything past its deadline is marked `expired` and its cargo removed.

## UI

- Station → **Contracts** sub-tab: the board (label, destination, hops, tier, volume, reward, deadline, Accept) and My Contracts (time left, Deliver here / Abandon).
- Galaxy map: a `📦` marker on every destination system with an active delivery and a "Deliveries here" row in the info panel; Plot course does the rest.

## Find-resource contracts (`type = 'fetch'`, migration 079)

Each port adds `FETCH_SIZE` (3) offers after its hauling offers: "bring N units of X at average quality ≥ Q, turn in here". Resource pool by tier = vendor base-price band (T1 ≤ 30 cr commons … T5 exotics); quantity bands T1 60–150 · T2 100–250 · T3 120–300 · T4 20–60 · T5 15–40; quality floor T1 none, T2 40–55, T3 50–65, T4 55–70, T5 65–80. Pay per unit = the vendor's sell price for that resource **at the floor quality** × `FETCH_PREMIUM` {1.6, 1.8, 2.0, 2.2, 2.5} — always better than mining and vendoring the same ore, because you have to find it and carry it back. Deadlines 90–240 min. Accepting stores no item; turn-in consumes qualifying stacks lowest-quality-first and refuses partials. Board and My Contracts show "you have N" so the pilot knows when to head back.

## Contested hauls, freight at stake, HUD (no migration, 2026-09-22)

- **Contested hauls.** 25 % of tier ≥ 2 hauling offers are flagged `contested` (pay × 1.5, red CONTESTED badge). When the pilot carrying one enters any system on the gate path other than the origin, `POST /combat/enter-system` appends a per-user raider fleet (same tier, built from the template catalog by `buildAmbushFleet`) to the manifest with `manifest.ambush`; the client places it ~320 units from the arrival point already in `chase` and toasts the ambush. Once per contract (in-memory `ambushDoneByUser`; a server restart may allow a second). Their loot claims validate against a per-user index alongside the system's claim index.
- **Freight at stake.** Podding now ejects every sealed-cargo stack into the flagship wreck (`ejectItems`); reclaiming the wreck restores the stacks with their contract id intact, so the haul can still be delivered before the deadline. `GET /contracts/mine` reports `freight_units` and the UI shows "freight lost — reclaim your wreck" instead of a Deliver button.
- **HUD.** Active contracts render as tiles in the pinned-quest stack (destination, minutes left, reward, have N/M for fetches), refreshed by `ContractsPoller` every 60 s and on every accept / deliver / abandon; 📦 markers also show in the in-flight galaxy view.

## Not in v1 (next on this framework)

- Bounty contracts verified against the loot-claim record.
- Reputation / faction standing per port; failure penalties.

## Levers

All constants live at the top of `star-shipper-server/src/game/contracts.js`.
