// combat.js — Damage-type × defense-layer resolution.
//
// Three defense layers deplete TOP-DOWN: shield → armor → hull.
//   - shield regenerates (handled by the caller's regen timer)
//   - armor + hull do not regenerate
//   - hull <= 0 means destroyed
//
// Each weapon type has a per-layer effectiveness multiplier. A shot's
// "raw" damage budget is spent layer by layer: a weapon that is weak vs
// a layer burns more of its budget clearing it, so overflow that reaches
// the next layer is reduced accordingly. This makes MIXED loadouts beat
// mono-weapon (strip shields with kinetic → crack armor with laser →
// gut hull with missiles), which is the whole point of the triangle.
//
// This is the single source of truth for the matrix. SystemView applies
// it in combat; ShipBuilderWindow reads it to show weapon effectiveness.

export const DEFENSE_LAYERS = ['shield', 'armor', 'hull'];

// matrix[weaponType][layer] = effectiveness multiplier.
// Tunable — these are the Phase-1 starting values from the spec
// (docs/combat-progression-spec.md §A1). Flavor:
//   laser   — energy beam: bounces off shields, bites armor
//   kinetic — slugs: shred shields, ineffective vs heavy armor
//   missile — warheads: punch through to hull, soft vs shields
export const DAMAGE_MATRIX = {
  laser:   { shield: 0.5,  armor: 1.5, hull: 1.0 },
  kinetic: { shield: 1.5,  armor: 0.5, hull: 1.0 },
  missile: { shield: 0.75, armor: 1.0, hull: 1.5 },
};

// Neutral fallback for untyped damage (collisions, unknown weapons).
const NEUTRAL = { shield: 1.0, armor: 1.0, hull: 1.0 };

export const getDamageMultipliers = (weaponType) => DAMAGE_MATRIX[weaponType] || NEUTRAL;

// Apply `rawDmg` to a target carrying numeric { shield, armor, hull }
// fields. Mutates the target in place, depleting top-down with per-layer
// multipliers. Empty shield/armor layers are skipped so damage falls
// through to the next layer. Hull is the final layer and may go <= 0.
//
// Returns { killed, shieldDamaged, layerHit } so the caller can set a
// shield-regen timer and pick a hit-spark color.
export function applyDamage(target, rawDmg, weaponType) {
  const mult = getDamageMultipliers(weaponType);
  let raw = rawDmg;
  let shieldDamaged = false;
  let layerHit = 'hull';

  for (const layer of DEFENSE_LAYERS) {
    if (raw <= 0) break;
    const m = mult[layer] ?? 1.0;
    const pool = target[layer] ?? 0;

    // Skip already-empty shield/armor so damage falls through. Hull
    // always resolves (it's the last layer and can go negative).
    if (layer !== 'hull' && pool <= 0) continue;

    layerHit = layer;
    const eff = raw * m; // effective damage this shot can do to this layer

    if (layer === 'hull') {
      target.hull = pool - eff;
      raw = 0;
    } else if (eff < pool) {
      // Layer absorbs the whole shot.
      target[layer] = pool - eff;
      if (layer === 'shield') shieldDamaged = true;
      raw = 0;
    } else {
      // Layer destroyed; carry the overflow back into raw terms. Clearing
      // `pool` of this layer cost `pool / m` of the raw budget.
      target[layer] = 0;
      if (layer === 'shield') shieldDamaged = true;
      raw -= pool / m;
    }
  }

  return { killed: target.hull <= 0, shieldDamaged, layerHit };
}

// Compact display model of a weapon type's matchups, for tooltips.
// Returns [{ layer, mult, label }] sorted strong→weak, plus a one-line
// summary string. `power` lets callers reuse the same thresholds.
const LAYER_LABEL = { shield: 'Shield', armor: 'Armor', hull: 'Hull' };

export const describeWeaponEffectiveness = (weaponType) => {
  const mult = DAMAGE_MATRIX[weaponType];
  if (!mult) return null;
  const rows = DEFENSE_LAYERS.map(layer => ({
    layer,
    label: LAYER_LABEL[layer],
    mult: mult[layer],
    tone: mult[layer] > 1 ? 'good' : mult[layer] < 1 ? 'bad' : 'neutral',
  }));
  const strong = rows.filter(r => r.tone === 'good').map(r => r.label);
  const weak   = rows.filter(r => r.tone === 'bad').map(r => r.label);
  return { rows, strong, weak };
};
