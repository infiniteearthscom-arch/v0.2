// grantStarterShip(userId)
// =========================
// Grants a brand-new player their Starter Scout: creates the ship row
// (pre-fitted with engine + reactor, mirroring the buy-hull flow for
// 'starter_scout') and sets it as the user's active_ship_id. Idempotent
// at the call-sites that use it: only called from new-user creation,
// so by definition there's no prior ship.
//
// Replaces the old "buy your free Starter Scout" tutorial step --
// players now load in already flying, with tutorial_fly_to_luna as
// the opening quest.

import { query, transaction } from '../db/index.js';

export async function grantStarterShip(userId) {
  await transaction(async (client) => {
    const hullRes = await client.query(
      `SELECT * FROM hull_types WHERE id = 'starter_scout'`
    );
    const hull = hullRes.rows[0];
    if (!hull) {
      // Starter Scout hull is seeded in migration 017. If it's missing,
      // the DB is in an unexpected state -- log and bail rather than
      // creating a ship with a null hull.
      console.error('grantStarterShip: starter_scout hull not found in hull_types');
      return;
    }

    const designRes = await client.query(`
      INSERT INTO ship_designs (user_id, name, hull_cells, rooms, hull_size, total_power, total_crew, total_cargo, is_valid)
      VALUES ($1, $2, '[]', '[]', $3, 0, 0, 0, true)
      RETURNING id
    `, [userId, hull.name, hull.grid_w * hull.grid_h]);

    // Pre-fit engine + reactor identically to the buy-hull path so
    // SystemView treats this ship just like one bought from the vendor.
    const fitted = JSON.stringify({
      eng1: { module_type_id: 'engine_basic', cargo_item_id: null, quality: { purity: 50, stability: 50, potency: 50, density: 50 } },
      rct1: { module_type_id: 'reactor_basic', cargo_item_id: null, quality: { purity: 50, stability: 50, potency: 50, density: 50 } },
    });

    const shipRes = await client.query(`
      INSERT INTO ships (user_id, design_id, name, hull_type_id, fitted_modules, location_type, storage_body_id)
      VALUES ($1, $2, $3, 'starter_scout', $4, 'hub', NULL)
      RETURNING id
    `, [userId, designRes.rows[0].id, hull.name, fitted]);

    await client.query(
      `UPDATE users SET active_ship_id = $1 WHERE id = $2`,
      [shipRes.rows[0].id, userId]
    );
  });
}
