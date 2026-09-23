# Refining (quality) — v1

Built 2026-09-22, migration 081. Station / city service: a resource stack goes in, fewer units come out at a higher quality, for a credit fee.

## Why

Quality is the lever the whole economy reads (vendor curve, crafting output, contract quality floors), but until now the only way to get high-Q ore was to find it. Refining lets a pilot manufacture quality from bulk, at a real cost, and finally gives the Processing skills something to do.

## Rules

```
units_out   = floor(units_in × yield)
yield       = min(0.92, 0.65 + reprocessing_yield_pct/100 + (ore ? metal_refining_pct : 0)/100 + (common ? common_ore_refining_pct : 0)/100)
quality_out = min(cap, quality_in + gain)         every stat shifted by the same delta, clamped 0–100
gain        = 8   (+4 with Deep Refining)
cap         = 75  (95 with Deep Refining) + 1 per Metallurgy Refining level on ores, max 100
fee         = ceil(units_in × base_price × 0.15)  credits, paid up front
min input   = 5 units; refuses if the stack is already at the cap
```

Gates: docked at a station or a city planet; `tech_refining` (Industry T2, 450 RP, after Advanced Mining) unlocks the service; `tech_deep_refining` (Industry T3, 1 500 RP) adds the gain and cap bonus.

Skills wired (bonus contracts already in the catalog): `prc_reprocessing` (+3 % yield / level), `prc_reprocessing_eff` (+2 %), `prc_metallurgy_refining` (+2 % yield and +1 cap on ores), `prc_ore_specialty` (+2 % on commons).

## No credit loop

Vendor prices follow a steep quality curve (Q90 ≈ 2.56 × Q50), so the loss and the fee have to beat it. Iron, base 10 cr, Q50 → Q90 needs 5 passes at base skills: yield 0.65⁵ ≈ 0.12, fees ≈ 5 × 0.15 = 0.75 × base per input unit. Sale value 0.12 × 12.8 cr ≈ 1.5 cr per input unit against 5 cr raw and 7.5 cr of fees: a big loss. At MAX skills (yield 0.92, cap 100, gain 8): 0.92⁵ ≈ 0.66 → 8.4 cr of ore, minus 7.5 cr fees, versus 5 cr raw: still a loss. Refine for crafting and contracts, not for the vendor.

## API

- `GET /api/refining/quote?inventory_id=&quantity=` → `{ unlocked, deep, stack, quote {units_in, units_out, yield_pct, fee, quality_in, quality_out, cap, gain, reason} }` (or `{ unlocked: false, requires_tech, tech_name }`).
- `POST /api/refining/run { inventory_id, quantity }` → consumes the input, charges the fee, merges the output into cargo (`addResourceStack`, same stat-tuple merge as everything else).

## UI

Station / city → **Refinery** sub-tab: cargo stack list (quality tier colored), units-in slider, live quote, REFINE. Locked state deep-links to the research node.

## Next (not built)

- **Tier refining**: turning commons into a rare-grade product ("Titanium Alloy", "Crystite Lattice") as new `resource_types` rows with their own base_price, driven by a `refining_recipes` table. Nothing consumes such products yet, so it waits for recipes that want them (station modules, tier-4 crafts).
- Timed batches / a refinery module on player stations (the station plan's Phase 1 refinery becomes "your own refinery, no fee").
