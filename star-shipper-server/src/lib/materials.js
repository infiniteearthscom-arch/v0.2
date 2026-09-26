// lib/materials.js -- resource stacks across CARGO + a base DEPOT (2026-09-26).
//
// The Foundry pulls job inputs and base-upgrade costs from the depot first
// (that is where collected outputs land), then from cargo, lowest quality
// first, and reports the quantity-weighted average stats of what it took
// so outputs inherit input quality. Shared by api/foundry.js and
// api/bases.js.

const AVG = (s) => ((Number(s.stat_purity ?? 50) + Number(s.stat_stability ?? 50) + Number(s.stat_potency ?? 50) + Number(s.stat_density ?? 50)) / 4);

// { [name]: { quantity, avg_quality, depot, cargo } } for every resource the
// pilot holds in cargo or in the given base's depot.
export async function availableMaterials(client, userId, baseId) {
  const q = (sql, p) => client.query(sql, p).then(r => r.rows);
  const cargo = await q(`
    SELECT rt.name, pri.quantity, pri.stat_purity, pri.stat_stability, pri.stat_potency, pri.stat_density
      FROM player_resource_inventory pri JOIN resource_types rt ON rt.id = pri.resource_type_id
     WHERE pri.user_id = $1 AND pri.item_type = 'resource' AND pri.quantity > 0`, [userId]);
  const depot = baseId ? await q(`
    SELECT rt.name, bi.quantity, bi.stat_purity, bi.stat_stability, bi.stat_potency, bi.stat_density
      FROM player_base_inventory bi JOIN resource_types rt ON rt.id = bi.resource_type_id
     WHERE bi.base_id = $1 AND bi.quantity > 0`, [baseId]) : [];
  const out = {};
  const add = (row, src) => {
    const o = out[row.name] || (out[row.name] = { quantity: 0, depot: 0, cargo: 0, _w: 0 });
    const n = Number(row.quantity);
    o.quantity += n; o[src] += n; o._w += AVG(row) * n;
  };
  for (const r of depot) add(r, 'depot');
  for (const r of cargo) add(r, 'cargo');
  for (const o of Object.values(out)) { o.avg_quality = o.quantity ? Math.round(o._w / o.quantity) : 50; delete o._w; }
  return out;
}

// Consume { [name]: qty } from depot (if baseId) then cargo, lowest quality
// first. Throws 400 if short. Returns { taken: [{resource_type_id, quantity,
// stat_*}], stats: weighted-average stat tuple of everything consumed }.
export async function consumeMaterials(client, userId, baseId, needs) {
  const taken = [];
  let w = 0, sp = 0, ss = 0, spo = 0, sd = 0;
  for (const [name, needRaw] of Object.entries(needs || {})) {
    const need = Math.max(0, Math.floor(Number(needRaw) || 0));
    if (need <= 0) continue;
    const rt = await client.query(`SELECT id FROM resource_types WHERE name = $1`, [name]);
    const rid = rt.rows[0]?.id;
    if (!rid) throw Object.assign(new Error(`Unknown material ${name}`), { statusCode: 500 });
    const order = `ORDER BY (COALESCE(stat_purity,50)+COALESCE(stat_stability,50)+COALESCE(stat_potency,50)+COALESCE(stat_density,50)) ASC`;
    const depotRows = baseId ? (await client.query(`SELECT id, quantity, stat_purity, stat_stability, stat_potency, stat_density, 'depot' AS src FROM player_base_inventory WHERE base_id = $1 AND resource_type_id = $2 ${order} FOR UPDATE`, [baseId, rid])).rows : [];
    const cargoRows = (await client.query(`SELECT id, quantity, stat_purity, stat_stability, stat_potency, stat_density, 'cargo' AS src FROM player_resource_inventory WHERE user_id = $1 AND item_type = 'resource' AND resource_type_id = $2 ${order} FOR UPDATE`, [userId, rid])).rows;
    const rows = [...depotRows, ...cargoRows];
    const have = rows.reduce((a, s) => a + Number(s.quantity), 0);
    if (have < need) throw Object.assign(new Error(`Needs ${need} ${name} (you have ${have} in depot + cargo)`), { statusCode: 400, code: 'short', material: name, need, have });
    let left = need;
    for (const s of rows) {
      if (left <= 0) break;
      const take = Math.min(left, Number(s.quantity));
      const table = s.src === 'depot' ? 'player_base_inventory' : 'player_resource_inventory';
      if (take >= Number(s.quantity)) await client.query(`DELETE FROM ${table} WHERE id = $1`, [s.id]);
      else await client.query(`UPDATE ${table} SET quantity = quantity - $1 WHERE id = $2`, [take, s.id]);
      taken.push({ resource_type_id: rid, name, quantity: take, stat_purity: s.stat_purity ?? 50, stat_stability: s.stat_stability ?? 50, stat_potency: s.stat_potency ?? 50, stat_density: s.stat_density ?? 50 });
      w += take; sp += Number(s.stat_purity ?? 50) * take; ss += Number(s.stat_stability ?? 50) * take; spo += Number(s.stat_potency ?? 50) * take; sd += Number(s.stat_density ?? 50) * take;
      left -= take;
    }
  }
  const stats = w > 0
    ? { stat_purity: Math.round(sp / w), stat_stability: Math.round(ss / w), stat_potency: Math.round(spo / w), stat_density: Math.round(sd / w) }
    : { stat_purity: 50, stat_stability: 50, stat_potency: 50, stat_density: 50 };
  return { taken, stats };
}

// Put a resource stack into a base depot (merging on the stat tuple).
// Returns false (and does nothing) if the depot lacks room.
export async function depotAdd(client, baseId, resourceTypeId, quantity, stats, capacity) {
  const vol = Number(quantity) * Math.max(1, Number(stats.stat_density ?? 50)) / 100;
  const used = await client.query(`SELECT COALESCE(SUM(quantity * GREATEST(COALESCE(stat_density,50),1) / 100.0),0) AS v FROM player_base_inventory WHERE base_id = $1`, [baseId]);
  if (capacity <= 0 || Number(used.rows[0].v) + vol > capacity) return false;
  const ex = await client.query(`SELECT id FROM player_base_inventory WHERE base_id = $1 AND resource_type_id = $2 AND stat_purity IS NOT DISTINCT FROM $3 AND stat_stability IS NOT DISTINCT FROM $4 AND stat_potency IS NOT DISTINCT FROM $5 AND stat_density IS NOT DISTINCT FROM $6`,
    [baseId, resourceTypeId, stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density]);
  if (ex.rows[0]) await client.query(`UPDATE player_base_inventory SET quantity = quantity + $1 WHERE id = $2`, [quantity, ex.rows[0].id]);
  else await client.query(`INSERT INTO player_base_inventory (base_id, resource_type_id, quantity, stat_purity, stat_stability, stat_potency, stat_density) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [baseId, resourceTypeId, quantity, stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density]);
  return true;
}

// Add an ITEM stack to cargo, merging with a stack of the same item_id and
// identical item_data (vendor supplies carry {} so crafted fuel cells merge
// with bought ones). No cargo-volume check: items count 1 volume per unit
// and callers check room first.
export async function addItemStack(client, userId, itemId, quantity, itemData = {}) {
  const data = JSON.stringify(itemData || {});
  const ex = await client.query(`SELECT id FROM player_resource_inventory WHERE user_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data = $3::jsonb LIMIT 1`, [userId, itemId, data]);
  if (ex.rows[0]) { await client.query(`UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`, [quantity, ex.rows[0].id]); return; }
  const slot = await client.query(`SELECT COALESCE(MAX(slot_index), -1) + 1 AS s FROM player_resource_inventory WHERE user_id = $1`, [userId]);
  await client.query(`INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data) VALUES ($1, 'item', $2, $3, $4, $5::jsonb)`, [userId, itemId, quantity, slot.rows[0].s, data]);
}
