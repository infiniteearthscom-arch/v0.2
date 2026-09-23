// pricing.js -- vendor SELL prices, one place (2026-09-22).
//
// Owner rules:
//   * Vendor-stocked goods sell back at VENDOR_SELLBACK (-10%) of the
//     vendor price. Applies to modules with a buy_price that came FROM a
//     vendor (item_data.source 'vendor', or legacy items with no source)
//     and to supplies (probes / fuel / warheads).
//   * Everything else -- crafted modules, loot drops, craft-only T3+ gear,
//     crafted harvesters -- is valued from its recipe MATERIALS (at the
//     vendor's own resource sell rate) times a TIER markup, times quality.
//     A T1 Q50 craft is a small loss against the ore that went in; a T4/T5
//     craft is worth several times its materials.
//   * Resources: base_price x RESOURCE_SELL_RATE at Q50, on a steeper
//     quality curve than modules (RESOURCE_Q_EXP) so a Q90 find pays.
//     Refined / higher-tier resources (future) should be their own
//     resource_types rows with their own base_price -- nothing here needs
//     to change for that.
//
// Provenance: /buy-module + starter kit stamp item_data.source='vendor',
// /craft stamps 'crafted', wreck / elite-drop inserts stamp 'loot'. Fit
// and unfit carry `source` through the fitted slot. Items with no source
// (pre-2026-09-22) are treated as vendor-bought when the module is
// vendor-stocked -- the generous reading.

export const VENDOR_SELLBACK = 0.9;      // sell back at 90% of vendor price
export const RESOURCE_SELL_RATE = 0.5;   // Q50 resource sells at half base_price
export const RESOURCE_Q_EXP = 1.6;       // Q90 ore = 2.56x, Q100 = 3.0x, Q30 = 0.44x
export const MODULE_Q_EXP = 1.0;         // Q90 module = 1.8x, Q100 = 2.0x
// Crafted / looted module value = material vendor value x TIER_MARKUP.
export const TIER_MARKUP = { 1: 0.85, 2: 1.2, 3: 2.0, 4: 3.2, 5: 5.0 };
// Nothing priceable at all (no recipe, no buy_price, no supply row).
export const FLOOR_BY_TIER = { 1: 20, 2: 100, 3: 600, 4: 2500, 5: 8000 };

// Vendor supplies (buy prices; sell = x VENDOR_SELLBACK).
export const SUPPLIES_CATALOG = {
  scanner_probe:          { price: 50,  display_name: 'Scanner Probe' },
  advanced_scanner_probe: { price: 150, display_name: 'Advanced Scanner Probe' },
  fuel_cell:              { price: 100, display_name: 'Fuel Cell' },
  missile_warhead:        { price: 30,  display_name: 'Missile Warhead' },
};

// quality: {purity,stability,potency,density} | number | null -> 0..100 avg
export function avgQuality(q) {
  if (q == null) return 50;
  if (typeof q === 'number') return q;
  const vals = ['purity', 'stability', 'potency', 'density'].map(k => Number(q[k] ?? 50));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
// Resource stacks carry stat_* columns (or a stats object).
export function avgResourceQuality(row) {
  const s = row.stats || row;
  return avgQuality({
    purity: s.stat_purity ?? s.purity, stability: s.stat_stability ?? s.stability,
    potency: s.stat_potency ?? s.potency, density: s.stat_density ?? s.density,
  });
}
const qMult = (avg, exp) => Math.pow(Math.max(1, avg) / 50, exp);

export function resourceSellPrice(basePrice, quality) {
  const avg = typeof quality === 'number' ? quality : avgResourceQuality(quality || {});
  return Math.max(1, Math.round(basePrice * RESOURCE_SELL_RATE * qMult(avg, RESOURCE_Q_EXP)));
}

// Vendor value of a recipe's inputs at Q50.
// ingredients: [{resource_name|resource, quantity}]; priceByName: name -> base_price
export function materialValue(ingredients, priceByName) {
  let total = 0;
  for (const ing of ingredients || []) {
    const name = ing.resource_name || ing.resource;
    const base = priceByName.get(name);
    if (base == null) continue;
    total += base * RESOURCE_SELL_RATE * (Number(ing.quantity) || 0);
  }
  return total;
}

// ---- catalog (cached) ----
let catalogCache = null, catalogAt = 0;
const CATALOG_TTL_MS = 5 * 60 * 1000;
export async function loadPricingCatalog(queryAll, force = false) {
  if (!force && catalogCache && Date.now() - catalogAt < CATALOG_TTL_MS) return catalogCache;
  const [resources, modules, recipes] = await Promise.all([
    queryAll(`SELECT name, base_price FROM resource_types`),
    queryAll(`SELECT id, name, tier, buy_price, recipe FROM module_types`),
    queryAll(`SELECT output_item_id, ingredients FROM crafting_recipes`),
  ]);
  const priceByName = new Map(resources.map(r => [r.name, Number(r.base_price)]));
  const moduleById = new Map(modules.map(m => [m.id, m]));
  const recipeByItem = new Map();
  for (const r of recipes) if (!recipeByItem.has(r.output_item_id)) recipeByItem.set(r.output_item_id, r.ingredients);
  catalogCache = { priceByName, moduleById, recipeByItem };
  catalogAt = Date.now();
  return catalogCache;
}
export const resetPricingCatalog = () => { catalogCache = null; };

// Sell price of one unit of an inventory ITEM row (module, supply,
// harvester, ...). Returns { price, name, basis } -- basis is for logs/UI:
// 'vendor' | 'supply' | 'materials' | 'floor'.
// Never vendorable: contract freight (078) -- the contract pays on delivery.
export const UNSELLABLE = new Set(['sealed_cargo']);

export function itemSellPrice(row, catalog) {
  const itemId = row.item_id;
  if (UNSELLABLE.has(itemId)) return { price: 0, name: row.item_name || 'Sealed Cargo', basis: 'unsellable' };
  const data = row.item_data || {};
  const mod = catalog.moduleById.get(itemId) || null;
  const tier = Math.max(1, Math.min(5, Number(mod?.tier ?? data.tier ?? 1)));
  const qm = qMult(avgQuality(data.quality), MODULE_Q_EXP);
  const name = mod?.name || row.item_name || (itemId ? itemId.replace(/_/g, ' ') : 'Item');

  // 1. supplies: flat vendor sell-back (no quality)
  if (SUPPLIES_CATALOG[itemId]) {
    return { price: Math.max(1, Math.round(SUPPLIES_CATALOG[itemId].price * VENDOR_SELLBACK)), name, basis: 'supply' };
  }
  // 2. vendor-stocked module that came from a vendor (or legacy, no source)
  const source = data.source || null;
  if (mod && mod.buy_price != null && (source === 'vendor' || source == null)) {
    return { price: Math.max(1, Math.round(mod.buy_price * VENDOR_SELLBACK * qm)), name, basis: 'vendor' };
  }
  // 3. materials x tier markup x quality
  const ingredients = catalog.recipeByItem.get(itemId) || mod?.recipe || null;
  const mat = ingredients ? materialValue(ingredients, catalog.priceByName) : 0;
  if (mat > 0) {
    return { price: Math.max(1, Math.round(mat * (TIER_MARKUP[tier] || 1) * qm)), name, basis: 'materials' };
  }
  // 4. floor by tier (or a vendor-stocked module with a non-vendor source and no recipe)
  if (mod && mod.buy_price != null) {
    return { price: Math.max(1, Math.round(mod.buy_price * VENDOR_SELLBACK * qm)), name, basis: 'vendor' };
  }
  return { price: Math.max(1, Math.round((FLOOR_BY_TIER[tier] || 20) * qm)), name, basis: 'floor' };
}
