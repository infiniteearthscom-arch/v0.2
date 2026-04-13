// ============================================
// ITEM SHAPE NORMALIZER
// --------------------------------------------
// Every "item-like" object in the game (cargo stack, vendor listing,
// module-type row, recipe output, harvester installable, etc.) arrives
// from the server in a slightly different shape. This module provides
// ONE function — normalizeItem(source, context) — that returns a
// canonical shape consumed by every item-display component.
//
// When server field names change, this file updates. Nothing else does.
// ============================================

import { RESOURCE_TYPES, getQualityTier } from '@/data/resources';

// Slot-type metadata — mirrors SLOT_TYPES in ShipBuilderWindow, kept here
// so the normalizer can resolve fallback icons/colors without importing
// from a UI component. If this ever diverges, move to a shared constants file.
export const SLOT_TYPE_META = {
  engine:  { color: '#ff6622', name: 'Engine',  icon: '🔥' },
  weapon:  { color: '#ff2244', name: 'Weapon',  icon: '🔫' },
  shield:  { color: '#8844ff', name: 'Shield',  icon: '🛡️' },
  cargo:   { color: '#ddaa22', name: 'Cargo',   icon: '📦' },
  utility: { color: '#22ccaa', name: 'Utility', icon: '🔧' },
  reactor: { color: '#00ddff', name: 'Reactor', icon: '⚛️' },
  mining:  { color: '#aa66ff', name: 'Mining',  icon: '⛏️' },
};

// Resource lookup keyed by numeric resource_type_id — built once from the
// static resource definitions. Gives us per-resource icon, color, name.
const RESOURCE_LOOKUP = {};
const RESOURCE_ABBR = {};
Object.values(RESOURCE_TYPES).forEach(r => {
  RESOURCE_LOOKUP[r.id] = r;
  const words = r.name.split(/[\s-]+/);
  RESOURCE_ABBR[r.id] = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : r.name.substring(0, 2).toUpperCase();
});

// Quality-tier → hex color for quality dots. Matches existing InventoryWindow
// threshold breaks (80 / 60 / 40) so we don't visually drift.
export const qualityColor = (avgQ) => {
  if (avgQ == null) return null;
  if (avgQ >= 80) return '#aa44ff';
  if (avgQ >= 60) return '#4488ff';
  if (avgQ >= 40) return '#44cc44';
  return '#888888';
};

// Compute average quality from a quality object. Returns null if data missing.
export const avgQuality = (q) => {
  if (!q) return null;
  const { purity, stability, potency, density } = q;
  if ([purity, stability, potency, density].some(v => v == null)) return null;
  return Math.round((purity + stability + potency + density) / 4);
};

// ============================================
// normalizeItem(source, context?)
// ============================================
// `source` is any item-shaped object. `context` (optional) adds display
// hints the caller knows but the source doesn't — e.g. { price, mode: 'buy' },
// { required: true }, { equipped: true }.
//
// Returns the canonical shape — or null if source is empty/unrecognizable.
//
// Canonical shape:
// {
//   kind:       'module' | 'resource' | 'hull' | 'consumable' | 'blueprint' | 'unknown'
//   id:         stable unique id for React keys (stack id, listing id, etc.)
//   name:       display name
//   description?: short description
//   icon:       emoji / glyph string to render inside the cell
//   iconFallback: string to render if `icon` fails (e.g. abbreviation)
//   color:      accent color for border / background tint (hex)
//   subtitle?:  second-line label under the name in tooltip (e.g. "Engine module")
//   slotType?:  for modules
//   tier?:      numeric tier for modules / quality tier name for resources
//   quality?:   { purity, stability, potency, density }  — module/resource quality
//   avgQ?:      pre-computed quality average (0–100)
//   qColor?:    pre-computed quality color
//   stats?:     [{ label, value, baseValue?, unit? }] — tooltip stats table
//   stackQty?:  stack count (null if not stacked or 1)
//   price?:     { amount, currency: 'cr', mode: 'buy' | 'sell' }
//   flags?:     { required?, equipped?, cannotAfford?, outOfStock? }
//   raw:        passthrough of the source object
// }
export function normalizeItem(source, context = {}) {
  if (!source) return null;

  const base = {
    id: null,
    name: 'Unknown',
    description: null,
    icon: '📦',
    iconFallback: '?',
    color: '#64748b',
    subtitle: null,
    kind: 'unknown',
    slotType: null,
    tier: null,
    quality: null,
    avgQ: null,
    qColor: null,
    stats: null,
    stackQty: null,
    price: context.price || null,
    flags: {
      required:     context.required     ?? false,
      equipped:     context.equipped     ?? false,
      cannotAfford: context.cannotAfford ?? false,
      outOfStock:   context.outOfStock   ?? false,
    },
    raw: source,
  };

  // ----- Cargo stack (resource, from resourcesAPI.getInventory) -----
  // Shape: { id, resource_type_id, resource_name, quantity, stats:{purity,stability,potency,density} }
  if (source.resource_type_id != null && !source.item_type) {
    const resMeta = RESOURCE_LOOKUP[source.resource_type_id] || {};
    const q = source.stats;
    const avg = avgQuality(q);
    const tier = q ? getQualityTier(q.purity, q.stability, q.potency, q.density) : null;
    return {
      ...base,
      kind: 'resource',
      id: source.id ?? `res-${source.resource_type_id}`,
      name: source.resource_name || resMeta.name || `Resource ${source.resource_type_id}`,
      icon: resMeta.icon || RESOURCE_ABBR[source.resource_type_id] || '◆',
      iconFallback: RESOURCE_ABBR[source.resource_type_id] || '?',
      color: resMeta.color || '#64748b',
      subtitle: resMeta.category ? `${resMeta.category.charAt(0).toUpperCase() + resMeta.category.slice(1)} resource` : 'Resource',
      tier: tier?.name || null,
      quality: q || null,
      avgQ: avg,
      qColor: qualityColor(avg),
      stackQty: source.quantity > 1 ? source.quantity : null,
      description: resMeta.description || null,
    };
  }

  // ----- Cargo stack (fabricated item, from resourcesAPI.getInventory) -----
  // Shape: { id, item_type: 'item', item_id, item_name, item_icon?, item_data?, item_description?, item_category?, quantity }
  if (source.item_type === 'item' || source.item_id) {
    const data = source.item_data || {};
    const slotType = data.slot_type || null;
    const slotMeta = slotType ? SLOT_TYPE_META[slotType] : null;
    const q = data.quality;
    const avg = avgQuality(q);

    // Build a stats table if the item has base_stats (module) or loose numeric fields
    let stats = null;
    if (data.base_stats && typeof data.base_stats === 'object') {
      stats = Object.entries(data.base_stats).map(([key, val]) => {
        const scaled = avg != null ? Math.round(val * (avg / 50)) : val;
        return {
          label: key.replace(/_/g, ' '),
          value: scaled,
          baseValue: scaled !== val ? val : null,
        };
      });
    }

    return {
      ...base,
      kind: slotType ? 'module' : 'consumable',
      id: source.id ?? `item-${source.item_id}`,
      name: source.item_name || source.item_id?.replace(/_/g, ' ') || 'Item',
      icon: source.item_icon || slotMeta?.icon || '📦',
      iconFallback: slotType ? slotMeta.icon : (source.item_name?.charAt(0).toUpperCase() || '?'),
      color: slotMeta?.color || '#ffaa00',
      subtitle: slotMeta ? `${slotMeta.name} module` : (source.item_category || 'Consumable'),
      slotType,
      tier: data.tier ?? null,
      quality: q || null,
      avgQ: avg,
      qColor: qualityColor(avg),
      stats,
      stackQty: source.quantity > 1 ? source.quantity : null,
      description: source.item_description || data.description || null,
    };
  }

  // ----- Vendor listing (module_types / item catalog row) -----
  // Shape: { id / module_type_id, name, slot_type, tier, base_stats?, description?, buy_price?, icon? }
  if (source.slot_type || source.module_type_id) {
    const slotType = source.slot_type;
    const slotMeta = slotType ? SLOT_TYPE_META[slotType] : null;
    const stats = source.base_stats && typeof source.base_stats === 'object'
      ? Object.entries(source.base_stats).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v }))
      : null;
    return {
      ...base,
      kind: 'module',
      id: source.id ?? source.module_type_id ?? `mt-${source.name}`,
      name: source.name || source.module_type_id || 'Module',
      icon: source.icon || slotMeta?.icon || '📦',
      iconFallback: slotMeta?.icon || '?',
      color: slotMeta?.color || '#64748b',
      subtitle: slotMeta ? `${slotMeta.name} module` : 'Module',
      slotType,
      tier: source.tier ?? null,
      stats,
      description: source.description || null,
      price: context.price || (source.buy_price != null ? { amount: source.buy_price, currency: 'cr', mode: context.mode || 'buy' } : null),
    };
  }

  // ----- Hull listing (from fittingAPI.getHulls) -----
  // Shape: { id, name, class, price, slots: [...] }
  if (source.class && Array.isArray(source.slots)) {
    return {
      ...base,
      kind: 'hull',
      id: source.id ?? `hull-${source.name}`,
      name: source.name,
      icon: '🚀',
      color: '#60a5fa',
      subtitle: `${source.class} hull · ${source.slots.length} slots`,
      stats: [{ label: 'slots', value: source.slots.length }],
      description: source.description || null,
      price: source.price != null ? { amount: source.price, currency: 'cr', mode: context.mode || 'buy' } : null,
    };
  }

  // ----- Fallback: supplies / misc vendor entry -----
  // Shape: { item_id / id, name / label, icon?, price?, description? }
  return {
    ...base,
    id: source.id ?? source.item_id ?? `misc-${source.name || Math.random()}`,
    name: source.name || source.label || source.item_id || 'Item',
    icon: source.icon || '📦',
    subtitle: source.category || null,
    description: source.description || null,
    price: context.price || (source.price != null ? { amount: source.price, currency: 'cr', mode: context.mode || 'buy' } : null),
  };
}

// Normalize a fitted module (from ship.moduleDetails) — these come back
// with a different shape than cargo stacks and need their own path so the
// ship-canvas filled slots show the right icon + quality.
// Shape: { name, slot_type, tier?, quality?, base_stats? }
export function normalizeFittedModule(mod, slotId) {
  if (!mod) return null;
  const slotType = mod.slot_type;
  const slotMeta = slotType ? SLOT_TYPE_META[slotType] : null;
  const avg = avgQuality(mod.quality);
  const stats = mod.base_stats && typeof mod.base_stats === 'object'
    ? Object.entries(mod.base_stats).map(([key, val]) => {
        const scaled = avg != null ? Math.round(val * (avg / 50)) : val;
        return {
          label: key.replace(/_/g, ' '),
          value: scaled,
          baseValue: scaled !== val ? val : null,
        };
      })
    : null;
  return {
    kind: 'module',
    id: `fitted-${slotId || mod.name}`,
    name: mod.name || slotMeta?.name || 'Module',
    icon: mod.icon || slotMeta?.icon || '📦',
    iconFallback: slotMeta?.icon || '?',
    color: slotMeta?.color || '#64748b',
    subtitle: slotMeta ? `${slotMeta.name} module · Fitted` : 'Fitted module',
    slotType,
    tier: mod.tier ?? null,
    quality: mod.quality || null,
    avgQ: avg,
    qColor: qualityColor(avg),
    stats,
    stackQty: null,
    description: mod.description || null,
    price: null,
    flags: { equipped: true, required: false, cannotAfford: false, outOfStock: false },
    raw: mod,
  };
}
