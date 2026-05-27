// CargoSlotTooltip -- the rich hover tooltip for inventory cargo
// stacks. Extracted from InventoryWindow so other cargo-display
// surfaces (CraftingCargoPanel, HarvesterCargoPanel, etc.) can show
// the same tooltip on hover. Two branches:
//   - resources: custom layout with quality bars + base price (the
//     individual purity/stability/potency/density splits are
//     gameplay-relevant for raw minerals, so they stay visible).
//   - items (modules + consumables): delegates to ItemTooltipContent
//     via normalizeItem so the cargo hover, Fittable Modules pane,
//     and the SlotInfo all read from one data shape.
//
// Positioning is "near the slot" -- caller passes the slot's
// screen-rect top-left as `screenX`/`screenY` + the tile size; this
// component clamps so the tooltip stays on-screen. Rendered via a
// portal in the caller (pointer-events: none on the wrapper so it
// doesn't intercept hover).

import React from 'react';
import { getQualityTier, RARITY_INFO } from '@/data/resources';
import { normalizeItem } from '@/utils/itemShape';
import { ItemTooltipContent } from '@/components/items/ItemTooltip';

export const CargoSlotTooltip = ({ stack, screenX, screenY, slotSize = 44, resourceIcons }) => {
  if (!stack) return null;

  let left = screenX + slotSize + 8;
  let top = screenY - 20;
  if (left + 200 > window.innerWidth) left = screenX - 208;
  if (top + 210 > window.innerHeight) top = window.innerHeight - 220;
  if (top < 0) top = 4;

  const isItem = stack.item_type === 'item';

  // Item branch: defer to the shared ItemTooltipContent (same renderer
  // the Fittable Modules pane uses) so the cargo hover + the fitting
  // tooltip show identical fields. The cargo gold border + glow stay
  // for visual consistency with the rest of the cargo UI.
  if (isItem) {
    const normalized = normalizeItem(stack);
    return (
      <div className="fixed z-[9999] pointer-events-none" style={{ left, top }}>
        <div
          className="rounded-lg shadow-xl min-w-[220px]"
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '2px solid #ffaa00',
            boxShadow: '0 0 12px #ffaa0033',
          }}
        >
          <ItemTooltipContent item={normalized} />
        </div>
      </div>
    );
  }

  // Resource branch: keep the per-stat quality bars + the base price.
  // resourceIcons is an optional lookup the caller can pass to render
  // the colored 2-letter abbreviation icon; if omitted, falls back to
  // a generic style so this component still works in surfaces that
  // don't maintain their own icon map.
  const tier = getQualityTier(
    stack.stats.purity, stack.stats.stability,
    stack.stats.potency, stack.stats.density
  );
  const iconInfo = resourceIcons?.[stack.resource_type_id];
  const rarityInfo = RARITY_INFO[stack.rarity];

  return (
    <div className="fixed z-[9999] pointer-events-none" style={{ left, top }}>
      <div
        className="rounded-lg p-3 shadow-xl min-w-[190px]"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          border: `2px solid ${tier.color}`,
          boxShadow: `0 0 12px ${tier.color}33`,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {iconInfo && (
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: iconInfo.color + '44',
                color: iconInfo.color,
                border: `1px solid ${iconInfo.color}88`,
              }}
            >
              {iconInfo.abbr}
            </div>
          )}
          <div>
            <div className="font-medium text-sm" style={{ color: rarityInfo?.color || '#fff' }}>
              {stack.resource_name}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: tier.color }}>{tier.name}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">{stack.category}</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-600/50 mb-2" />

        <div className="space-y-1.5 mb-2">
          {[
            { label: 'Purity', value: stack.stats.purity },
            { label: 'Stability', value: stack.stats.stability },
            { label: 'Potency', value: stack.stats.potency },
            { label: 'Density', value: stack.stats.density },
          ].map(stat => {
            const pct = stat.value;
            const barColor =
              pct >= 80 ? '#aa44ff'
              : pct >= 60 ? '#4488ff'
              : pct >= 40 ? '#44ff44'
              : pct >= 20 ? '#ffffff'
              : '#666666';
            return (
              <div key={stat.label} className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 w-14">{stat.label}</span>
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
                <span className="text-slate-300 w-6 text-right">{stat.value}</span>
              </div>
            );
          })}
        </div>

        <div className="h-px bg-slate-600/50 mb-2" />

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Quantity</span>
          <span className="text-cyan-300 font-medium">{stack.quantity}</span>
        </div>
        <div className="flex justify-between text-xs mt-0.5">
          <span className="text-slate-400">Base value</span>
          <span className="text-yellow-400">{stack.base_price || '—'} cr/unit</span>
        </div>
      </div>
    </div>
  );
};

export default CargoSlotTooltip;
