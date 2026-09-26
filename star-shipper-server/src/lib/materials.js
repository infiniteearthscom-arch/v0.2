// lib/materials.js -- stacks across the fleet CARGO and a base DEPOT (2026-09-26).
//
// The depot (player_base_inventory) mirrors cargo (player_resource_inventory)
// since 089: resource OR item stacks, each with a slot position. Everything
// at a base draws from the depot first, then cargo, lowest quality first,
// and reports the quantity-weighted average stats of what it took so
// outputs inherit input quality. Shared by api/foundry.js, api/bases.js,
// api/refining.js and api/resources.js (/craft).

const AVG = (s) => ((Number(s.stat_purity ?? 50) + Number(s.stat_stability ?? 50) + Number(s.stat_potency ?? 50) + Number(s.stat_density ?? 50)) / 4);
const Q = (client) => (sql, p) => client.query(sql, p).then(r => r.rows);

// Depot volume: resources by density (like cargo), items 1 unit each.
export async function depotUsed(client, baseId) {
  const r = await client.query(`
    SELECT COALESCE(SUM(CASE WHEN item_type = 'item' THEN quantity ELSE quantity * GREATEST(COALESCE(stat_density,50),1) / 100.0 END), 0) AS v
      FROM player_base_inventory WHERE base_id = $1`, [baseId]);
  return Number(r.rows[0]?.v || 0);
}
export const depotCapacityOf = (base) => Object.values(base?.fitted_modules || {}).reduce((a, m) => a + (Number(m.stats?.depot_capacity) || 0), 0);

export async function depotNextSlot(client, baseId) {
  const r = await client.query(`SELECT COALESCE(MAX(slot_index), -1) + 1 AS s FROM player_base_inventory WHERE base_id = $1`, [baseId]);
  return Number(r.rows[0]?.s || 0);
}

// Every depot stack, shaped like a cargo stack for the client grid.
export async function depotStacks(client, baseId) {
  const rows = await Q(client)(`
    SELECT bi.*, rt.name AS resource_name, rt.category, rt.rarity, rt.base_price,
           idef.name AS item_name, idef.category AS item_category, idef.icon AS item_icon, idef.max_stack AS item_max_stack,
           mt.stats AS module_stats, mt.tier AS module_tier
      FROM player_base_inventory bi
      LEFT JOIN resource_types rt ON rt.id = bi.resource_type_id
      LEFT JOIN item_definitions idef ON idef.id = bi.item_id
      LEFT JOIN module_types mt ON mt.id = bi.item_id
     WHERE bi.base_id = $1 ORDER BY bi.slot_index NULLS LAST, bi.created_at`, [baseId]);
  return rows.map(s => s.item_type === 'item' ? ({
    id: s.id, source: 'depot', item_type: 'item', item_id: s.item_id, item_name: s.item_name || s.item_id, item_category: s.item_category, item_icon: s.item_icon,
    item_data: { ...(s.item_data || {}), ...(s.module_stats ? { base_stats: s.module_stats } : {}), ...(s.module_tier != null ? { tier: s.module_tier } : {}) },
    item_max_stack: s.item_max_stack || 1, quantity: Number(s.quantity), slot_index: s.slot_index,
  }) : ({
    id: s.id, source: 'depot', item_type: 'resource', resource_type_id: s.resource_type_id, resource_name: s.resource_name, category: s.category, rarity: s.rarity, base_price: s.base_price,
    quantity: Number(s.quantity), slot_index: s.slot_index, avg_quality: Math.round(AVG(s)),
    stats: { purity: s.stat_purity, stability: s.stat_stability, potency: s.stat_potency, density: s.stat_density },
  }));
}

// { [name]: { quantity, avg_quality, depot, cargo } } for every RESOURCE the
// pilot holds in cargo or in the given base's depot.
export async function availableMaterials(client, userId, baseId) {
  const q = Q(client);
  const cargo = await q(`
    SELECT rt.name, pri.quantity, pri.stat_purity, pri.stat_stability, pri.stat_potency, pri.stat_density
      FROM player_resource_inventory pri JOIN resource_types rt ON rt.id = pri.resource_type_id
     WHERE pri.user_id = $1 AND pri.item_type = 'resource' AND pri.quantity > 0`, [userId]);
  const depot = baseId ? await q(`
    SELECT rt.name, bi.quantity, bi.stat_purity, bi.stat_stability, bi.stat_potency, bi.stat_density
      FROM player_base_inventory bi JOIN resource_types rt ON rt.id = bi.resource_type_id
     WHERE bi.base_id = $1 AND bi.item_type = 'resource' AND bi.quantity > 0`, [baseId]) : [];
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

// Consume { [name]: qty } of RESOURCES from depot (if baseId) then cargo,
// lowest quality first. Throws 400 if short. Returns { taken, stats }.
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
    const depotRows = baseId ? (await client.query(`SELECT id, quantity, stat_purity, stat_stability, stat_potency, stat_density, 'depot' AS src FROM player_base_inventory WHERE base_id = $1 AND item_type = 'resource' AND resource_type_id = $2 ${order} FOR UPDATE`, [baseId, rid])).rows : [];
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

// Put a RESOURCE stack into a base depot (merging on the stat tuple).
// Returns false (and does nothing) if the depot lacks room.
export async function depotAdd(client, baseId, resourceTypeId, quantity, stats, capacity) {
  const vol = Number(quantity) * Math.max(1, Number(stats.stat_density ?? 50)) / 100;
  if (capacity <= 0 || (await depotUsed(client, baseId)) + vol > capacity) return false;
  const ex = await client.query(`SELECT id FROM player_base_inventory WHERE base_id = $1 AND item_type = 'resource' AND resource_type_id = $2 AND stat_purity IS NOT DISTINCT FROM $3 AND stat_stability IS NOT DISTINCT FROM $4 AND stat_potency IS NOT DISTINCT FROM $5 AND stat_density IS NOT DISTINCT FROM $6`,
    [baseId, resourceTypeId, stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density]);
  if (ex.rows[0]) await client.query(`UPDATE player_base_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`, [quantity, ex.rows[0].id]);
  else await client.query(`INSERT INTO player_base_inventory (base_id, item_type, resource_type_id, quantity, stat_purity, stat_stability, stat_potency, stat_density, slot_index) VALUES ($1,'resource',$2,$3,$4,$5,$6,$7,$8)`,
    [baseId, resourceTypeId, quantity, stats.stat_purity, stats.stat_stability, stats.stat_potency, stats.stat_density, await depotNextSlot(client, baseId)]);
  return true;
}

// Put an ITEM stack into a base depot (merging on item_id + item_data). Items
// take 1 depot unit each. Returns false if the depot lacks room.
export async function depotAddItem(client, baseId, itemId, quantity, itemData, capacity) {
  const q = Number(quantity) || 0;
  if (q <= 0) return true;
  if (capacity <= 0 || (await depotUsed(client, baseId)) + q > capacity) return false;
  const data = JSON.stringify(itemData || {});
  const ex = await client.query(`SELECT id FROM player_base_inventory WHERE base_id = $1 AND item_type = 'item' AND item_id = $2 AND item_data = $3::jsonb LIMIT 1`, [baseId, itemId, data]);
  if (ex.rows[0]) await client.query(`UPDATE player_base_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`, [q, ex.rows[0].id]);
  else await client.query(`INSERT INTO player_base_inventory (base_id, item_type, item_id, item_data, quantity, slot_index) VALUES ($1,'item',$2,$3::jsonb,$4,$5)`, [baseId, itemId, data, q, await depotNextSlot(client, baseId)]);
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

// Lock + load ONE resource stack from cargo or (source 'depot') the base's
// depot. Returns null when missing. Shape matches api/refining.js loadStack.
export async function loadResourceStackAny(client, userId, baseId, ref) {
  const source = ref?.source === 'depot' ? 'depot' : 'cargo';
  const id = String(ref?.id || ref?.stack_id || '');
  if (!id) return null;
  if (source === 'depot') {
    if (!baseId) return null;
    const r = await client.query(`
      SELECT bi.id, bi.quantity, bi.resource_type_id, bi.stat_purity, bi.stat_stability, bi.stat_potency, bi.stat_density,
             rt.name AS resource_name, rt.category, rt.rarity, rt.base_price
        FROM player_base_inventory bi JOIN resource_types rt ON rt.id = bi.resource_type_id
       WHERE bi.id = $1 AND bi.base_id = $2 AND bi.item_type = 'resource' FOR UPDATE OF bi`, [id, baseId]);
    return r.rows[0] ? { ...r.rows[0], source: 'depot' } : null;
  }
  const r = await client.query(`
    SELECT pri.id, pri.quantity, pri.resource_type_id, pri.stat_purity, pri.stat_stability, pri.stat_potency, pri.stat_density,
           rt.name AS resource_name, rt.category, rt.rarity, rt.base_price
      FROM player_resource_inventory pri JOIN resource_types rt ON rt.id = pri.resource_type_id
     WHERE pri.id = $1 AND pri.user_id = $2 AND pri.item_type = 'resource' FOR UPDATE OF pri`, [id, userId]);
  return r.rows[0] ? { ...r.rows[0], source: 'cargo' } : null;
}
export async function debitStackAny(client, stack, quantity) {
  const table = stack.source === 'depot' ? 'player_base_inventory' : 'player_resource_inventory';
  if (quantity >= Number(stack.quantity)) await client.query(`DELETE FROM ${table} WHERE id = $1`, [stack.id]);
  else await client.query(`UPDATE ${table} SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [quantity, stack.id]);
}
