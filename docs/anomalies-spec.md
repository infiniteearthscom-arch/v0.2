# Anomalies & Archaeology — v1 (cosmic signatures)

Built 2026-09-23, migration 083. The exploration loop: **detect → probe → pin → fly → investigate**, with the Astrometrics and Exploration skills (inert since the catalog shipped) doing the scaling.

## Sites

Every system hides 0–3 signature sites per **daily bucket**, seeded from the system seed (`sitesFor(systemId, bucket)`): count by region tier (T1 0–1 … T5 3), type weighted and tier-gated, a position 500 units out to just beyond the outer orbit, and a `guarded` flag (0 % at T1 → 90 % at T5). Same sites for every pilot; progress is per pilot per bucket, so the galaxy refreshes every day.

| Type | From tier | Reward |
|---|---|---|
| Gas Pocket ☁ | 1 | 40–90 × tier units of a gas (Hydrogen … Plasma / Dark Matter by tier) at Q60–85 |
| Derelict Hulk ⚓ | 1 | credits (600 × tier-scaled), 60 % + Salvaging bonus chance of a module drop (tier ≤ site tier), some Iron/Titanium |
| Data Vault ▣ | 2 | research points (60 → 1 400 by tier, + Data Analysis), credits |
| Relic Cache ◈ | 3 | Ancient Alloy / Quantum Dust / Void Essence, 35 % + Relic Analysis chance of a module up to tier+1 (× 2 with Xenoarchaeology); **tier IV+ caches need Xenoarchaeology** |

Rewards roll server-side from `hash(pilot, system, site, bucket)` — no re-roll fishing.

## Probing

Needs a **Signature Probe Launcher** fitted anywhere in the active fleet (utility, T2, 7 000 cr or crafted; research **Signature Analysis**, Society T2). Each probe cycle (20 s × cycle-time skills: Survey Probing −5 %/level, Astrometric Acquisition −5 %/level) tightens a position estimate: a circle of radius `700 × (1 − cycles/needed)` (Astrometric Pinpointing −5 %/level), jittered per pilot. Three cycles pin the site (two with Astrometric Rangefinding at +20 %). Cycle timing is enforced server-side per site.

## Investigating

Fly within 90 units of the pinned position (FLY TO sets an autopilot target of type `anomaly`) and INVESTIGATE. Guarded sites hand back a raider fleet of the site's tier, built by the same `buildAmbushFleet` the contested hauls use; the client spawns it 320 units out already in `chase`, and its loot claims validate through the per-pilot ambush index.

## API (`/api/anomalies`)

`GET /system/:id` (sites with my progress, estimates, pinned positions, `has_launcher`, `cycle_seconds`) · `POST /probe {system_id, site_index}` · `POST /resolve {system_id, site_index, x, y}`.

## UI

Toolbar **🔭 Signals** window: sites in the current system with PROBE (cooldown countdown) / FLY TO / INVESTIGATE; SystemView draws pinned sites (type glyph) and the shrinking estimate circles; ticker `anomaly_resolved`.

## Next (not built)

Hacking mini-game for vaults / relics (the "virus coherence" contracts are read as flat bonuses for now); site-specific hazards; a Deep Probe Launcher tier; blueprints as relic rewards once blueprint research exists; signatures visible on the galaxy map for systems you have a Telemetry Grid in.
