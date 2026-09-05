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
  const matCost = await pool.query(
    `SELECT jsonb_array_length(material_cost) AS n FROM tech_definitions WHERE id = 'tech_exotic_weapons'`
  );
  report('tech_exotic_weapons has material_cost (068)', (matCost.rows[0]?.n || 0) > 0);
  const iron = await pool.query(`SELECT base_price FROM resource_types WHERE name = 'Iron'`);
  report('Iron repriced to 6 (068)', parseInt(iron.rows[0]?.base_price) === 6, `price=${iron.rows[0]?.base_price}`);
  const myield = await pool.query(`SELECT stats->>'mine_yield' AS y FROM module_types WHERE id = 'mining_basic'`);
  report('mining_basic yield 3 (068)', myield.rows[0]?.y === '3', `yield=${myield.rows[0]?.y}`);

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
