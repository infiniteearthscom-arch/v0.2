// Crafting Window
// Select recipes, drag resources from Cargo window into ingredient slots, craft items

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { RESOURCE_TYPES } from '@/data/resources';
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
  
  // Calculate weighted average quality from all assigned resources
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
  
  const qualityMultiplier = totalWeight > 0 ? ((totalPurity + totalStability + totalPotency + totalDensity) / (totalWeight * 4)) / 50 : 1;
  
  // Preview item stats
  const baseData = recipe.item_data_defaults || {};
  const previewStats = {};
  if (baseData.harvest_rate) previewStats['Harvest Rate'] = `${Math.round(baseData.harvest_rate * Math.max(0.5, qualityMultiplier))}/hr`;
  if (baseData.storage_capacity) previewStats['Storage'] = Math.round(baseData.storage_capacity * Math.max(0.5, qualityMultiplier));
  if (baseData.fuel_hours) previewStats['Duration'] = `${(Math.round(baseData.fuel_hours * Math.max(0.5, qualityMultiplier) * 10) / 10)}h`;
  
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

          {Object.entries(previewStats).map(([key, val]) => (
            <div key={key} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              fontFamily: FONT.mono,
              padding: '2px 0',
              borderBottom: '1px solid rgba(26,48,80,0.3)',
            }}>
              <span style={{ color: COLORS.TEXT.muted, letterSpacing: 0.5 }}>{key.toUpperCase()}</span>
              <span style={{ color: COLORS.BLUE.light, fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const CraftingWindow = () => {
  const windows = useGameStore(state => state.windows);
  const isOpen = windows.crafting?.open;

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
    <ContextPanel windowId="crafting" title="Crafting" icon="🔨" accent={COLORS.PURPLE.light} width={460}>
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

              {/* Craft button */}
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
      </div>
    </ContextPanel>
  );
};

export default CraftingWindow;
