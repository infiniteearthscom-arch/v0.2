// Cargo Window
// WoW-style inventory grid with drag-and-drop, hover tooltips, and persistent slot positions

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore } from '@/stores/gameStore';
import { getQualityTier, CATEGORY_INFO, RARITY_INFO, RESOURCE_TYPES } from '@/data/resources';
import { resourcesAPI } from '@/utils/api';

// ============================================
// CONSTANTS
// ============================================

const SLOT_SIZE = 40;
const SLOT_GAP = 4;
const GRID_COLS = 6;

// Resource icon abbreviations and colors
const RESOURCE_ICONS = {};
Object.values(RESOURCE_TYPES).forEach(r => {
  const words = r.name.split(/[\s-]+/);
  const abbr = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : r.name.substring(0, 2).toUpperCase();
  RESOURCE_ICONS[r.id] = { abbr, color: r.color, name: r.name };
});

const TIER_BORDER = {
  Impure: '#555555',
  Standard: '#888888',
  Refined: '#44ff44',
  Superior: '#4488ff',
  Pristine: '#aa44ff',
};

// Check if two stacks can merge
const canMerge = (a, b) => {
  if (!a || !b) return false;
  if (a.item_type !== b.item_type) return false;
  
  if (a.item_type === 'item') {
    return a.item_id === b.item_id && 
      JSON.stringify(a.item_data || {}) === JSON.stringify(b.item_data || {});
  }
  
  return a.resource_type_id === b.resource_type_id &&
    a.stats.purity === b.stats.purity &&
    a.stats.stability === b.stats.stability &&
    a.stats.potency === b.stats.potency &&
    a.stats.density === b.stats.density;
};

// ============================================
// TOOLTIP
// ============================================

const ItemTooltip = ({ stack, screenX, screenY }) => {
  const isItem = stack.item_type === 'item';
  
  let left = screenX + SLOT_SIZE + 8;
  let top = screenY - 20;
  if (left + 200 > window.innerWidth) left = screenX - 208;
  if (top + 210 > window.innerHeight) top = window.innerHeight - 220;
  if (top < 0) top = 4;

  if (isItem) {
    const q = stack.item_data?.quality;
    const itemStats = Object.entries(stack.item_data || {}).filter(([k]) => k !== 'quality');
    
    return (
      <div className="fixed z-[9999] pointer-events-none" style={{ left, top }}>
        <div
          className="rounded-lg p-3 shadow-xl min-w-[190px]"
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '2px solid #ffaa00',
            boxShadow: '0 0 12px #ffaa0033',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{stack.item_icon || '📦'}</span>
            <div>
              <div className="font-medium text-sm text-amber-300">{stack.item_name || stack.item_id}</div>
              <div className="text-xs text-slate-400">
                {stack.item_data?.slot_type ? (
                  <span className="capitalize">{stack.item_data.slot_type} module</span>
                ) : (
                  stack.item_category
                )}
              </div>
            </div>
          </div>
          
          {stack.item_data?.quality && (
            <div className="flex gap-2 text-[10px] mb-2">
              <span className="text-slate-500">Q: </span>
              <span className="text-cyan-400">{Math.round((stack.item_data.quality.purity + stack.item_data.quality.stability + stack.item_data.quality.potency + stack.item_data.quality.density) / 4)}</span>
            </div>
          )}
          
          {stack.item_description && (
            <>
              <div className="h-px bg-slate-600/50 mb-2" />
              <div className="text-xs text-slate-300 mb-2">{stack.item_description}</div>
            </>
          )}
          
          {itemStats.length > 0 && (
            <>
              <div className="h-px bg-slate-600/50 mb-2" />
              {itemStats.map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-400">{key.replace(/_/g, ' ')}</span>
                  <span className="text-cyan-300">{value}</span>
                </div>
              ))}
            </>
          )}
          
          {q && (
            <>
              <div className="h-px bg-slate-600/50 my-2" />
              <div className="text-xs text-slate-500 mb-1">Craft Quality</div>
              {['purity', 'stability', 'potency', 'density'].map(stat => {
                const pct = q[stat] || 0;
                const barColor = pct >= 80 ? '#aa44ff' : pct >= 60 ? '#4488ff' : pct >= 40 ? '#44ff44' : pct >= 20 ? '#ffffff' : '#666666';
                return (
                  <div key={stat} className="flex items-center gap-2 text-xs mb-1">
                    <span className="text-slate-500 w-14 capitalize">{stat}</span>
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                    </div>
                    <span className="text-slate-300 w-6 text-right">{pct}</span>
                  </div>
                );
              })}
            </>
          )}
          
          <div className="h-px bg-slate-600/50 my-2" />
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Quantity</span>
            <span className="text-cyan-300 font-medium">{stack.quantity}</span>
          </div>
        </div>
      </div>
    );
  }

  // Resource tooltip
  const tier = getQualityTier(
    stack.stats.purity, stack.stats.stability,
    stack.stats.potency, stack.stats.density
  );
  const iconInfo = RESOURCE_ICONS[stack.resource_type_id];
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
            className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: iconInfo?.color + '44', color: iconInfo?.color, border: `1px solid ${iconInfo?.color}88` }}
          >
            {iconInfo?.abbr}
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
            const barColor = pct >= 80 ? '#aa44ff' : pct >= 60 ? '#4488ff' : pct >= 40 ? '#44ff44' : pct >= 20 ? '#ffffff' : '#666666';
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

// ============================================
// CARGO BAR
// ============================================

const CargoBar = ({ capacity, used, slotCount, usedSlots, shipCount }) => {
  const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#eab308' : '#22d3ee';
  const displayUsed = Number.isInteger(used) ? used : used.toFixed(1);

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">🚀 Fleet Cargo ({shipCount || 1} {shipCount === 1 ? 'ship' : 'ships'}) • {usedSlots}/{slotCount} slots</span>
        <span style={{ color }}>{displayUsed}/{capacity} vol ({pct}%)</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const InventoryWindow = () => {
  const windows = useGameStore(state => state.windows);
  const isOpen = windows.inventory?.open;

  const [inventory, setInventory] = useState([]); // flat array of stacks
  const [cargo, setCargo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredStack, setHoveredStack] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dragItem, setDragItem] = useState(null); // stack being dragged
  const [dragOverSlot, setDragOverSlot] = useState(null); // slot index being hovered during drag
  const [trashDragOver, setTrashDragOver] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState(null); // stack to confirm trashing
  const containerRef = useRef(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await resourcesAPI.getInventory();
      const allStacks = [];
      
      // Resources
      for (const resource of (data.inventory || [])) {
        for (const stack of resource.stacks) {
          allStacks.push({
            ...stack,
            item_type: 'resource',
            resource_type_id: resource.resource_type_id,
            resource_name: resource.resource_name,
            category: resource.category,
            rarity: resource.rarity,
            base_price: resource.base_price,
            icon: resource.icon,
          });
        }
      }
      
      // Items (crafted goods)
      for (const item of (data.items || [])) {
        allStacks.push({
          ...item,
          item_type: 'item',
        });
      }
      
      setInventory(allStacks);
      setCargo(data.cargo || null);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchInventory();
  }, [isOpen, fetchInventory]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchInventory, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchInventory]);

  if (!isOpen) return null;

  // Calculate total slots — use server-provided count, fallback to capacity/10
  const maxOccupiedSlot = inventory.reduce((max, s) => Math.max(max, s.slot_index ?? -1), -1);
  const serverSlots = cargo?.totalSlots || (cargo ? Math.floor(cargo.capacity / 10) : GRID_COLS);
  const totalSlots = Math.max(GRID_COLS, serverSlots, maxOccupiedSlot + 1);
  const usedSlots = inventory.length;

  // Build a slot map: slot_index -> stack
  const slotMap = {};
  for (const stack of inventory) {
    if (stack.slot_index != null) {
      slotMap[stack.slot_index] = stack;
    }
  }
  // Items without slot_index get appended to first available slots
  const unslotted = inventory.filter(s => s.slot_index == null);
  let nextFree = 0;
  for (const stack of unslotted) {
    while (slotMap[nextFree] != null) nextFree++;
    slotMap[nextFree] = stack;
    stack._tempSlot = nextFree;
    nextFree++;
  }

  // Generate slot array
  const slots = [];
  for (let i = 0; i < totalSlots; i++) {
    slots.push({ index: i, stack: slotMap[i] || null });
  }

  // Drag handlers
  const handleDragStart = (stack, slotIndex) => {
    setDragItem({ ...stack, fromSlot: slotIndex });
    setHoveredStack(null);
  };

  const handleDragOver = (e, slotIndex) => {
    e.preventDefault();
    setDragOverSlot(slotIndex);
  };

  const handleDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleDrop = async (targetSlotIndex) => {
    if (!dragItem) return;
    setDragOverSlot(null);

    const targetStack = slotMap[targetSlotIndex];
    const fromSlot = dragItem.fromSlot;

    if (fromSlot === targetSlotIndex) {
      setDragItem(null);
      return;
    }

    // Check if we can merge
    if (targetStack && canMerge(dragItem, targetStack) && dragItem.id !== targetStack.id) {
      try {
        await resourcesAPI.mergeStacks(dragItem.id, targetStack.id);
        await fetchInventory();
      } catch (err) {
        setError(err.message);
      }
    } else {
      // Move/swap
      try {
        await resourcesAPI.moveItem(dragItem.id, targetSlotIndex);
        await fetchInventory();
      } catch (err) {
        setError(err.message);
      }
    }

    setDragItem(null);
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDragOverSlot(null);
  };

  const handleSlotHover = (stack, e) => {
    if (dragItem) return;
    const slotRect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: slotRect.left,
      y: slotRect.top,
    });
    setHoveredStack(stack);
  };

  const getSlotStyle = (slotIndex, stack) => {
    const isDragSource = dragItem && dragItem.fromSlot === slotIndex;
    const isDragTarget = dragOverSlot === slotIndex;
    const wouldMerge = isDragTarget && stack && dragItem && canMerge(dragItem, stack) && dragItem.id !== stack.id;

    if (isDragSource) {
      return {
        opacity: 0.3,
        border: '2px dashed #334455',
      };
    }
    if (wouldMerge) {
      return {
        border: '2px solid #44ff44',
        boxShadow: '0 0 8px #44ff4444',
        background: '#44ff4411',
      };
    }
    if (isDragTarget) {
      return {
        border: '2px solid #00ccff',
        boxShadow: '0 0 8px #00ccff44',
      };
    }
    return {};
  };

  // Calculate grid dimensions
  const gridRows = Math.ceil(totalSlots / GRID_COLS);
  const gridContentHeight = gridRows * (SLOT_SIZE + SLOT_GAP) + SLOT_GAP + 2; // +2 for border
  const cargoBarHeight = 40;
  const footerHeight = 36;
  const trashZoneHeight = 40;
  const padding = 24; // window padding
  const titleBarHeight = 36;
  
  // Max rows before scrolling (100 slots / 6 cols ≈ 17 rows)
  const maxRowsBeforeScroll = Math.ceil(100 / GRID_COLS);
  const maxGridHeight = maxRowsBeforeScroll * (SLOT_SIZE + SLOT_GAP) + SLOT_GAP + 2;
  
  const clampedGridHeight = Math.min(gridContentHeight, maxGridHeight);
  const windowHeight = titleBarHeight + cargoBarHeight + clampedGridHeight + footerHeight + trashZoneHeight + padding;
  const windowWidth = GRID_COLS * (SLOT_SIZE + SLOT_GAP) + SLOT_GAP + 2 + 32; // grid + padding

  return (
    <DraggableWindow
      windowId="inventory"
      title="Cargo"
      initialWidth={windowWidth}
      initialHeight={Math.min(windowHeight, 900)}
      minWidth={windowWidth}
      minHeight={250}
    >
      <div className="flex flex-col h-full relative" ref={containerRef}>
        {cargo && (
          <CargoBar
            capacity={cargo.capacity}
            used={cargo.used}
            slotCount={totalSlots}
            usedSlots={usedSlots}
            shipCount={cargo.shipCount}
          />
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-2 text-red-400 text-xs mb-2">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300">✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && inventory.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm animate-pulse">Loading cargo...</div>
          ) : (
            <div
              className="inline-grid p-1 rounded-lg"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, ${SLOT_SIZE}px)`,
                gap: SLOT_GAP,
                background: '#0a0f1a',
                border: '1px solid #1e293b',
              }}
            >
              {slots.map(({ index, stack }) => {
                const overrideStyle = getSlotStyle(index, stack);

                if (stack) {
                  const isItem = stack.item_type === 'item';
                  
                  let borderColor, iconContent, iconBg, iconColor, qualityDot;
                  
                  if (isItem) {
                    borderColor = '#ffaa00';
                    iconContent = stack.item_icon || '📦';
                    iconBg = '#ffaa0022';
                    iconColor = '#ffaa00';
                    qualityDot = null;
                    
                    // Module items — use slot type color
                    const SLOT_TYPE_COLORS = {
                      engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff',
                      cargo: '#ddaa22', utility: '#22ccaa', reactor: '#00ddff', mining: '#aa66ff',
                    };
                    const slotType = stack.item_data?.slot_type;
                    if (slotType && SLOT_TYPE_COLORS[slotType]) {
                      borderColor = SLOT_TYPE_COLORS[slotType];
                      iconBg = SLOT_TYPE_COLORS[slotType] + '22';
                      iconColor = SLOT_TYPE_COLORS[slotType];
                    }
                    
                    // Quality-based border brightness for crafted items with quality data
                    if (stack.item_data?.quality) {
                      const q = stack.item_data.quality;
                      const avg = (q.purity + q.stability + q.potency + q.density) / 4;
                      if (avg >= 80) qualityDot = '#aa44ff';
                      else if (avg >= 60) qualityDot = '#4488ff';
                      else if (avg >= 40) qualityDot = '#44ff44';
                    }
                  } else {
                    const tier = getQualityTier(
                      stack.stats.purity, stack.stats.stability,
                      stack.stats.potency, stack.stats.density
                    );
                    const iconInfo = RESOURCE_ICONS[stack.resource_type_id];
                    borderColor = TIER_BORDER[tier.name] || '#444';
                    iconContent = iconInfo?.abbr;
                    iconBg = iconInfo?.color + '33';
                    iconColor = iconInfo?.color;
                    qualityDot = tier.color;
                  }

                  return (
                    <div
                      key={`slot-${index}`}
                      className="relative cursor-grab active:cursor-grabbing transition-all hover:brightness-125"
                      draggable
                      onDragStart={(e) => {
                        // Set drag data for cross-window drag
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          stack_id: stack.id,
                          item_type: stack.item_type,
                          resource_type_id: stack.resource_type_id,
                          resource_name: stack.resource_name,
                          item_id: stack.item_id,
                          item_name: stack.item_name,
                          quantity: stack.quantity,
                          stats: stack.stats,
                          slot_index: index,
                          category: stack.category,
                        }));
                        e.dataTransfer.effectAllowed = 'move';
                        handleDragStart(stack, index);
                      }}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(index)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={(e) => handleSlotHover(stack, e)}
                      onMouseLeave={() => setHoveredStack(null)}
                      style={{
                        width: SLOT_SIZE,
                        height: SLOT_SIZE,
                        border: `2px solid ${borderColor}`,
                        borderRadius: 4,
                        background: isItem
                          ? `linear-gradient(135deg, ${borderColor}15 0%, ${borderColor}08 100%)`
                          : `linear-gradient(135deg, ${iconColor}15 0%, ${iconColor}08 100%)`,
                        boxShadow: isItem ? `inset 0 0 8px ${borderColor}11` : `inset 0 0 8px ${iconColor}11`,
                        ...overrideStyle,
                      }}
                    >
                      <div
                        className="absolute inset-1 rounded flex items-center justify-center font-bold"
                        style={isItem ? {
                          fontSize: '16px',
                        } : {
                          fontSize: '11px',
                          backgroundColor: iconBg,
                          color: iconColor,
                          textShadow: `0 0 4px ${iconColor}66`,
                        }}
                      >
                        {iconContent}
                      </div>

                      {stack.quantity > 1 && (
                        <div
                          className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold px-1 rounded-sm leading-tight"
                          style={{ backgroundColor: '#000000cc', color: '#ffffff', minWidth: 14, textAlign: 'center' }}
                        >
                          {stack.quantity}
                        </div>
                      )}

                      {qualityDot && (
                        <div
                          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: qualityDot }}
                        />
                      )}
                    </div>
                  );
                }

                // Empty slot
                return (
                  <div
                    key={`slot-${index}`}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(index)}
                    style={{
                      width: SLOT_SIZE,
                      height: SLOT_SIZE,
                      border: '1px solid #1e293b',
                      borderRadius: 4,
                      background: '#0f172a44',
                      transition: 'all 0.15s',
                      ...(dragOverSlot === index ? {
                        border: '2px solid #00ccff',
                        boxShadow: '0 0 8px #00ccff44',
                      } : {}),
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Trash zone - visible when dragging */}
        {dragItem && (
          <div
            className="mt-2 py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
            onDragOver={(e) => { e.preventDefault(); setTrashDragOver(true); }}
            onDragLeave={() => setTrashDragOver(false)}
            onDrop={() => {
              setTrashDragOver(false);
              if (dragItem) {
                setTrashConfirm(dragItem);
              }
              setDragItem(null);
            }}
            style={{
              border: trashDragOver ? '2px solid #ef4444' : '2px dashed #44444488',
              background: trashDragOver ? '#ef444418' : '#1a0000',
              boxShadow: trashDragOver ? '0 0 12px #ef444433' : 'none',
            }}
          >
            <span className="text-sm">🗑️</span>
            <span className={`text-xs ${trashDragOver ? 'text-red-400' : 'text-slate-600'}`}>
              Drop to trash
            </span>
          </div>
        )}

        {/* Trash confirmation */}
        {trashConfirm && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
            <div className="bg-slate-900 border border-slate-600 rounded-lg p-4 shadow-2xl max-w-[280px]">
              <div className="text-sm text-slate-200 mb-3">
                Trash <span className="text-red-400 font-medium">
                  {trashConfirm.quantity}× {trashConfirm.item_type === 'item' ? (trashConfirm.item_name || trashConfirm.item_id) : trashConfirm.resource_name}
                </span>?
              </div>
              <div className="text-xs text-slate-500 mb-4">This cannot be undone.</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTrashConfirm(null)}
                  className="flex-1 py-1.5 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await resourcesAPI.trashItem(trashConfirm.id);
                      await fetchInventory();
                    } catch (err) {
                      setError(err.message);
                    }
                    setTrashConfirm(null);
                  }}
                  className="flex-1 py-1.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white transition-colors"
                >
                  Trash
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div className="border-t border-slate-700/50 pt-2 mt-2 flex justify-between text-xs text-slate-500">
          <span>{usedSlots > 0 ? `${usedSlots} item${usedSlots !== 1 ? 's' : ''}` : 'Empty'}</span>
          <button onClick={fetchInventory} className="text-cyan-400/60 hover:text-cyan-400 transition-colors">
            ↻ Refresh
          </button>
        </div>

        {hoveredStack && !dragItem && createPortal(
          <ItemTooltip
            stack={hoveredStack}
            screenX={tooltipPos.x}
            screenY={tooltipPos.y}
          />,
          document.body
        )}
      </div>
    </DraggableWindow>
  );
};

export default InventoryWindow;
