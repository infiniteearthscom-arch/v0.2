import { Router } from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ============================================
// SHIP DESIGNS
// ============================================

// Get all user's ship designs
router.get('/designs', async (req, res) => {
  try {
    const designs = await queryAll(
      `SELECT id, name, hull_size, total_power, total_crew, total_cargo, is_valid, created_at, updated_at
       FROM ship_designs 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [req.user.id]
    );
    
    res.json({ designs });
  } catch (error) {
    console.error('Get designs error:', error);
    res.status(500).json({ error: 'Failed to get ship designs' });
  }
});

// Get single design with full data
router.get('/designs/:id', async (req, res) => {
  try {
    const design = await queryOne(
      `SELECT * FROM ship_designs WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    
    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }
    
    res.json({ design });
  } catch (error) {
    console.error('Get design error:', error);
    res.status(500).json({ error: 'Failed to get ship design' });
  }
});

// Save/update ship design
router.post('/designs', async (req, res) => {
  try {
    const { id, name, hullCells, rooms, stats } = req.body;
    
    if (!name || !hullCells || !rooms) {
      return res.status(400).json({ error: 'Name, hullCells, and rooms are required' });
    }
    
    const hullSize = Array.isArray(hullCells) ? hullCells.length : 0;
    const totalPower = stats?.totalPower || 0;
    const totalCrew = stats?.totalCrew || 0;
    const totalCargo = stats?.totalCargo || 0;
    const isValid = stats?.isValid || false;
    
    let design;
    
    if (id) {
      // Update existing
      const existing = await queryOne(
        `SELECT id FROM ship_designs WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
      
      if (!existing) {
        return res.status(404).json({ error: 'Design not found' });
      }
      
      design = await queryOne(
        `UPDATE ship_designs 
         SET name = $1, hull_cells = $2, rooms = $3, 
             hull_size = $4, total_power = $5, total_crew = $6, total_cargo = $7, is_valid = $8
         WHERE id = $9 AND user_id = $10
         RETURNING *`,
        [name, JSON.stringify(hullCells), JSON.stringify(rooms), 
         hullSize, totalPower, totalCrew, totalCargo, isValid,
         id, req.user.id]
      );
    } else {
      // Create new
      design = await queryOne(
        `INSERT INTO ship_designs (user_id, name, hull_cells, rooms, hull_size, total_power, total_crew, total_cargo, is_valid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.user.id, name, JSON.stringify(hullCells), JSON.stringify(rooms),
         hullSize, totalPower, totalCrew, totalCargo, isValid]
      );
    }
    
    res.json({ design });
  } catch (error) {
    console.error('Save design error:', error);
    res.status(500).json({ error: 'Failed to save ship design' });
  }
});

// Delete ship design
router.delete('/designs/:id', async (req, res) => {
  try {
    // Check if any ships use this design
    const ships = await queryOne(
      `SELECT COUNT(*) as count FROM ships WHERE design_id = $1`,
      [req.params.id]
    );
    
    if (ships && parseInt(ships.count) > 0) {
      return res.status(400).json({ error: 'Cannot delete design that has built ships' });
    }
    
    const result = await query(
      `DELETE FROM ship_designs WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    
    res.json({ message: 'Design deleted' });
  } catch (error) {
    console.error('Delete design error:', error);
    res.status(500).json({ error: 'Failed to delete design' });
  }
});

// ============================================
// SHIPS (Built instances)
// ============================================

// Get all user's ships
router.get('/', async (req, res) => {
  try {
    const ships = await queryAll(
      `SELECT s.*, d.name as design_name
       FROM ships s
       JOIN ship_designs d ON s.design_id = d.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    
    res.json({ ships });
  } catch (error) {
    console.error('Get ships error:', error);
    res.status(500).json({ error: 'Failed to get ships' });
  }
});

// Get single ship
router.get('/:id', async (req, res) => {
  try {
    const ship = await queryOne(
      `SELECT s.*, d.name as design_name, d.hull_cells, d.rooms
       FROM ships s
       JOIN ship_designs d ON s.design_id = d.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [req.params.id, req.user.id]
    );
    
    if (!ship) {
      return res.status(404).json({ error: 'Ship not found' });
    }
    
    // Get crew
    const crew = await queryAll(
      `SELECT * FROM crew_members WHERE ship_id = $1`,
      [req.params.id]
    );
    
    res.json({ ship, crew });
  } catch (error) {
    console.error('Get ship error:', error);
    res.status(500).json({ error: 'Failed to get ship' });
  }
});

// Build ship from design
router.post('/build', async (req, res) => {
  try {
    const { designId, name } = req.body;
    
    if (!designId) {
      return res.status(400).json({ error: 'Design ID is required' });
    }
    
    // Get design
    const design = await queryOne(
      `SELECT * FROM ship_designs WHERE id = $1 AND user_id = $2`,
      [designId, req.user.id]
    );
    
    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }
    
    if (!design.is_valid) {
      return res.status(400).json({ error: 'Cannot build invalid design' });
    }
    
    // Calculate costs
    const hullCost = design.hull_size * 10;
    const roomCost = design.rooms.length * 100;
    const costs = {
      credits: hullCost + roomCost,
      metals: Math.floor(design.hull_size * 5),
      components: design.rooms.length * 2,
    };
    
    // Check and deduct resources in transaction
    const ship = await transaction(async (client) => {
      // Get current resources
      const resources = await client.query(
        `SELECT * FROM player_resources WHERE user_id = $1 FOR UPDATE`,
        [req.user.id]
      );
      
      const r = resources.rows[0];
      if (!r) throw new Error('Resources not found');
      
      // Check if can afford
      if (r.credits < costs.credits || r.metals < costs.metals || r.components < costs.components) {
        throw new Error('Insufficient resources');
      }
      
      // Deduct resources
      await client.query(
        `UPDATE player_resources 
         SET credits = credits - $1, metals = metals - $2, components = components - $3
         WHERE user_id = $4`,
        [costs.credits, costs.metals, costs.components, req.user.id]
      );
      
      // Create ship
      const result = await client.query(
        `INSERT INTO ships (user_id, design_id, name, location_type)
         VALUES ($1, $2, $3, 'hub')
         RETURNING *`,
        [req.user.id, designId, name || `${design.name} #${Date.now() % 1000}`]
      );
      
      return result.rows[0];
    });
    
    res.status(201).json({ ship, costs });
  } catch (error) {
    console.error('Build ship error:', error);
    if (error.message === 'Insufficient resources') {
      return res.status(400).json({ error: 'Insufficient resources to build ship' });
    }
    res.status(500).json({ error: 'Failed to build ship' });
  }
});

// Rename ship
router.patch('/:id/name', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.length > 64) {
      return res.status(400).json({ error: 'Invalid ship name' });
    }
    
    const ship = await queryOne(
      `UPDATE ships SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [name, req.params.id, req.user.id]
    );
    
    if (!ship) {
      return res.status(404).json({ error: 'Ship not found' });
    }
    
    res.json({ ship });
  } catch (error) {
    console.error('Rename ship error:', error);
    res.status(500).json({ error: 'Failed to rename ship' });
  }
});

// Scrap ship (get some resources back)
router.delete('/:id', async (req, res) => {
  try {
    const ship = await queryOne(
      `SELECT s.*, d.hull_size, d.rooms
       FROM ships s
       JOIN ship_designs d ON s.design_id = d.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [req.params.id, req.user.id]
    );
    
    if (!ship) {
      return res.status(404).json({ error: 'Ship not found' });
    }
    
    if (ship.status === 'in_combat') {
      return res.status(400).json({ error: 'Cannot scrap ship while in combat' });
    }
    
    // Calculate scrap value (50% of build cost)
    const rooms = typeof ship.rooms === 'string' ? JSON.parse(ship.rooms) : ship.rooms;
    const scrapValue = {
      credits: Math.floor((ship.hull_size * 10 + rooms.length * 100) * 0.5),
      metals: Math.floor(ship.hull_size * 2.5),
    };
    
    await transaction(async (client) => {
      // Remove crew from ship
      await client.query(
        `UPDATE crew_members SET ship_id = NULL WHERE ship_id = $1`,
        [req.params.id]
      );
      
      // Delete ship
      await client.query(
        `DELETE FROM ships WHERE id = $1`,
        [req.params.id]
      );
      
      // Add scrap resources
      await client.query(
        `UPDATE player_resources 
         SET credits = credits + $1, metals = metals + $2
         WHERE user_id = $3`,
        [scrapValue.credits, scrapValue.metals, req.user.id]
      );
    });
    
    res.json({ message: 'Ship scrapped', scrapValue });
  } catch (error) {
    console.error('Scrap ship error:', error);
    res.status(500).json({ error: 'Failed to scrap ship' });
  }
});

export default router;
