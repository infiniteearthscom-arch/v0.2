# Refining — v2 (base refineries, timed + queued)

Rebuilt 2026-09-25, migration 086, after the owner's direction: refining should require a base and a CRAFTED refinery building, the refinery should get better with crafted quality, and jobs should be timed and queueable so there is something to manage.

## Rules

- **Where:** only at a base you own, while docked at its planet, with at least one **Base Refinery** fitted. Stations and cities no longer refine.
- **The building:** `base_refinery` is craft-only (Titanium 120, Copper 80, Crystite 30, Iron 100), gated by **Ore Refining** research. Its crafted quality is the machine's grade: Q100 gives +10 % yield, +10 to the quality cap and 1.5× speed over Q50. Each fitted refinery is a **lane**; a base can hold up to 3 (Station tier).
- **A job:** N units of one cargo stack → `floor(N × yield)` units at `min(cap, Q + gain)`, every stat shifted equally. Yield 0.65 + Processing skills + module bonus (max 0.92); gain 8 (+4 Deep Refining); cap 75 (95 Deep) + Metallurgy on ores + module bonus.
- **Time:** `(30 s + 0.8 s × units) ÷ speed`, Smelting −5 %/level. 200 units ≈ 3 min at Q50, 2 min at Q100.
- **Cost:** 1 Fuel Cell per 100 units (ceil), taken from cargo at enqueue. No credit fee.
- **Queue:** up to 6 jobs per lane; times are fixed at enqueue (a job starts when the lane's previous job ends), so no cron. Jobs that have not started can be cancelled for a full refund and the lane's later jobs pull forward.
- **Collect:** finished jobs are collected while docked, to cargo (room check) or the base depot (capacity check). Collecting completes the Grade Up onboarding quest.

## API (`/api/refining`)

`GET /status` (lanes + jobs with phase waiting/running/done and progress, fuel cells in cargo) · `GET /quote?inventory_id&quantity&lane` · `POST /queue {inventory_id, quantity, lane?}` · `POST /jobs/:id/cancel` · `POST /jobs/:id/collect {to}`.

## UI

Base tab → REFINERY card: lanes with their crafted Q, running job progress bars, queue with countdowns, TO CARGO / TO DEPOT on finished jobs, CANCEL on waiting ones; queue form with stack picker, units, lane choice and a live quote (out, Q in→out, time, fuel).

## Next

- A tier-3 Industrial Refinery module (two jobs at once, or bulk lanes).
- Tier refining (commons into rare-grade products) as recipes on the same job system.
- Fuel from the depot instead of cargo; by-products (slag) as a low-value output.
