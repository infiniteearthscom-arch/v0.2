// Harvester API Routes
// Handles automated harvester deployment, fueling, and collection

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';

const router = express.Router();

// ============================================
// HELPER: Resolve body ID (string name or UUID)
// ============================================

const resolveBodyId = async (bodyIdOrName) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(bodyIdOrName)) return bodyIdOrName;
  
  const alias = await queryOne(
    `SELECT celestial_body_id FROM celestial_body_aliases WHERE alias = LOWER($1)`,
    [bodyIdOrName]
  );
  if (alias) return alias.celestial_body_id;
  
  const body = await queryOne(
    `SELECT id FROM celestial_bodies WHERE LOWER(name) = LOWER($1)`,
    [bodyIdOrName]
  );
  if (body) return body.id;
  
  return null;
};

// ============================================
// HELPER: Update harvester state based on elapsed time
// ============================================

const updateHarvesterState = (harvester, depositRemaining = null) => {
  // Calculate what happened since last update
  const now = new Date();
  const lastCheck = new Date(harvester.last_hopper_update_at || harvester.last_fuel_check_at);
  const hoursElapsed = Math.max(0, (now - lastCheck) / (1000 * 60 * 60));
  
  if (hoursElapsed <= 0 || harvester.status !== 'active') {
    return {
      ...harvester,
      computed_hopper: harvester.hopper_quantity,
      computed_fuel: parseFloat(harvester.fuel_remaining_hours),
      computed_status: harvester.status,
      _unitsMined: 0,
      _fuelUsed: 0,
    };
  }
  
  const fuelRemaining = parseFloat(harvester.fuel_remaining_hours);
  const harvestRate = parseFloat(harvester.harvest_rate);
  const storageCapacity = harvester.storage_capacity;
  const currentHopper = harvester.hopper_quantity;
  const hopperSpace = storageCapacity - currentHopper;
  
  // How long can we actually mine? Limited by fuel and hopper space
  const hoursOfFuel = Math.min(hoursElapsed, fuelRemaining);
  const maxUnitsFromTime = Math.floor(hoursOfFuel * harvestRate);
  let unitsMined = Math.min(maxUnitsFromTime, hopperSpace);
  
  // Also cap by deposit remaining (if known)
  if (depositRemaining != null) {
    unitsMined = Math.min(unitsMined, Math.max(0, depositRemaining));
  }
  
  // How much time did that actually take?
  const hoursUsed = harvestRate > 0 ? unitsMined / harvestRate : 0;
  const fuelUsed = Math.min(hoursUsed, fuelRemaining);
  
  const newFuel = Math.max(0, fuelRemaining - fuelUsed);
  const newHopper = currentHopper + unitsMined;
  
  let newStatus = 'active';
  if (newFuel <= 0) newStatus = 'idle';
  if (newHopper >= storageCapacity) newStatus = 'full';
  if (depositRemaining != null && depositRemaining - unitsMined <= 0) newStatus = 'idle';
  
  return {
    ...harvester,
    computed_hopper: newHopper,
    computed_fuel: newFuel,
    computed_status: newStatus,
    _hoursUsed: hoursUsed,
    _unitsMined: unitsMined,
    _fuelUsed: fuelUsed,
  };
};

// Persist the computed state back to DB and deplete deposit
const persistHarvesterState = async (harvester, computed, client = null) => {
  const q = client
    ? (sql, params) => client.query(sql, params)
    : (sql, params) => query(sql, params);
  
  await q(`
    UPDATE deployed_harvesters
    SET hopper_quantity = $1, fuel_remaining_hours = $2, status = $3,
        last_hopper_update_at = NOW(), last_fuel_check_at = NOW(), updated_at = NOW()
    WHERE id = $4
  `, [computed.computed_hopper, computed.computed_fuel, computed.computed_status, harvester.id]);
  
  // Deplete deposit by units mined
  if (computed._unitsMined > 0 && harvester.deposit_id) {
    await q(`
      UPDATE resource_deposits
      SET quantity_remaining = GREATEST(0, quantity_remaining - $1),
          depleted_at = CASE WHEN quantity_remaining - $1 <= 0 THEN NOW() ELSE depleted_at END
      WHERE id = $2
    `, [computed._unitsMined, harvester.deposit_id]);
  }
};

// ============================================
// GET PLANET HARVESTERS
// ============================================

router.get('/planet/:bodyId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const bodyId = await resolveBodyId(req.params.bodyId);
    
    if (!bodyId) {
      return res.status(404).json({ error: 'Planet not found' });
    }
    
    // Get planet info including harvester slots
    const body = await queryOne(`
      SELECT id, name, harvester_slots FROM celestial_bodies WHERE id = $1
    `, [bodyId]);
    
    if (!body) {
      return res.status(404).json({ error: 'Planet not found' });
    }
    
    // Get deployed harvesters on this planet for this user
    const harvesters = await queryAll(`
      SELECT dh.*, 
        rt.name as resource_name, rt.category, rt.icon as resource_icon,
        rd.stat_purity as deposit_purity, rd.stat_stability as deposit_stability,
        rd.stat_potency as deposit_potency, rd.stat_density as deposit_density,
        rd.quantity_remaining as deposit_remaining, rd.slot_number as deposit_slot
      FROM deployed_harvesters dh
      LEFT JOIN resource_types rt ON dh.resource_type_id = rt.id
      LEFT JOIN resource_deposits rd ON dh.deposit_id = rd.id
      WHERE dh.celestial_body_id = $1 AND dh.user_id = $2
      ORDER BY dh.slot_index ASC
    `, [bodyId, userId]);
    
    // Update each harvester's computed state
    const updatedHarvesters = harvesters.map(h => {
      const computed = updateHarvesterState(h, h.deposit_remaining);
      return {
        id: h.id,
        slot_index: h.slot_index,
        harvester_type: h.harvester_type,
        harvest_rate: parseFloat(h.harvest_rate),
        storage_capacity: h.storage_capacity,
        fuel_efficiency: parseFloat(h.fuel_efficiency),
        deposit_id: h.deposit_id,
        resource_name: h.resource_name,
        resource_type_id: h.resource_type_id,
        category: h.category,
        resource_icon: h.resource_icon,
        deposit_slot: h.deposit_slot,
        deposit_remaining: h.deposit_remaining != null ? Math.max(0, h.deposit_remaining - (computed._unitsMined || 0)) : null,
        deposit_stats: h.deposit_id ? {
          purity: h.deposit_purity,
          stability: h.deposit_stability,
          potency: h.deposit_potency,
          density: h.deposit_density,
        } : null,
        hopper_quantity: computed.computed_hopper,
        hopper_stats: h.hopper_stat_purity != null ? {
          purity: h.hopper_stat_purity,
          stability: h.hopper_stat_stability,
          potency: h.hopper_stat_potency,
          density: h.hopper_stat_density,
        } : null,
        fuel_remaining_hours: computed.computed_fuel,
        status: computed.computed_status,
        deployed_at: h.deployed_at,
      };
    });
    
    // Persist updated states and deplete deposits
    for (const h of harvesters) {
      const computed = updateHarvesterState(h, h.deposit_remaining);
      if (computed._unitsMined > 0 || computed._fuelUsed > 0) {
        await persistHarvesterState(h, computed);
      }
    }
    
    // Get available deposits for this planet (not already assigned to a harvester)
    const deposits = await queryAll(`
      SELECT rd.*, rt.name as resource_name, rt.category, rt.icon
      FROM resource_deposits rd
      JOIN resource_types rt ON rd.resource_type_id = rt.id
      WHERE rd.celestial_body_id = $1 
        AND rd.quantity_remaining > 0
        AND rd.id NOT IN (SELECT deposit_id FROM deployed_harvesters WHERE celestial_body_id = $1 AND deposit_id IS NOT NULL)
      ORDER BY rd.slot_number ASC
    `, [bodyId]);
    
    res.json({
      planet_name: body.name,
      harvester_slots: body.harvester_slots || 0,
      harvesters: updatedHarvesters,
      available_deposits: deposits,
    });
  } catch (error) {
    console.error('Error fetching planet harvesters:', error);
    res.status(500).json({ error: 'Failed to fetch harvesters' });
  }
});

// ============================================
// DEPLOY HARVESTER
// ============================================

router.post('/deploy', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { body_id: rawBodyId, slot_index, cargo_item_id, deposit_id } = req.body;
    
    if (!rawBodyId || slot_index == null || !cargo_item_id) {
      return res.status(400).json({ error: 'body_id, slot_index, and cargo_item_id required' });
    }
    
    const body_id = await resolveBodyId(rawBodyId);
    if (!body_id) {
      return res.status(404).json({ error: 'Planet not found' });
    }
    
    const result = await transaction(async (client) => {
      // Verify planet and slot count
      const bodyResult = await client.query(
        `SELECT id, harvester_slots FROM celestial_bodies WHERE id = $1`, [body_id]
      );
      const body = bodyResult.rows[0];
      if (!body) throw Object.assign(new Error('Planet not found'), { statusCode: 404 });
      if (slot_index < 0 || slot_index >= (body.harvester_slots || 0)) {
        throw Object.assign(new Error('Invalid harvester slot'), { statusCode: 400 });
      }
      
      // Check slot is empty
      const existingResult = await client.query(
        `SELECT id FROM deployed_harvesters WHERE celestial_body_id = $1 AND slot_index = $2`,
        [body_id, slot_index]
      );
      if (existingResult.rows[0]) {
        throw Object.assign(new Error('Slot already occupied'), { statusCode: 400 });
      }
      
      // Get the harvester from cargo
      const cargoResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2 AND item_type = 'item' FOR UPDATE`,
        [cargo_item_id, userId]
      );
      const cargoItem = cargoResult.rows[0];
      if (!cargoItem) throw Object.assign(new Error('Harvester not found in cargo'), { statusCode: 404 });
      
      const itemData = cargoItem.item_data || {};
      if (!cargoItem.item_id.includes('harvester')) {
        throw Object.assign(new Error('Item is not a harvester'), { statusCode: 400 });
      }
      
      // Validate deposit if provided
      let depositInfo = null;
      if (deposit_id) {
        const depositResult = await client.query(
          `SELECT rd.*, rt.name as resource_name, rt.category
           FROM resource_deposits rd JOIN resource_types rt ON rd.resource_type_id = rt.id
           WHERE rd.id = $1 AND rd.celestial_body_id = $2 AND rd.quantity_remaining > 0`,
          [deposit_id, body_id]
        );
        depositInfo = depositResult.rows[0];
        if (!depositInfo) throw Object.assign(new Error('Deposit not found or depleted'), { statusCode: 400 });
        
        // Check deposit isn't already assigned
        const assignedResult = await client.query(
          `SELECT id FROM deployed_harvesters WHERE deposit_id = $1`, [deposit_id]
        );
        if (assignedResult.rows[0]) {
          throw Object.assign(new Error('Deposit already has a harvester'), { statusCode: 400 });
        }
      }
      
      // Remove harvester from cargo
      if (cargoItem.quantity <= 1) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [cargoItem.id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - 1, updated_at = NOW() WHERE id = $1`,
          [cargoItem.id]
        );
      }
      
      // Deploy harvester
      const harvestRate = itemData.harvest_rate || 30;
      const storageCapacity = itemData.storage_capacity || 200;
      const fuelEfficiency = itemData.quality
        ? ((itemData.quality.purity + itemData.quality.stability + itemData.quality.potency + itemData.quality.density) / 4) / 50
        : 1.0;
      
      const insertResult = await client.query(`
        INSERT INTO deployed_harvesters (
          user_id, celestial_body_id, slot_index,
          harvester_type, harvest_rate, storage_capacity, fuel_efficiency,
          deposit_id, resource_type_id,
          hopper_stat_purity, hopper_stat_stability, hopper_stat_potency, hopper_stat_density,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        userId, body_id, slot_index,
        cargoItem.item_id, harvestRate, storageCapacity, fuelEfficiency,
        deposit_id || null,
        depositInfo?.resource_type_id || null,
        depositInfo?.stat_purity || null,
        depositInfo?.stat_stability || null,
        depositInfo?.stat_potency || null,
        depositInfo?.stat_density || null,
        'idle',
      ]);
      
      return insertResult.rows[0];
    });
    
    res.json({ success: true, harvester: result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error deploying harvester:', error);
    res.status(500).json({ error: 'Failed to deploy harvester' });
  }
});

// ============================================
// ASSIGN DEPOSIT TO HARVESTER
// ============================================

router.post('/assign-deposit', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { harvester_id, deposit_id } = req.body;
    
    if (!harvester_id || !deposit_id) {
      return res.status(400).json({ error: 'harvester_id and deposit_id required' });
    }
    
    const result = await transaction(async (client) => {
      const harvResult = await client.query(
        `SELECT * FROM deployed_harvesters WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [harvester_id, userId]
      );
      const harvester = harvResult.rows[0];
      if (!harvester) throw Object.assign(new Error('Harvester not found'), { statusCode: 404 });
      
      // Persist current state before changing deposit
      let curDepRemaining = null;
      if (harvester.deposit_id) {
        const dr = await client.query(`SELECT quantity_remaining FROM resource_deposits WHERE id = $1`, [harvester.deposit_id]);
        curDepRemaining = dr.rows[0]?.quantity_remaining ?? null;
      }
      const computed = updateHarvesterState(harvester, curDepRemaining);
      await persistHarvesterState(harvester, computed, client);
      
      const depositResult = await client.query(
        `SELECT rd.*, rt.name as resource_name
         FROM resource_deposits rd JOIN resource_types rt ON rd.resource_type_id = rt.id
         WHERE rd.id = $1 AND rd.celestial_body_id = $2 AND rd.quantity_remaining > 0`,
        [deposit_id, harvester.celestial_body_id]
      );
      const deposit = depositResult.rows[0];
      if (!deposit) throw Object.assign(new Error('Deposit not found or depleted'), { statusCode: 400 });
      
      // Check deposit isn't assigned to another harvester
      const assignedResult = await client.query(
        `SELECT id FROM deployed_harvesters WHERE deposit_id = $1 AND id != $2`, [deposit_id, harvester_id]
      );
      if (assignedResult.rows[0]) {
        throw Object.assign(new Error('Deposit already has a harvester'), { statusCode: 400 });
      }
      
      // If hopper has different resource, it must be empty
      if (computed.computed_hopper > 0 && harvester.resource_type_id && harvester.resource_type_id !== deposit.resource_type_id) {
        throw Object.assign(new Error('Hopper must be empty before switching deposits'), { statusCode: 400 });
      }
      
      const newStatus = computed.computed_fuel > 0 ? 'active' : 'idle';
      
      await client.query(`
        UPDATE deployed_harvesters
        SET deposit_id = $1, resource_type_id = $2,
            hopper_stat_purity = $3, hopper_stat_stability = $4,
            hopper_stat_potency = $5, hopper_stat_density = $6,
            status = $7, last_hopper_update_at = NOW(), updated_at = NOW()
        WHERE id = $8
      `, [deposit_id, deposit.resource_type_id,
          deposit.stat_purity, deposit.stat_stability, deposit.stat_potency, deposit.stat_density,
          newStatus, harvester_id]);
      
      return { deposit_name: deposit.resource_name };
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error assigning deposit:', error);
    res.status(500).json({ error: 'Failed to assign deposit' });
  }
});

// ============================================
// REFUEL HARVESTER
// ============================================

router.post('/refuel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { harvester_id, fuel_item_id } = req.body;
    
    if (!harvester_id || !fuel_item_id) {
      return res.status(400).json({ error: 'harvester_id and fuel_item_id required' });
    }
    
    const result = await transaction(async (client) => {
      const harvResult = await client.query(
        `SELECT * FROM deployed_harvesters WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [harvester_id, userId]
      );
      const harvester = harvResult.rows[0];
      if (!harvester) throw Object.assign(new Error('Harvester not found'), { statusCode: 404 });
      
      // Persist current state
      let refuelDepRemaining = null;
      if (harvester.deposit_id) {
        const dr = await client.query(`SELECT quantity_remaining FROM resource_deposits WHERE id = $1`, [harvester.deposit_id]);
        refuelDepRemaining = dr.rows[0]?.quantity_remaining ?? null;
      }
      const computed = updateHarvesterState(harvester, refuelDepRemaining);
      await persistHarvesterState(harvester, computed, client);
      
      // Get fuel from cargo
      const fuelResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2 AND item_type = 'item' FOR UPDATE`,
        [fuel_item_id, userId]
      );
      const fuelItem = fuelResult.rows[0];
      if (!fuelItem || fuelItem.item_id !== 'fuel_cell') {
        throw Object.assign(new Error('Fuel cell not found in cargo'), { statusCode: 400 });
      }
      
      const fuelData = fuelItem.item_data || {};
      const fuelHours = (fuelData.fuel_hours || 6) * parseFloat(harvester.fuel_efficiency);
      
      // Consume one fuel cell
      if (fuelItem.quantity <= 1) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [fuelItem.id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - 1, updated_at = NOW() WHERE id = $1`,
          [fuelItem.id]
        );
      }
      
      // Add fuel
      const newFuel = computed.computed_fuel + fuelHours;
      const newStatus = harvester.deposit_id && computed.computed_hopper < harvester.storage_capacity
        ? 'active' : (computed.computed_hopper >= harvester.storage_capacity ? 'full' : 'idle');
      
      await client.query(`
        UPDATE deployed_harvesters
        SET fuel_remaining_hours = $1, status = $2, last_fuel_check_at = NOW(), updated_at = NOW()
        WHERE id = $3
      `, [newFuel, newStatus, harvester_id]);
      
      return { fuel_added_hours: fuelHours, total_fuel_hours: newFuel, status: newStatus };
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error refueling harvester:', error);
    res.status(500).json({ error: 'Failed to refuel harvester' });
  }
});

// ============================================
// COLLECT FROM HOPPER
// ============================================

router.post('/collect', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { harvester_id } = req.body;
    
    if (!harvester_id) {
      return res.status(400).json({ error: 'harvester_id required' });
    }
    
    const result = await transaction(async (client) => {
      const harvResult = await client.query(
        `SELECT * FROM deployed_harvesters WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [harvester_id, userId]
      );
      const harvester = harvResult.rows[0];
      if (!harvester) throw Object.assign(new Error('Harvester not found'), { statusCode: 404 });
      
      // Get deposit remaining for accurate state computation
      let depositRemaining = null;
      if (harvester.deposit_id) {
        const depResult = await client.query(
          `SELECT quantity_remaining FROM resource_deposits WHERE id = $1`, [harvester.deposit_id]
        );
        depositRemaining = depResult.rows[0]?.quantity_remaining ?? null;
      }
      
      // Compute current state (also depletes deposit via persist)
      const computed = updateHarvesterState(harvester, depositRemaining);
      await persistHarvesterState(harvester, computed, client);
      
      if (computed.computed_hopper <= 0) {
        return { units_collected: 0, message: 'Hopper is empty.' };
      }
      
      // Check cargo space
      const cargoResult = await client.query(`
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN pri.item_type = 'resource' THEN pri.quantity * GREATEST(pri.stat_density, 1) / 100.0
              ELSE pri.quantity * COALESCE(idef.volume_per_unit, 1)
            END
          ), 0) as total_volume
        FROM player_resource_inventory pri
        LEFT JOIN item_definitions idef ON pri.item_id = idef.id
        WHERE pri.user_id = $1
      `, [userId]);
      const shipResult = await client.query(
        `SELECT d.total_cargo FROM ships s JOIN ship_designs d ON s.design_id = d.id
         WHERE s.user_id = $1 ORDER BY s.created_at ASC LIMIT 1`, [userId]
      );
      
      const cargoUsedVol = parseFloat(cargoResult.rows[0].total_volume) || 0;
      const cargoCapacity = shipResult.rows[0]?.total_cargo || 0;
      const cargoRemaining = Math.max(0, cargoCapacity - cargoUsedVol);
      
      const density = harvester.hopper_stat_density || 50;
      const volPerUnit = Math.max(density, 1) / 100.0;
      const unitsThatFit = volPerUnit > 0 ? Math.floor(cargoRemaining / volPerUnit) : 0;
      
      const unitsToCollect = Math.min(computed.computed_hopper, unitsThatFit);
      
      if (unitsToCollect <= 0) {
        return { units_collected: 0, message: 'Cargo is full.' };
      }
      
      // Add to cargo (stack with matching resource + stats)
      const existingStack = await client.query(`
        SELECT id FROM player_resource_inventory
        WHERE user_id = $1 AND item_type = 'resource'
          AND resource_type_id = $2
          AND stat_purity = $3 AND stat_stability = $4
          AND stat_potency = $5 AND stat_density = $6
      `, [userId, harvester.resource_type_id,
          harvester.hopper_stat_purity, harvester.hopper_stat_stability,
          harvester.hopper_stat_potency, harvester.hopper_stat_density]);
      
      if (existingStack.rows[0]) {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
          [unitsToCollect, existingStack.rows[0].id]
        );
      } else {
        // Find first free slot
        const slotSql = `
          SELECT s.slot FROM generate_series(0, COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)) s(slot)
          WHERE s.slot NOT IN (SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL)
          ORDER BY s.slot ASC LIMIT 1
        `;
        const slotResult = await client.query(slotSql, [userId]);
        const nextSlot = parseInt(slotResult.rows[0]?.slot) || 0;
        
        await client.query(`
          INSERT INTO player_resource_inventory (
            user_id, resource_type_id, quantity,
            stat_purity, stat_stability, stat_potency, stat_density,
            slot_index
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [userId, harvester.resource_type_id, unitsToCollect,
            harvester.hopper_stat_purity, harvester.hopper_stat_stability,
            harvester.hopper_stat_potency, harvester.hopper_stat_density, nextSlot]);
      }
      
      // Note: deposit is already depleted during mining (via persistHarvesterState)
      // No need to deplete again during collection
      
      // Update hopper
      const newHopper = computed.computed_hopper - unitsToCollect;
      const newStatus = computed.computed_fuel > 0 && harvester.deposit_id ? 'active' : 'idle';
      
      await client.query(`
        UPDATE deployed_harvesters
        SET hopper_quantity = $1, fuel_remaining_hours = $2, status = $3,
            last_hopper_update_at = NOW(), last_fuel_check_at = NOW(), updated_at = NOW()
        WHERE id = $4
      `, [newHopper, computed.computed_fuel, newHopper >= harvester.storage_capacity ? 'full' : newStatus, harvester_id]);
      
      return { units_collected: unitsToCollect, hopper_remaining: newHopper, message: `Collected ${unitsToCollect} units.` };
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error collecting from harvester:', error);
    res.status(500).json({ error: 'Failed to collect from harvester' });
  }
});

// ============================================
// REMOVE HARVESTER (return to cargo)
// ============================================

router.post('/remove', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { harvester_id } = req.body;
    
    if (!harvester_id) {
      return res.status(400).json({ error: 'harvester_id required' });
    }
    
    const result = await transaction(async (client) => {
      const harvResult = await client.query(
        `SELECT * FROM deployed_harvesters WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [harvester_id, userId]
      );
      const harvester = harvResult.rows[0];
      if (!harvester) throw Object.assign(new Error('Harvester not found'), { statusCode: 404 });
      
      // Compute final state with deposit remaining
      let depositRemaining = null;
      if (harvester.deposit_id) {
        const depResult = await client.query(
          `SELECT quantity_remaining FROM resource_deposits WHERE id = $1`, [harvester.deposit_id]
        );
        depositRemaining = depResult.rows[0]?.quantity_remaining ?? null;
      }
      const computed = updateHarvesterState(harvester, depositRemaining);
      await persistHarvesterState(harvester, computed, client);
      
      // If hopper has resources, must collect first
      if (computed.computed_hopper > 0) {
        throw Object.assign(new Error('Must collect hopper resources before removing harvester'), { statusCode: 400 });
      }
      
      // Get item definition for this harvester type
      const itemDefResult = await client.query(
        `SELECT * FROM item_definitions WHERE id = $1`, [harvester.harvester_type]
      );
      const itemDef = itemDefResult.rows[0];
      
      // Return harvester to cargo
      const itemData = {
        harvest_rate: parseFloat(harvester.harvest_rate),
        storage_capacity: harvester.storage_capacity,
        quality: { purity: 50, stability: 50, potency: 50, density: 50 },
      };
      
      // Find first free slot
      const slotSql = `
        SELECT s.slot FROM generate_series(0, COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)) s(slot)
        WHERE s.slot NOT IN (SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL)
        ORDER BY s.slot ASC LIMIT 1
      `;
      const slotResult = await client.query(slotSql, [userId]);
      const nextSlot = parseInt(slotResult.rows[0]?.slot) || 0;
      
      await client.query(`
        INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
        VALUES ($1, 'item', $2, 1, $3, $4)
      `, [userId, harvester.harvester_type, nextSlot, JSON.stringify(itemData)]);
      
      // Delete deployed harvester
      await client.query(`DELETE FROM deployed_harvesters WHERE id = $1`, [harvester_id]);
      
      return { returned: harvester.harvester_type };
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error removing harvester:', error);
    res.status(500).json({ error: 'Failed to remove harvester' });
  }
});

export default router;
