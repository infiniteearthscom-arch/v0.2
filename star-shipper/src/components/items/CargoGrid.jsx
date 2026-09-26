// CargoGrid.jsx -- a cargo-hold grid (2026-09-26): the fleet cargo and the
// base depot side by side in the base console, dragging stacks between them
// and arranging within each. Tiles render exactly like InventoryWindow's
// (module colours, quality dot, pixel icon, stack count) and use the same
// tooltip singleton. The grid is presentational: the caller supplies the
// stacks and performs moves.
//
//   stacks     [{ id, item_type, slot_index, quantity, ... }]  (source stamped by caller)
//   source     'cargo' | 'depot'
//   cols, slotSize, minSlots
//   onDropStack(payload, { slotIndex, targetStack })  payload = parsed drag JSON (+ source)
//   accent     header colour

import React, { useEffect, useState } from 'react';
import { cargoTooltip } from '@/components/items/CargoTooltipLayer';
import { PixelItemIcon, moduleIconSpec, resourceIconSpec } from '@/components/pixel/PixelArt';
import { getQualityTier, QUALITY_TIER_COLORS } from '@/data/resources';

const SLOT_TYPE_COLORS = { engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff', cargo: '#ddaa22', utility: '#22ccaa', reactor: '#00ddff', mining: '#aa66ff', base: '#4ade80' };
const avg4 = (q) => q ? ((q.purity ?? 50) + (q.stability ?? 50) + (q.potency ?? 50) + (q.density ?? 50)) / 4 : null;

export const dragPayloadFor = (stack, source) => ({
  stack_id: stack.id, source, item_type: stack.item_type,
  resource_type_id: stack.resource_type_id, resource_name: stack.resource_name, category: stack.category,
  item_id: stack.item_id, item_name: stack.item_name, quantity: stack.quantity, stats: stack.stats,
  slot_index: stack.slot_index ?? null,
});

export const CargoGrid = ({ stacks, source, cols = 5, slotSize = 40, minSlots = 20, onDropStack, busy }) => {
  const [over, setOver] = useState(null);
  useEffect(() => () => cargoTooltip.hide(), []);
  // place by slot_index; unslotted stacks fill the first gaps
  const slotMap = {};
  for (const s of stacks) if (s.slot_index != null && slotMap[s.slot_index] == null) slotMap[s.slot_index] = s;
  let next = 0;
  for (const s of stacks) { if (s.slot_index != null && slotMap[s.slot_index] === s) continue; while (slotMap[next] != null) next++; slotMap[next] = s; s._tempSlot = next; next++; }
  const maxIdx = Object.keys(slotMap).reduce((m, k) => Math.max(m, Number(k)), -1);
  const total = Math.max(minSlots, Math.ceil((maxIdx + 2) / cols) * cols);
  const parse = (e) => { try { return JSON.parse(e.dataTransfer.getData('application/json') || 'null'); } catch { return null; } };

  const tile = (index, stack) => {
    if (!stack) {
      return (
        <div key={index} onDragOver={(e) => { e.preventDefault(); setOver(index); }} onDragLeave={() => setOver(null)}
             onDrop={(e) => { e.preventDefault(); setOver(null); const p = parse(e); if (p && onDropStack) onDropStack(p, { slotIndex: index, targetStack: null }); }}
             style={{ width: slotSize, height: slotSize, border: over === index ? '2px solid #00ccff' : '1px solid #1e293b', borderRadius: 4, background: '#0f172a44', boxSizing: 'border-box' }} />
      );
    }
    const isItem = stack.item_type === 'item';
    let border = '#ffaa00', tint = '#ffaa00', dot = null;
    if (isItem) {
      const st = stack.item_data?.slot_type;
      if (st && SLOT_TYPE_COLORS[st]) { border = SLOT_TYPE_COLORS[st]; tint = border; }
      const q = avg4(stack.item_data?.quality);
      if (q != null) dot = q >= 80 ? '#aa44ff' : q >= 60 ? '#4488ff' : q >= 40 ? '#44ff44' : null;
    } else {
      const t = getQualityTier(stack.stats?.purity ?? 50, stack.stats?.stability ?? 50, stack.stats?.potency ?? 50, stack.stats?.density ?? 50);
      border = QUALITY_TIER_COLORS?.[t.name] || t.color || '#666'; tint = '#94a3b8'; dot = t.color;
    }
    const spec = isItem
      ? moduleIconSpec({ itemId: stack.item_id, slotType: stack.item_data?.slot_type, tier: stack.item_data?.tier, damageType: stack.item_data?.base_stats?.damage_type, avgQuality: avg4(stack.item_data?.quality) })
      : resourceIconSpec(stack.resource_type_id, avg4(stack.stats));
    return (
      <div key={index} draggable={!busy}
           onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify(dragPayloadFor(stack, source))); e.dataTransfer.effectAllowed = 'move'; cargoTooltip.hide(); }}
           onDragOver={(e) => { e.preventDefault(); setOver(index); }} onDragLeave={() => setOver(null)}
           onDrop={(e) => { e.preventDefault(); setOver(null); const p = parse(e); if (p && onDropStack && p.stack_id !== stack.id) onDropStack(p, { slotIndex: index, targetStack: stack }); }}
           onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); cargoTooltip.show({ stack, x: r.left, y: r.top, slotSize, resourceIcons: {} }); }}
           onMouseLeave={() => cargoTooltip.hide()}
           title={`${isItem ? (stack.item_name || stack.item_id) : stack.resource_name} ×${stack.quantity} — drag to move`}
           style={{ position: 'relative', width: slotSize, height: slotSize, boxSizing: 'border-box', cursor: 'grab', borderRadius: 4,
                    border: over === index ? '2px solid #00ccff' : `2px solid ${border}`,
                    background: `linear-gradient(135deg, ${tint}15 0%, ${tint}08 100%)`, boxShadow: `inset 0 0 8px ${tint}11` }}>
        <div style={{ position: 'absolute', inset: 4, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isItem ? 'rgba(4,8,16,0.35)' : `${tint}22` }}>
          <PixelItemIcon size={slotSize - 12} spec={spec} />
        </div>
        {stack.quantity > 1 && (
          <div style={{ position: 'absolute', bottom: -2, right: -2, fontSize: '0.72rem', fontWeight: 700, padding: '0 3px', borderRadius: 2, lineHeight: 1.2, background: '#000000cc', color: '#fff', minWidth: 14, textAlign: 'center' }}>{stack.quantity}</div>
        )}
        {dot && <div style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 3, background: dot }} />}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${slotSize}px)`, gap: 4, padding: 4, borderRadius: 4, background: '#0a0f1a', border: '1px solid #1e293b', opacity: busy ? 0.7 : 1 }}
         onDragOver={(e) => e.preventDefault()}
         onDrop={(e) => { // drop on the grid's padding = append
           if (e.target !== e.currentTarget) return; e.preventDefault(); const p = parse(e); if (p && onDropStack) onDropStack(p, { slotIndex: null, targetStack: null }); }}>
      {Array.from({ length: total }, (_, i) => tile(i, slotMap[i] || null))}
    </div>
  );
};

export default CargoGrid;
