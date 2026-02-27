// Crafting Window
// Select recipes, drag resources from Cargo window into ingredient slots, craft items

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore } from '@/stores/gameStore';
import { RESOURCE_TYPES } from '@/data/resources';
import { resourcesAPI } from '@/utils/api';

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
      className={`
        p-2 rounded cursor-pointer transition-all border text-left w-full
        ${isSelected
          ? 'border-cyan-400/60 bg-cyan-900/20'
          : canCraft
            ? 'border-slate-600/50 bg-slate-800/30 hover:border-slate-500'
            : 'border-slate-700/30 bg-slate-900/20 opacity-50 hover:opacity-70'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{recipe.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-200 truncate">{recipe.name}</div>
          <div className="text-[10px] text-slate-500">{recipe.category}</div>
        </div>
        {canCraft && <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
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
      className="relative rounded-lg p-2 transition-all"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: dragOver
          ? '2px dashed #00ccff'
          : isFilled
            ? `2px solid ${color}88`
            : isPartial
              ? '2px solid #eab30888'
              : '2px dashed #334155',
        background: dragOver
          ? '#00ccff08'
          : isFilled
            ? `${color}08`
            : '#0f172a44',
        boxShadow: dragOver ? '0 0 8px #00ccff22' : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color }}>
          {resourceName}
        </span>
        <span className="text-[10px] text-slate-500">
          {available} available
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Progress */}
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, ((assigned?.quantity || 0) / needed) * 100)}%`,
              backgroundColor: isFilled ? '#44ff44' : isPartial ? '#eab308' : '#334155',
            }}
          />
        </div>
        
        <span className={`text-xs font-mono ${isFilled ? 'text-green-400' : isPartial ? 'text-yellow-400' : 'text-slate-500'}`}>
          {assigned?.quantity || 0}/{needed}
        </span>
      </div>
      
      {/* Assigned stacks */}
      {assigned && assigned.stacks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {assigned.stacks.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:brightness-125"
              style={{ backgroundColor: `${color}22`, border: `1px solid ${color}44` }}
              onClick={() => onRemove(i)}
              title="Click to remove"
            >
              <span style={{ color }}>{s.quantity}×</span>
              <span className="text-slate-400">
                Q{s.stats ? Math.round((s.stats.purity + s.stats.stability + s.stats.potency + s.stats.density) / 4) : '?'}
              </span>
              <span className="text-red-400 ml-0.5">✕</span>
            </div>
          ))}
        </div>
      )}
      
      {!assigned && (
        <div className="mt-1 text-[10px] text-slate-600 text-center">
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
    <div className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/50">
      <div className="text-xs text-slate-500 mb-2">Output</div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{recipe.icon}</span>
        <div>
          <div className="text-sm font-medium text-amber-300">{recipe.name}</div>
          <div className="text-[10px] text-slate-400">×{recipe.output_quantity}</div>
        </div>
      </div>
      
      {totalWeight > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500">Input Quality:</span>
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${avgQuality}%`,
                  backgroundColor: avgQuality >= 80 ? '#aa44ff' : avgQuality >= 60 ? '#4488ff' : avgQuality >= 40 ? '#44ff44' : '#888',
                }}
              />
            </div>
            <span className="text-[10px] text-slate-300">{avgQuality}</span>
          </div>
          
          {Object.entries(previewStats).map(([key, val]) => (
            <div key={key} className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-400">{key}</span>
              <span className="text-cyan-300">{val}</span>
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
    <DraggableWindow
      windowId="crafting"
      title="Crafting"
      initialWidth={520}
      initialHeight={520}
      minWidth={460}
      minHeight={380}
    >
      <div className="flex h-full gap-2">
        {/* Recipe sidebar */}
        <div className="w-[180px] flex-shrink-0 overflow-y-auto border-r border-slate-700/50 pr-2">
          {loading && recipes.length === 0 ? (
            <div className="text-xs text-slate-500 animate-pulse p-2">Loading...</div>
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
                <div key={cat} className="mb-1">
                  {/* Category header — clickable to collapse */}
                  <button
                    onClick={() => toggleCat(cat)}
                    className="w-full flex items-center gap-1.5 py-1.5 px-1 rounded hover:bg-slate-800/40 transition-colors"
                  >
                    <span className="text-[10px] text-slate-600 w-3">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="text-sm">{CATEGORY_ICONS[cat]}</span>
                    <span className="text-[11px] text-slate-300 font-medium flex-1 text-left">{CATEGORY_LABELS[cat] || cat}</span>
                    {craftableInCat > 0 && (
                      <span className="text-[9px] bg-green-900/30 text-green-400 px-1 rounded">{craftableInCat}</span>
                    )}
                    <span className="text-[9px] text-slate-600">{totalInCat}</span>
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
                          <div key={sub} className="mb-0.5">
                            {/* Subcategory header */}
                            <button
                              onClick={() => toggleSub(sub)}
                              className="w-full flex items-center gap-1 py-1 px-1 rounded hover:bg-slate-800/30 transition-colors"
                            >
                              <span className="text-[9px] text-slate-600 w-2.5">{isSubCollapsed ? '▸' : '▾'}</span>
                              <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: subInfo.color }} />
                              <span className="text-[10px] text-slate-400 flex-1 text-left">{subInfo.label}</span>
                              {craftableSub > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                              )}
                            </button>

                            {/* Subcategory recipes */}
                            {!isSubCollapsed && (
                              <div className="space-y-0.5 ml-3 mb-1">
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
                    <div className="space-y-0.5 ml-4 mb-1">
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
        <div className="flex-1 flex flex-col overflow-y-auto">
          {!selectedRecipe ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a recipe
            </div>
          ) : (
            <>
              {/* Recipe header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{selectedRecipe.icon}</span>
                <div>
                  <div className="text-sm font-medium text-slate-200">{selectedRecipe.name}</div>
                  <div className="text-[10px] text-slate-400">{selectedRecipe.description}</div>
                </div>
              </div>
              
              {/* Ingredients */}
              <div className="text-xs text-slate-500 mb-1.5">Ingredients</div>
              <div className="space-y-2 mb-3">
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
                <div className="mt-2 p-2 rounded text-xs bg-red-900/30 border border-red-500/40 text-red-400">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-2 p-2 rounded text-xs bg-green-900/30 border border-green-500/40 text-green-400">
                  {success}
                </div>
              )}
              
              {/* Craft button */}
              <button
                onClick={handleCraft}
                disabled={!canCraftNow || crafting}
                className={`
                  mt-3 py-2 px-4 rounded-lg font-medium text-sm transition-all w-full
                  ${canCraftNow && !crafting
                    ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-lg shadow-amber-900/30'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }
                `}
              >
                {crafting ? 'Crafting...' : `Craft ${selectedRecipe.name}`}
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
                className="mt-1 py-1 px-3 rounded text-[10px] w-full bg-red-900/30 border border-red-500/30 text-red-400 hover:bg-red-900/50 transition-all"
              >
                🐛 Cheat Craft (no resources)
              </button>
            </>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};

export default CraftingWindow;
