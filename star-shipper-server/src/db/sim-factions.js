// npm run sim:factions -- dry run for the enemy factions (spec §6 / §9).
//
// Part 1 (no DB): territory over the generated galaxy -- systems per tier
// per faction, which regions are the nests, and whether both nests exist.
// Part 2 (needs DB, runs on the DO console): builds every system's manifest
// and prints average credit payout per full clear by tier and faction, plus
// the resource / module drop expectation from loot tables, so no faction
// becomes the farm. Part 2 is skipped quietly when the DB is unreachable.
import { generateGalaxy } from '../game/galaxyGenerator.js';
import { computeTerritory, FACTION_LABEL, NEST_LABEL } from '../game/factions.js';

const galaxy = generateGalaxy(12345, 200);
const T = computeTerritory(galaxy);

console.log('=== Territory (seed 12345, 200 systems) ===');
const grid = {};
for (const s of galaxy.systems) {
  const t = s.regionTier ?? 1, f = T.systemFaction.get(s.id);
  grid[t] ??= { reavers: 0, synod: 0, swarm: 0 };
  grid[t][f]++;
}
for (const t of Object.keys(grid).sort()) console.log(`  T${t}: reavers ${String(grid[t].reavers).padStart(3)} | synod ${String(grid[t].synod).padStart(3)} | swarm ${String(grid[t].swarm).padStart(3)}`);
console.log('--- regions ---');
for (const r of galaxy.regions) {
  const nest = Object.entries(T.nests).find(([, id]) => id === r.id);
  console.log(`  ${r.name.padEnd(22)} T${r.tier}  ${FACTION_LABEL[T.regionFaction.get(r.id)].padEnd(13)} ${r.systemIds.length} systems${nest ? `  <-- ${NEST_LABEL[nest[0]]}` : ''}`);
}
console.log(`nests: swarm=${T.nests.swarm || 'NONE'} synod=${T.nests.synod || 'NONE'}`);
// Islands (jump-gates-spec §5): no lane in; every non-island system must still be gate-reachable from Sol.
const islands = galaxy.regions.filter(r => r.isIsland);
console.log('islands:', islands.map(r => `${r.name} (T${r.tier}, ${r.systemIds.length} systems, ${T.regionFaction.get(r.id)})`).join(' | ') || 'NONE');
{
  const seen = new Set(['sol']); const q = ['sol'];
  while (q.length) { const id = q.shift(); for (const n of (galaxy.systemMap[id]?.jumpConnections || [])) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  const nonIsland = galaxy.systems.filter(s => !s.isIsland);
  const unreachable = nonIsland.filter(s => !seen.has(s.id));
  const leak = galaxy.systems.filter(s => s.isIsland && seen.has(s.id));
  console.log(`gate-reachable from Sol: ${seen.size} / non-island ${nonIsland.length}; unreachable non-island: ${unreachable.length}; islands leaked: ${leak.length}`);
  if (unreachable.length || leak.length) { console.error('FAIL: island cut broke reachability'); process.exitCode = 1; }
  for (const r of islands) { const ids = new Set(r.systemIds); const s0 = r.systemIds[0]; const seenI = new Set([s0]); const qq = [s0]; while (qq.length) { const id = qq.shift(); for (const n of (galaxy.systemMap[id]?.jumpConnections || [])) if (ids.has(n) && !seenI.has(n)) { seenI.add(n); qq.push(n); } } console.log(`  ${r.name}: internal gate connectivity ${seenI.size}/${r.systemIds.length}`); }
}
if (!T.nests.swarm || !T.nests.synod) { console.error('FAIL: a nest is missing'); process.exitCode = 1; }

try {
  const { getSystemManifest, getCatalog } = await import('../game/enemyManifest.js');
  await getCatalog();
  console.log('\n=== Payout per full clear (credits) by tier x faction ===');
  const acc = {};
  const drops = {};
  const catalog = await getCatalog();
  for (const s of galaxy.systems) {
    const m = await getSystemManifest(s.id);
    if (!m) continue;
    const t = m.manifest.tier, f = m.manifest.faction || 'reavers';
    const total = [...m.claimIndex.values()].reduce((a, e) => a + e.credits, 0);
    acc[t] ??= {}; acc[t][f] ??= { sum: 0, n: 0, ships: 0 };
    acc[t][f].sum += total; acc[t][f].n++; acc[t][f].ships += m.manifest.enemies.length;
    for (const e of m.manifest.enemies) {
      const tmpl = catalog.byId.get(e.template_id);
      for (const d of (tmpl?.loot_table || [])) {
        const key = `${f}:${d.kind === 'resource' ? d.resource_name : d.module_type_id}`;
        const ev = (d.chance ?? 1) * (d.kind === 'resource' ? ((d.quantity?.[0] ?? 1) + (d.quantity?.[1] ?? 1)) / 2 : 1);
        drops[key] = (drops[key] || 0) + ev;
      }
    }
  }
  for (const t of Object.keys(acc).sort()) for (const f of Object.keys(acc[t])) { const a = acc[t][f]; console.log(`  T${t} ${f.padEnd(8)} ${a.n} systems  avg clear ${Math.round(a.sum / a.n).toLocaleString()} cr  avg ships ${(a.ships / a.n).toFixed(1)}`); }
  console.log('--- expected drops per full galaxy clear (units or modules) ---');
  for (const [k, v] of Object.entries(drops).sort()) console.log(`  ${k.padEnd(34)} ${v.toFixed(1)}`);
} catch (e) {
  console.log(`\n(payout pass skipped: ${e.message.split('\n')[0]})`);
}
process.exit();
