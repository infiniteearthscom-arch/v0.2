// Crafting Window
// Select recipes, drag resources from Cargo window into ingredient slots, craft items

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { RESOURCE_TYPES, getQualityTier } from '@/data/resources';
import { qualityMultiplier, STAT_META, fmtStatValue, statModifierColor } from '@/utils/quality';
import { resourcesAPI } from '@/utils/api';
import { COLORS, FONT, SectionHead, PanelButton, MessageBar, glow } from '@/components/ui/panelStyles';

// ============================================
// CONSTANTS
// ============================================

const CATEGORY_ICONS = {
  scanner: '📡',
  harvester: '⚙️',
  fuel: '🔋',
  upgrade: '🔧',
  module: '🚀',
};

const CATEGORY_ORDER = ['module', 'scanner', 'harvester', 'fuel', 'upgrade'];

const CATEGORY_LABELS = {
  module: 'Ship Modules',
  scanner: 'Scanners',
  harvester: 'Harvesters',
  fuel: 'Fuel',
  upgrade: 'Upgrades',
};

// Module subcategories based on output item_id prefix
const MODULE_SUBCATEGORIES = {
  engine: { label: 'Engines', icon: '🔥', color: '#ff6622' },
  reactor: { label: 'Reactors', icon: '⚛️', color: '#00ddff' },
  cargo: { label: 'Cargo', icon: '📦', color: '#ddaa22' },
  weapon: { label: 'Weapons', icon: '🔫', color: '#ff2244' },
  shield: { label: 'Shields', icon: '🛡️', color: '#8844ff' },
  utility: { label: 'Utility', icon: '🔧', color: '#22ccaa' },
  mining: { label: 'Mining', icon: '⛏️', color: '#aa66ff' },
};

const MODULE_SUBCAT_ORDER = ['engine', 'reactor', 'cargo', 'weapon', 'shield', 'utility', 'mining'];

// Map resource names to their RESOURCE_TYPES colors
const RESOURCE_COLORS = {};
Object.values(RESOURCE_TYPES).forEach(r => {
  RESOURCE_COLORS[r.name] = r.color;
});

// ============================================
// RECIPE CARD (sidebar)
// ============================================

const RecipeCard = ({ recipe, isSelected, onClick }) => {
  const canCraft = recipe.can_craft;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 8px',
        borderRadius: 3,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        background: isSelected
          ? `linear-gradient(135deg, ${COLORS.PURPLE.pri}18, transparent)`
          : canCraft
            ? COLORS.ROW_BG
            : 'rgba(4,8,16,0.3)',
        border: `1px solid ${COLORS.EDGE}`,
        borderLeft: isSelected
          ? `2px solid ${COLORS.PURPLE.light}`
          : `2px solid ${canCraft ? COLORS.EDGE : '#0a1020'}`,
        opacity: canCraft ? 1 : 0.5,
        transition: 'all 0.15s',
        boxShadow: isSelected ? glow(COLORS.PURPLE.light, 0.15) : 'none',
        marginBottom: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{recipe.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: isSelected ? COLORS.TEXT.primary : COLORS.TEXT.secondary,
            fontFamily: FONT.ui,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>{recipe.name}</div>
          <div style={{
            fontSize: 8,
            color: COLORS.TEXT.dim,
            fontFamily: FONT.mono,
            letterSpacing: 0.3,
          }}>{recipe.category}</div>
        </div>
        {canCraft && (
          <div style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: COLORS.GREEN.light,
            boxShadow: glow(COLORS.GREEN.light, 0.5),
            flexShrink: 0,
          }} />
        )}
      </div>
    </div>
  );
};

// ============================================
// INGREDIENT SLOT (drop target)
// ============================================

const IngredientSlot = ({ ingredient, assigned, onDrop, onRemove, resourceCounts }) => {
  const [dragOver, setDragOver] = useState(false);
  const needed = ingredient.quantity;
  const resourceName = ingredient.resource_name;
  const color = RESOURCE_COLORS[resourceName] || '#888';
  const available = resourceCounts?.[resourceName] || 0;
  
  const isFilled = assigned && assigned.quantity >= needed;
  const isPartial = assigned && assigned.quantity > 0 && assigned.quantity < needed;
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      // We can't read dataTransfer during dragover, so just show the indicator
      setDragOver(true);
      e.dataTransfer.dropEffect = 'copy';
    } catch (err) {}
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data && data.item_type === 'resource') {
        onDrop(data);
      }
    } catch (err) {
      console.error('Drop parse error:', err);
    }
  };
  
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        borderRadius: 3,
        padding: 8,
        transition: 'all 0.15s',
        border: dragOver
          ? `1px dashed ${COLORS.BLUE.light}`
          : isFilled
            ? `1px solid ${color}88`
            : isPartial
              ? `1px solid ${COLORS.GOLD.pri}88`
              : `1px dashed ${COLORS.EDGE}`,
        borderLeft: dragOver
          ? `2px dashed ${COLORS.BLUE.light}`
          : isFilled
            ? `2px solid ${color}`
            : isPartial
              ? `2px solid ${COLORS.GOLD.pri}`
              : `2px dashed ${COLORS.EDGE}`,
        background: dragOver
          ? `${COLORS.BLUE.pri}10`
          : isFilled
            ? `${color}10`
            : COLORS.ROW_BG,
        boxShadow: dragOver ? glow(COLORS.BLUE.light, 0.2) : 'none',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 5,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color,
          fontFamily: FONT.ui,
          letterSpacing: 0.3,
          textTransform: 'capitalize',
        }}>
          {resourceName}
        </span>
        <span style={{
          fontSize: 9,
          color: COLORS.TEXT.dim,
          fontFamily: FONT.mono,
          letterSpacing: 0.3,
        }}>
          {available} AVAIL
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          flex: 1,
          height: 5,
          background: '#0a1528',
          border: `1px solid ${COLORS.EDGE}`,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, ((assigned?.quantity || 0) / needed) * 100)}%`,
              background: isFilled
                ? `linear-gradient(90deg, ${COLORS.GREEN.dim}, ${COLORS.GREEN.light})`
                : isPartial
                  ? `linear-gradient(90deg, ${COLORS.GOLD.dim}, ${COLORS.GOLD.light})`
                  : COLORS.EDGE,
              transition: 'width 0.3s',
            }}
          />
        </div>

        <span style={{
          fontSize: 9,
          fontFamily: FONT.mono,
          fontWeight: 700,
          color: isFilled ? COLORS.GREEN.light : isPartial ? COLORS.GOLD.light : COLORS.TEXT.dim,
          minWidth: 36,
          textAlign: 'right',
        }}>
          {assigned?.quantity || 0}/{needed}
        </span>
      </div>

      {/* Assigned stacks */}
      {assigned && assigned.stacks.length > 0 && (
        <div style={{
          marginTop: 6,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
        }}>
          {assigned.stacks.map((s, i) => (
            <div
              key={i}
              onClick={() => onRemove(i)}
              title="Click to remove"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 2,
                fontSize: 9,
                fontFamily: FONT.mono,
                cursor: 'pointer',
                background: `${color}22`,
                border: `1px solid ${color}55`,
              }}
            >
              <span style={{ color }}>{s.quantity}×</span>
              <span style={{ color: COLORS.TEXT.muted }}>
                Q{s.stats ? Math.round((s.stats.purity + s.stats.stability + s.stats.potency + s.stats.density) / 4) : '?'}
              </span>
              <span style={{ color: COLORS.RED.light, marginLeft: 2 }}>✕</span>
            </div>
          ))}
        </div>
      )}

      {!assigned && (
        <div style={{
          marginTop: 5,
          fontSize: 9,
          color: COLORS.TEXT.dim,
          textAlign: 'center',
          fontFamily: FONT.ui,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          Drag from cargo
        </div>
      )}
    </div>
  );
};

// ============================================
// OUTPUT PREVIEW
// ============================================

const OutputPreview = ({ recipe, assignedIngredients }) => {
  if (!recipe) return null;

  // Calculate weighted average quality from all assigned resources.
  // Matches the server's /craft math at resources.js:719-723 so what
  // the preview promises is what the server delivers.
  let totalPurity = 0, totalStability = 0, totalPotency = 0, totalDensity = 0, totalWeight = 0;

  for (const ing of Object.values(assignedIngredients)) {
    for (const stack of (ing?.stacks || [])) {
      if (stack.stats) {
        totalPurity += (stack.stats.purity || 0) * stack.quantity;
        totalStability += (stack.stats.stability || 0) * stack.quantity;
        totalPotency += (stack.stats.potency || 0) * stack.quantity;
        totalDensity += (stack.stats.density || 0) * stack.quantity;
        totalWeight += stack.quantity;
      }
    }
  }

  const avgQuality = totalWeight > 0
    ? Math.round((totalPurity + totalStability + totalPotency + totalDensity) / (totalWeight * 4))
    : 0;

  // Build a synthetic "fitted-module" shape for the shared quality
  // helper. The helper reads .quality so we mirror what the server
  // will stamp on the crafted item. Per-stat scaling rules then
  // come straight from STAT_META (same source ShipBuilderWindow uses
  // for the post-craft fitted view -- no drift between projection and
  // reality).
  const fakeFitted = totalWeight > 0
    ? { quality: {
        purity:    totalPurity / totalWeight,
        stability: totalStability / totalWeight,
        potency:   totalPotency / totalWeight,
        density:   totalDensity / totalWeight,
      } }
    : null;

  // Iterate every numeric field on item_data_defaults so weapon recipes
  // (damage, range, fire_rate) and harvester recipes (harvest_rate,
  // storage_capacity, fuel_hours) both render correctly. Non-numeric
  // fields (slot_type, etc.) are skipped.
  const baseData = recipe.item_data_defaults || {};
  const previewRows = Object.entries(baseData)
    .filter(([, v]) => typeof v === 'number')
    .map(([key, val]) => {
      const meta = STAT_META[key];
      const label = meta?.label || key.replace(/_/g, ' ').toUpperCase();
      const mult = fakeFitted
        ? qualityMultiplier(fakeFitted, { power: meta?.power ?? 1, invert: meta?.invert ?? false })
        : 1.0;
      const scaled = val * mult;
      return { key, label, val, scaled, mult, meta };
    });
  
  return (
    <div style={{
      background: COLORS.ROW_BG,
      border: `1px solid ${COLORS.EDGE}`,
      borderLeft: `2px solid ${COLORS.GOLD.pri}`,
      borderRadius: 3,
      padding: 10,
    }}>
      <div style={{
        fontSize: 9,
        color: COLORS.GOLD.light,
        fontFamily: FONT.mono,
        letterSpacing: 1,
        marginBottom: 6,
        textTransform: 'uppercase',
        fontWeight: 700,
      }}>◆ Output</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{recipe.icon}</span>
        <div>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: COLORS.GOLD.light,
            fontFamily: FONT.ui,
          }}>{recipe.name}</div>
          <div style={{
            fontSize: 9,
            color: COLORS.TEXT.dim,
            fontFamily: FONT.mono,
          }}>×{recipe.output_quantity}</div>
        </div>
      </div>

      {totalWeight > 0 && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 9,
              color: COLORS.TEXT.muted,
              fontFamily: FONT.mono,
              letterSpacing: 0.5,
            }}>QUALITY</span>
            <div style={{
              flex: 1,
              height: 5,
              background: '#0a1528',
              border: `1px solid ${COLORS.EDGE}`,
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${avgQuality}%`,
                  background: avgQuality >= 80 ? COLORS.PURPLE.light
                    : avgQuality >= 60 ? COLORS.BLUE.light
                    : avgQuality >= 40 ? COLORS.GREEN.light
                    : COLORS.TEXT.dim,
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <span style={{
              fontSize: 9,
              fontFamily: FONT.mono,
              fontWeight: 700,
              color: COLORS.TEXT.primary,
              minWidth: 18,
              textAlign: 'right',
            }}>{avgQuality}</span>
          </div>

          {previewRows.map(({ key, label, val, scaled, mult, meta }) => {
            const differs = Math.abs(scaled - val) > 0.005;
            const multColor = statModifierColor(scaled, val, meta);
            return (
              <div key={key} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: 10,
                fontFamily: FONT.mono,
                padding: '2px 0',
                borderBottom: '1px solid rgba(26,48,80,0.3)',
              }}>
                <span style={{ color: COLORS.TEXT.muted, letterSpacing: 0.5 }}>{label.toUpperCase()}</span>
                <span>
                  <span style={{ color: COLORS.BLUE.light, fontWeight: 700 }}>
                    {fmtStatValue(scaled, meta)}
                  </span>
                  {differs && (
                    <>
                      <span style={{ color: COLORS.TEXT.dim, marginLeft: 6 }}>
                        (base {fmtStatValue(val, meta)})
                      </span>
                      <span style={{ color: multColor, marginLeft: 6, fontWeight: 700 }}>
                        ×{mult.toFixed(2)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

// ============================================
// CARGO SIDEBAR (embedded in CraftingWindow)
// ============================================
// Renders cargo stacks using the EXACT same visual code as the main
// InventoryWindow grid (RESOURCE_ICONS abbreviation + TIER_BORDER +
// quality dot + stack count badge) so the player sees identical
// tiles in both places. No ItemCell here -- the standardized
// CargoPanel extraction is filed in the backlog; until then,
// copying the InventoryWindow render verbatim is the most reliable
// way to guarantee visual parity.
//
// Interaction model: LEFT CLICK a tile to assign that stack to the
// currently-selected recipe's matching ingredient. The existing X
// button on each assigned stack in the middle column handles
// removal. Drag-drop still works for any user who prefers it.

const CARGO_SLOT_SIZE = 40;

// Mirror of InventoryWindow's RESOURCE_ICONS / TIER_BORDER. Kept
// duplicated rather than imported because InventoryWindow doesn't
// export them; extracting both to a shared module is the standardize
// pass on the backlog.
const CARGO_RESOURCE_ICONS = {};
Object.values(RESOURCE_TYPES).forEach(r => {
  const words = r.name.split(/[\s-]+/);
  const abbr = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : r.name.substring(0, 2).toUpperCase();
  CARGO_RESOURCE_ICONS[r.id] = { abbr, color: r.color, name: r.name };
});

const CARGO_TIER_BORDER = {
  Impure:   '#555555',
  Standard: '#888888',
  Refined:  '#44ff44',
  Superior: '#4488ff',
  Pristine: '#aa44ff',
};

// Single cargo tile -- visual code lifted from InventoryWindow's
// stack render so the two views are pixel-identical. `matchesRecipe`
// adds a subtle glow when the tile's resource is one the currently
// selected recipe wants, so the player can scan their cargo and see
// at a glance which stacks are useful right now.
const CargoStackTile = ({ stack, matchesRecipe, onClick }) => {
  const tier = getQualityTier(
    stack.stats.purity, stack.stats.stability,
    stack.stats.potency, stack.stats.density
  );
  const iconInfo = CARGO_RESOURCE_ICONS[stack.resource_type_id];
  const borderColor = CARGO_TIER_BORDER[tier.name] || '#444';
  const iconContent = iconInfo?.abbr;
  const iconBg = (iconInfo?.color || '#888') + '33';
  const iconColor = iconInfo?.color || '#888';
  const qualityDot = tier.color;

  return (
    <div
      className="relative cursor-pointer transition-all hover:brightness-125"
      draggable
      onDragStart={(e) => {
        // Same payload shape as InventoryWindow so IngredientSlot's
        // drop handler accepts it byte-for-byte.
        e.dataTransfer.setData('application/json', JSON.stringify({
          stack_id: stack.id,
          item_type: 'resource',
          resource_type_id: stack.resource_type_id,
          resource_name: stack.resource_name,
          quantity: stack.quantity,
          stats: stack.stats,
          category: stack.category,
        }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      title={onClick ? `Click to assign ${stack.resource_name}` : stack.resource_name}
      style={{
        width: CARGO_SLOT_SIZE,
        height: CARGO_SLOT_SIZE,
        border: `2px solid ${borderColor}`,
        borderRadius: 4,
        background: `linear-gradient(135deg, ${iconColor}15 0%, ${iconColor}08 100%)`,
        boxShadow: matchesRecipe
          ? `0 0 8px ${iconColor}aa, inset 0 0 8px ${iconColor}33`
          : `inset 0 0 8px ${iconColor}11`,
        opacity: matchesRecipe || !onClick ? 1 : 0.55,
      }}
    >
      <div
        className="absolute inset-1 rounded flex items-center justify-center font-bold"
        style={{
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
};

const CraftingCargoPanel = ({ isOpen, selectedRecipe, onAssign }) => {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resourcesAPI.getInventory();
      const out = [];
      for (const resource of (data.inventory || [])) {
        for (const stack of resource.stacks) {
          out.push({
            ...stack,
            resource_type_id: resource.resource_type_id,
            resource_name: resource.resource_name,
            category: resource.category,
          });
        }
      }
      setStacks(out);
    } catch (err) {
      console.error('Cargo panel load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchInventory();
  }, [isOpen, fetchInventory]);

  // Auto-refresh so quantities track recent crafts / mines.
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchInventory, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchInventory]);

  // Set of resource names the selected recipe needs -- drives the
  // matching-tile glow + which tiles respond to click.
  const wantedNames = new Set(
    (selectedRecipe?.ingredients || []).map(i => i.resource_name)
  );

  const hasAny = stacks.length > 0;

  return (
    <div
      className="flex flex-col h-full min-h-0"
      style={{
        width: 220,
        flexShrink: 0,
        background: '#0c1018',
        borderRadius: 6,
        border: '1px solid #1e293b',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-700/40">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 12 }}>📦</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Cargo</span>
        </div>
        <button
          onClick={fetchInventory}
          title="Refresh from cargo"
          className="text-[10px] text-slate-500 hover:text-cyan-300 transition-colors px-1"
        >
          ↻
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-1.5" style={{ scrollbarWidth: 'thin' }}>
        {loading && !hasAny && (
          <div className="text-[10px] text-slate-600 text-center mt-3">Loading…</div>
        )}
        {!loading && !hasAny && (
          <div className="text-[10px] text-slate-500 text-center mt-3 px-2 leading-snug">
            Cargo is empty.
            <div className="text-slate-600 mt-1">Mine asteroids or planet deposits to fill cargo with resources.</div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 px-0.5">
          {stacks.map(stack => {
            const matches = wantedNames.has(stack.resource_name);
            return (
              <CargoStackTile
                key={stack.id}
                stack={stack}
                matchesRecipe={matches}
                // Only wire click when a recipe is selected AND the
                // tile matches an ingredient. Clicking a non-matching
                // tile would be a no-op anyway since IngredientSlot
                // rejects mismatched resource names.
                onClick={(selectedRecipe && matches)
                  ? () => onAssign(stack)
                  : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-2 py-1 border-t border-slate-700/40 text-[9px] text-slate-500 text-center leading-tight">
        {selectedRecipe
          ? 'Click a glowing tile to add it · X on a slot to remove'
          : 'Select a recipe first, then click cargo tiles to add'}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const CraftingWindow = () => {
  const windows = useGameStore(state => state.windows);
  const completeQuest = useGameStore(state => state.completeQuest);
  const isOpen = windows.crafting?.open;
  // Tier B vendor → crafting deep link: when the vendor's "Craft this"
  // button is clicked it sets craftingTargetRecipeId then opens this
  // window. We watch the target, select the matching recipe on the
  // first render that has it loaded, and clear so re-opens don't
  // re-fire.
  const craftingTarget = useGameStore(state => state.craftingTargetRecipeId);
  const clearCraftingTarget = useGameStore(state => state.clearCraftingTargetRecipe);
  // Tech list drives the locked-recipe UI; clicking the lock badge
  // sets researchTargetTechId and opens the research window.
  const techs = useGameStore(state => state.techs);
  const setResearchTargetTech = useGameStore(state => state.setResearchTargetTech);
  const openWindow = useGameStore(state => state.openWindow);

  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [assignedIngredients, setAssignedIngredients] = useState({}); // resourceName -> { quantity, stacks: [{stack_id, quantity, stats}] }
  const [loading, setLoading] = useState(false);
  const [crafting, setCrafting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resourcesAPI.getRecipes();
      setRecipes(data.recipes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchRecipes();
  }, [isOpen, fetchRecipes]);

  // Refresh recipes periodically to keep resource counts current
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchRecipes, 10000);
    return () => clearInterval(interval);
  }, [isOpen, fetchRecipes]);

  // Vendor → crafting deep link: when craftingTarget is set + recipes
  // have loaded, auto-select the matching recipe + clear the target.
  useEffect(() => {
    if (!craftingTarget || recipes.length === 0) return;
    const target = recipes.find(r => r.id === craftingTarget);
    if (target) {
      setSelectedRecipe(target);
      setAssignedIngredients({});
      setError(null);
      setSuccess(null);
    }
    clearCraftingTarget();
  }, [craftingTarget, recipes, clearCraftingTarget]);

  const selectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setAssignedIngredients({});
    setError(null);
    setSuccess(null);
  };

  const handleIngredientDrop = (ingredientName, neededQty, dropData) => {
    // dropData comes from cargo drag: { stack_id, resource_name, quantity, stats }
    if (dropData.resource_name !== ingredientName) {
      setError(`Need ${ingredientName}, not ${dropData.resource_name}`);
      setTimeout(() => setError(null), 2000);
      return;
    }

    setAssignedIngredients(prev => {
      const existing = prev[ingredientName] || { quantity: 0, stacks: [] };
      const remaining = neededQty - existing.quantity;
      
      if (remaining <= 0) return prev; // Already full
      
      // Check if this stack is already assigned
      const alreadyAssigned = existing.stacks.find(s => s.stack_id === dropData.stack_id);
      const alreadyUsed = alreadyAssigned ? alreadyAssigned.quantity : 0;
      const availableFromStack = dropData.quantity - alreadyUsed;
      
      if (availableFromStack <= 0) return prev;
      
      const toAssign = Math.min(remaining, availableFromStack);
      
      let newStacks;
      if (alreadyAssigned) {
        newStacks = existing.stacks.map(s =>
          s.stack_id === dropData.stack_id
            ? { ...s, quantity: s.quantity + toAssign }
            : s
        );
      } else {
        newStacks = [...existing.stacks, {
          stack_id: dropData.stack_id,
          quantity: toAssign,
          resource_name: dropData.resource_name,
          stats: dropData.stats,
        }];
      }
      
      return {
        ...prev,
        [ingredientName]: {
          quantity: existing.quantity + toAssign,
          stacks: newStacks,
        },
      };
    });
  };

  const handleRemoveStack = (ingredientName, stackIndex) => {
    setAssignedIngredients(prev => {
      const existing = prev[ingredientName];
      if (!existing) return prev;
      
      const removed = existing.stacks[stackIndex];
      const newStacks = existing.stacks.filter((_, i) => i !== stackIndex);
      
      return {
        ...prev,
        [ingredientName]: {
          quantity: existing.quantity - removed.quantity,
          stacks: newStacks,
        },
      };
    });
  };

  const canCraftNow = selectedRecipe && selectedRecipe.ingredients.every(ing => {
    const assigned = assignedIngredients[ing.resource_name];
    return assigned && assigned.quantity >= ing.quantity;
  });

  const handleCraft = async () => {
    if (!canCraftNow || crafting) return;
    
    setCrafting(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Build ingredients array for server
      const ingredients = [];
      for (const ing of Object.values(assignedIngredients)) {
        for (const stack of ing.stacks) {
          ingredients.push({ stack_id: stack.stack_id, quantity: stack.quantity });
        }
      }
      
      const result = await resourcesAPI.craft(selectedRecipe.id, ingredients);

      setSuccess(`Crafted ${result.crafted.item_name}!`);
      setAssignedIngredients({});

      // Refresh recipes to update resource counts
      await fetchRecipes();

      // Tutorial: crafting the basic harvester completes "Build the Bot".
      // Server is idempotent so this is safe to fire even when the
      // quest is already complete / not active.
      if (completeQuest && selectedRecipe.id === 'craft_basic_harvester') {
        completeQuest('tutorial_craft_harvester');
      }

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setCrafting(false);
    }
  };

  if (!isOpen) return null;

  // Group recipes by category
  const grouped = {};
  for (const r of recipes) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  // Sub-group modules by prefix (engine_, reactor_, etc.)
  const moduleSubgroups = {};
  if (grouped.module) {
    for (const r of grouped.module) {
      const prefix = r.output_item_id?.split('_')[0] || 'other';
      if (!moduleSubgroups[prefix]) moduleSubgroups[prefix] = [];
      moduleSubgroups[prefix].push(r);
    }
  }

  // Collapsible state — start all collapsed
  const [collapsed, setCollapsed] = useState(() => {
    const init = {};
    CATEGORY_ORDER.forEach(c => init[c] = true);
    return init;
  });
  const [subCollapsed, setSubCollapsed] = useState(() => {
    const init = {};
    MODULE_SUBCAT_ORDER.forEach(s => init[s] = true);
    return init;
  });
  const toggleCat = (cat) => setCollapsed(p => ({ ...p, [cat]: !p[cat] }));
  const toggleSub = (key) => setSubCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <ContextPanel windowId="crafting" title="Crafting" icon="🔨" accent={COLORS.PURPLE.light} width={720}>
      <div style={{ display: 'flex', height: '100%', gap: 8 }}>
        {/* Recipe sidebar */}
        <div style={{
          width: 180,
          flexShrink: 0,
          overflowY: 'auto',
          borderRight: `1px solid ${COLORS.EDGE}`,
          paddingRight: 6,
        }}>
          {loading && recipes.length === 0 ? (
            <div style={{
              fontSize: 10,
              color: COLORS.TEXT.muted,
              padding: 8,
              fontFamily: FONT.ui,
            }}>Loading...</div>
          ) : (
            CATEGORY_ORDER.map(cat => {
              const catRecipes = grouped[cat];
              if (!catRecipes && cat !== 'module') return null;
              if (cat === 'module' && Object.keys(moduleSubgroups).length === 0) return null;

              const isCollapsed = collapsed[cat];
              const totalInCat = cat === 'module'
                ? Object.values(moduleSubgroups).reduce((sum, arr) => sum + arr.length, 0)
                : (catRecipes?.length || 0);
              const craftableInCat = cat === 'module'
                ? Object.values(moduleSubgroups).reduce((sum, arr) => sum + arr.filter(r => r.can_craft).length, 0)
                : (catRecipes?.filter(r => r.can_craft).length || 0);

              return (
                <div key={cat} style={{ marginBottom: 4 }}>
                  {/* Category header — clickable to collapse */}
                  <button
                    onClick={() => toggleCat(cat)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 6px',
                      borderRadius: 2,
                      background: 'rgba(4,8,16,0.4)',
                      border: `1px solid ${COLORS.EDGE}`,
                      borderLeft: `2px solid ${COLORS.PURPLE.light}55`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      fontFamily: FONT.ui,
                    }}
                  >
                    <span style={{ fontSize: 9, color: COLORS.TEXT.dim, width: 10 }}>{isCollapsed ? '▸' : '▾'}</span>
                    <span style={{ fontSize: 12 }}>{CATEGORY_ICONS[cat]}</span>
                    <span style={{
                      fontSize: 10,
                      color: COLORS.TEXT.secondary,
                      fontWeight: 700,
                      flex: 1,
                      textAlign: 'left',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}>{CATEGORY_LABELS[cat] || cat}</span>
                    {craftableInCat > 0 && (
                      <span style={{
                        fontSize: 8,
                        background: `${COLORS.GREEN.pri}22`,
                        color: COLORS.GREEN.light,
                        padding: '1px 5px',
                        borderRadius: 2,
                        fontFamily: FONT.mono,
                        fontWeight: 700,
                        border: `1px solid ${COLORS.GREEN.pri}55`,
                      }}>{craftableInCat}</span>
                    )}
                    <span style={{
                      fontSize: 8,
                      color: COLORS.TEXT.dim,
                      fontFamily: FONT.mono,
                    }}>{totalInCat}</span>
                  </button>

                  {/* Category contents */}
                  {!isCollapsed && cat === 'module' && (
                    <div className="ml-1">
                      {MODULE_SUBCAT_ORDER.map(sub => {
                        const subRecipes = moduleSubgroups[sub];
                        if (!subRecipes) return null;
                        const subInfo = MODULE_SUBCATEGORIES[sub] || { label: sub, icon: '?', color: '#888' };
                        const isSubCollapsed = subCollapsed[sub];
                        const craftableSub = subRecipes.filter(r => r.can_craft).length;

                        return (
                          <div key={sub} style={{ marginBottom: 2 }}>
                            {/* Subcategory header */}
                            <button
                              onClick={() => toggleSub(sub)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 4px',
                                marginTop: 2,
                                marginLeft: 4,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                fontFamily: FONT.ui,
                              }}
                            >
                              <span style={{ fontSize: 8, color: COLORS.TEXT.dim, width: 8 }}>{isSubCollapsed ? '▸' : '▾'}</span>
                              <span style={{
                                width: 6,
                                height: 6,
                                background: subInfo.color,
                                boxShadow: `0 0 4px ${subInfo.color}88`,
                                flexShrink: 0,
                              }} />
                              <span style={{
                                fontSize: 9,
                                color: COLORS.TEXT.muted,
                                flex: 1,
                                textAlign: 'left',
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                                fontWeight: 600,
                              }}>{subInfo.label}</span>
                              {craftableSub > 0 && (
                                <span style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: 3,
                                  background: COLORS.GREEN.light,
                                  boxShadow: glow(COLORS.GREEN.light, 0.5),
                                  flexShrink: 0,
                                }} />
                              )}
                            </button>

                            {/* Subcategory recipes */}
                            {!isSubCollapsed && (
                              <div style={{ marginLeft: 12, marginBottom: 4 }}>
                                {subRecipes.map(r => (
                                  <RecipeCard
                                    key={r.id}
                                    recipe={r}
                                    isSelected={selectedRecipe?.id === r.id}
                                    onClick={() => selectRecipe(r)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isCollapsed && cat !== 'module' && catRecipes && (
                    <div style={{ marginLeft: 16, marginBottom: 4, marginTop: 4 }}>
                      {catRecipes.map(r => (
                        <RecipeCard
                          key={r.id}
                          recipe={r}
                          isSelected={selectedRecipe?.id === r.id}
                          onClick={() => selectRecipe(r)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        
        {/* Recipe detail / crafting area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingLeft: 4 }}>
          {!selectedRecipe ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.TEXT.muted,
              fontSize: 11,
              fontFamily: FONT.ui,
              letterSpacing: 0.5,
            }}>
              Select a recipe
            </div>
          ) : (
            <>
              {/* Recipe header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
                padding: '8px 10px',
                background: `linear-gradient(135deg, ${COLORS.PURPLE.pri}10, transparent)`,
                border: `1px solid ${COLORS.EDGE}`,
                borderLeft: `2px solid ${COLORS.PURPLE.light}`,
                borderRadius: 3,
              }}>
                <span style={{ fontSize: 22 }}>{selectedRecipe.icon}</span>
                <div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.TEXT.primary,
                    fontFamily: FONT.ui,
                    letterSpacing: 0.3,
                  }}>{selectedRecipe.name}</div>
                  <div style={{
                    fontSize: 10,
                    color: COLORS.TEXT.dim,
                    fontFamily: FONT.ui,
                  }}>{selectedRecipe.description}</div>
                </div>
              </div>

              {/* Ingredients */}
              <SectionHead
                title="Ingredients"
                accent={COLORS.PURPLE.light}
                icon="◆"
                marginTop={0}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {selectedRecipe.ingredients.map((ing, i) => (
                  <IngredientSlot
                    key={i}
                    ingredient={ing}
                    assigned={assignedIngredients[ing.resource_name]}
                    resourceCounts={selectedRecipe.resource_counts}
                    onDrop={(data) => handleIngredientDrop(ing.resource_name, ing.quantity, data)}
                    onRemove={(stackIdx) => handleRemoveStack(ing.resource_name, stackIdx)}
                  />
                ))}
              </div>

              {/* Output preview */}
              <OutputPreview
                recipe={selectedRecipe}
                assignedIngredients={assignedIngredients}
              />

              {/* Status messages */}
              {error && (
                <div style={{ marginTop: 8 }}>
                  <MessageBar type="error">{error}</MessageBar>
                </div>
              )}
              {success && (
                <div style={{ marginTop: 8 }}>
                  <MessageBar type="success">{success}</MessageBar>
                </div>
              )}

              {/* Research lock (Migration 053). If the recipe is gated
                  by a tech the player hasn't researched, the craft
                  button is replaced by a lock badge that jumps to the
                  research node in the tree. Server enforces the gate
                  too -- this is purely a UX prompt to point the player
                  at the right action. */}
              {(() => {
                const techId = selectedRecipe.requires_tech;
                if (!techId) return null;
                const tech = techs.find(t => t.id === techId);
                // Server returns status 'unlocked' for completed
                // research (see research.js:76). Bail early when the
                // player has already learned it -- no lock to show.
                if (tech?.status === 'unlocked') return null;
                return (
                  <div style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 3,
                    background: 'rgba(133,77,14,0.18)',
                    border: '1px solid rgba(251,191,36,0.4)',
                    borderLeft: '3px solid #fbbf24',
                  }}>
                    <div style={{
                      fontSize: 10, color: '#fbbf24', fontFamily: FONT.ui,
                      fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
                      marginBottom: 4,
                    }}>🔒 Research Required</div>
                    <div style={{ fontSize: 11, color: '#e2e8f0', fontFamily: FONT.ui, marginBottom: 8 }}>
                      Unlock <span style={{ color: '#fbbf24', fontWeight: 700 }}>{tech?.name || techId}</span> in the research tree first.
                    </div>
                    <button
                      onClick={() => {
                        setResearchTargetTech(techId);
                        openWindow('research');
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 10, fontWeight: 800, letterSpacing: 1,
                        textTransform: 'uppercase', fontFamily: FONT.ui,
                        color: '#fbbf24',
                        background: 'rgba(133,77,14,0.35)',
                        border: '1px solid #fbbf24',
                        borderRadius: 2,
                        cursor: 'pointer',
                      }}
                    >→ Open Research</button>
                  </div>
                );
              })()}

              {/* Craft button -- hidden when research-locked since the
                  lock panel above takes its slot. Server will reject
                  anyway, so showing a disabled button would be redundant. */}
              {!(selectedRecipe.requires_tech && techs.find(t => t.id === selectedRecipe.requires_tech)?.status !== 'unlocked') && (
                <button
                  onClick={handleCraft}
                  disabled={!canCraftNow || crafting}
                  style={{
                    marginTop: 12,
                    padding: '10px 18px',
                    width: '100%',
                    borderRadius: 3,
                    fontFamily: FONT.ui,
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    cursor: (canCraftNow && !crafting) ? 'pointer' : 'not-allowed',
                    background: (canCraftNow && !crafting)
                      ? `linear-gradient(180deg, ${COLORS.GOLD.pri}33, ${COLORS.GOLD.pri}0a)`
                      : 'rgba(30,41,59,0.5)',
                    border: `1px solid ${(canCraftNow && !crafting) ? `${COLORS.GOLD.pri}88` : '#1e293b'}`,
                    borderLeft: `3px solid ${(canCraftNow && !crafting) ? COLORS.GOLD.pri : '#1e293b'}`,
                    color: (canCraftNow && !crafting) ? COLORS.GOLD.light : '#475569',
                    transition: 'all 0.15s',
                    boxShadow: (canCraftNow && !crafting) ? glow(COLORS.GOLD.pri, 0.2) : 'none',
                  }}
                >
                  {crafting ? 'Crafting...' : `⚒ Craft ${selectedRecipe.name}`}
                </button>
              )}

              {/* DEV CHEAT: Craft without resources */}
              <button
                onClick={async () => {
                  setCrafting(true);
                  try {
                    const result = await resourcesAPI.cheatCraft(selectedRecipe.id);
                    setSuccess(`[CHEAT] Crafted ${result.crafted.item_name}!`);
                    await fetchRecipes();
                    setTimeout(() => setSuccess(null), 3000);
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setCrafting(false);
                  }
                }}
                disabled={crafting}
                style={{
                  marginTop: 4,
                  padding: '4px 12px',
                  width: '100%',
                  fontSize: 9,
                  borderRadius: 2,
                  background: 'rgba(127,29,29,0.25)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: COLORS.RED.light,
                  fontFamily: FONT.mono,
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                }}
              >
                🐛 DEV: Cheat Craft
              </button>
            </>
          )}
        </div>

        {/* Cargo sidebar -- click a glowing tile to assign it to the
            matching ingredient slot. Tiles render with the EXACT same
            visual code as the main InventoryWindow grid so cargo looks
            identical in both places. Drag-drop still works for users
            who prefer it; click is the more reliable primary path. */}
        <CraftingCargoPanel
          isOpen={isOpen}
          selectedRecipe={selectedRecipe}
          onAssign={(stack) => {
            // Find which ingredient this stack satisfies in the
            // selected recipe -- IngredientSlot's drop handler does
            // the same name-match, so we just forward the stack with
            // a synthesized drop payload.
            const ing = (selectedRecipe?.ingredients || [])
              .find(i => i.resource_name === stack.resource_name);
            if (!ing) return;
            handleIngredientDrop(ing.resource_name, ing.quantity, {
              stack_id: stack.id,
              item_type: 'resource',
              resource_type_id: stack.resource_type_id,
              resource_name: stack.resource_name,
              quantity: stack.quantity,
              stats: stack.stats,
              category: stack.category,
            });
          }}
        />
      </div>
    </ContextPanel>
  );
};

export default CraftingWindow;
