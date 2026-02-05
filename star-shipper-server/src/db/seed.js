import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  console.log('🌱 Seeding database with initial game data...\n');

  try {
    // ==========================================
    // STAR SYSTEMS
    // ==========================================
    console.log('Creating star systems...');

    // Sol system (starting hub)
    const sol = await pool.query(`
      INSERT INTO star_systems (name, galaxy_x, galaxy_y, star_type, star_size, is_hub, danger_level, connections)
      VALUES ('Sol', 0, 0, 'yellow', 1.0, true, 1, '[]')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const solId = sol.rows[0]?.id;

    if (solId) {
      // Add planets to Sol
      const solBodies = [
        { name: 'Mercury', type: 'planet', orbit: 50, planetType: 'barren', resources: { metals: 80, rareEarth: 20 } },
        { name: 'Venus', type: 'planet', orbit: 80, planetType: 'lava', resources: { metals: 60, gases: 40 } },
        { name: 'Earth', type: 'planet', orbit: 120, planetType: 'terran', resources: { food: 100, metals: 30 } },
        { name: 'Luna Station', type: 'station', orbit: 130, services: ['trade', 'repair', 'refuel'] },
        { name: 'Mars', type: 'planet', orbit: 170, planetType: 'desert', resources: { metals: 70, crystals: 30 } },
        { name: 'Asteroid Belt', type: 'asteroid_belt', orbit: 250, resources: { metals: 90, crystals: 50, rareEarth: 10 } },
        { name: 'Jupiter', type: 'gas_giant', orbit: 400, resources: { gases: 100, fuel: 80 } },
        { name: 'Saturn', type: 'gas_giant', orbit: 550, resources: { gases: 90, fuel: 70 } },
      ];

      for (const body of solBodies) {
        await pool.query(`
          INSERT INTO celestial_bodies (system_id, name, body_type, orbit_radius, planet_type, resources, services)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT DO NOTHING
        `, [
          solId,
          body.name,
          body.type,
          body.orbit,
          body.planetType || null,
          JSON.stringify(body.resources || {}),
          JSON.stringify(body.services || [])
        ]);
      }

      console.log('  ✓ Sol system created with 8 celestial bodies');

      // Create initial hub instance for Sol
      await pool.query(`
        INSERT INTO hub_instances (system_id, max_players)
        VALUES ($1, 100)
        ON CONFLICT DO NOTHING
      `, [solId]);

      console.log('  ✓ Sol hub instance created');
    }

    // Alpha Centauri (nearby system)
    const alphaCentauri = await pool.query(`
      INSERT INTO star_systems (name, galaxy_x, galaxy_y, star_type, star_size, is_hub, danger_level, connections)
      VALUES ('Alpha Centauri', 100, 50, 'red_dwarf', 0.8, false, 2, '[]')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const acId = alphaCentauri.rows[0]?.id;
    if (acId) {
      await pool.query(`
        INSERT INTO celestial_bodies (system_id, name, body_type, orbit_radius, planet_type, resources)
        VALUES 
          ($1, 'Proxima b', 'planet', 80, 'rocky', '{"metals": 60, "crystals": 40}'),
          ($1, 'Proxima c', 'planet', 150, 'ice', '{"gases": 50, "water": 80}'),
          ($1, 'Mining Outpost', 'station', 200, null, '{}')
        ON CONFLICT DO NOTHING
      `, [acId]);

      console.log('  ✓ Alpha Centauri system created');
    }

    // Sirius (hub system)
    const sirius = await pool.query(`
      INSERT INTO star_systems (name, galaxy_x, galaxy_y, star_type, star_size, is_hub, danger_level, connections)
      VALUES ('Sirius', -80, 120, 'blue_giant', 1.5, true, 3, '[]')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const siriusId = sirius.rows[0]?.id;
    if (siriusId) {
      await pool.query(`
        INSERT INTO celestial_bodies (system_id, name, body_type, orbit_radius, planet_type, resources, services)
        VALUES 
          ($1, 'Sirius Prime', 'planet', 200, 'terran', '{"food": 80, "metals": 40}', '[]'),
          ($1, 'Sirius Station', 'station', 250, null, '{}', '["trade", "repair", "refuel", "missions"]'),
          ($1, 'Forge World', 'planet', 350, 'lava', '{"metals": 100, "rareEarth": 30}', '[]')
        ON CONFLICT DO NOTHING
      `, [siriusId]);

      // Create hub instance
      await pool.query(`
        INSERT INTO hub_instances (system_id, max_players)
        VALUES ($1, 100)
        ON CONFLICT DO NOTHING
      `, [siriusId]);

      console.log('  ✓ Sirius system created');
    }

    // Update connections between systems
    if (solId && acId) {
      await pool.query(`UPDATE star_systems SET connections = $1 WHERE id = $2`, [JSON.stringify([acId, siriusId]), solId]);
      await pool.query(`UPDATE star_systems SET connections = $1 WHERE id = $2`, [JSON.stringify([solId]), acId]);
    }
    if (siriusId && solId) {
      await pool.query(`UPDATE star_systems SET connections = $1 WHERE id = $2`, [JSON.stringify([solId]), siriusId]);
    }

    console.log('  ✓ System connections established');

    // ==========================================
    // SUMMARY
    // ==========================================
    const systemCount = await pool.query('SELECT COUNT(*) FROM star_systems');
    const bodyCount = await pool.query('SELECT COUNT(*) FROM celestial_bodies');
    const hubCount = await pool.query('SELECT COUNT(*) FROM hub_instances');

    console.log(`
✅ Seeding complete!

Summary:
  - Star Systems: ${systemCount.rows[0].count}
  - Celestial Bodies: ${bodyCount.rows[0].count}
  - Hub Instances: ${hubCount.rows[0].count}
    `);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
