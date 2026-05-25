// Resources API Routes
// Handles resource deposits, surveying, harvesting, and inventory

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';
import {
  ensureDepositsExist,
  getDepositsForBody,
  getDepositById,
  depleteDeposit
} from '../game/deposits.js';
import { isCityPlanet, SRng } from '../util/seed.js';
import { getPlayerBonuses } from '../util/playerBonuses.js';
import { qualityMultiplier } from '../lib/quality.js';

const router = express.Router();

// ============================================
// HELPER: Resolve body ID (handles both UUIDs and name aliases)
// ============================================

const resolveBodyId = async (bodyIdOrName) => {
  // Check if it's already a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(bodyIdOrName)) {
    return bodyIdOrName;
  }
  
  // Look up by alias
  const alias = await queryOne(`
    SELECT celestial_body_id FROM celestial_body_aliases
    WHERE alias = LOWER($1)
  `, [bodyIdOrName]);
  
  if (alias) {
    return alias.celestial_body_id;
  }
  
  // Try to find by name directly
  const body = await queryOne(`
    SELECT id FROM celestial_bodies
    WHERE LOWER(name) = LOWER($1)
  `, [bodyIdOrName]);
  
  if (body) {
    return body.id;
  }
  
  return null;
};

// ============================================
// HELPER: Get player's fleet-wide cargo usage and capacity
// Capacity = sum of computed_cargo across ALL player's ships
// ============================================

const getPlayerCargoInfo = async (userId, client = null) => {
  const q = client
    ? async (sql, params) => { const r = await client.query(sql, params); return r.rows[0]; }
    : queryOne;
  const qAll = client
    ? async (sql, params) => { const r = await client.query(sql, params); return r.rows; }
    : queryAll;

  // Sum cargo capacity across ALL player ships (fleet-wide)
  const fleetCargo = await q(`
    SELECT 
      COALESCE(SUM(COALESCE(s.computed_cargo, 0)), 0) as fleet_capacity,
      COUNT(*) as ship_count
    FROM ships s
    WHERE s.user_id = $1
  `, [userId]);

  const capacity = parseInt(fleetCargo?.fleet_capacity || 0);
  const shipCount = parseInt(fleetCargo?.ship_count || 0);

  // Calculate used volume from inventory
  const volumeResult = await q(`
    SELECT 
      COALESCE(SUM(
        CASE 
          WHEN pri.item_type = 'resource' THEN pri.quantity * GREATEST(pri.stat_density, 1) / 100.0
          ELSE pri.quantity * COALESCE(idef.volume_per_unit, 1)
        END
      ), 0) as total_volume,
      COUNT(*) as slot_count
    FROM player_resource_inventory pri
    LEFT JOIN item_definitions idef ON pri.item_id = idef.id
    WHERE pri.user_id = $1
  `, [userId]);

  const totalSlots = Math.floor(capacity / 10);
  const usedVolume = Math.round(parseFloat(volumeResult?.total_volume || 0) * 100) / 100;
  const usedSlots = parseInt(volumeResult?.slot_count || 0);

  return {
    capacity,
    used: usedVolume,
    remaining: Math.max(0, capacity - usedVolume),
    totalSlots,
    usedSlots,
    shipCount,
  };
};

// Get next available slot index for a user's inventory
const getNextSlotIndex = async (userId, client = null) => {
  // Find the first unused slot index (fills gaps instead of always appending)
  const sql = `
    SELECT s.slot FROM generate_series(0, COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)) s(slot)
    WHERE s.slot NOT IN (SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL)
    ORDER BY s.slot ASC
    LIMIT 1
  `;
  if (client) {
    const result = await client.query(sql, [userId]);
    return parseInt(result.rows[0]?.slot) || 0;
  }
  const result = await queryOne(sql, [userId]);
  return parseInt(result?.slot) || 0;
};

// ============================================
// RESOURCE TYPES
// ============================================

// Get all resource types
router.get('/types', async (req, res) => {
  try {
    const resources = await queryAll(`
      SELECT * FROM resource_types ORDER BY category, rarity, name
    `);
    
    res.json({ resources });
  } catch (error) {
    console.error('Error fetching resource types:', error);
    res.status(500).json({ error: 'Failed to fetch resource types' });
  }
});

// Get resource types by category
router.get('/types/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    
    const resources = await queryAll(`
      SELECT * FROM resource_types 
      WHERE category = $1 
      ORDER BY rarity, name
    `, [category]);
    
    res.json({ resources });
  } catch (error) {
    console.error('Error fetching resources by category:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// ============================================
// DEPOSITS
// ============================================

// Get deposits for a celestial body (auto-spawns if needed)
router.get('/deposits/:bodyId', authMiddleware, async (req, res) => {
  try {
    const { bodyId } = req.params;
    const userId = req.user.id;
    
    // Resolve body ID (handles names like "mars" or UUIDs)
    const resolvedBodyId = await resolveBodyId(bodyId);
    if (!resolvedBodyId) {
      return res.status(404).json({ error: 'Celestial body not found' });
    }
    
    // Ensure deposits exist (spawns them if first visit)
    const deposits = await ensureDepositsExist(resolvedBodyId);
    
    // Check if player has surveyed this body
    const survey = await queryOne(`
      SELECT * FROM player_surveys
      WHERE user_id = $1 AND celestial_body_id = $2
    `, [userId, resolvedBodyId]);

    // Check for active harvest sessions on each deposit
    const activeSessions = await queryAll(`
      SELECT deposit_id, user_id FROM harvest_sessions
      WHERE deposit_id = ANY($1::uuid[]) AND status = 'active'
    `, [deposits.map(d => d.id)]);

    const occupiedMap = {};
    for (const s of activeSessions) {
      occupiedMap[s.deposit_id] = s.user_id;
    }
    
    // If not surveyed, hide deposit details
    if (!survey || !survey.ground_scanned) {
      // Return limited info (just that deposits exist)
      res.json({
        deposits: deposits.map(d => ({
          id: d.id,
          slot_number: d.slot_number,
          // Hide details until ground scanned
          resource_name: survey?.orbital_scanned ? d.resource_name : '???',
          category: survey?.orbital_scanned ? d.category : null,
          rarity: survey?.orbital_scanned ? d.rarity : null,
          quantity_remaining: null, // Hidden
          quantity_total: null,     // Hidden
          stats: null,              // Hidden
          is_occupied: !!occupiedMap[d.id],
          occupied_by_me: occupiedMap[d.id] === userId,
        })),
        survey_status: {
          orbital_scanned: survey?.orbital_scanned || false,
          ground_scanned: survey?.ground_scanned || false,
        }
      });
    } else {
      // Full details for ground-scanned bodies
      res.json({
        deposits: deposits.map(d => ({
          id: d.id,
          slot_number: d.slot_number,
          resource_name: d.resource_name,
          resource_type_id: d.resource_type_id,
          category: d.category,
          rarity: d.rarity,
          base_price: d.base_price,
          quantity_remaining: d.quantity_remaining,
          quantity_total: d.quantity_total,
          stats: {
            purity: d.stat_purity,
            stability: d.stat_stability,
            potency: d.stat_potency,
            density: d.stat_density,
          },
          quality_tier: getQualityTier(d.stat_purity, d.stat_stability, d.stat_potency, d.stat_density),
          is_occupied: !!occupiedMap[d.id],
          occupied_by_me: occupiedMap[d.id] === userId,
        })),
        survey_status: {
          orbital_scanned: true,
          ground_scanned: true,
        }
      });
    }
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Get single deposit details
router.get('/deposit/:depositId', authMiddleware, async (req, res) => {
  try {
    const { depositId } = req.params;
    
    const deposit = await getDepositById(depositId);
    
    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }
    
    res.json({
      deposit: {
        ...deposit,
        stats: {
          purity: deposit.stat_purity,
          stability: deposit.stat_stability,
          potency: deposit.stat_potency,
          density: deposit.stat_density,
        },
        quality_tier: getQualityTier(deposit.stat_purity, deposit.stat_stability, deposit.stat_potency, deposit.stat_density),
      }
    });
  } catch (error) {
    console.error('Error fetching deposit:', error);
    res.status(500).json({ error: 'Failed to fetch deposit' });
  }
});

// ============================================
// PLAYER INVENTORY & CARGO
// ============================================

// Get player's resource inventory
router.get('/inventory', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const inventory = await queryAll(`
      SELECT 
        pri.*,
        rt.name as resource_name,
        rt.category,
        rt.rarity,
        rt.base_price,
        rt.icon as resource_icon,
        idef.name as item_name,
        idef.description as item_description,
        idef.category as item_category,
        idef.icon as item_icon,
        idef.max_stack as item_max_stack
      FROM player_resource_inventory pri
      LEFT JOIN resource_types rt ON pri.resource_type_id = rt.id
      LEFT JOIN item_definitions idef ON pri.item_id = idef.id
      WHERE pri.user_id = $1
      ORDER BY pri.slot_index ASC NULLS LAST
    `, [userId]);
    
    // Group resources by type, keep items as flat list
    const grouped = {};
    const items = [];
    
    for (const row of inventory) {
      if (row.item_type === 'item') {
        items.push({
          id: row.id,
          item_type: 'item',
          item_id: row.item_id,
          item_name: row.item_name || row.item_id,
          item_description: row.item_description,
          item_category: row.item_category,
          item_icon: row.item_icon,
          item_data: row.item_data || {},
          item_max_stack: row.item_max_stack || 1,
          quantity: row.quantity,
          slot_index: row.slot_index,
        });
      } else {
        const key = row.resource_name;
        if (!grouped[key]) {
          grouped[key] = {
            resource_type_id: row.resource_type_id,
            resource_name: row.resource_name,
            category: row.category,
            rarity: row.rarity,
            base_price: row.base_price,
            icon: row.resource_icon,
            total_quantity: 0,
            stacks: [],
          };
        }
        
        grouped[key].total_quantity += row.quantity;
        grouped[key].stacks.push({
          id: row.id,
          quantity: row.quantity,
          slot_index: row.slot_index,
          stats: {
            purity: row.stat_purity,
            stability: row.stat_stability,
            potency: row.stat_potency,
            density: row.stat_density,
          },
          quality_tier: getQualityTier(row.stat_purity, row.stat_stability, row.stat_potency, row.stat_density),
        });
      }
    }

    // Include cargo info
    const cargo = await getPlayerCargoInfo(userId);
    
    res.json({ 
      inventory: Object.values(grouped),
      items,
      total_stacks: inventory.length,
      cargo: {
        capacity: cargo.capacity,
        used: cargo.used,
        remaining: cargo.remaining,
        totalSlots: cargo.totalSlots,
        usedSlots: cargo.usedSlots,
        shipCount: cargo.shipCount,
      },
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Add resources to player inventory
router.post('/inventory/add', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { resource_type_id, quantity, purity, stability, potency, density } = req.body;
    
    if (!resource_type_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid resource data' });
    }
    
    // Try to stack with existing (same stats)
    const existing = await queryOne(`
      SELECT * FROM player_resource_inventory
      WHERE user_id = $1 
        AND resource_type_id = $2
        AND stat_purity = $3
        AND stat_stability = $4
        AND stat_potency = $5
        AND stat_density = $6
    `, [userId, resource_type_id, purity, stability, potency, density]);
    
    let result;
    
    if (existing) {
      // Add to existing stack
      result = await queryOne(`
        UPDATE player_resource_inventory
        SET quantity = quantity + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [quantity, existing.id]);
    } else {
      // Create new stack with next available slot
      const nextSlot = await getNextSlotIndex(userId);
      result = await queryOne(`
        INSERT INTO player_resource_inventory (
          user_id, resource_type_id, quantity,
          stat_purity, stat_stability, stat_potency, stat_density,
          slot_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [userId, resource_type_id, quantity, purity, stability, potency, density, nextSlot]);
    }
    
    res.json({ success: true, stack: result });
  } catch (error) {
    console.error('Error adding to inventory:', error);
    res.status(500).json({ error: 'Failed to add to inventory' });
  }
});

// Get cargo info (capacity, usage)
router.get('/cargo', authMiddleware, async (req, res) => {
  try {
    const cargo = await getPlayerCargoInfo(req.user.id);
    res.json({ cargo });
  } catch (error) {
    console.error('Error fetching cargo info:', error);
    res.status(500).json({ error: 'Failed to fetch cargo info' });
  }
});

// Move item to a different slot (swap if occupied)
router.post('/inventory/move', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id, to_slot } = req.body;

    if (!item_id || to_slot == null || to_slot < 0) {
      return res.status(400).json({ error: 'item_id and to_slot are required' });
    }

    await transaction(async (client) => {
      // Get the item being moved
      const itemResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2`,
        [item_id, userId]
      );
      const item = itemResult.rows[0];
      if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });

      const fromSlot = item.slot_index;

      // Check if destination slot is occupied
      const occupantResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE user_id = $1 AND slot_index = $2`,
        [userId, to_slot]
      );
      const occupant = occupantResult.rows[0];

      if (occupant) {
        // Swap: move occupant to the source slot
        await client.query(
          `UPDATE player_resource_inventory SET slot_index = $1 WHERE id = $2`,
          [fromSlot, occupant.id]
        );
      }

      // Move item to destination slot
      await client.query(
        `UPDATE player_resource_inventory SET slot_index = $1 WHERE id = $2`,
        [to_slot, item.id]
      );
    });

    res.json({ success: true });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error moving item:', error);
    res.status(500).json({ error: 'Failed to move item' });
  }
});

// Merge two stacks with identical resource type and stats
router.post('/inventory/merge', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { source_id, target_id } = req.body;

    if (!source_id || !target_id) {
      return res.status(400).json({ error: 'source_id and target_id are required' });
    }

    if (source_id === target_id) {
      return res.status(400).json({ error: 'Cannot merge item with itself' });
    }

    const result = await transaction(async (client) => {
      const sourceResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2`,
        [source_id, userId]
      );
      const targetResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2`,
        [target_id, userId]
      );

      const source = sourceResult.rows[0];
      const target = targetResult.rows[0];

      if (!source || !target) {
        throw Object.assign(new Error('Item not found'), { statusCode: 404 });
      }

      // Check they're mergeable
      if (source.item_type !== target.item_type) {
        throw Object.assign(new Error('Cannot merge different item types'), { statusCode: 400 });
      }
      
      if (source.item_type === 'resource') {
        if (source.resource_type_id !== target.resource_type_id ||
            source.stat_purity !== target.stat_purity ||
            source.stat_stability !== target.stat_stability ||
            source.stat_potency !== target.stat_potency ||
            source.stat_density !== target.stat_density) {
          throw Object.assign(new Error('Can only merge stacks with identical resource and stats'), { statusCode: 400 });
        }
      } else {
        if (source.item_id !== target.item_id ||
            JSON.stringify(source.item_data) !== JSON.stringify(target.item_data)) {
          throw Object.assign(new Error('Can only merge identical items'), { statusCode: 400 });
        }
      }

      // Add source quantity to target
      await client.query(
        `UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
        [source.quantity, target.id]
      );

      // Delete source
      await client.query(
        `DELETE FROM player_resource_inventory WHERE id = $1`,
        [source.id]
      );

      return { merged_quantity: source.quantity + target.quantity };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error merging stacks:', error);
    res.status(500).json({ error: 'Failed to merge stacks' });
  }
});

// ============================================
// CRAFTING
// ============================================

// Get all crafting recipes with player's available resources
router.get('/recipes', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const recipes = await queryAll(`
      SELECT cr.*, idef.icon, idef.item_data_defaults
      FROM crafting_recipes cr
      JOIN item_definitions idef ON cr.output_item_id = idef.id
      ORDER BY cr.category, cr.name
    `);
    
    // Get player's resource counts by name
    const resources = await queryAll(`
      SELECT rt.name, SUM(pri.quantity) as total
      FROM player_resource_inventory pri
      JOIN resource_types rt ON pri.resource_type_id = rt.id
      WHERE pri.user_id = $1 AND pri.item_type = 'resource'
      GROUP BY rt.name
    `, [userId]);
    
    const resourceCounts = {};
    for (const r of resources) {
      resourceCounts[r.name] = parseInt(r.total);
    }
    
    const recipesWithAvailability = recipes.map(r => {
      const ingredients = r.ingredients;
      const canCraft = ingredients.every(ing => 
        (resourceCounts[ing.resource_name] || 0) >= ing.quantity
      );
      return {
        ...r,
        can_craft: canCraft,
        resource_counts: resourceCounts,
      };
    });
    
    res.json({ recipes: recipesWithAvailability });
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// Craft an item using specific resource stacks
router.post('/craft', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipe_id, ingredients } = req.body;
    // ingredients: [{ stack_id, quantity }]
    
    if (!recipe_id || !ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'recipe_id and ingredients array required' });
    }
    
    const result = await transaction(async (client) => {
      // Get recipe
      const recipeResult = await client.query(
        `SELECT cr.*, idef.max_stack, idef.item_data_defaults, idef.name as item_name, idef.icon, idef.category as item_category, idef.description as item_description
         FROM crafting_recipes cr
         JOIN item_definitions idef ON cr.output_item_id = idef.id
         WHERE cr.id = $1`,
        [recipe_id]
      );
      const recipe = recipeResult.rows[0];
      if (!recipe) throw Object.assign(new Error('Recipe not found'), { statusCode: 404 });
      
      const requiredIngredients = recipe.ingredients; // [{resource_name, quantity}]
      
      // Build a map of what resources are needed
      const needed = {};
      for (const ing of requiredIngredients) {
        needed[ing.resource_name] = ing.quantity;
      }
      
      // Validate each provided stack
      const provided = {}; // resource_name -> total provided
      const stacksToConsume = []; // { id, consumeQty, resourceName, stats }
      let totalStatPurity = 0, totalStatStability = 0, totalStatPotency = 0, totalStatDensity = 0;
      let totalStatWeight = 0;
      
      for (const ing of ingredients) {
        // Lock and fetch the stack
        const stackResult = await client.query(
          `SELECT pri.*, rt.name as resource_name
           FROM player_resource_inventory pri
           JOIN resource_types rt ON pri.resource_type_id = rt.id
           WHERE pri.id = $1 AND pri.user_id = $2 AND pri.item_type = 'resource'
           FOR UPDATE`,
          [ing.stack_id, userId]
        );
        const stack = stackResult.rows[0];
        if (!stack) throw Object.assign(new Error(`Stack ${ing.stack_id} not found`), { statusCode: 400 });
        
        if (ing.quantity > stack.quantity) {
          throw Object.assign(new Error(`Not enough ${stack.resource_name} in stack (need ${ing.quantity}, have ${stack.quantity})`), { statusCode: 400 });
        }
        
        if (!needed[stack.resource_name]) {
          throw Object.assign(new Error(`${stack.resource_name} is not needed for this recipe`), { statusCode: 400 });
        }
        
        if (!provided[stack.resource_name]) provided[stack.resource_name] = 0;
        provided[stack.resource_name] += ing.quantity;
        
        stacksToConsume.push({
          id: stack.id,
          consumeQty: ing.quantity,
          currentQty: stack.quantity,
          resourceName: stack.resource_name,
        });
        
        // Weight stats by quantity consumed
        totalStatPurity += (stack.stat_purity || 0) * ing.quantity;
        totalStatStability += (stack.stat_stability || 0) * ing.quantity;
        totalStatPotency += (stack.stat_potency || 0) * ing.quantity;
        totalStatDensity += (stack.stat_density || 0) * ing.quantity;
        totalStatWeight += ing.quantity;
      }
      
      // Verify all ingredients are satisfied
      for (const ing of requiredIngredients) {
        const got = provided[ing.resource_name] || 0;
        if (got < ing.quantity) {
          throw Object.assign(new Error(`Need ${ing.quantity} ${ing.resource_name} but only provided ${got}`), { statusCode: 400 });
        }
        if (got > ing.quantity) {
          throw Object.assign(new Error(`Provided too much ${ing.resource_name} (need ${ing.quantity}, got ${got})`), { statusCode: 400 });
        }
      }
      
      // Consume resources
      for (const s of stacksToConsume) {
        if (s.consumeQty >= s.currentQty) {
          await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
        } else {
          await client.query(
            `UPDATE player_resource_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
            [s.consumeQty, s.id]
          );
        }
      }
      
      // Calculate output quality from weighted average of input stats
      const avgPurity = totalStatWeight > 0 ? Math.round(totalStatPurity / totalStatWeight) : 0;
      const avgStability = totalStatWeight > 0 ? Math.round(totalStatStability / totalStatWeight) : 0;
      const avgPotency = totalStatWeight > 0 ? Math.round(totalStatPotency / totalStatWeight) : 0;
      const avgDensity = totalStatWeight > 0 ? Math.round(totalStatDensity / totalStatWeight) : 0;
      
      // Build item_data with quality-modified stats
      const baseData = recipe.item_data_defaults || {};
      const qualityMultiplier = ((avgPurity + avgStability + avgPotency + avgDensity) / 4) / 50; // 1.0 at avg 50
      const itemData = { ...baseData };
      
      // Scale relevant stats by quality
      if (itemData.harvest_rate) {
        itemData.harvest_rate = Math.round(itemData.harvest_rate * Math.max(0.5, qualityMultiplier));
      }
      if (itemData.storage_capacity) {
        itemData.storage_capacity = Math.round(itemData.storage_capacity * Math.max(0.5, qualityMultiplier));
      }
      if (itemData.fuel_hours) {
        itemData.fuel_hours = Math.round(itemData.fuel_hours * Math.max(0.5, qualityMultiplier) * 10) / 10;
      }
      
      // Store the input quality on the item
      itemData.quality = { purity: avgPurity, stability: avgStability, potency: avgPotency, density: avgDensity };
      
      // Try to stack with existing identical item (same item_id and same item_data)
      const existingItem = await client.query(
        `SELECT id, quantity FROM player_resource_inventory 
         WHERE user_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data = $3
         LIMIT 1`,
        [userId, recipe.output_item_id, JSON.stringify(itemData)]
      );
      
      let outputStack;
      if (existingItem.rows[0] && recipe.max_stack > 1) {
        // Stack onto existing
        const updateResult = await client.query(
          `UPDATE player_resource_inventory 
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [recipe.output_quantity, existingItem.rows[0].id]
        );
        outputStack = updateResult.rows[0];
      } else {
        // Create new cargo slot
        const nextSlot = await getNextSlotIndex(userId, client);
        
        const insertResult = await client.query(
          `INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
           VALUES ($1, 'item', $2, $3, $4, $5)
           RETURNING *`,
          [userId, recipe.output_item_id, recipe.output_quantity, nextSlot, JSON.stringify(itemData)]
        );
        outputStack = insertResult.rows[0];
      }
      
      return {
        item_id: recipe.output_item_id,
        item_name: recipe.item_name,
        item_icon: recipe.icon,
        quantity: recipe.output_quantity,
        item_data: itemData,
        stack_id: outputStack.id,
      };
    });
    
    res.json({ success: true, crafted: result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error crafting:', error);
    res.status(500).json({ error: 'Failed to craft item' });
  }
});

// Delete/trash an item from inventory
router.post('/inventory/trash', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id, quantity } = req.body;

    if (!item_id) return res.status(400).json({ error: 'item_id required' });

    const item = await queryOne(
      `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2`,
      [item_id, userId]
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const trashQty = quantity || item.quantity; // Default: trash entire stack

    if (trashQty >= item.quantity) {
      await query(`DELETE FROM player_resource_inventory WHERE id = $1`, [item.id]);
    } else {
      await query(
        `UPDATE player_resource_inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
        [trashQty, item.id]
      );
    }

    res.json({ success: true, trashed: trashQty });
  } catch (error) {
    console.error('Error trashing item:', error);
    res.status(500).json({ error: 'Failed to trash item' });
  }
});

// ============================================
// HARVESTING (Manual Mining)
// ============================================

// DEV ONLY: Cheat craft — creates item without consuming resources
router.post('/craft/cheat', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipe_id } = req.body;
    if (!recipe_id) return res.status(400).json({ error: 'recipe_id required' });

    const recipe = await queryOne(`
      SELECT cr.*, idef.max_stack, idef.item_data_defaults, idef.name as item_name, idef.icon
      FROM crafting_recipes cr
      JOIN item_definitions idef ON cr.output_item_id = idef.id
      WHERE cr.id = $1
    `, [recipe_id]);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    const itemData = { ...(recipe.item_data_defaults || {}), quality: { purity: 50, stability: 50, potency: 50, density: 50 } };

    const nextSlot = await getNextSlotIndex(userId);
    const result = await queryOne(`
      INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
      VALUES ($1, 'item', $2, $3, $4, $5)
      RETURNING *
    `, [userId, recipe.output_item_id, recipe.output_quantity, nextSlot, JSON.stringify(itemData)]);

    res.json({ success: true, crafted: { item_id: recipe.output_item_id, item_name: recipe.item_name, item_icon: recipe.icon, quantity: recipe.output_quantity, item_data: itemData } });
  } catch (error) {
    console.error('Error cheat crafting:', error);
    res.status(500).json({ error: 'Failed to cheat craft' });
  }
});

// Get player's active harvest session
router.get('/harvest/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const session = await queryOne(`
      SELECT 
        hs.*,
        rt.name as resource_name,
        rt.category,
        rt.rarity,
        rt.base_price,
        rt.icon,
        cb.name as body_name,
        rd.quantity_remaining as deposit_remaining,
        rd.quantity_total as deposit_total
      FROM harvest_sessions hs
      JOIN resource_types rt ON hs.resource_type_id = rt.id
      JOIN resource_deposits rd ON hs.deposit_id = rd.id
      JOIN celestial_bodies cb ON rd.celestial_body_id = cb.id
      WHERE hs.user_id = $1 AND hs.status = 'active'
    `, [userId]);

    if (!session) {
      return res.json({ session: null });
    }

    // Calculate how much could have been extracted since last_calculated_at
    const now = new Date();
    const lastCalc = new Date(session.last_calculated_at);
    const hoursElapsed = Math.max(0, (now - lastCalc)) / (1000 * 60 * 60);
    const rawPending = Math.max(0, Math.floor(hoursElapsed * session.harvest_rate));

    // Cap by deposit remaining and cargo space
    const cargo = await getPlayerCargoInfo(userId);

    // Get the deposit's stats from the deposit itself
    const deposit = await getDepositById(session.deposit_id);

    // Convert volume remaining to units that fit based on density
    const density = deposit?.stat_density || 50;
    const volPerUnit = Math.max(density, 1) / 100.0;
    const unitsThatFit = volPerUnit > 0 ? Math.floor(cargo.remaining / volPerUnit) : 0;

    const cappedByDeposit = Math.min(rawPending, session.deposit_remaining);
    const cappedByCargo = Math.min(cappedByDeposit, unitsThatFit);

    res.json({
      session: {
        id: session.id,
        deposit_id: session.deposit_id,
        ship_id: session.ship_id,
        resource_type_id: session.resource_type_id,
        resource_name: session.resource_name,
        category: session.category,
        rarity: session.rarity,
        body_name: session.body_name,
        stats: deposit ? {
          purity: deposit.stat_purity,
          stability: deposit.stat_stability,
          potency: deposit.stat_potency,
          density: deposit.stat_density,
        } : null,
        quality_tier: deposit ? getQualityTier(deposit.stat_purity, deposit.stat_stability, deposit.stat_potency, deposit.stat_density) : null,
        harvest_rate: session.harvest_rate,
        units_harvested: session.units_harvested,
        pending_units: Math.max(0, cappedByCargo),
        deposit_remaining: session.deposit_remaining,
        deposit_total: session.deposit_total,
        started_at: session.started_at,
        last_calculated_at: session.last_calculated_at,
      },
      cargo: {
        capacity: cargo.capacity,
        used: cargo.used,
        remaining: cargo.remaining,
        totalSlots: cargo.totalSlots,
        usedSlots: cargo.usedSlots,
        shipCount: cargo.shipCount,
      },
    });
  } catch (error) {
    console.error('Error fetching active harvest:', error);
    res.status(500).json({ error: 'Failed to fetch harvest session' });
  }
});

// Start harvesting a deposit
router.post('/harvest/start', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deposit_id } = req.body;

    if (!deposit_id) {
      return res.status(400).json({ error: 'deposit_id is required' });
    }

    // Check player has a ship
    const ship = await queryOne(`
      SELECT s.id, d.total_cargo
      FROM ships s
      JOIN ship_designs d ON s.design_id = d.id
      WHERE s.user_id = $1
      ORDER BY s.created_at ASC
      LIMIT 1
    `, [userId]);

    if (!ship) {
      return res.status(400).json({ error: 'You need a ship to mine' });
    }

    // Check cargo space
    const cargo = await getPlayerCargoInfo(userId);
    if (cargo.remaining <= 0) {
      return res.status(400).json({ error: 'Cargo is full. Offload resources first.' });
    }

    // Check for existing active session
    const existingSession = await queryOne(`
      SELECT id FROM harvest_sessions
      WHERE user_id = $1 AND status = 'active'
    `, [userId]);

    if (existingSession) {
      return res.status(400).json({ error: 'Already have an active harvest session. Stop it first.' });
    }

    // Check deposit exists and has resources
    const deposit = await getDepositById(deposit_id);
    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }
    if (deposit.quantity_remaining <= 0) {
      return res.status(400).json({ error: 'Deposit is depleted' });
    }

    // Check nobody else is mining this slot
    const slotOccupied = await queryOne(`
      SELECT id FROM harvest_sessions
      WHERE deposit_id = $1 AND status = 'active'
    `, [deposit_id]);

    if (slotOccupied) {
      return res.status(400).json({ error: 'This deposit is already being mined' });
    }

    // Check player has ground-scanned this body
    const survey = await queryOne(`
      SELECT ground_scanned FROM player_surveys
      WHERE user_id = $1 AND celestial_body_id = $2
    `, [userId, deposit.celestial_body_id]);

    if (!survey || !survey.ground_scanned) {
      return res.status(400).json({ error: 'Must ground-scan this body before mining' });
    }

    // Base rate: 50 units/hr (future: modify by mining bay modules)
    const harvestRate = 3600; // DEV: 1 unit/sec (change to 50 for production)

    // Create session
    const session = await queryOne(`
      INSERT INTO harvest_sessions (
        user_id, ship_id, deposit_id, resource_type_id, harvest_rate
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, ship.id, deposit_id, deposit.resource_type_id, harvestRate]);

    console.log(`⛏️ ${userId} started mining ${deposit.resource_name} at ${deposit.body_name}`);

    res.json({
      success: true,
      session: {
        id: session.id,
        deposit_id: session.deposit_id,
        resource_type_id: deposit.resource_type_id,
        resource_name: deposit.resource_name,
        category: deposit.category,
        rarity: deposit.rarity,
        body_name: deposit.body_name,
        stats: {
          purity: deposit.stat_purity,
          stability: deposit.stat_stability,
          potency: deposit.stat_potency,
          density: deposit.stat_density,
        },
        quality_tier: getQualityTier(deposit.stat_purity, deposit.stat_stability, deposit.stat_potency, deposit.stat_density),
        harvest_rate: harvestRate,
        units_harvested: 0,
        pending_units: 0,
        deposit_remaining: deposit.quantity_remaining,
        deposit_total: deposit.quantity_total,
        started_at: session.started_at,
      },
      cargo: {
        capacity: cargo.capacity,
        used: cargo.used,
        remaining: cargo.remaining,
      },
      message: `Started mining ${deposit.resource_name}. Extracting at ${harvestRate} units/hr.`,
    });
  } catch (error) {
    console.error('Error starting harvest:', error);
    // Handle unique constraint violations nicely
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Harvest slot conflict. Try again.' });
    }
    res.status(500).json({ error: 'Failed to start mining' });
  }
});

// Calculate and collect pending resources from active session
// This is the "trickle" — call it periodically or on demand
router.post('/harvest/collect', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await transaction(async (client) => {
      // Lock the session row
      const sessionResult = await client.query(`
        SELECT hs.*, rd.quantity_remaining as deposit_remaining
        FROM harvest_sessions hs
        JOIN resource_deposits rd ON hs.deposit_id = rd.id
        WHERE hs.user_id = $1 AND hs.status = 'active'
        FOR UPDATE OF hs
      `, [userId]);

      const session = sessionResult.rows[0];
      if (!session) {
        throw Object.assign(new Error('No active harvest session'), { statusCode: 404 });
      }

      // Get deposit stats (for inventory stacking)
      const depositResult = await client.query(`
        SELECT stat_purity, stat_stability, stat_potency, stat_density
        FROM resource_deposits WHERE id = $1
      `, [session.deposit_id]);
      const depositStats = depositResult.rows[0];

      // Calculate elapsed
      const now = new Date();
      const lastCalc = new Date(session.last_calculated_at);
      const hoursElapsed = (now - lastCalc) / (1000 * 60 * 60);
      const rawUnits = Math.floor(hoursElapsed * session.harvest_rate);

      if (rawUnits <= 0) {
        return { units_collected: 0, message: 'Nothing to collect yet.' };
      }

      // Get cargo space using volume-based calculation
      const cargo = await getPlayerCargoInfo(userId, client);
      const cargoRemaining = cargo.remaining;
      const cargoCapacity = cargo.capacity;

      // For resources, calculate volume per unit based on deposit density
      const depositDensity = depositStats?.stat_density || 50;
      const volumePerUnit = Math.max(depositDensity, 1) / 100.0;
      // How many units can fit in remaining volume?
      const unitsThatFit = volumePerUnit > 0 ? Math.floor(cargoRemaining / volumePerUnit) : 0;

      // Cap by deposit remaining and cargo space
      const cappedByDeposit = Math.min(rawUnits, session.deposit_remaining);
      const unitsToCollect = Math.min(cappedByDeposit, unitsThatFit);

      if (unitsToCollect <= 0 && unitsThatFit <= 0) {
        // Cargo full — end the session
        await client.query(`
          UPDATE harvest_sessions
          SET status = 'completed', end_reason = 'cargo_full', ended_at = $1, last_calculated_at = $1
          WHERE id = $2
        `, [now, session.id]);

        return { 
          units_collected: 0, 
          session_ended: true, 
          end_reason: 'cargo_full',
          message: 'Cargo is full! Mining stopped.',
        };
      }

      if (unitsToCollect <= 0) {
        return { units_collected: 0, message: 'Nothing to collect yet.' };
      }

      // Deplete the deposit
      const newDepositRemaining = Math.max(0, session.deposit_remaining - unitsToCollect);
      const depositDepleted = newDepositRemaining === 0;

      await client.query(`
        UPDATE resource_deposits
        SET quantity_remaining = $1, depleted_at = $2
        WHERE id = $3
      `, [newDepositRemaining, depositDepleted ? now : null, session.deposit_id]);

      // Add to inventory (stack with matching stats)
      const existingStack = await client.query(`
        SELECT id FROM player_resource_inventory
        WHERE user_id = $1 AND resource_type_id = $2
          AND stat_purity = $3 AND stat_stability = $4
          AND stat_potency = $5 AND stat_density = $6
      `, [userId, session.resource_type_id,
          depositStats.stat_purity, depositStats.stat_stability,
          depositStats.stat_potency, depositStats.stat_density]);

      if (existingStack.rows[0]) {
        await client.query(`
          UPDATE player_resource_inventory
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE id = $2
        `, [unitsToCollect, existingStack.rows[0].id]);
      } else {
        // Get first available slot
        const nextSlot = await getNextSlotIndex(userId, client);

        await client.query(`
          INSERT INTO player_resource_inventory (
            user_id, resource_type_id, quantity,
            stat_purity, stat_stability, stat_potency, stat_density,
            slot_index
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [userId, session.resource_type_id, unitsToCollect,
            depositStats.stat_purity, depositStats.stat_stability,
            depositStats.stat_potency, depositStats.stat_density, nextSlot]);
      }

      // Update session
      const totalHarvested = session.units_harvested + unitsToCollect;

      if (depositDepleted) {
        await client.query(`
          UPDATE harvest_sessions
          SET units_harvested = $1, last_calculated_at = $2, ended_at = $2,
              status = 'completed', end_reason = 'depleted'
          WHERE id = $3
        `, [totalHarvested, now, session.id]);
      } else {
        // Check if cargo is now full after this collection
        const volumeAdded = unitsToCollect * volumePerUnit;
        const newVolumeRemaining = cargoRemaining - volumeAdded;
        if (newVolumeRemaining <= 0) {
          await client.query(`
            UPDATE harvest_sessions
            SET units_harvested = $1, last_calculated_at = $2, ended_at = $2,
                status = 'completed', end_reason = 'cargo_full'
            WHERE id = $3
          `, [totalHarvested, now, session.id]);
        } else {
          await client.query(`
            UPDATE harvest_sessions
            SET units_harvested = $1, last_calculated_at = $2
            WHERE id = $3
          `, [totalHarvested, now, session.id]);
        }
      }

      const volumeAdded = unitsToCollect * volumePerUnit;
      const sessionEnded = depositDepleted || (cargoRemaining - volumeAdded <= 0);
      const endReason = depositDepleted ? 'depleted' : (cargoRemaining - volumeAdded <= 0) ? 'cargo_full' : null;

      return {
        units_collected: unitsToCollect,
        total_harvested: totalHarvested,
        deposit_remaining: newDepositRemaining,
        session_ended: sessionEnded,
        end_reason: endReason,
        cargo_remaining: Math.max(0, cargoRemaining - volumeAdded),
        message: sessionEnded
          ? (endReason === 'depleted'
            ? `Collected ${unitsToCollect} units. Deposit fully depleted!`
            : `Collected ${unitsToCollect} units. Cargo full!`)
          : `Collected ${unitsToCollect} units.`,
      };
    });

    console.log(`📦 ${userId} collected ${result.units_collected} units`);
    res.json({ success: true, ...result });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error collecting harvest:', error);
    res.status(500).json({ error: 'Failed to collect resources' });
  }
});

// Stop harvesting (player stops manually)
router.post('/harvest/stop', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await transaction(async (client) => {
      // Lock the session
      const sessionResult = await client.query(`
        SELECT hs.*, rd.quantity_remaining as deposit_remaining,
               rd.stat_purity, rd.stat_stability, rd.stat_potency, rd.stat_density
        FROM harvest_sessions hs
        JOIN resource_deposits rd ON hs.deposit_id = rd.id
        WHERE hs.user_id = $1 AND hs.status = 'active'
        FOR UPDATE OF hs
      `, [userId]);

      const session = sessionResult.rows[0];
      if (!session) {
        throw Object.assign(new Error('No active harvest session'), { statusCode: 404 });
      }

      // Calculate any remaining pending resources
      const now = new Date();
      const lastCalc = new Date(session.last_calculated_at);
      const hoursElapsed = (now - lastCalc) / (1000 * 60 * 60);
      const rawUnits = Math.floor(hoursElapsed * session.harvest_rate);

      // Get cargo space for final collection (volume-based)
      const cargo = await getPlayerCargoInfo(userId, client);
      const cargoRemaining = cargo.remaining;

      // Calculate volume per unit based on deposit density
      const depositResult = await client.query(
        `SELECT stat_density FROM resource_deposits WHERE id = $1`, [session.deposit_id]
      );
      const stopDensity = depositResult.rows[0]?.stat_density || 50;
      const stopVolumePerUnit = Math.max(stopDensity, 1) / 100.0;
      const stopUnitsThatFit = stopVolumePerUnit > 0 ? Math.floor(cargoRemaining / stopVolumePerUnit) : 0;

      const cappedByDeposit = Math.min(rawUnits, session.deposit_remaining);
      const unitsToCollect = Math.min(cappedByDeposit, stopUnitsThatFit);

      // Collect any final pending resources
      if (unitsToCollect > 0) {
        // Deplete deposit
        const newRemaining = Math.max(0, session.deposit_remaining - unitsToCollect);
        await client.query(`
          UPDATE resource_deposits
          SET quantity_remaining = $1, depleted_at = $2
          WHERE id = $3
        `, [newRemaining, newRemaining === 0 ? now : null, session.deposit_id]);

        // Add to inventory
        const existingStack = await client.query(`
          SELECT id FROM player_resource_inventory
          WHERE user_id = $1 AND resource_type_id = $2
            AND stat_purity = $3 AND stat_stability = $4
            AND stat_potency = $5 AND stat_density = $6
        `, [userId, session.resource_type_id,
            session.stat_purity, session.stat_stability,
            session.stat_potency, session.stat_density]);

        if (existingStack.rows[0]) {
          await client.query(`
            UPDATE player_resource_inventory
            SET quantity = quantity + $1, updated_at = NOW()
            WHERE id = $2
          `, [unitsToCollect, existingStack.rows[0].id]);
        } else {
          const nextSlot = await getNextSlotIndex(userId, client);

          await client.query(`
            INSERT INTO player_resource_inventory (
              user_id, resource_type_id, quantity,
              stat_purity, stat_stability, stat_potency, stat_density,
              slot_index
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [userId, session.resource_type_id, unitsToCollect,
              session.stat_purity, session.stat_stability,
              session.stat_potency, session.stat_density, nextSlot]);
        }
      }

      // End session
      const totalHarvested = session.units_harvested + unitsToCollect;
      await client.query(`
        UPDATE harvest_sessions
        SET units_harvested = $1, last_calculated_at = $2, ended_at = $2,
            status = 'cancelled', end_reason = 'player_stopped'
        WHERE id = $3
      `, [totalHarvested, now, session.id]);

      return {
        units_collected: unitsToCollect,
        total_harvested: totalHarvested,
        message: unitsToCollect > 0
          ? `Mining stopped. Collected ${unitsToCollect} final units. Total: ${totalHarvested}.`
          : `Mining stopped. Total extracted: ${totalHarvested}.`,
      };
    });

    console.log(`🛑 ${userId} stopped mining (${result.units_collected} final units)`);
    res.json({ success: true, ...result });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error stopping harvest:', error);
    res.status(500).json({ error: 'Failed to stop mining' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getQualityTier(purity, stability, potency, density) {
  const avg = (purity + stability + potency + density) / 4;
  
  if (avg <= 20) return { name: 'Impure', color: '#888888' };
  if (avg <= 40) return { name: 'Standard', color: '#ffffff' };
  if (avg <= 60) return { name: 'Refined', color: '#44ff44' };
  if (avg <= 80) return { name: 'Superior', color: '#4488ff' };
  return { name: 'Pristine', color: '#aa44ff' };
}

// Generate stat range for ground scan (shows range, not exact value)
function getStatRange(exactValue) {
  const variance = 10;
  const min = Math.max(0, exactValue - variance);
  const max = Math.min(100, exactValue + variance);
  return { min, max };
}

// Get abundance description based on total quantity
function getAbundance(totalQuantity) {
  if (totalQuantity < 200) return 'Scarce';
  if (totalQuantity < 500) return 'Moderate';
  return 'Abundant';
}

// ============================================
// SCANNER PROBES (Items)
// ============================================

// Scanner probe definitions
const SCANNER_PROBES = {
  BASIC: {
    id: 'scanner_probe',
    name: 'Scanner Probe',
    description: 'Basic orbital scanner for detecting resource types',
    type: 'orbital',
    craftingCost: { iron: 5, copper: 2 },
  },
  ADVANCED: {
    id: 'advanced_scanner_probe', 
    name: 'Advanced Scanner Probe',
    description: 'Ground-penetrating scanner for detailed deposit analysis',
    type: 'ground',
    craftingCost: { titanium: 3, copper: 5, crystite: 1 },
  },
};

// Get player's scanner probe counts (from cargo items)
router.get('/probes', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const scannerProbes = await queryOne(`
      SELECT COALESCE(SUM(quantity), 0) as count
      FROM player_resource_inventory
      WHERE user_id = $1 AND item_type = 'item' AND item_id = 'scanner_probe'
    `, [userId]);
    
    const advancedProbes = await queryOne(`
      SELECT COALESCE(SUM(quantity), 0) as count
      FROM player_resource_inventory
      WHERE user_id = $1 AND item_type = 'item' AND item_id = 'advanced_scanner_probe'
    `, [userId]);
    
    res.json({
      scanner_probes: parseInt(scannerProbes?.count) || 0,
      advanced_scanner_probes: parseInt(advancedProbes?.count) || 0,
      probe_types: SCANNER_PROBES,
    });
  } catch (error) {
    console.error('Error fetching probes:', error);
    res.status(500).json({ error: 'Failed to fetch probe counts' });
  }
});

// ============================================
// SURVEYING
// ============================================

// Get survey status for a body
router.get('/survey/:bodyId', authMiddleware, async (req, res) => {
  try {
    const { bodyId } = req.params;
    const userId = req.user.id;
    
    const resolvedBodyId = await resolveBodyId(bodyId);
    if (!resolvedBodyId) {
      return res.status(404).json({ error: 'Celestial body not found' });
    }
    
    const survey = await queryOne(`
      SELECT * FROM player_surveys
      WHERE user_id = $1 AND celestial_body_id = $2
    `, [userId, resolvedBodyId]);
    
    const body = await queryOne(`
      SELECT id, name, body_type, planet_type, size
      FROM celestial_bodies WHERE id = $1
    `, [resolvedBodyId]);
    
    if (!body) {
      return res.status(404).json({ error: 'Celestial body not found' });
    }
    
    res.json({
      body: {
        id: body.id,
        name: body.name,
        body_type: body.body_type,
        planet_type: body.planet_type,
      },
      survey_status: {
        orbital_scanned: survey?.orbital_scanned || false,
        ground_scanned: survey?.ground_scanned || false,
        scanned_at: survey?.scanned_at || null,
      },
    });
  } catch (error) {
    console.error('Error fetching survey status:', error);
    res.status(500).json({ error: 'Failed to fetch survey status' });
  }
});

// Perform ORBITAL SCAN
router.post('/survey/orbital/:bodyId', authMiddleware, async (req, res) => {
  try {
    const { bodyId } = req.params;
    const userId = req.user.id;
    
    const resolvedBodyId = await resolveBodyId(bodyId);
    if (!resolvedBodyId) {
      return res.status(404).json({ error: 'Celestial body not found' });
    }
    
    const existingSurvey = await queryOne(`
      SELECT * FROM player_surveys
      WHERE user_id = $1 AND celestial_body_id = $2
    `, [userId, resolvedBodyId]);
    
    if (existingSurvey?.orbital_scanned) {
      return res.status(400).json({ error: 'Already orbital scanned' });
    }
    
    const probeStack = await queryOne(`
      SELECT id, quantity FROM player_resource_inventory 
      WHERE user_id = $1 AND item_type = 'item' AND item_id = 'scanner_probe' AND quantity > 0
      ORDER BY slot_index ASC LIMIT 1
    `, [userId]);
    
    if (!probeStack) {
      return res.status(400).json({ error: 'No scanner probes available' });
    }
    
    // Consume one probe
    if (probeStack.quantity <= 1) {
      await query(`DELETE FROM player_resource_inventory WHERE id = $1`, [probeStack.id]);
    } else {
      await query(`UPDATE player_resource_inventory SET quantity = quantity - 1 WHERE id = $1`, [probeStack.id]);
    }
    
    const deposits = await ensureDepositsExist(resolvedBodyId);
    
    if (existingSurvey) {
      await query(`
        UPDATE player_surveys 
        SET orbital_scanned = TRUE, scanned_at = NOW()
        WHERE id = $1
      `, [existingSurvey.id]);
    } else {
      await query(`
        INSERT INTO player_surveys (user_id, celestial_body_id, orbital_scanned)
        VALUES ($1, $2, TRUE)
      `, [userId, resolvedBodyId]);
    }
    
    const body = await queryOne(`
      SELECT name, body_type, planet_type FROM celestial_bodies WHERE id = $1
    `, [resolvedBodyId]);
    
    const resourceSummary = {};
    for (const deposit of deposits) {
      if (!resourceSummary[deposit.resource_name]) {
        resourceSummary[deposit.resource_name] = {
          name: deposit.resource_name,
          category: deposit.category,
          rarity: deposit.rarity,
          deposit_count: 0,
          total_quantity: 0,
        };
      }
      resourceSummary[deposit.resource_name].deposit_count++;
      resourceSummary[deposit.resource_name].total_quantity += deposit.quantity_remaining;
    }
    
    const resources_detected = Object.values(resourceSummary).map(r => ({
      name: r.name,
      category: r.category,
      rarity: r.rarity,
      deposit_count: r.deposit_count,
      abundance: getAbundance(r.total_quantity),
    }));
    
    const hazards = [];
    if (body.planet_type === 'lava') hazards.push('Extreme heat detected');
    if (body.planet_type === 'ice') hazards.push('Extreme cold detected');
    if (body.body_type === 'gas_giant') hazards.push('Toxic atmosphere detected');
    
    res.json({
      success: true,
      scan_type: 'orbital',
      body_name: body.name,
      results: {
        resources_detected,
        total_deposits: deposits.length,
        hazards: hazards.length > 0 ? hazards : null,
      },
      message: `Orbital scan complete. Detected ${resources_detected.length} resource type(s) across ${deposits.length} deposit(s).`,
    });
  } catch (error) {
    console.error('Error performing orbital scan:', error);
    res.status(500).json({ error: 'Failed to perform orbital scan' });
  }
});

// Perform GROUND SCAN
router.post('/survey/ground/:bodyId', authMiddleware, async (req, res) => {
  try {
    const { bodyId } = req.params;
    const userId = req.user.id;
    
    const resolvedBodyId = await resolveBodyId(bodyId);
    if (!resolvedBodyId) {
      return res.status(404).json({ error: 'Celestial body not found' });
    }
    
    const existingSurvey = await queryOne(`
      SELECT * FROM player_surveys
      WHERE user_id = $1 AND celestial_body_id = $2
    `, [userId, resolvedBodyId]);
    
    if (existingSurvey?.ground_scanned) {
      return res.status(400).json({ error: 'Already ground scanned' });
    }
    
    if (!existingSurvey?.orbital_scanned) {
      return res.status(400).json({ error: 'Must perform orbital scan first' });
    }
    
    const probeStack = await queryOne(`
      SELECT id, quantity FROM player_resource_inventory 
      WHERE user_id = $1 AND item_type = 'item' AND item_id = 'advanced_scanner_probe' AND quantity > 0
      ORDER BY slot_index ASC LIMIT 1
    `, [userId]);
    
    if (!probeStack) {
      return res.status(400).json({ error: 'No advanced scanner probes available' });
    }
    
    // Consume one probe
    if (probeStack.quantity <= 1) {
      await query(`DELETE FROM player_resource_inventory WHERE id = $1`, [probeStack.id]);
    } else {
      await query(`UPDATE player_resource_inventory SET quantity = quantity - 1 WHERE id = $1`, [probeStack.id]);
    }
    
    await query(`
      UPDATE player_surveys 
      SET ground_scanned = TRUE, scanned_at = NOW()
      WHERE id = $1
    `, [existingSurvey.id]);
    
    const deposits = await getDepositsForBody(resolvedBodyId);
    
    const body = await queryOne(`
      SELECT name FROM celestial_bodies WHERE id = $1
    `, [resolvedBodyId]);
    
    const detailed_deposits = deposits.map((d) => ({
      id: d.id,
      slot_number: d.slot_number,
      resource_name: d.resource_name,
      category: d.category,
      rarity: d.rarity,
      quantity_range: {
        min: Math.floor(d.quantity_remaining * 0.9),
        max: Math.ceil(d.quantity_remaining * 1.1),
      },
      stat_ranges: {
        purity: getStatRange(d.stat_purity),
        stability: getStatRange(d.stat_stability),
        potency: getStatRange(d.stat_potency),
        density: getStatRange(d.stat_density),
      },
      estimated_tier: getQualityTier(d.stat_purity, d.stat_stability, d.stat_potency, d.stat_density),
    }));
    
    res.json({
      success: true,
      scan_type: 'ground',
      body_name: body.name,
      results: {
        deposits: detailed_deposits,
      },
      message: `Ground scan complete. Analyzed ${detailed_deposits.length} deposit(s) with detailed composition data.`,
    });
  } catch (error) {
    console.error('Error performing ground scan:', error);
    res.status(500).json({ error: 'Failed to perform ground scan' });
  }
});

// ============================================
// ENSURE BODY EXISTS IN DB (for procedural systems)
// Client calls this when docking at a procedural planet.
// Creates star_system + celestial_body rows if they don't exist.
// Returns the celestial_body UUID needed for scanning/mining.
// ============================================
router.post('/ensure-body', authMiddleware, async (req, res) => {
  try {
    const {
      system_procedural_id, // e.g. 'sys_42'
      system_name,
      star_type,
      body_client_id,      // e.g. 'planet_3'
      body_name,
      body_type,           // 'planet', 'station', 'jump_gate'
      planet_type,         // 'rocky', 'terran', etc.
      size,
      orbit_radius,
      danger_level,
      // Phase A city seeding -- both required to deterministically place
      // a city in a procedural system. If omitted, defaults below treat
      // the body as not-a-city (safe for old clients during deploy).
      system_seed,
      system_planet_count,
    } = req.body;

    if (!system_procedural_id || !body_client_id || !body_name) {
      return res.status(400).json({ error: 'system_procedural_id, body_client_id, and body_name required' });
    }

    // 1. Ensure star_system exists
    let system = await queryOne(
      `SELECT id FROM star_systems WHERE procedural_id = $1`,
      [system_procedural_id]
    );

    if (!system) {
      system = await queryOne(`
        INSERT INTO star_systems (name, galaxy_x, galaxy_y, star_type, star_size, danger_level, procedural_id)
        VALUES ($1, 0, 0, $2, 1.0, $3, $4)
        RETURNING id
      `, [system_name || system_procedural_id, star_type || 'yellow_star', danger_level || 0, system_procedural_id]);
    }

    // City decision is deterministic from the system seed + the body's
    // index in the system's planet list. Same answer for every player,
    // every dock. Stations / jump gates / asteroid belts are never cities.
    const hasCity = (typeof system_seed === 'number' && typeof system_planet_count === 'number')
      ? isCityPlanet(system_seed, system_planet_count, body_client_id)
      : false;

    // 2. Check if body already exists (by system + client-side name)
    let body = await queryOne(
      `SELECT id, has_city FROM celestial_bodies WHERE system_id = $1 AND name = $2`,
      [system.id, body_name]
    );

    if (!body) {
      body = await queryOne(`
        INSERT INTO celestial_bodies (
          system_id, name, body_type, planet_type, size,
          orbit_radius, orbit_speed, star_type, deposit_slots, has_city
        ) VALUES ($1, $2, $3, $4, $5, $6, 1.0, $7, $8, $9)
        RETURNING id, has_city
      `, [
        system.id,
        body_name,
        body_type || 'planet',
        planet_type || null,
        size || 20,
        orbit_radius || 1000,
        star_type || null,
        body_type === 'station' || body_type === 'jump_gate' ? 0 : (size > 50 ? 6 : size > 25 ? 4 : 3),
        hasCity,
      ]);
    }

    res.json({
      success: true,
      system_db_id: system.id,
      body_db_id: body.id,
      has_city: body.has_city === true,
    });
  } catch (error) {
    console.error('Error ensuring body:', error);
    res.status(500).json({ error: 'Failed to register body' });
  }
});

// ============================================
// WRECKS — lootable spatial entities (Phase 1: pirate-kill credit drops)
// ============================================
// Migration 021. Replaces the old fittingAPI.awardLoot flow: instead of
// instantly crediting the player when an enemy is destroyed, the server
// spawns a wreck row at the kill position. Players fly to it, claim it
// via /wrecks/claim, and the contents transfer to their account.
//
// Multiplayer trust note: spawn + claim trust client-supplied position
// data (same model as the old awardLoot). When pirates move server-side
// we'll tighten this. The 1000-cr/spawn cap is the only safeguard for now.

const SOL_SYSTEM_ID = '00000000-0000-0000-0000-000000000001';
const WRECK_TTL_MINUTES = 5;
const WRECK_MAX_CREDITS = 1000;
// Probability a pirate kill drops a module alongside credits. Tune
// here. Phase 1.5: tier 1-2 only, low-mid quality (30-60 per stat) so
// dropped loot is "decent but encourages crafting/buying for better".
// TEMPORARILY 1.0 for verification -- dial back to 0.25 once confirmed working.
const MODULE_DROP_CHANCE = 1.0;
// Random integer in [lo, hi] inclusive.
const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

// Resolve a client's currentSystemId to the DB system UUID. Sol is hand-
// seeded (migration 005) without a procedural_id, so we hard-map it.
// Procedural systems use the ensure-or-fetch pattern from /ensure-body.
async function resolveSystemId(client, system_procedural_id, system_name, star_type, danger_level) {
  if (system_procedural_id === 'sol') return SOL_SYSTEM_ID;
  const existing = await client.query(
    `SELECT id FROM star_systems WHERE procedural_id = $1`,
    [system_procedural_id]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query(`
    INSERT INTO star_systems (name, galaxy_x, galaxy_y, star_type, star_size, danger_level, procedural_id)
    VALUES ($1, 0, 0, $2, 1.0, $3, $4)
    RETURNING id
  `, [system_name || system_procedural_id, star_type || 'yellow_star', danger_level || 0, system_procedural_id]);
  return created.rows[0].id;
}

// Spawn a wreck. Called by client on pirate kill.
router.post('/wrecks/spawn', authMiddleware, async (req, res) => {
  try {
    const { system_procedural_id, system_name, star_type, danger_level, x, y, credits } = req.body;
    if (!system_procedural_id || x == null || y == null) {
      return res.status(400).json({ error: 'system_procedural_id, x, y required' });
    }
    const lootCredits = Math.max(0, Math.min(parseInt(credits) || 0, WRECK_MAX_CREDITS));

    const wreck = await transaction(async (client) => {
      const systemId = await resolveSystemId(client, system_procedural_id, system_name, star_type, danger_level);

      // Module drop roll. tier <= 2 keeps elites out of pirate drops;
      // ORDER BY RANDOM() is fine at this scale (a few dozen module rows).
      const modules = [];
      if (Math.random() < MODULE_DROP_CHANCE) {
        const modResult = await client.query(`
          SELECT id, slot_type FROM module_types
          WHERE buy_price IS NOT NULL AND tier <= 2
          ORDER BY RANDOM() LIMIT 1
        `);
        const mod = modResult.rows[0];
        if (mod) {
          modules.push({
            module_type_id: mod.id,
            slot_type: mod.slot_type,
            quality: {
              purity:    randInt(30, 60),
              stability: randInt(30, 60),
              potency:   randInt(30, 60),
              density:   randInt(30, 60),
            },
          });
        }
      }
      const contents = modules.length > 0
        ? { credits: lootCredits, modules }
        : { credits: lootCredits };

      const result = await client.query(`
        INSERT INTO wrecks (system_id, x, y, contents, source, expires_at)
        VALUES ($1, $2, $3, $4, 'pirate', NOW() + ($5 || ' minutes')::INTERVAL)
        RETURNING id, x, y, contents, expires_at
      `, [systemId, x, y, JSON.stringify(contents), WRECK_TTL_MINUTES]);
      return result.rows[0];
    });

    res.json({ success: true, wreck });
  } catch (error) {
    // Verbose logging for the Phase 1.5 debug -- the previous one-liner
    // hid the actual cause. PG errors expose code/detail/constraint/table
    // which usually point straight at the bug. Strip back to a one-liner
    // once we know what's broken.
    console.error('[wreck spawn] FAIL:', {
      message:    error?.message,
      code:       error?.code,
      detail:     error?.detail,
      hint:       error?.hint,
      constraint: error?.constraint,
      table:      error?.table,
      column:     error?.column,
      position:   error?.position,
      stack:      error?.stack,
      input: {
        system_procedural_id: req.body?.system_procedural_id,
        x:                    req.body?.x,
        y:                    req.body?.y,
        credits:              req.body?.credits,
      },
    });
    res.status(500).json({ error: 'Failed to spawn wreck', detail: error?.message });
  }
});

// List active (unclaimed, unexpired) wrecks in a system. Polled by client.
router.get('/wrecks', authMiddleware, async (req, res) => {
  try {
    const { system_procedural_id } = req.query;
    if (!system_procedural_id) return res.status(400).json({ error: 'system_procedural_id required' });

    let systemId;
    if (system_procedural_id === 'sol') {
      systemId = SOL_SYSTEM_ID;
    } else {
      const sys = await queryOne(
        `SELECT id FROM star_systems WHERE procedural_id = $1`,
        [system_procedural_id]
      );
      // System not yet registered -- no wrecks possible. Return empty.
      if (!sys) return res.json({ wrecks: [] });
      systemId = sys.id;
    }

    const wrecks = await queryAll(`
      SELECT id, x, y, contents, expires_at
      FROM wrecks
      WHERE system_id = $1 AND claimed_by IS NULL AND expires_at > NOW()
      ORDER BY spawned_at DESC
      LIMIT 50
    `, [systemId]);

    res.json({ wrecks });
  } catch (error) {
    console.error('Error listing wrecks:', error);
    res.status(500).json({ error: 'Failed to list wrecks' });
  }
});

// Claim a wreck. Atomically marks it claimed_by the requesting user,
// then awards the contents. Returns 409 if already claimed / expired
// (race condition with another player or the despawn timer).
router.post('/wrecks/claim', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { wreck_id } = req.body;
    if (!wreck_id) return res.status(400).json({ error: 'wreck_id required' });

    const result = await transaction(async (client) => {
      // The WHERE clause does the race-safety: if another player claimed
      // first or the wreck expired, this updates 0 rows and we throw 409.
      const claimRes = await client.query(`
        UPDATE wrecks
        SET claimed_by = $1, claimed_at = NOW()
        WHERE id = $2 AND claimed_by IS NULL AND expires_at > NOW()
        RETURNING contents
      `, [userId, wreck_id]);

      if (claimRes.rows.length === 0) {
        throw Object.assign(new Error('Wreck already claimed or expired'), { statusCode: 409 });
      }

      const contents = claimRes.rows[0].contents || {};
      const creditsAwarded = parseInt(contents.credits) || 0;
      if (creditsAwarded > 0) {
        await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [creditsAwarded, userId]);
      }

      // Module drops (Phase 1.5). For each module in contents.modules,
      // find the player's next free inventory slot and insert as a
      // module-type cargo item -- same shape /buy-module produces, so
      // the rest of the cargo + fitting UI handles it without changes.
      // No cargo-cap check: the inventory schema allows arbitrary slot
      // indexes, and this matches the existing buy-module behavior.
      const modulesAwarded = [];
      const droppedModules = Array.isArray(contents.modules) ? contents.modules : [];
      for (const m of droppedModules) {
        const modInfo = await client.query(
          `SELECT name, slot_type FROM module_types WHERE id = $1`,
          [m.module_type_id]
        );
        const mt = modInfo.rows[0];
        if (!mt) continue; // module type was removed; skip silently

        const slotRes = await client.query(`
          SELECT s.slot FROM generate_series(
            0,
            COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)
          ) s(slot)
          WHERE s.slot NOT IN (
            SELECT slot_index FROM player_resource_inventory
            WHERE user_id = $1 AND slot_index IS NOT NULL
          )
          ORDER BY s.slot ASC LIMIT 1
        `, [userId]);
        const nextSlot = parseInt(slotRes.rows[0]?.slot) || 0;

        const itemData = {
          slot_type: mt.slot_type,
          quality: m.quality || { purity: 50, stability: 50, potency: 50, density: 50 },
        };
        await client.query(`
          INSERT INTO player_resource_inventory
            (user_id, item_type, item_id, quantity, slot_index, item_data)
          VALUES ($1, 'item', $2, 1, $3, $4)
        `, [userId, m.module_type_id, nextSlot, JSON.stringify(itemData)]);

        modulesAwarded.push(mt.name);
      }

      return { credits_awarded: creditsAwarded, modules_awarded: modulesAwarded };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error claiming wreck:', error);
    res.status(500).json({ error: 'Failed to claim wreck' });
  }
});

// ============================================
// ASTEROIDS — mineable spatial entities in belt bodies (Phase A1)
// ============================================
// Server-persisted so depletion state (A3) is shared across players.
// Generated lazily on first GET for a system: takes the system seed +
// belt orbit_radius as a per-belt RNG seed, deterministic across calls.
//
// Contents shape: { "<resource_type_id>": { initial: N, remaining: N } }
// 1-3 resource types per asteroid, rarity-weighted (70% common / 25%
// rare / 5% exotic). Quantity scales with asteroid size + rarity.

const ASTEROIDS_PER_BELT_MIN = 20;
const ASTEROIDS_PER_BELT_MAX = 40;
const RARITY_WEIGHTS = { common: 0.70, rare: 0.25, exotic: 0.05 };
const ASTEROID_RESPAWN_MINUTES = 10;

// Roll resource composition for one asteroid. Used by initial generation
// (deterministic via shared SRng) and by lazy respawn (uses Math.random
// since respawn is a stochastic world event, not seed-derived).
// `rng` is { next, range, int } -- accepts SRng OR a Math.random adapter.
function rollAsteroidContents(rng, resByRarity, size) {
  const pickRarity = () => {
    const r = rng.next();
    if (r < RARITY_WEIGHTS.common) return 'common';
    if (r < RARITY_WEIGHTS.common + RARITY_WEIGHTS.rare) return 'rare';
    return 'exotic';
  };
  const qtyFor = (rarity, sz) => {
    const base = { common: 200, rare: 80, exotic: 25 }[rarity] || 100;
    return Math.round(base * (sz / 4) * (0.7 + rng.next() * 0.6));
  };
  const numResources = rng.int(1, 3);
  const contents = {};
  for (let r = 0; r < numResources; r++) {
    const rarity = pickRarity();
    const pool = resByRarity[rarity];
    if (!pool || pool.length === 0) continue;
    const resId = pool[rng.int(0, pool.length - 1)];
    const qty = qtyFor(rarity, size);
    contents[resId] = contents[resId]
      ? { initial: contents[resId].initial + qty, remaining: contents[resId].remaining + qty }
      : { initial: qty, remaining: qty };
  }
  return contents;
}

// Math.random-backed adapter that satisfies the same {next/range/int}
// interface SRng exposes. Used for non-deterministic rolls (respawn).
const mathRng = {
  next: () => Math.random(),
  range: (a, b) => a + Math.random() * (b - a),
  int: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
};

// Roll one stat (0-100) using a triangular distribution (avg of 3
// uniform draws). Centers at 50, makes q90+ rare (~1-2%). Mirrors the
// curve in deposits.js generateStat + migration 046 backfill so every
// quality roll in the game uses the same shape.
function rollQualityStat(rng) {
  const avg = (rng.int(0, 100) + rng.int(0, 100) + rng.int(0, 100)) / 3;
  return Math.min(100, Math.max(0, Math.round(avg)));
}

function rollAsteroidQuality(rng) {
  return {
    purity:    rollQualityStat(rng),
    stability: rollQualityStat(rng),
    potency:   rollQualityStat(rng),
    density:   rollQualityStat(rng),
  };
}

// Generates the asteroid set for a belt body. Returns rows ready for
// bulk INSERT. Uses SRng for determinism so re-runs would produce the
// same field (though in practice we only generate once per belt).
async function buildAsteroidsForBelt(client, belt, systemSeed) {
  // Per-belt seed: combine system seed + belt's orbit radius so each
  // belt in a multi-belt system gets a distinct field.
  const seed = (systemSeed | 0) + Math.round(belt.orbit_radius);
  const rng = new SRng(seed + 0xA570); // 0xA570 salt = "ASTROID"
  const resByRarity = await loadResByRarity(client);

  const beltSize = belt.size || 50;
  const beltRadius = belt.orbit_radius || 1000;
  const count = rng.int(ASTEROIDS_PER_BELT_MIN, ASTEROIDS_PER_BELT_MAX);
  const rows = [];

  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    // Radial jitter: stay within +/- 40% of belt size so asteroids
    // cluster in the visible belt zone.
    const radius = beltRadius + rng.range(-beltSize * 0.4, beltSize * 0.4);
    const size = rng.int(2, 6);

    const quality = rollAsteroidQuality(rng);
    rows.push({
      system_id: belt.system_id,
      belt_body_id: belt.id,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size,
      rotation: rng.range(0, Math.PI * 2),
      contents: rollAsteroidContents(rng, resByRarity, size),
      stat_purity:    quality.purity,
      stat_stability: quality.stability,
      stat_potency:   quality.potency,
      stat_density:   quality.density,
    });
  }
  return rows;
}

// Cache resource-by-rarity within a request to avoid repeating the
// SELECT for every roll. Resolves once and reuses.
async function loadResByRarity(client) {
  const resByRarity = { common: [], rare: [], exotic: [] };
  const allRes = await client.query(`SELECT id, rarity FROM resource_types`);
  for (const r of allRes.rows) {
    if (resByRarity[r.rarity]) resByRarity[r.rarity].push(r.id);
  }
  return resByRarity;
}

// Helper: enrich a contents object ({resId: {initial, remaining}}) with
// the human-readable resource name. Called on every list + scan + mine
// response so the client doesn't have to maintain its own resource_types
// lookup. Skips null/empty contents.
async function enrichContentsWithNames(client, contents) {
  if (!contents || typeof contents !== 'object') return contents;
  const ids = Object.keys(contents).map(Number).filter(n => !isNaN(n));
  if (ids.length === 0) return contents;
  const rows = await client.query(
    `SELECT id, name FROM resource_types WHERE id = ANY($1::INT[])`,
    [ids]
  );
  const nameMap = {};
  rows.rows.forEach(r => { nameMap[r.id] = r.name; });
  const enriched = {};
  for (const [k, v] of Object.entries(contents)) {
    enriched[k] = { ...v, name: nameMap[Number(k)] || `res_${k}` };
  }
  return enriched;
}

// List active (non-depleted) asteroids in a system. Generates the set
// lazily on first request for a belt that has zero asteroid rows.
router.get('/asteroids', authMiddleware, async (req, res) => {
  try {
    const { system_procedural_id } = req.query;
    if (!system_procedural_id) return res.status(400).json({ error: 'system_procedural_id required' });

    const asteroids = await transaction(async (client) => {
      // Resolve system id (Sol special-case mirrors wrecks/spawn).
      let systemId;
      if (system_procedural_id === 'sol') {
        systemId = SOL_SYSTEM_ID;
      } else {
        const sys = await client.query(
          `SELECT id FROM star_systems WHERE procedural_id = $1`,
          [system_procedural_id]
        );
        if (!sys.rows[0]) return [];
        systemId = sys.rows[0].id;
      }

      // Find belt bodies in this system.
      const belts = await client.query(
        `SELECT id, system_id, orbit_radius, size FROM celestial_bodies
         WHERE system_id = $1 AND body_type = 'asteroid_belt'`,
        [systemId]
      );
      if (belts.rows.length === 0) return [];

      // System seed for deterministic generation. Sol's seed is its
      // procedural_id hash; procedural systems may not have a seed
      // column stored, so we derive from procedural_id hash too.
      // Simple FNV-ish hash so server doesn't need to import the client RNG seed.
      let systemSeed = 0;
      for (let i = 0; i < system_procedural_id.length; i++) {
        systemSeed = ((systemSeed << 5) - systemSeed + system_procedural_id.charCodeAt(i)) | 0;
      }

      // For each belt, generate asteroids if none exist yet.
      for (const belt of belts.rows) {
        const existing = await client.query(
          `SELECT 1 FROM asteroids WHERE belt_body_id = $1 LIMIT 1`,
          [belt.id]
        );
        if (existing.rows.length > 0) continue;

        const rows = await buildAsteroidsForBelt(client, belt, systemSeed);
        // Bulk insert. JSONB contents passed as stringified JSON per row.
        for (const r of rows) {
          await client.query(`
            INSERT INTO asteroids (
              system_id, belt_body_id, x, y, size, rotation, contents,
              stat_purity, stat_stability, stat_potency, stat_density
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            r.system_id, r.belt_body_id, r.x, r.y, r.size, r.rotation,
            JSON.stringify(r.contents),
            r.stat_purity, r.stat_stability, r.stat_potency, r.stat_density,
          ]);
        }
      }

      // A3: lazy respawn pass. Any asteroid in this system whose
      // respawn_at has passed gets a fresh roll of contents at its
      // original position. Done inline on the list query so we don't
      // need a background job. Re-rolled with Math.random (not seeded)
      // so successive respawns vary.
      const respawnable = await client.query(`
        SELECT id, size FROM asteroids
        WHERE system_id = $1 AND depleted_at IS NOT NULL AND respawn_at < NOW()
      `, [systemId]);
      if (respawnable.rows.length > 0) {
        const resByRarity = await loadResByRarity(client);
        for (const a of respawnable.rows) {
          const newContents = rollAsteroidContents(mathRng, resByRarity, a.size);
          // Fresh asteroid = fresh quality roll. Use mathRng (non-seeded)
          // so successive respawns at the same coordinates vary.
          const q = rollAsteroidQuality(mathRng);
          await client.query(`
            UPDATE asteroids
            SET contents = $1,
                depleted_at = NULL,
                respawn_at = NULL,
                spawned_at = NOW(),
                stat_purity = $3,
                stat_stability = $4,
                stat_potency = $5,
                stat_density = $6
            WHERE id = $2
          `, [JSON.stringify(newContents), a.id, q.purity, q.stability, q.potency, q.density]);
        }
        // Wipe ALL prior scans on respawned asteroids so every player
        // (including this one) has to rescan before mining. New roll =
        // new asteroid as far as scanner state is concerned. Single
        // DELETE keyed on the respawned-id list.
        const respawnedIds = respawnable.rows.map(r => r.id);
        await client.query(
          `DELETE FROM player_asteroid_scans WHERE asteroid_id = ANY($1::UUID[])`,
          [respawnedIds]
        );
      }

      // Return all non-depleted asteroids in the system. JOIN to
      // player_asteroid_scans so we only send contents for asteroids
      // THIS player has scanned -- unscanned asteroids get null contents
      // (client treats them as "unknown, click to scan"). This gates the
      // information reveal at the data layer so a tampered client can't
      // see contents without a scan.
      const userId = req.user.id;
      // Quality stats are scan-gated alongside contents -- a player who
      // hasn't scanned a rock shouldn't see its quality either, otherwise
      // they could shop for the best-q rock without spending a scan.
      const result = await client.query(`
        SELECT a.id, a.belt_body_id, a.x, a.y, a.size, a.rotation,
               CASE WHEN s.asteroid_id IS NOT NULL THEN a.contents ELSE NULL END AS contents,
               CASE WHEN s.asteroid_id IS NOT NULL THEN a.stat_purity    ELSE NULL END AS stat_purity,
               CASE WHEN s.asteroid_id IS NOT NULL THEN a.stat_stability ELSE NULL END AS stat_stability,
               CASE WHEN s.asteroid_id IS NOT NULL THEN a.stat_potency   ELSE NULL END AS stat_potency,
               CASE WHEN s.asteroid_id IS NOT NULL THEN a.stat_density   ELSE NULL END AS stat_density,
               (s.asteroid_id IS NOT NULL) AS scanned
        FROM asteroids a
        LEFT JOIN player_asteroid_scans s
          ON s.asteroid_id = a.id AND s.user_id = $2
        WHERE a.system_id = $1 AND a.depleted_at IS NULL
        ORDER BY a.belt_body_id, a.id
      `, [systemId, userId]);

      // Enrich each asteroid's contents with resource names
      for (const row of result.rows) {
        row.contents = await enrichContentsWithNames(client, row.contents);
      }
      return result.rows;
    });

    res.json({ asteroids });
  } catch (error) {
    console.error('Error listing asteroids:', error);
    res.status(500).json({ error: 'Failed to list asteroids' });
  }
});

// Scan an asteroid to reveal its contents. Records the reveal in
// player_asteroid_scans so future GET /asteroids includes the contents.
// Validates the player has a sensor module fitted; distance is trusted
// client-side for MVP (matches the existing trust model for wreck claim
// and award-loot). Idempotent: re-scanning is a no-op + still returns
// the contents.
router.post('/asteroids/scan', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { asteroid_id } = req.body;
    if (!asteroid_id) return res.status(400).json({ error: 'asteroid_id required' });

    const out = await transaction(async (client) => {
      // Fleet-wide scanner check. A scanner on a wingman scans for the
      // whole fleet -- same model as the mining laser endpoint below.
      // Stored ships (storage_body_id IS NOT NULL) are parked at a
      // station and do NOT contribute their fitted modules to in-space
      // capability checks. Future module gates should follow this
      // same fleet-wide + active-only pattern out of the gate.
      const fleetShips = await client.query(
        `SELECT fitted_modules FROM ships
         WHERE user_id = $1 AND storage_body_id IS NULL`,
        [userId]
      );
      let hasScanner = false;
      outer: for (const ship of fleetShips.rows) {
        const fitted = ship.fitted_modules || {};
        for (const slot of Object.values(fitted)) {
          const id = slot?.module_type_id;
          if (id && (id === 'utility_scanner' || id.startsWith('utility_scanner'))) {
            hasScanner = true; break outer;
          }
        }
      }
      if (!hasScanner) {
        throw Object.assign(new Error('Sensor Suite required to scan'), { statusCode: 400 });
      }

      // Verify asteroid exists + is not depleted; fetch contents +
      // quality stats so the scan response can show both.
      const ast = await client.query(
        `SELECT contents, stat_purity, stat_stability, stat_potency, stat_density
         FROM asteroids WHERE id = $1 AND depleted_at IS NULL`,
        [asteroid_id]
      );
      if (!ast.rows[0]) {
        throw Object.assign(new Error('Asteroid not found or depleted'), { statusCode: 404 });
      }

      // Record the scan. PK on (user_id, asteroid_id) means re-scans
      // are silent no-ops via ON CONFLICT DO NOTHING.
      await client.query(`
        INSERT INTO player_asteroid_scans (user_id, asteroid_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, asteroid_id) DO NOTHING
      `, [userId, asteroid_id]);

      const enriched = await enrichContentsWithNames(client, ast.rows[0].contents);
      return {
        contents: enriched,
        stat_purity:    ast.rows[0].stat_purity,
        stat_stability: ast.rows[0].stat_stability,
        stat_potency:   ast.rows[0].stat_potency,
        stat_density:   ast.rows[0].stat_density,
      };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error scanning asteroid:', error);
    res.status(500).json({ error: 'Failed to scan asteroid' });
  }
});

// Mine a single tick from an asteroid. Validates fitted mining laser,
// non-depleted asteroid, available cargo. Picks the first resource
// with remaining > 0 (round-robin / player choice deferred to a
// later phase). Decrements asteroid + adds to player inventory in a
// transaction so we don't get half-applied state on errors.
//
// Returns 409 with `error: 'cargo_full'` so the client can stop the
// mining loop cleanly. Returns 410 if the asteroid is depleted /
// missing (gone since last poll). Returns 200 with the mined
// resource info + the asteroid's remaining contents on success.
router.post('/asteroids/mine', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { asteroid_id, ship_id, slot_key } = req.body;
    if (!asteroid_id) return res.status(400).json({ error: 'asteroid_id required' });
    if (!ship_id || !slot_key) {
      return res.status(400).json({ error: 'ship_id and slot_key required (multi-laser per-tick model)' });
    }

    const out = await transaction(async (client) => {
      // 1. Validate the *specific* laser this tick fires from.
      // Phase A4 model: client assigns each laser to its own asteroid
      // and pings this endpoint per-laser, per-cycle. Each tick mines
      // from exactly one laser's yield, not the fleet sum. The ship
      // must belong to the user and NOT be parked at a station (Ship
      // Storage Phase 1 -- stored ships don't grant capability).
      const shipRow = await client.query(
        `SELECT id, fitted_modules, storage_body_id FROM ships
         WHERE id = $1 AND user_id = $2`,
        [ship_id, userId]
      );
      const ship = shipRow.rows[0];
      if (!ship) {
        throw Object.assign(new Error('Ship not found'), { statusCode: 404 });
      }
      if (ship.storage_body_id != null) {
        throw Object.assign(new Error('Ship is stored at a station'), { statusCode: 400 });
      }
      const fitted = ship.fitted_modules || {};
      const slot = fitted[slot_key];
      const moduleTypeId = slot?.module_type_id;
      if (!moduleTypeId || !(moduleTypeId === 'mining_basic' || moduleTypeId.startsWith('mining_'))) {
        throw Object.assign(new Error('Slot is not a fitted mining laser'), { statusCode: 400 });
      }

      // Look up the laser's base mine_yield from module_types.stats.
      // Default 5 if unset (matches the pre-tier behavior of mining_basic).
      const statsRow = await client.query(
        `SELECT stats FROM module_types WHERE id = $1`, [moduleTypeId]
      );
      const baseYield = (() => {
        const y = statsRow.rows[0]?.stats?.mine_yield;
        return (typeof y === 'number' && y > 0) ? y : 5;
      })();

      // Per-laser quality via the shared helper. q50 = 1.0x, q100 = 2x,
      // clamped 0.4..2.5. Phase 2 refactor -- this used to be inline math.
      const qMult = qualityMultiplier(slot);
      // Industry skill multiplier: +5% per level on "Mining Operations"
      // (skill id ind_mining_ops). Pulled from the player_bonuses
      // aggregate so any future skill / research that emits a
      // 'mining_yield_pct' bonus stacks for free.
      const bonuses = await getPlayerBonuses(userId);
      const skillMult = 1 + (bonuses.mining_yield_pct || 0) / 100;
      const totalYield = Math.max(1, Math.round(baseYield * qMult * skillMult));

      // 2. Lock + load the asteroid. Includes the asteroid's per-rock
      // quality stats so the mined stack inherits them (replacing the
      // old hardcoded q50 baseline -- this is what makes mineral
      // variance actually visible to the player).
      const ast = await client.query(
        `SELECT id, contents, system_id,
                stat_purity, stat_stability, stat_potency, stat_density
         FROM asteroids
         WHERE id = $1 AND depleted_at IS NULL FOR UPDATE`,
        [asteroid_id]
      );
      if (!ast.rows[0]) {
        throw Object.assign(new Error('Asteroid depleted or missing'), { statusCode: 410 });
      }
      const contents = ast.rows[0].contents || {};

      // 3. Pick first resource with remaining > 0.
      const target = Object.entries(contents).find(([_, v]) => (v?.remaining || 0) > 0);
      if (!target) {
        // Defensive: shouldn't normally hit since we check depleted_at,
        // but if a previous tick race left empty contents, deplete now.
        await client.query(`
          UPDATE asteroids
          SET depleted_at = NOW(), respawn_at = NOW() + ($1 || ' minutes')::INTERVAL
          WHERE id = $2
        `, [ASTEROID_RESPAWN_MINUTES, asteroid_id]);
        throw Object.assign(new Error('Asteroid depleted or missing'), { statusCode: 410 });
      }
      const [resKey, resInfo] = target;
      const resId = parseInt(resKey, 10);

      // 4. Cargo capacity check via the shared getPlayerCargoInfo
      // helper -- this is the SAME calculation the UI uses (volume =
      // quantity * stat_density / 100 for resources, * volume_per_unit
      // for items, summed across all inventory rows; capacity = sum of
      // computed_cargo across ships). Using the helper guarantees the
      // server's "full" state matches what the cargo bar shows.
      const cargoInfo = await getPlayerCargoInfo(userId, client);
      const totalCap = cargoInfo.capacity;
      const usedVolume = cargoInfo.used;
      if (totalCap > 0 && usedVolume >= totalCap) {
        throw Object.assign(new Error('cargo_full'), { statusCode: 409 });
      }

      // 5. How much to mine this tick: totalYield (fleet-wide sum from
      // step 1) capped by what's remaining on the asteroid. We don't
      // cap by remaining-volume here -- a single tick can slightly
      // overflow capacity (more so now with multi-laser yields), and
      // the next tick's upfront check throws cargo_full.
      const minable = Math.min(totalYield, resInfo.remaining);
      if (minable <= 0) {
        throw Object.assign(new Error('cargo_full'), { statusCode: 409 });
      }

      // 6. Decrement asteroid contents.
      contents[resKey] = { ...resInfo, remaining: resInfo.remaining - minable };
      const allEmpty = Object.values(contents).every(v => (v?.remaining || 0) <= 0);
      if (allEmpty) {
        await client.query(`
          UPDATE asteroids
          SET contents = $1, depleted_at = NOW(), respawn_at = NOW() + ($2 || ' minutes')::INTERVAL
          WHERE id = $3
        `, [JSON.stringify(contents), ASTEROID_RESPAWN_MINUTES, asteroid_id]);
      } else {
        await client.query(
          `UPDATE asteroids SET contents = $1 WHERE id = $2`,
          [JSON.stringify(contents), asteroid_id]
        );
      }

      // 7. Add to player inventory using THIS asteroid's quality stats.
      // The unique constraint on (user_id, resource_type_id, stat_*)
      // means q47 iron and q63 iron land in separate stacks -- the
      // inventory UI's quality-tier rendering kicks in automatically.
      // Volume math (GREATEST(stat_density, 1)/100) still works because
      // every asteroid post-migration-046 has non-zero stat_density.
      const astQ = {
        purity:    ast.rows[0].stat_purity,
        stability: ast.rows[0].stat_stability,
        potency:   ast.rows[0].stat_potency,
        density:   ast.rows[0].stat_density,
      };
      const existing = await client.query(
        `SELECT id, quantity FROM player_resource_inventory
         WHERE user_id = $1 AND item_type = 'resource' AND resource_type_id = $2
           AND stat_purity = $3 AND stat_stability = $4
           AND stat_potency = $5 AND stat_density = $6
         LIMIT 1`,
        [userId, resId, astQ.purity, astQ.stability, astQ.potency, astQ.density]
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW()
           WHERE id = $2`,
          [minable, existing.rows[0].id]
        );
      } else {
        const slotRes = await client.query(`
          SELECT s.slot FROM generate_series(
            0,
            COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)
          ) s(slot)
          WHERE s.slot NOT IN (
            SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL
          )
          ORDER BY s.slot ASC LIMIT 1
        `, [userId]);
        const nextSlot = parseInt(slotRes.rows[0]?.slot) || 0;
        await client.query(
          `INSERT INTO player_resource_inventory
            (user_id, item_type, resource_type_id, quantity, slot_index,
             stat_purity, stat_stability, stat_potency, stat_density)
           VALUES ($1, 'resource', $2, $3, $4, $5, $6, $7, $8)`,
          [userId, resId, minable, nextSlot,
           astQ.purity, astQ.stability, astQ.potency, astQ.density]
        );
      }

      // 8. Resource name for the client toast / log.
      const nameRow = await client.query(
        `SELECT name FROM resource_types WHERE id = $1`, [resId]
      );

      // Re-query cargo so the response shows the post-mine state
      // exactly matching what the cargo bar will display next refresh.
      const afterCargo = await getPlayerCargoInfo(userId, client);
      return {
        mined: { resource_type_id: resId, name: nameRow.rows[0]?.name || `res_${resId}`, quantity: minable },
        asteroid_remaining: await enrichContentsWithNames(client, contents),
        asteroid_depleted: allEmpty,
        cargo_used: afterCargo.used,
        cargo_capacity: afterCargo.capacity,
      };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error mining asteroid:', error);
    res.status(500).json({ error: 'Failed to mine asteroid' });
  }
});

export default router;
