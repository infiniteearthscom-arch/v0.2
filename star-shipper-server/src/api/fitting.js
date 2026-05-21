// Ship Fitting API Routes
// Hull selection, module fitting, ship management

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';

const router = express.Router();

// ============================================
// GET HULL TYPES
// ============================================

router.get('/hulls', authMiddleware, async (req, res) => {
  try {
    // Filter out hulls with NULL price -- those are non-purchasable
    // system hulls (e.g. 'pod', minted only by /enter-pod on death).
    const hulls = await queryAll(`SELECT * FROM hull_types WHERE price IS NOT NULL ORDER BY price ASC`);
    res.json({ hulls });
  } catch (error) {
    console.error('Error fetching hulls:', error);
    res.status(500).json({ error: 'Failed to fetch hulls' });
  }
});

// ============================================
// GET MODULE TYPES
// ============================================

router.get('/modules', authMiddleware, async (req, res) => {
  try {
    const modules = await queryAll(`SELECT * FROM module_types ORDER BY slot_type, tier ASC`);
    res.json({ modules });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// ============================================
// GET PLAYER'S SHIPS (with hull and module details)
// ============================================

router.get('/my-ships', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ships = await queryAll(`
      SELECT s.*, ht.name as hull_name, ht.class as hull_class,
             ht.base_hull, ht.base_speed, ht.base_maneuver, ht.base_sensors,
             ht.grid_w, ht.grid_h, ht.slots as hull_slots,
             d.name as design_name,
             COALESCE(s.computed_cargo, d.total_cargo, 0) as total_cargo
      FROM ships s
      LEFT JOIN hull_types ht ON s.hull_type_id = ht.id
      LEFT JOIN ship_designs d ON s.design_id = d.id
      WHERE s.user_id = $1
      ORDER BY s.created_at ASC
    `, [userId]);

    res.json({ ships });
  } catch (error) {
    console.error('Error fetching ships:', error);
    res.status(500).json({ error: 'Failed to fetch ships' });
  }
});

// ============================================
// GET SINGLE SHIP DETAIL
// ============================================

router.get('/ship/:shipId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ship = await queryOne(`
      SELECT s.*, ht.name as hull_name, ht.class as hull_class,
             ht.base_hull, ht.base_speed, ht.base_maneuver, ht.base_sensors,
             ht.grid_w, ht.grid_h, ht.slots as hull_slots, ht.price as hull_price,
             COALESCE(s.computed_cargo, d.total_cargo, 0) as total_cargo
      FROM ships s
      LEFT JOIN hull_types ht ON s.hull_type_id = ht.id
      LEFT JOIN ship_designs d ON s.design_id = d.id
      WHERE s.id = $1 AND s.user_id = $2
    `, [req.params.shipId, userId]);

    if (!ship) return res.status(404).json({ error: 'Ship not found' });

    // Resolve fitted module details
    const fittedModules = ship.fitted_modules || {};
    const moduleDetails = {};
    for (const [slotId, modInfo] of Object.entries(fittedModules)) {
      const modType = await queryOne(
        `SELECT * FROM module_types WHERE id = $1`, [modInfo.module_type_id]
      );
      if (modType) {
        moduleDetails[slotId] = {
          ...modInfo,
          name: modType.name,
          // slot_type is what the client's normalizeFittedModule keys
          // into SLOT_TYPE_META to resolve the proper icon + color.
          // Without it, fitted modules render as near-invisible gray
          // boxes that look like empty slots.
          slot_type: modType.slot_type,
          tier: modType.tier,
          base_stats: modType.stats,
        };
      }
    }

    res.json({ ship, moduleDetails });
  } catch (error) {
    console.error('Error fetching ship detail:', error);
    res.status(500).json({ error: 'Failed to fetch ship' });
  }
});

// ============================================
// GET PLAYER CREDITS
// ============================================

router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const user = await queryOne(`SELECT credits FROM users WHERE id = $1`, [req.user.id]);
    res.json({ credits: parseInt(user?.credits) || 0 });
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

// ============================================
// BUY HULL (create new ship)
// ============================================

router.post('/buy-hull', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    // dock_body_id is the body the player is currently docked at;
    // required only when the resulting fleet would exceed FLEET_CAP
    // (server stores the new ship at that body instead of activating).
    const { hull_type_id, ship_name, dock_body_id } = req.body;

    if (!hull_type_id) return res.status(400).json({ error: 'hull_type_id required' });

    const result = await transaction(async (client) => {
      const hull = await client.query(`SELECT * FROM hull_types WHERE id = $1`, [hull_type_id]);
      if (!hull.rows[0]) throw Object.assign(new Error('Hull not found'), { statusCode: 404 });
      const hullType = hull.rows[0];

      // Starter Scout: free emergency hull. Available when the player
      // has no real ships, which covers both the original tutorial case
      // (brand-new captain) and the post-podding safety net (podded
      // player with no reserves -- their only "ship" is the pod). A pod
      // does not count as a real ship for this gate.
      if (hull_type_id === 'starter_scout') {
        const shipCount = await client.query(
          `SELECT COUNT(*) AS count FROM ships WHERE user_id = $1 AND hull_type_id != 'pod'`,
          [userId]
        );
        if (parseInt(shipCount.rows[0].count) > 0) {
          throw Object.assign(
            new Error('The Starter Scout is only available when you have no other hulls.'),
            { statusCode: 400 }
          );
        }
      }

      // Check and deduct credits
      if (hullType.price > 0) {
        const userRow = await client.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        const credits = parseInt(userRow.rows[0]?.credits || 0);
        if (credits < hullType.price) {
          throw Object.assign(new Error(`Not enough credits (need ${hullType.price}, have ${credits})`), { statusCode: 400 });
        }
        await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [hullType.price, userId]);
      }

      // Starter Scout comes pre-fitted with engine and reactor (no cargo items consumed)
      const initialFittedModules = hull_type_id === 'starter_scout'
        ? JSON.stringify({
            eng1: { module_type_id: 'engine_basic', cargo_item_id: null, quality: { purity: 50, stability: 50, potency: 50, density: 50 } },
            rct1: { module_type_id: 'reactor_basic', cargo_item_id: null, quality: { purity: 50, stability: 50, potency: 50, density: 50 } },
          })
        : '{}';

      // Create a ship design for this hull
      const designResult = await client.query(`
        INSERT INTO ship_designs (user_id, name, hull_cells, rooms, hull_size, total_power, total_crew, total_cargo, is_valid)
        VALUES ($1, $2, '[]', '[]', $3, 0, 0, $4, true)
        RETURNING id
      `, [userId, ship_name || hullType.name, hullType.grid_w * hullType.grid_h, 0]);

      // Fleet cap check: if activating this ship would exceed cap,
      // it must be stored at the player's current dock instead.
      // The pod is never counted toward the cap (storage_body_id is
      // never NULL for it -- pods never enter storage anyway, but if
      // a pod is active we let normal podding rules apply).
      const activeCountRow = await client.query(
        `SELECT COUNT(*)::INT AS c FROM ships
         WHERE user_id = $1 AND storage_body_id IS NULL`,
        [userId]
      );
      const activeCount = activeCountRow.rows[0]?.c || 0;
      const willStore = activeCount >= FLEET_CAP;
      if (willStore && !dock_body_id) {
        throw Object.assign(
          new Error(`Fleet full (${activeCount}/${FLEET_CAP}). Dock at a station to receive new ships.`),
          { statusCode: 400 }
        );
      }

      // Create the ship. If we're storing it, set storage_body_id now
      // so the row never appears as active mid-transaction.
      const shipResult = await client.query(`
        INSERT INTO ships (user_id, design_id, name, hull_type_id, fitted_modules, location_type, storage_body_id)
        VALUES ($1, $2, $3, $4, $5, 'hub', $6)
        RETURNING *
      `, [
        userId, designResult.rows[0].id, ship_name || hullType.name,
        hull_type_id, initialFittedModules,
        willStore ? dock_body_id : null,
      ]);

      const ship = shipResult.rows[0];

      // Auto-set as active ship if player has no active ship yet AND
      // the new ship is active (not just-stored).
      if (!willStore) {
        await client.query(
          `UPDATE users SET active_ship_id = $1 WHERE id = $2 AND active_ship_id IS NULL`,
          [ship.id, userId]
        );
      }

      return { ship, hull: hullType, stored: willStore };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error buying hull:', error);
    res.status(500).json({ error: 'Failed to buy hull' });
  }
});

// ============================================
// FIT MODULE (from cargo into ship slot)
// ============================================

router.post('/fit-module', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id, slot_id, cargo_item_id } = req.body;

    if (!ship_id || !slot_id || !cargo_item_id) {
      return res.status(400).json({ error: 'ship_id, slot_id, and cargo_item_id required' });
    }

    const result = await transaction(async (client) => {
      // Get ship with hull info
      const shipResult = await client.query(`
        SELECT s.*, ht.slots as hull_slots
        FROM ships s
        JOIN hull_types ht ON s.hull_type_id = ht.id
        WHERE s.id = $1 AND s.user_id = $2
        FOR UPDATE
      `, [ship_id, userId]);
      const ship = shipResult.rows[0];
      if (!ship) throw Object.assign(new Error('Ship not found'), { statusCode: 404 });

      // Find the slot on the hull
      const hullSlots = ship.hull_slots || [];
      const slot = hullSlots.find(s => s.id === slot_id);
      if (!slot) throw Object.assign(new Error('Slot not found on hull'), { statusCode: 400 });

      // Check slot isn't already occupied
      const fitted = ship.fitted_modules || {};
      if (fitted[slot_id]) {
        throw Object.assign(new Error('Slot already has a module — unfit first'), { statusCode: 400 });
      }

      // Get cargo item — must be a module type matching the slot
      const cargoResult = await client.query(
        `SELECT * FROM player_resource_inventory WHERE id = $1 AND user_id = $2 AND item_type = 'item' FOR UPDATE`,
        [cargo_item_id, userId]
      );
      const cargoItem = cargoResult.rows[0];
      if (!cargoItem) throw Object.assign(new Error('Item not found in cargo'), { statusCode: 404 });

      // Verify it's a module that fits this slot type
      const moduleType = await client.query(
        `SELECT * FROM module_types WHERE id = $1`, [cargoItem.item_id]
      );
      const mod = moduleType.rows[0];
      if (!mod) throw Object.assign(new Error('Item is not a ship module'), { statusCode: 400 });
      if (mod.slot_type !== slot.type) {
        throw Object.assign(new Error(`Module type "${mod.slot_type}" doesn't fit "${slot.type}" slot`), { statusCode: 400 });
      }

      // Remove from cargo
      if (cargoItem.quantity <= 1) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [cargoItem.id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - 1, updated_at = NOW() WHERE id = $1`,
          [cargoItem.id]
        );
      }

      // Add to ship's fitted modules
      const itemData = cargoItem.item_data || {};
      fitted[slot_id] = {
        module_type_id: mod.id,
        quality: itemData.quality || null,
        name: mod.name,
      };

      await client.query(
        `UPDATE ships SET fitted_modules = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(fitted), ship_id]
      );

      // Recalculate ship stats based on all fitted modules
      await recalcShipStats(client, ship_id, userId);

      // Check if all hull slots are now filled (client uses this to trigger quest completion)
      const allFilled = hullSlots.length > 0 && hullSlots.every(s => fitted[s.id]);

      return { fitted_slot: slot_id, module: mod.name, all_slots_filled: allFilled };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error fitting module:', error);
    res.status(500).json({ error: 'Failed to fit module' });
  }
});

// ============================================
// UNFIT MODULE (return to cargo)
// ============================================

router.post('/unfit-module', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id, slot_id } = req.body;

    if (!ship_id || !slot_id) {
      return res.status(400).json({ error: 'ship_id and slot_id required' });
    }

    const result = await transaction(async (client) => {
      const shipResult = await client.query(
        `SELECT * FROM ships WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [ship_id, userId]
      );
      const ship = shipResult.rows[0];
      if (!ship) throw Object.assign(new Error('Ship not found'), { statusCode: 404 });

      const fitted = ship.fitted_modules || {};
      if (!fitted[slot_id]) {
        throw Object.assign(new Error('No module in that slot'), { statusCode: 400 });
      }

      const modInfo = fitted[slot_id];

      // Return module to cargo — find first free slot
      const slotSql = `
        SELECT s.slot FROM generate_series(0, COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)) s(slot)
        WHERE s.slot NOT IN (SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL)
        ORDER BY s.slot ASC LIMIT 1
      `;
      const slotResult = await client.query(slotSql, [userId]);
      const nextSlot = parseInt(slotResult.rows[0]?.slot) || 0;

      // Look up the module's slot_type so it surfaces in the Ship Builder's
      // FittableModulesPanel, which filters cargo by item_data.slot_type.
      // Without this the unfit module is in cargo but invisible in the
      // ship builder (only the generic Cargo window can see it).
      const modTypeRow = await client.query(
        `SELECT slot_type FROM module_types WHERE id = $1`,
        [modInfo.module_type_id]
      );
      const itemData = {};
      if (modTypeRow.rows[0]?.slot_type) itemData.slot_type = modTypeRow.rows[0].slot_type;
      if (modInfo.quality) itemData.quality = modInfo.quality;

      await client.query(`
        INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
        VALUES ($1, 'item', $2, 1, $3, $4)
      `, [userId, modInfo.module_type_id, nextSlot, JSON.stringify(itemData)]);

      // Remove from fitted
      delete fitted[slot_id];
      await client.query(
        `UPDATE ships SET fitted_modules = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(fitted), ship_id]
      );

      // Recalculate stats
      await recalcShipStats(client, ship_id, userId);

      return { removed_module: modInfo.module_type_id };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error unfitting module:', error);
    res.status(500).json({ error: 'Failed to unfit module' });
  }
});

// ============================================
// HELPER: Recalculate ship stats from hull + modules
// ============================================

const recalcShipStats = async (client, shipId, userId) => {
  const shipResult = await client.query(`
    SELECT s.*, ht.base_hull, ht.base_speed, ht.base_maneuver, ht.base_sensors
    FROM ships s
    JOIN hull_types ht ON s.hull_type_id = ht.id
    WHERE s.id = $1 AND s.user_id = $2
  `, [shipId, userId]);
  const ship = shipResult.rows[0];
  if (!ship) return;

  const fitted = ship.fitted_modules || {};
  let totalCargo = 0;

  for (const [slotId, modInfo] of Object.entries(fitted)) {
    const modResult = await client.query(
      `SELECT stats FROM module_types WHERE id = $1`, [modInfo.module_type_id]
    );
    const modStats = modResult.rows[0]?.stats || {};

    // Quality scaling: average quality / 50 as multiplier (50 = baseline 1.0)
    let qualityMult = 1.0;
    if (modInfo.quality) {
      const q = modInfo.quality;
      const avg = ((q.purity || 50) + (q.stability || 50) + (q.potency || 50) + (q.density || 50)) / 4;
      qualityMult = avg / 50;
    }

    if (modStats.cargo_capacity) {
      totalCargo += Math.round(modStats.cargo_capacity * qualityMult);
    }
  }

  // Update computed_cargo on the ship itself (used for fleet-wide cargo calculation)
  await client.query(
    `UPDATE ships SET computed_cargo = $1 WHERE id = $2`,
    [totalCargo, shipId]
  );

  // Also update legacy ship_designs if it exists (backward compat)
  if (ship.design_id) {
    await client.query(
      `UPDATE ship_designs SET total_cargo = $1 WHERE id = $2`,
      [totalCargo, ship.design_id]
    );
  }
};

// ============================================
// BUY MODULE FROM STATION (creates cargo item)
// ============================================

router.post('/buy-module', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { module_type_id } = req.body;

    if (!module_type_id) return res.status(400).json({ error: 'module_type_id required' });

    // Starter Kit: special bundle purchase
    if (module_type_id === 'starter_kit') {
      const STARTER_KIT_PRICE = 500;
      const STARTER_KIT_ITEMS = [
        { id: 'engine_basic',      slot_type: 'engine'  },
        { id: 'reactor_basic',     slot_type: 'reactor' },
        { id: 'cargo_basic',       slot_type: 'cargo'   },
        { id: 'weapon_laser',      slot_type: 'weapon'  },
        { id: 'utility_scanner',   slot_type: 'utility' },
        { id: 'utility_autopilot', slot_type: 'utility' },
      ];

      const kitResult = await transaction(async (client) => {
        const userRow = await client.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        const credits = parseInt(userRow.rows[0]?.credits || 0);
        if (credits < STARTER_KIT_PRICE) {
          throw Object.assign(
            new Error(`Not enough credits (need ${STARTER_KIT_PRICE}, have ${credits})`),
            { statusCode: 400 }
          );
        }
        await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [STARTER_KIT_PRICE, userId]);

        for (const item of STARTER_KIT_ITEMS) {
          const slotResult = await client.query(`
            SELECT s.slot FROM generate_series(0,
              COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)
            ) s(slot)
            WHERE s.slot NOT IN (
              SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL
            )
            ORDER BY s.slot ASC LIMIT 1
          `, [userId]);
          const nextSlot = parseInt(slotResult.rows[0]?.slot) || 0;

          const itemData = {
            slot_type: item.slot_type,
            quality: { purity: 50, stability: 50, potency: 50, density: 50 },
          };
          await client.query(`
            INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
            VALUES ($1, 'item', $2, 1, $3, $4)
          `, [userId, item.id, nextSlot, JSON.stringify(itemData)]);
        }

        return { module: 'Starter Kit', price: STARTER_KIT_PRICE };
      });

      return res.json({ success: true, ...kitResult });
    }

    const result = await transaction(async (client) => {
      const modResult = await client.query(
        `SELECT * FROM module_types WHERE id = $1`, [module_type_id]
      );
      const mod = modResult.rows[0];
      if (!mod) throw Object.assign(new Error('Module not found'), { statusCode: 404 });
      if (!mod.buy_price) throw Object.assign(new Error('Module not available for purchase'), { statusCode: 400 });

      // Check and deduct credits
      const userRow = await client.query(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const credits = parseInt(userRow.rows[0]?.credits || 0);
      if (credits < mod.buy_price) {
        throw Object.assign(new Error(`Not enough credits (need ${mod.buy_price}, have ${credits})`), { statusCode: 400 });
      }
      await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [mod.buy_price, userId]);

      // Add to cargo as item
      const slotSql = `
        SELECT s.slot FROM generate_series(0, COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)) s(slot)
        WHERE s.slot NOT IN (SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL)
        ORDER BY s.slot ASC LIMIT 1
      `;
      const slotResult = await client.query(slotSql, [userId]);
      const nextSlot = parseInt(slotResult.rows[0]?.slot) || 0;

      // Station-bought modules have quality 50 (baseline)
      const itemData = {
        slot_type: mod.slot_type,
        quality: { purity: 50, stability: 50, potency: 50, density: 50 },
      };

      await client.query(`
        INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
        VALUES ($1, 'item', $2, 1, $3, $4)
      `, [userId, module_type_id, nextSlot, JSON.stringify(itemData)]);

      return { module: mod.name, price: mod.buy_price };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error buying module:', error);
    res.status(500).json({ error: 'Failed to buy module' });
  }
});

// ============================================
// GET PLAYER CREDITS
// ============================================

router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const user = await queryOne(`SELECT credits FROM users WHERE id = $1`, [req.user.id]);
    res.json({ credits: parseInt(user?.credits || 0) });
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

// ============================================
// GET FLEET (all ships with active marker)
// ============================================

router.get('/fleet', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ships = await queryAll(`
      SELECT s.*, ht.name as hull_name, ht.class as hull_class,
             ht.base_hull, ht.base_speed, ht.base_maneuver, ht.base_sensors,
             ht.grid_w, ht.grid_h, ht.slots as hull_slots,
             (u.active_ship_id = s.id) as is_active,
             cb.name AS storage_body_name
      FROM ships s
      LEFT JOIN hull_types ht       ON s.hull_type_id    = ht.id
      LEFT JOIN celestial_bodies cb ON s.storage_body_id = cb.id
      LEFT JOIN users u             ON u.id              = s.user_id
      WHERE s.user_id = $1
      ORDER BY (s.storage_body_id IS NULL) DESC,
               (u.active_ship_id = s.id) DESC,
               s.created_at ASC
    `, [userId]);

    const activeShipId = ships.find(s => s.is_active)?.id || null;
    const activeFleetCount = ships.filter(s => s.storage_body_id == null).length;
    res.json({ ships, activeShipId, activeFleetCount, fleetCap: FLEET_CAP });
  } catch (error) {
    console.error('Error fetching fleet:', error);
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
});

// Server-side fleet cap (matches client MAX_FLEET_SIZE). Beyond this,
// purchased ships must be stored at a station and activation is gated.
const FLEET_CAP = 5;

// Resolve a celestial body identifier to its DB UUID. Mirrors the
// resolveBodyId helper in api/resources.js -- accepts a UUID, an
// alias in celestial_body_aliases, or a direct match on
// celestial_bodies.name (case-insensitive). The name fallback matters
// because some Sol stations (e.g. 'Luna Station') ship without alias
// rows in migration 005, so an alias-only resolver returns null and
// produces a spurious 'Station not found'. Used by store-ship.
async function resolveCelestialBodyId(client, idOrAlias) {
  if (!idOrAlias) return null;
  const s = String(idOrAlias);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    const r = await client.query(`SELECT id FROM celestial_bodies WHERE id = $1`, [s]);
    return r.rows[0]?.id || null;
  }
  const aliasRow = await client.query(
    `SELECT celestial_body_id FROM celestial_body_aliases WHERE alias = LOWER($1)`,
    [s]
  );
  if (aliasRow.rows[0]?.celestial_body_id) return aliasRow.rows[0].celestial_body_id;
  const nameRow = await client.query(
    `SELECT id FROM celestial_bodies WHERE LOWER(name) = LOWER($1)`,
    [s]
  );
  return nameRow.rows[0]?.id || null;
}

// ============================================
// STORE SHIP (move active -> stored at a body)
// ============================================
// Client passes the body the player is currently docked at; the
// server doesn't track dock state, so we trust the body_id but
// validate the ship is owned + currently active + not the pod or
// the active_ship_id (deactivating those leaves you stranded).

router.post('/store-ship', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id, body_id } = req.body;
    if (!ship_id || !body_id) return res.status(400).json({ error: 'ship_id and body_id required' });

    const result = await transaction(async (client) => {
      const shipRow = await client.query(
        `SELECT id, hull_type_id, storage_body_id, name FROM ships
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [ship_id, userId]
      );
      const ship = shipRow.rows[0];
      if (!ship) throw Object.assign(new Error('Ship not found'), { statusCode: 404 });
      if (ship.storage_body_id != null) {
        throw Object.assign(new Error('Ship is already stored'), { statusCode: 400 });
      }
      if (ship.hull_type_id === 'pod') {
        throw Object.assign(new Error('Cannot store an Escape Pod'), { statusCode: 400 });
      }

      const userRow = await client.query(
        `SELECT active_ship_id FROM users WHERE id = $1`, [userId]
      );
      if (userRow.rows[0]?.active_ship_id === ship_id) {
        throw Object.assign(
          new Error('Cannot store the active ship — switch active ship first'),
          { statusCode: 400 }
        );
      }

      const resolvedBodyId = await resolveCelestialBodyId(client, body_id);
      if (!resolvedBodyId) throw Object.assign(new Error('Station not found'), { statusCode: 404 });
      const bodyRow = await client.query(
        `SELECT name FROM celestial_bodies WHERE id = $1`, [resolvedBodyId]
      );

      await client.query(`UPDATE ships SET storage_body_id = $1 WHERE id = $2`, [resolvedBodyId, ship_id]);
      return {
        ship_id, ship_name: ship.name,
        storage_body_id: resolvedBodyId, storage_body_name: bodyRow.rows[0].name,
      };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error storing ship:', error);
    res.status(500).json({ error: 'Failed to store ship' });
  }
});

// ============================================
// ACTIVATE SHIP (move stored -> active in fleet)
// ============================================
// Gates: ship must be stored, fleet must have room (< FLEET_CAP active).
// Server doesn't enforce that the player is at the storage body --
// client UI gates the button, server trusts (same model as wreck claim,
// award-loot, mining). Tighten when multiplayer presence is enforced.

router.post('/activate-ship', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id } = req.body;
    if (!ship_id) return res.status(400).json({ error: 'ship_id required' });

    const result = await transaction(async (client) => {
      const shipRow = await client.query(
        `SELECT id, storage_body_id, name FROM ships
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [ship_id, userId]
      );
      const ship = shipRow.rows[0];
      if (!ship) throw Object.assign(new Error('Ship not found'), { statusCode: 404 });
      if (ship.storage_body_id == null) {
        throw Object.assign(new Error('Ship is already active'), { statusCode: 400 });
      }

      const countRow = await client.query(
        `SELECT COUNT(*)::INT AS c FROM ships
         WHERE user_id = $1 AND storage_body_id IS NULL`,
        [userId]
      );
      const activeCount = countRow.rows[0]?.c || 0;
      if (activeCount >= FLEET_CAP) {
        throw Object.assign(
          new Error(`Fleet full (${activeCount}/${FLEET_CAP}). Store another ship first.`),
          { statusCode: 400 }
        );
      }

      await client.query(`UPDATE ships SET storage_body_id = NULL WHERE id = $1`, [ship_id]);
      return { ship_id, ship_name: ship.name };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error activating ship:', error);
    res.status(500).json({ error: 'Failed to activate ship' });
  }
});

// ============================================
// SET ACTIVE SHIP
// ============================================

router.post('/set-active-ship', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id } = req.body;
    if (!ship_id) return res.status(400).json({ error: 'ship_id required' });

    // Verify ownership
    const ship = await queryOne(
      `SELECT id, name FROM ships WHERE id = $1 AND user_id = $2`, [ship_id, userId]
    );
    if (!ship) return res.status(404).json({ error: 'Ship not found' });

    await query(`UPDATE users SET active_ship_id = $1 WHERE id = $2`, [ship_id, userId]);

    res.json({ success: true, active_ship_id: ship_id, ship_name: ship.name });
  } catch (error) {
    console.error('Error setting active ship:', error);
    res.status(500).json({ error: 'Failed to set active ship' });
  }
});

// ============================================
// RENAME SHIP
// ============================================

router.post('/rename-ship', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id, name } = req.body;
    if (!ship_id || !name) return res.status(400).json({ error: 'ship_id and name required' });
    if (name.length > 48) return res.status(400).json({ error: 'Name too long (max 48 chars)' });

    const ship = await queryOne(
      `SELECT id FROM ships WHERE id = $1 AND user_id = $2`, [ship_id, userId]
    );
    if (!ship) return res.status(404).json({ error: 'Ship not found' });

    await query(`UPDATE ships SET name = $1, updated_at = NOW() WHERE id = $2`, [name.trim(), ship_id]);

    res.json({ success: true, ship_id, name: name.trim() });
  } catch (error) {
    console.error('Error renaming ship:', error);
    res.status(500).json({ error: 'Failed to rename ship' });
  }
});

// (sell endpoints follow below)
// Sell price = base_price × quality_mult × 0.5
// ============================================

router.post('/sell-resource', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, quantity } = req.body;

    if (!inventory_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'inventory_id and positive quantity required' });
    }

    const result = await transaction(async (client) => {
      // Get the inventory row
      const inv = await client.query(
        `SELECT pri.*, rt.base_price, rt.name as resource_name
         FROM player_resource_inventory pri
         JOIN resource_types rt ON pri.resource_type_id = rt.id
         WHERE pri.id = $1 AND pri.user_id = $2 AND pri.item_type = 'resource'
         FOR UPDATE`,
        [inventory_id, userId]
      );
      const row = inv.rows[0];
      if (!row) throw new Error('Resource stack not found');

      const sellQty = Math.min(quantity, row.quantity);
      if (sellQty <= 0) throw new Error('Nothing to sell');

      // Quality multiplier: average quality / 50 (so Q100 = 2x, Q50 = 1x)
      const avgQuality = (
        (row.stat_purity || 50) + (row.stat_stability || 50) +
        (row.stat_potency || 50) + (row.stat_density || 50)
      ) / 4;
      const qualityMult = avgQuality / 50;

      // Sell price = base_price × quality × 0.5 (50% vendor spread)
      const pricePerUnit = Math.max(1, Math.round(row.base_price * qualityMult * 0.5));
      const totalPrice = pricePerUnit * sellQty;

      // Remove from inventory
      if (sellQty >= row.quantity) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [inventory_id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`,
          [sellQty, inventory_id]
        );
      }

      // Add credits
      await client.query(
        `UPDATE users SET credits = credits + $1 WHERE id = $2`,
        [totalPrice, userId]
      );

      const user = await client.query(`SELECT credits FROM users WHERE id = $1`, [userId]);

      return {
        sold: sellQty,
        resource_name: row.resource_name,
        price_per_unit: pricePerUnit,
        total_earned: totalPrice,
        credits: parseInt(user.rows[0].credits),
      };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error selling resource:', error);
    res.status(400).json({ error: error.message || 'Failed to sell resource' });
  }
});

// ============================================
// SELL ITEM (modules, probes, fuel from cargo)
// Modules: buy_price × 0.4, others: flat price
// ============================================

router.post('/sell-item', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inventory_id, quantity } = req.body;

    if (!inventory_id) {
      return res.status(400).json({ error: 'inventory_id required' });
    }

    const sellQty = Math.max(1, quantity || 1);

    const result = await transaction(async (client) => {
      const inv = await client.query(
        `SELECT * FROM player_resource_inventory
         WHERE id = $1 AND user_id = $2 AND item_type IN ('item', 'module')
         FOR UPDATE`,
        [inventory_id, userId]
      );
      const row = inv.rows[0];
      if (!row) throw new Error('Item not found');

      const qty = Math.min(sellQty, row.quantity);
      if (qty <= 0) throw new Error('Nothing to sell');

      let pricePerUnit = 5; // minimum fallback
      let itemName = row.item_id || 'Unknown';

      // Try to get module price
      if (row.item_type === 'module' && row.item_data?.module_type_id) {
        const mod = await client.query(
          `SELECT buy_price, name FROM module_types WHERE id = $1`,
          [row.item_data.module_type_id]
        );
        if (mod.rows[0]) {
          pricePerUnit = Math.max(1, Math.round((mod.rows[0].buy_price || 10) * 0.4));
          itemName = mod.rows[0].name;
        }
      } else {
        // Items like fuel cells, probes — sell at flat rate
        const itemPrices = {
          fuel_cell: 40,
          scanner_probe: 20,
          advanced_scanner_probe: 60,
        };
        pricePerUnit = itemPrices[row.item_id] || 5;
        itemName = row.item_id?.replace(/_/g, ' ') || 'Item';
      }

      // Quality multiplier for modules
      if (row.item_data?.quality) {
        const q = row.item_data.quality;
        const avg = ((q.purity || 50) + (q.stability || 50) + (q.potency || 50) + (q.density || 50)) / 4;
        pricePerUnit = Math.max(1, Math.round(pricePerUnit * (avg / 50)));
      }

      const totalPrice = pricePerUnit * qty;

      // Remove from inventory
      if (qty >= row.quantity) {
        await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [inventory_id]);
      } else {
        await client.query(
          `UPDATE player_resource_inventory SET quantity = quantity - $1 WHERE id = $2`,
          [qty, inventory_id]
        );
      }

      // Add credits
      await client.query(
        `UPDATE users SET credits = credits + $1 WHERE id = $2`,
        [totalPrice, userId]
      );

      const user = await client.query(`SELECT credits FROM users WHERE id = $1`, [userId]);

      return {
        sold: qty,
        item_name: itemName,
        price_per_unit: pricePerUnit,
        total_earned: totalPrice,
        credits: parseInt(user.rows[0].credits),
      };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error selling item:', error);
    res.status(400).json({ error: error.message || 'Failed to sell item' });
  }
});

// ============================================
// COMBAT: Award loot credits
// ============================================

router.post('/award-loot', authMiddleware, async (req, res) => {
  try {
    const { credits } = req.body;
    if (!credits || credits <= 0) return res.status(400).json({ error: 'Invalid credits' });
    const amt = Math.min(credits, 1000); // Cap per kill
    await query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [amt, req.user.id]);
    res.json({ success: true, awarded: amt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to award loot' });
  }
});

// ============================================
// COMBAT: Deduct repair cost on death
// ============================================
// Legacy endpoint -- retained for backward compatibility but no longer
// called by the death handler (replaced by /enter-pod). Safe to remove
// once we confirm no client still references it.

router.post('/repair-cost', authMiddleware, async (req, res) => {
  try {
    const { cost } = req.body;
    if (!cost || cost <= 0) return res.status(400).json({ error: 'Invalid cost' });
    await query(`UPDATE users SET credits = GREATEST(0, credits - $1) WHERE id = $2`, [cost, req.user.id]);
    res.json({ success: true, deducted: cost });
  } catch (error) {
    res.status(500).json({ error: 'Failed to deduct repair cost' });
  }
});

// ============================================
// COMBAT: Eject into escape pod (replaces respawn)
// ============================================
// Called when the player's active ship hull reaches 0. Destroys the
// active ship + its fitted modules (Phase 2 will eject these into a
// wreck instead), creates an Escape Pod, and sets it as active. The
// pod is untargetable client-side and serves as a way to fly back to
// a station to re-equip. Player inventory (cargo) is untouched in
// Phase 1 -- destroying ships does not yet eject cargo.

router.post('/enter-pod', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await transaction(async (client) => {
      // Lock the user row first (single-table FOR UPDATE -- can't combine
      // FOR UPDATE with a LEFT JOIN's nullable side in Postgres).
      const userRow = await client.query(
        `SELECT active_ship_id FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      const activeShipId = userRow.rows[0]?.active_ship_id;
      if (!activeShipId) {
        throw Object.assign(new Error('No active ship to destroy'), { statusCode: 400 });
      }

      // Now read the ship's hull type + name to validate + log.
      const shipRow = await client.query(
        `SELECT hull_type_id, name FROM ships WHERE id = $1 AND user_id = $2`,
        [activeShipId, userId]
      );
      const ship = shipRow.rows[0];
      if (!ship) {
        throw Object.assign(new Error('Active ship not found'), { statusCode: 400 });
      }
      if (ship.hull_type_id === 'pod') {
        throw Object.assign(new Error('Already in a pod'), { statusCode: 400 });
      }
      const destroyedShipName = ship.name;

      // Destroy the active ship. The ON DELETE SET NULL on
      // users.active_ship_id (migration 014) clears the FK for us.
      await client.query(`DELETE FROM ships WHERE id = $1 AND user_id = $2`, [activeShipId, userId]);

      // Create the pod ship. Mirrors the buy-hull flow: a minimal
      // ship_design row satisfies the ships.design_id NOT NULL FK.
      const podHullResult = await client.query(`SELECT * FROM hull_types WHERE id = 'pod'`);
      const podHull = podHullResult.rows[0];
      if (!podHull) throw Object.assign(new Error('Pod hull missing -- run migration 019'), { statusCode: 500 });

      const designResult = await client.query(`
        INSERT INTO ship_designs (user_id, name, hull_cells, rooms, hull_size, total_power, total_crew, total_cargo, is_valid)
        VALUES ($1, $2, '[]', '[]', $3, 0, 0, 0, true)
        RETURNING id
      `, [userId, 'Escape Pod', podHull.grid_w * podHull.grid_h]);

      const shipResult = await client.query(`
        INSERT INTO ships (user_id, design_id, name, hull_type_id, fitted_modules, location_type)
        VALUES ($1, $2, 'Escape Pod', 'pod', '{}'::jsonb, 'space')
        RETURNING *
      `, [userId, designResult.rows[0].id]);
      const pod = shipResult.rows[0];

      await client.query(`UPDATE users SET active_ship_id = $1 WHERE id = $2`, [pod.id, userId]);

      return { pod, destroyed_ship_name: destroyedShipName };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error entering pod:', error);
    res.status(500).json({ error: 'Failed to enter pod' });
  }
});

// ============================================
// COMBAT: Disembark from escape pod
// ============================================
// Switches active ship to a non-pod fleet ship and deletes the pod.
// Caller is expected to be docked, but we don't enforce that server-
// side -- the client gates this behind dock state.

router.post('/exit-pod', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ship_id } = req.body;
    if (!ship_id) return res.status(400).json({ error: 'ship_id required' });

    const result = await transaction(async (client) => {
      // Lock the user row first; FOR UPDATE on a LEFT JOIN's nullable
      // side is rejected by Postgres, so we read the ship in a follow-up.
      const userRow = await client.query(
        `SELECT active_ship_id FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      const podId = userRow.rows[0]?.active_ship_id;
      if (!podId) {
        throw Object.assign(new Error('No active ship'), { statusCode: 400 });
      }
      const shipRow = await client.query(
        `SELECT hull_type_id FROM ships WHERE id = $1 AND user_id = $2`,
        [podId, userId]
      );
      if (shipRow.rows[0]?.hull_type_id !== 'pod') {
        throw Object.assign(new Error('Not currently in a pod'), { statusCode: 400 });
      }

      const target = await client.query(
        `SELECT id, name, hull_type_id FROM ships WHERE id = $1 AND user_id = $2`,
        [ship_id, userId]
      );
      const targetShip = target.rows[0];
      if (!targetShip) throw Object.assign(new Error('Target ship not found'), { statusCode: 404 });
      if (targetShip.hull_type_id === 'pod') {
        throw Object.assign(new Error('Cannot disembark into another pod'), { statusCode: 400 });
      }

      await client.query(`UPDATE users SET active_ship_id = $1 WHERE id = $2`, [ship_id, userId]);
      await client.query(`DELETE FROM ships WHERE id = $1 AND user_id = $2`, [podId, userId]);

      return { boarded_ship: targetShip };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error exiting pod:', error);
    res.status(500).json({ error: 'Failed to exit pod' });
  }
});

// ============================================
// DEV: RESET ACCOUNT (wipe all player data)
// ============================================

router.post('/reset-account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await transaction(async (client) => {
      // 1. Null FKs that reference ships before we delete them
      await client.query(`UPDATE users SET active_ship_id = NULL, credits = 1000 WHERE id = $1`, [userId]);
      await client.query(`UPDATE player_presence SET active_ship_id = NULL WHERE user_id = $1`, [userId]);

      // 2. Wipe active harvest sessions
      await client.query(`DELETE FROM harvest_sessions WHERE user_id = $1`, [userId]);

      // 3. Wipe deployed harvesters
      await client.query(`DELETE FROM deployed_harvesters WHERE user_id = $1`, [userId]);

      // 4. Wipe all cargo / inventory (resources, modules, probes)
      await client.query(`DELETE FROM player_resource_inventory WHERE user_id = $1`, [userId]);

      // 5. Wipe scan history
      await client.query(`DELETE FROM player_surveys WHERE user_id = $1`, [userId]);

      // 6. Delete ships (must come after nulling active_ship_id FKs)
      await client.query(`DELETE FROM ships WHERE user_id = $1`, [userId]);

      // 7. Delete ship designs (ships referenced these, so ships must be gone first)
      await client.query(`DELETE FROM ship_designs WHERE user_id = $1`, [userId]);

      // 8. Wipe quest progress (so tutorial restarts from scratch)
      await client.query(`DELETE FROM player_quests WHERE user_id = $1`, [userId]);
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Reset account error:', error);
    res.status(500).json({ error: 'Failed to reset account' });
  }
});

export default router;
