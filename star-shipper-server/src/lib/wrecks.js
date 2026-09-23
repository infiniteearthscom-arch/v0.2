// wrecks.js -- server-owned wreck creation + cargo helpers (combat Phase 4b,
// "stakes"). Wreck ROWS are only ever created here, by the server, at the
// moment it destroys a player ship (/fitting/enter-pod, /fitting/lose-ship)
// -- never from a client request (the old /resources/wrecks/spawn let a
// client mint credits; it is gone). Pirate kills don't make rows at all:
// their loot is validated against the spawn manifest by /combat/claim-loot.
//
// A player wreck holds what the lost hull was carrying:
//   modules   -- every fitted module, with its quality (flagship + wingman)
//   resources -- FLAGSHIP only: EJECT_CARGO_FRACTION of every resource
//                stack in the pilot's cargo (cargo is fleet-pooled, so the
//                flagship popping is "the hold breached")
// Anyone in the system can salvage it by flying into pickup range
// (/resources/wrecks/claim, first-touch). It expires after WRECK_TTL_MIN.

export const SOL_SYSTEM_ID = '00000000-0000-0000-0000-000000000001';
export const WRECK_TTL_MIN = 30;
export const EJECT_CARGO_FRACTION = 0.5;

// star_systems row for a procedural id, creating a minimal one if the
// player died somewhere nobody has docked yet (ensure-body normally
// registers systems on first dock).
export async function resolveWreckSystemId(client, systemProceduralId) {
  if (!systemProceduralId) return null;
  if (systemProceduralId === 'sol') return SOL_SYSTEM_ID;
  const existing = await client.query(`SELECT id FROM star_systems WHERE procedural_id = $1`, [systemProceduralId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query(
    `INSERT INTO star_systems (name, galaxy_x, galaxy_y, star_type, star_size, danger_level, procedural_id)
     VALUES ($1, 0, 0, 'yellow_star', 1.0, 0, $1) RETURNING id`,
    [systemProceduralId]
  );
  return created.rows[0].id;
}

// fitted_modules JSONB → wreck module entries. Keeps the instance quality
// (what the pilot actually had) and the display name.
export function modulesFromFitted(fitted) {
  const out = [];
  for (const fv of Object.values(fitted || {})) {
    if (!fv?.module_type_id) continue;
    out.push({
      module_type_id: fv.module_type_id,
      name: fv.name || fv.module_type_id,
      quality: fv.quality || null,
      tier: fv.tier || null,
    });
  }
  return out;
}

// Remove `fraction` of every resource stack from the pilot's cargo and
// return the removed amounts as wreck entries. Rounds DOWN per stack, so
// tiny stacks survive; stacks that hit 0 are deleted.
export async function ejectResources(client, userId, fraction) {
  const stacks = await client.query(
    `SELECT pri.id, pri.resource_type_id, pri.quantity,
            pri.stat_purity, pri.stat_stability, pri.stat_potency, pri.stat_density,
            rt.name AS resource_name
       FROM player_resource_inventory pri
       JOIN resource_types rt ON rt.id = pri.resource_type_id
      WHERE pri.user_id = $1 AND pri.resource_type_id IS NOT NULL AND pri.quantity > 0
      FOR UPDATE OF pri`,
    [userId]
  );
  const out = [];
  for (const s of stacks.rows) {
    const take = Math.floor(Number(s.quantity) * fraction);
    if (take <= 0) continue;
    const left = Number(s.quantity) - take;
    if (left > 0) {
      await client.query(`UPDATE player_resource_inventory SET quantity = $1, updated_at = NOW() WHERE id = $2`, [left, s.id]);
    } else {
      await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
    }
    out.push({
      resource_type_id: s.resource_type_id,
      resource_name: s.resource_name,
      quantity: take,
      stats: {
        stat_purity: s.stat_purity, stat_stability: s.stat_stability,
        stat_potency: s.stat_potency, stat_density: s.stat_density,
      },
    });
  }
  return out;
}

// Insert the wreck row. contents = { modules, resources, credits?, ship_name, source_name }.
// Eject whole ITEM stacks (contract freight, 2026-09-22) into a wreck.
// Returns [{ item_id, quantity, item_data }] and deletes the stacks.
export async function ejectItems(client, userId, itemIds) {
  if (!itemIds?.length) return [];
  const r = await client.query(
    `SELECT id, item_id, quantity, item_data FROM player_resource_inventory
      WHERE user_id = $1 AND item_type = 'item' AND item_id = ANY($2::text[]) AND quantity > 0
      FOR UPDATE`, [userId, itemIds]);
  const out = [];
  for (const s of r.rows) {
    await client.query(`DELETE FROM player_resource_inventory WHERE id = $1`, [s.id]);
    out.push({ item_id: s.item_id, quantity: Number(s.quantity), item_data: s.item_data || {} });
  }
  return out;
}

export async function insertWreck(client, { systemProceduralId, x, y, contents, source }) {
  const systemId = await resolveWreckSystemId(client, systemProceduralId);
  if (!systemId) return null;
  const r = await client.query(
    `INSERT INTO wrecks (system_id, x, y, contents, source, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::INTERVAL)
     RETURNING id, x, y, contents, source, expires_at`,
    [systemId, Number(x) || 0, Number(y) || 0, JSON.stringify(contents), source, WRECK_TTL_MIN]
  );
  return r.rows[0];
}

// --- cargo insert helpers (shared by wreck claim + elite drops) ---

async function nextFreeSlot(client, userId) {
  const r = await client.query(
    `SELECT s.slot FROM generate_series(
       0, COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)
     ) s(slot)
     WHERE s.slot NOT IN (SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL)
     ORDER BY s.slot ASC LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.slot ?? 0;
}

// One module item into cargo. Returns the module name, or null if the
// type no longer exists.
export async function insertModuleItem(client, userId, moduleTypeId, quality) {
  const mt = await client.query(`SELECT name, slot_type FROM module_types WHERE id = $1`, [moduleTypeId]);
  if (!mt.rows[0]) return null;
  const slot = await nextFreeSlot(client, userId);
  const itemData = {
    slot_type: mt.rows[0].slot_type,
    quality: quality || { purity: 50, stability: 50, potency: 50, density: 50 },
    source: 'loot', // valued from materials x tier (lib/pricing.js)
  };
  await client.query(
    `INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
     VALUES ($1, 'item', $2, 1, $3, $4)`,
    [userId, moduleTypeId, slot, JSON.stringify(itemData)]
  );
  return mt.rows[0].name;
}

// Merge a resource stack into cargo by (type + stat tuple), else new slot.
export async function addResourceStack(client, userId, resourceTypeId, quantity, stats) {
  const st = stats || {};
  const q = Number(quantity) || 0;
  if (q <= 0) return;
  const existing = await client.query(
    `SELECT id FROM player_resource_inventory
      WHERE user_id = $1 AND resource_type_id = $2
        AND stat_purity IS NOT DISTINCT FROM $3 AND stat_stability IS NOT DISTINCT FROM $4
        AND stat_potency IS NOT DISTINCT FROM $5 AND stat_density IS NOT DISTINCT FROM $6`,
    [userId, resourceTypeId, st.stat_purity ?? null, st.stat_stability ?? null, st.stat_potency ?? null, st.stat_density ?? null]
  );
  if (existing.rows[0]) {
    await client.query(`UPDATE player_resource_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`, [q, existing.rows[0].id]);
    return;
  }
  const slot = await nextFreeSlot(client, userId);
  await client.query(
    `INSERT INTO player_resource_inventory
       (user_id, resource_type_id, quantity, stat_purity, stat_stability, stat_potency, stat_density, slot_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, resourceTypeId, q, st.stat_purity ?? 50, st.stat_stability ?? 50, st.stat_potency ?? 50, st.stat_density ?? 50, slot]
  );
}
