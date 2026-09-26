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

// Foundry (088): a processed material says where it is made and what it
// is for; a raw resource says which stations consume it. The catalog is
// loaded once at login (gameStore.foundryCatalog); nothing shows until then.
const FoundryLines = ({ name }) => {
  const cat = useGameStore(s => s.foundryCatalog);
  if (!cat || !name) return null;
  const m = (cat.materials || []).find(x => x.name === name);
  const uses = m ? m.used_for : (cat.used_for_raw || {})[name];
  if (!m && !(uses && uses.length)) return null;
  const useText = (uses || []).slice(0, 4).map(u => u.kind === 'job' ? `${u.name} (${u.station})` : u.kind === 'base_tier' ? u.name : u.station ? `${u.name} @ ${u.station}` : u.name).join(' · ');
  return (
    <div className="mt-2 pt-2 text-xs" style={{ borderTop: '1px solid rgba(100,116,139,0.3)' }}>
      {m?.made_at && <div><span className="text-slate-400">Made at </span><span style={{ color: '#f5c542' }}>{m.made_at.station_name}</span>{m.is_part && <span className="text-slate-500"> · station part, craft-only</span>}</div>}
      {useText && <div className="mt-0.5"><span className="text-slate-400">Used for </span><span className="text-slate-200">{useText}</span></div>}
    </div>
  );
};
import { getQualityTier, RARITY_INFO } from '@/data/resources';
import { normalizeItem } from '@/utils/itemShape';
import { ItemTooltipContent } from '@/components/items/ItemTooltip';
import { PixelItemIcon, resourceIconSpec } from '@/components/pixel/PixelArt';
import { useGameStore } from '@/stores/gameStore';

export const CargoSlotTooltip = ({ stack, screenX, screenY, slotSize = 44, resourceIcons }) => {
  if (!stack) return null;

  // Clamp estimates scale with the root font-size so the tooltip stays
  // on-screen when the Settings UI-scale grows it (rem-based text).
  const ui = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
  let left = screenX + slotSize + 8;
  let top = screenY - 20;
  if (left + 230 * ui > window.innerWidth) left = screenX - 238 * ui;
  if (top + 220 * ui > window.innerHeight) top = window.innerHeight - 230 * ui;
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
          <div
            className="rounded flex items-center justify-center"
            style={{ width: 36, height: 36, backgroundColor: (iconInfo?.color || tier.color) + '33', border: `1px solid ${(iconInfo?.color || tier.color)}88` }}
          >
            <PixelItemIcon size={32} spec={resourceIconSpec(stack.resource_type_id,
              (stack.stats.purity + stack.stats.stability + stack.stats.potency + stack.stats.density) / 4)} />
          </div>
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
        <FoundryLines name={stack.resource_name} />
      </div>
    </div>
  );
};

export default CargoSlotTooltip;
