// Tracked requirements (owner 2026-10-09: "standardize this feature so we're
// not coding everything custom for every piece").
//
// ONE shape for anything the player can save to the top-right stack and
// watch have/need against the fleet hold -- crafting recipes, base builds
// and upgrades, plot buildings, future blueprints:
//
//   { kind, id, name, ingredients: [{ resource_name, quantity }], credits?, icon? }
//
// kind + id make the key. Surfaces add a <TrackButton item={...} /> and
// never touch the store directly; the overlay renders every kind with the
// same TrackedTile. Persisted in gameStore.pinnedRecipes (name kept for
// the persisted state; entries written before 2026-10-09 lack `kind` and
// are normalised as recipes).

export const TRACK_MAX = 6;

export const TRACK_KINDS = {
  recipe:   { label: 'RECIPE',   ready: 'READY TO CRAFT', icon: '⚒', color: '#a855f7', light: '#c084fc' },
  base:     { label: 'BASE',     ready: 'READY TO BUILD', icon: '🏠', color: '#eab308', light: '#fde047' },
  building: { label: 'BUILDING', ready: 'READY TO BUILD', icon: '🏗', color: '#f59e0b', light: '#fbbf24' },
  module:   { label: 'MODULE',   ready: 'READY TO FIT',   icon: '🔧', color: '#38bdf8', light: '#7dd3fc' },
};

export const trackKey = (kind, id) => `${kind || 'recipe'}:${id}`;

/** Normalise any tracked entry (incl. legacy recipe rows) to the one shape. */
export function normalizeTracked(entry) {
  if (!entry) return null;
  const kind = entry.kind || 'recipe';
  const id = entry.id;
  if (id == null) return null;
  return {
    key: entry.key || trackKey(kind, id),
    kind,
    id,
    name: entry.name || String(id),
    ingredients: (entry.ingredients || []).map(g => ({ resource_name: g.resource_name, quantity: Number(g.quantity) || 0 })),
    credits: Number(entry.credits) || 0,
    icon: entry.icon || null,
  };
}

/** Build a tracked item from a `{ name: qty }` cost map (base tiers). */
export function ingredientsFromMap(map) {
  return Object.entries(map || {}).map(([resource_name, quantity]) => ({ resource_name, quantity: Number(quantity) || 0 }));
}
