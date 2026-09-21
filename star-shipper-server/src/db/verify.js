// DB state verifier — `npm run db:verify` from the DO console.
// =============================================================
// The migrations tracker records that a file ran, but can't prove its
// effects exist (see the wrecks 42P01 mystery: tracker rows present,
// table missing at runtime). This script checks the ACTUAL schema
// against what the migrations promise, so "skipped (already executed)"
// can be trusted or debunked without pasting SQL into the console.
//
// Add a check here whenever a migration's effects are worth verifying.

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const results = [];
function report(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function tableExists(name) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return !!r.rows[0];
}

async function columnExists(table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return !!r.rows[0];
}

async function indexInfo(name) {
  const r = await pool.query(
    `SELECT ix.indisunique AS is_unique
       FROM pg_class c
       JOIN pg_index ix ON ix.indexrelid = c.oid
      WHERE c.relname = $1`,
    [name]
  );
  return r.rows[0] || null; // null = missing
}

async function main() {
  console.log('🔍 Verifying database state...\n');

  // --- migrations tracker tail ---
  const recent = await pool.query(
    `SELECT name, executed_at FROM migrations ORDER BY name DESC LIMIT 5`
  );
  console.log('Last 5 tracker records:');
  for (const row of recent.rows) {
    console.log(`   ${row.name}  @ ${row.executed_at?.toISOString?.() || row.executed_at}`);
  }
  console.log('');

  // --- migration 066 effects ---
  report(
    'deployed_harvesters has modern shape (celestial_body_id)',
    await columnExists('deployed_harvesters', 'celestial_body_id')
  );
  const bodySlot = await indexInfo('idx_harvesters_body_slot');
  report('idx_harvesters_body_slot exists + UNIQUE', !!bodySlot?.is_unique,
    bodySlot ? `unique=${bodySlot.is_unique}` : 'missing');
  const dep = await indexInfo('idx_harvesters_deposit');
  report('idx_harvesters_deposit exists + UNIQUE (066 rebuilt it)', !!dep?.is_unique,
    dep ? `unique=${dep.is_unique}` : 'missing');
  report('idx_activity_type_user exists (066)', !!(await indexInfo('idx_activity_type_user')));
  report('idx_activity_user_created exists (066)', !!(await indexInfo('idx_activity_user_created')));

  // --- migration 067 effects (Phase 0 combat quick wins) ---
  const ml2 = await pool.query(`SELECT buy_price FROM module_types WHERE id = 'mining_laser_2'`);
  report('mining_laser_2 obtainable (067: buy_price set)', ml2.rows[0]?.buy_price != null,
    `buy_price=${ml2.rows[0]?.buy_price ?? 'NULL'}`);
  const ml2r = await pool.query(`SELECT 1 FROM crafting_recipes WHERE id = 'craft_mining_laser_2'`);
  report('craft_mining_laser_2 recipe exists (067)', !!ml2r.rows[0]);
  const dtCount = await pool.query(
    `SELECT COUNT(*)::int AS n FROM module_types WHERE stats ? 'damage_type'`
  );
  report('weapons carry explicit damage_type (067)', dtCount.rows[0].n >= 8, `${dtCount.rows[0].n} modules typed`);

  // --- migration 068 effects (Phase 1 rebalance) ---
  const t4 = await pool.query(`SELECT MIN(rp_cost)::int AS c FROM tech_definitions WHERE tier = 4`);
  report('T4 tech costs 15000 RP (068)', t4.rows[0]?.c === 15000, `min=${t4.rows[0]?.c}`);
  // Column may not exist at all if 068 never ran (seen 2026-09-17) —
  // a missing column must be a ❌ row, not a verifier crash.
  if (await columnExists('tech_definitions', 'material_cost')) {
    const matCost = await pool.query(
      `SELECT jsonb_array_length(material_cost) AS n FROM tech_definitions WHERE id = 'tech_exotic_weapons'`
    );
    report('tech_exotic_weapons has material_cost (068)', (matCost.rows[0]?.n || 0) > 0);
  } else {
    report('tech_exotic_weapons has material_cost (068)', false, 'column material_cost MISSING — run npm run db:migrate');
  }
  const iron = await pool.query(`SELECT base_price FROM resource_types WHERE name = 'Iron'`);
  report('Iron repriced to 6 (068)', parseInt(iron.rows[0]?.base_price) === 6, `price=${iron.rows[0]?.base_price}`);
  const myield = await pool.query(`SELECT stats->>'mine_yield' AS y FROM module_types WHERE id = 'mining_basic'`);
  report('mining_basic yield 3 (068)', myield.rows[0]?.y === '3', `yield=${myield.rows[0]?.y}`);

  // --- migration 069 effects (Phase 2 enemy templates) ---
  report('enemy_templates exists (069)', await tableExists('enemy_templates'));
  report('enemy_template_modules exists (069)', await tableExists('enemy_template_modules'));
  if (await tableExists('enemy_templates')) {
    const tcount = await pool.query(`SELECT COUNT(*)::int AS n FROM enemy_templates`);
    report('enemy_templates seeded (069)', tcount.rows[0].n >= 18, `${tcount.rows[0].n} templates`);
    const orphanMods = await pool.query(
      `SELECT COUNT(*)::int AS n FROM enemy_template_modules tm
        LEFT JOIN module_types mt ON mt.id = tm.module_type_id WHERE mt.id IS NULL`
    );
    report('enemy_template_modules all reference real modules (069)', orphanMods.rows[0].n === 0, `${orphanMods.rows[0].n} orphans`);
  }
  const pirateHulls = await pool.query(
    `SELECT COUNT(*)::int AS n FROM hull_types WHERE id IN ('pirate_interceptor','pirate_marauder','pirate_destroyer')`
  );
  report('pirate hulls registered in hull_types (069)', pirateHulls.rows[0].n === 3, `${pirateHulls.rows[0].n}/3`);

  // --- migration 070 (last system) ---
  report('users.last_system_id exists (070)', await columnExists('users', 'last_system_id'));

  // --- migration 072 (harvester slots on procedural planets) ---
  const nullSlots = await pool.query(
    `SELECT COUNT(*)::int AS n FROM celestial_bodies WHERE harvester_slots IS NULL`
  );
  report('no celestial_bodies with NULL harvester_slots (072)', nullSlots.rows[0].n === 0, `${nullSlots.rows[0].n} NULL`);
  const zeroPlanets = await pool.query(
    `SELECT COUNT(*)::int AS n FROM celestial_bodies WHERE body_type = 'planet' AND COALESCE(harvester_slots, 0) = 0`
  );
  report('every planet row has harvester slots (072)', zeroPlanets.rows[0].n === 0, `${zeroPlanets.rows[0].n} planets with 0 slots`);

  // --- every module_types row must have an item_definitions twin (CLAUDE.md pitfall #19) ---
  const orphanMods = await pool.query(
    `SELECT COUNT(*)::int AS n FROM module_types mt LEFT JOIN item_definitions idef ON idef.id = mt.id WHERE idef.id IS NULL`
  );
  report('every module_types row has an item_definitions row', orphanMods.rows[0].n === 0, `${orphanMods.rows[0].n} missing`);

  // --- migration 076 (asteroid telemetry) ---
  const tele = await pool.query(`SELECT COUNT(*)::int AS n FROM module_types WHERE stats ? 'telemetry_tier'`);
  report('asteroid telemetry modules seeded (076)', tele.rows[0].n === 3, `${tele.rows[0].n}/3`);
  const teleTech = await pool.query(`SELECT COUNT(*)::int AS n FROM tech_definitions WHERE id LIKE 'tech_ast_telemetry%'`);
  report('asteroid telemetry research nodes (076)', teleTech.rows[0].n === 3, `${teleTech.rows[0].n}/3`);

  // --- migration 075 (Repair Nanite Hive) ---
  const nanites = await pool.query(`SELECT buy_price, stats->>'hull_repair_per_sec' AS r FROM module_types WHERE id = 'utility_repair_nanites'`);
  report('utility_repair_nanites module exists (075)', !!nanites.rows[0] && nanites.rows[0].r != null, nanites.rows[0] ? `buy_price=${nanites.rows[0].buy_price}` : 'missing');

  // --- migration 074 (persisted fleet damage) ---
  report('users.fleet_hull_pct exists (074)', await columnExists('users', 'fleet_hull_pct'));
  report('users.fleet_armor_pct exists (074)', await columnExists('users', 'fleet_armor_pct'));

  // --- migration 073 (one-time position sync grace) ---
  report('users.last_system_synced exists (073)', await columnExists('users', 'last_system_synced'));

  // --- migration 071 (Fleet Command grandfather) ---
  const overCap = await pool.query(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT s.user_id, COUNT(*) AS active, COALESCE(MAX(ps.level), 0) AS lvl
         FROM ships s
         LEFT JOIN player_skills ps ON ps.user_id = s.user_id AND ps.skill_id = 'cmd_fleet_command'
        WHERE s.storage_body_id IS NULL AND s.hull_type_id <> 'pod'
        GROUP BY s.user_id
     ) t WHERE t.active > LEAST(5, 2 + t.lvl)`
  );
  report('no player over their Fleet Command cap (071)', overCap.rows[0].n === 0, `${overCap.rows[0].n} over cap`);

  // --- the old wrecks 42P01 mystery (migrations 021/022) ---
  report('wrecks table exists (021 — known 42P01 mystery)', await tableExists('wrecks'));

  // --- general sanity ---
  report('market_orders exists (058)', await tableExists('market_orders'));
  report('bounties exists (060)', await tableExists('bounties'));

  const failed = results.filter(r => !r.ok);
  console.log(
    failed.length === 0
      ? '\n✅ All checks passed — tracker and schema agree.'
      : `\n❌ ${failed.length} check(s) FAILED — tracker may be recording migrations that didn't take effect.`
  );
  await pool.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Verifier crashed:', err);
  await pool.end();
  process.exit(2);
});
