// itemColors.js -- ONE rule for how a cargo tile / tooltip is coloured
// (owner direction 2026-10-06). Before this, four tables shared the same
// blue and purple and landed on different parts of the square: a
// resource's own swatch painted the background, quality painted the
// border AND the dot, rarity only showed in the tooltip, and modules
// used slot colour for the border and tier colour for the icon brackets.
//
// The rule now:
//   RESOURCES  name + background + border = RARITY colour
//              dot = QUALITY colour
//   MODULES    name + background          = TIER colour (the rarity ramp I-V)
//              border                     = SLOT TYPE colour (matches the Ship Builder slot it fits)
//              dot = QUALITY colour
//   OTHER ITEMS (probes, fuel, harvesters, freight) are not graded: amber all round, no dot.
//
// The glyph inside the square is what tells one item from another (its
// own swatch / glyph), never the background. Quality is the dot only.

import { RARITY_INFO, getQualityTier, RESOURCE_TYPES } from '@/data/resources';
import { tierColor } from '@/utils/tiers';

export const SLOT_TYPE_COLORS = {
  engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff', cargo: '#ddaa22', utility: '#22ccaa',
  reactor: '#00ddff', mining: '#aa66ff', base: '#4ade80',
};
export const UNGRADED_ITEM_COLOR = '#ffaa00';

const RES_BY_ID = {};
for (const r of Object.values(RESOURCE_TYPES)) RES_BY_ID[r.id] = r;

export const rarityColor = (rarity) => RARITY_INFO[rarity]?.color || RARITY_INFO.common.color;

export const avg4 = (q) => (q ? ((q.purity ?? 50) + (q.stability ?? 50) + (q.potency ?? 50) + (q.density ?? 50)) / 4 : null);

// Quality colour from an average (0-100) via the shared QUALITY_TIERS palette.
export const qualityColorFor = (avg) => (avg == null ? null : getQualityTier(avg, avg, avg, avg).color);

// A stack's rarity: the server sends rt.rarity on inventory / depot rows;
// fall back to the static catalogue (processed materials are 'common').
export const resourceRarityOf = (stack) => stack?.rarity || RES_BY_ID[stack?.resource_type_id]?.rarity || 'common';

export const resourceTileColors = (stack) => {
  const rc = rarityColor(resourceRarityOf(stack));
  return { accent: rc, border: rc, name: rc, dot: qualityColorFor(avg4(stack?.stats)) };
};

export const moduleTileColors = ({ slotType, tier, quality }) => {
  const graded = !!slotType;
  const tc = graded ? tierColor(tier || 1) : UNGRADED_ITEM_COLOR;
  const border = (slotType && SLOT_TYPE_COLORS[slotType]) || tc;
  return { accent: tc, border, name: tc, dot: graded ? qualityColorFor(avg4(quality)) : null };
};

// Any inventory / depot stack row.
export const stackTileColors = (stack) =>
  stack?.item_type === 'item'
    ? moduleTileColors({ slotType: stack.item_data?.slot_type, tier: stack.item_data?.tier, quality: stack.item_data?.quality })
    : resourceTileColors(stack);
