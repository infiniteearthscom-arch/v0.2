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
// HELPER: Get player's current cargo usage and capacity
// ============================================

const getPlayerCargoInfo = async (userId, client = null) => {
  const q = client
    ? async (sql, params) => { const r = await client.query(sql, params); return r.rows[0]; }
    : queryOne;
  const qAll = client
    ? async (sql, params) => { const r = await client.query(sql, params); return r.rows; }
    : queryAll;

  // Get the player's active ship's cargo capacity
  const ship = await q(`
    SELECT s.id as ship_id, d.total_cargo
    FROM ships s
    JOIN ship_designs d ON s.design_id = d.id
    WHERE s.user_id = $1
    ORDER BY s.created_at ASC
    LIMIT 1
  `, [userId]);

  if (!ship) {
    return { shipId: null, capacity: 0, used: 0, remaining: 0, totalSlots: 0, usedSlots: 0 };
  }

  // Calculate volume: resources use density stat, items use volume_per_unit from definitions
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

  const capacity = ship.total_cargo || 0;
  const totalSlots = Math.floor(capacity / 10);
  const usedVolume = Math.round(parseFloat(volumeResult?.total_volume || 0) * 100) / 100;
  const usedSlots = parseInt(volumeResult?.slot_count || 0);

  return {
    shipId: ship.ship_id,
    capacity,
    used: usedVolume,
    remaining: Math.max(0, capacity - usedVolume),
    totalSlots,
    usedSlots,
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
        const slotResult = await client.query(
          `SELECT COALESCE(MAX(slot_index), -1) + 1 as next_slot FROM player_resource_inventory WHERE user_id = $1`,
          [userId]
        );
        const nextSlot = slotResult.rows[0]?.next_slot || 0;
        
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
    const hoursElapsed = (now - lastCalc) / (1000 * 60 * 60);
    const rawPending = Math.floor(hoursElapsed * session.harvest_rate);

    // Cap by deposit remaining and cargo space
    const cargo = await getPlayerCargoInfo(userId);
    const cappedByDeposit = Math.min(rawPending, session.deposit_remaining);
    const cappedByCargo = Math.min(cappedByDeposit, cargo.remaining);

    // Get the deposit's stats from the deposit itself
    const deposit = await getDepositById(session.deposit_id);

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
        // Get next available slot
        const slotResult = await client.query(
          `SELECT COALESCE(MAX(slot_index), -1) + 1 as next_slot FROM player_resource_inventory WHERE user_id = $1`,
          [userId]
        );
        const nextSlot = slotResult.rows[0]?.next_slot || 0;

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
          const slotResult = await client.query(
            `SELECT COALESCE(MAX(slot_index), -1) + 1 as next_slot FROM player_resource_inventory WHERE user_id = $1`,
            [userId]
          );
          const nextSlot = slotResult.rows[0]?.next_slot || 0;

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

export default router;
