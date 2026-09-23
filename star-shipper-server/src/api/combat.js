// combat.js -- server persistence boundary for the client-local combat sim.
// The real-time fight stays client-side. This router:
//   * SERVES the spawn manifest (Phase 2 enemy template system,
//     src/game/enemyManifest.js) -- the client spawns exactly what it is
//     handed; there is no client-side pirate generation any more.
//   * validates loot claims against that same manifest (combat F4 /
//     spec A3) so loot is capped to the real spawn. Replaces the old
//     trust-the-client /fitting/award-loot (removed -- it minted credits).
//
// Claim tracking is IN-MEMORY, mirroring the client's spawn model: enemies
// respawn when the player re-enters a system, so claims reset on the
// enter-system call the client makes when it spawns the system's pirates.
// A server restart wipes the maps -- worst case a player can re-claim one
// spawn's wrecks, which is noise at these stakes.

import express from 'express';
import { authMiddleware, isDevAccount } from '../auth/index.js';
import { query, queryOne } from '../db/index.js';
import { getSystemManifest, invalidateManifests, getCatalog, buildAmbushFleet } from '../game/enemyManifest.js';
import { insertModuleItem } from '../lib/wrecks.js';
import { queryAll } from '../db/index.js';
import { offerByKey, pathBetween } from '../game/contracts.js';

// ---- contested-haul ambushes (2026-09-22) ----
// userId -> Set(contractId) that already got their one ambush;
// userId -> systemId -> Map(enemyId -> claim entry) for loot validation.
const ambushDoneByUser = new Map();
const ambushIndexByUser = new Map();
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
async function maybeAmbush(userId, systemId) {
  const rows = await queryAll(
    `SELECT id, contract_key, tier, origin_system_id, dest_system_id, cargo_label
       FROM player_contracts WHERE user_id = $1 AND status = 'active' AND contract_type = 'haul'`, [userId]);
  if (!rows.length) return null;
  let done = ambushDoneByUser.get(userId);
  if (!done) { done = new Set(); ambushDoneByUser.set(userId, done); }
  for (const c of rows) {
    if (done.has(c.id)) continue;
    const offer = offerByKey(c.contract_key, { anyBucket: true });
    if (!offer?.contested) continue;
    if (systemId === c.origin_system_id) continue;
    const path = pathBetween(c.origin_system_id, c.dest_system_id) || [];
    if (!path.includes(systemId)) continue;
    done.add(c.id);
    const fleetId = `ambush_${String(c.id).slice(0, 8)}`;
    const built = await buildAmbushFleet({ systemId, tier: c.tier, seed: strHash(`${c.id}|${systemId}`), fleetId, label: c.cargo_label });
    let bySystem = ambushIndexByUser.get(userId);
    if (!bySystem) { bySystem = new Map(); ambushIndexByUser.set(userId, bySystem); }
    bySystem.set(systemId, built.claimIndex);
    return { ...built, contract: c };
  }
  return null;
}

const router = express.Router();
router.use(authMiddleware);

// userId -> systemId -> Set(claimed enemy ids). Bounded by concurrent
// players x systems visited since restart; trivially small.
const claimsByUser = new Map();

// userId -> systemId -> ms timestamp of the last claim-set re-arm.
// Phase 0 (2026-09-04): enter-system used to reset claims on EVERY
// call, so hop-out/hop-in re-earned a full system's loot instantly —
// a scriptable farm loop. Now a system's loot manifest only re-arms
// after RESPAWN_COOLDOWN; within the window, previously-claimed
// enemies stay claimed (unclaimed ones remain claimable, so partial
// clears keep their remaining loot). In-memory: a server restart
// re-arms everything, same accepted noise as the claim sets.
const lastRearmByUser = new Map();
const RESPAWN_COOLDOWN_MS = 15 * 60 * 1000;

function getClaimSet(userId, systemId) {
  let bySystem = claimsByUser.get(userId);
  if (!bySystem) { bySystem = new Map(); claimsByUser.set(userId, bySystem); }
  let claimed = bySystem.get(systemId);
  if (!claimed) { claimed = new Set(); bySystem.set(systemId, claimed); }
  return claimed;
}

// ============================================
// POST /combat/enter-system -- hand the client this system's spawn
// manifest AND re-arm this player's loot claims for it (subject to the
// respawn cooldown). The client calls it whenever it (re)spawns the
// system's pirates, which is exactly when kills become re-earnable.
// Known gap: nothing verifies the fight happened before a claim -- that
// would need server-side combat. Loot is capped per visit to the real
// spawn; that is this endpoint's whole job on the claims side.
// ============================================
router.post('/enter-system', async (req, res) => {
  try {
    const { system_id } = req.body;
    if (!system_id || typeof system_id !== 'string') {
      return res.status(400).json({ error: 'system_id required' });
    }
    const entry = await getSystemManifest(system_id);
    if (!entry) return res.status(404).json({ error: 'Unknown system' });

    let rearms = lastRearmByUser.get(req.user.id);
    if (!rearms) { rearms = new Map(); lastRearmByUser.set(req.user.id, rearms); }
    const last = rearms.get(system_id) || 0;
    const now = Date.now();
    let reArmed = false;
    let retryIn = 0;
    if (now - last < RESPAWN_COOLDOWN_MS) {
      // Too soon — keep the existing claim set. The client still spawns
      // the manifest's pirates; already-claimed kills just pay nothing
      // until the cooldown lapses (claim returns 409, wreck is dropped
      // client-side).
      retryIn = Math.ceil((RESPAWN_COOLDOWN_MS - (now - last)) / 1000);
    } else {
      rearms.set(system_id, now);
      const bySystem = claimsByUser.get(req.user.id);
      if (bySystem) bySystem.delete(system_id);
      reArmed = true;
    }
    // Contested haul on board and this system is on the route -> add a
    // per-user raider fleet to the manifest (once per contract).
    let manifest = entry.manifest;
    try {
      const ambush = await maybeAmbush(req.user.id, system_id);
      if (ambush) {
        manifest = {
          ...entry.manifest,
          fleets: [...entry.manifest.fleets, ambush.fleet],
          enemies: [...entry.manifest.enemies, ...ambush.enemies],
          ambush: { contract_id: ambush.contract.id, cargo_label: ambush.contract.cargo_label, fleet_id: ambush.fleet.id },
        };
      }
    } catch (e) { console.warn('ambush check failed:', e.message); }
    res.json({
      success: true,
      re_armed: reArmed,
      ...(retryIn ? { retry_in_seconds: retryIn } : {}),
      manifest,
    });
  } catch (e) {
    console.error('Error entering system:', e);
    res.status(500).json({ error: 'Failed to load system manifest' });
  }
});

// ============================================
// GET /combat/manifest/:systemId -- read-only view of a system's spawn
// (debugging / tooling). Does not touch claims.
// ============================================
router.get('/manifest/:systemId', async (req, res) => {
  try {
    const entry = await getSystemManifest(req.params.systemId);
    if (!entry) return res.status(404).json({ error: 'Unknown system' });
    res.json(entry.manifest);
  } catch (e) {
    console.error('Error reading manifest:', e);
    res.status(500).json({ error: 'Failed to load system manifest' });
  }
});

// ============================================
// POST /combat/reload-templates -- dev-only: drop the cached catalog +
// manifests so edited enemy_templates rows take effect without a
// redeploy. Claims are untouched.
// ============================================
router.post('/reload-templates', (req, res) => {
  if (!isDevAccount(req.user)) return res.status(403).json({ error: 'Dev account only' });
  invalidateManifests();
  res.json({ success: true });
});

// ============================================
// POST /combat/claim-loot { system_id, enemy_id } -- validate a wreck
// salvage against the manifest and pay the SERVER's number (the
// client-side wreck credits are display-only). 404 unknown enemy,
// 409 already claimed this visit.
// ============================================
router.post('/claim-loot', async (req, res) => {
  try {
    const { system_id, enemy_id } = req.body;
    if (!system_id || typeof system_id !== 'string' || !enemy_id || typeof enemy_id !== 'string') {
      return res.status(400).json({ error: 'system_id and enemy_id required' });
    }

    const system = await getSystemManifest(system_id);
    const entry = system?.claimIndex.get(enemy_id) || ambushIndexByUser.get(req.user.id)?.get(system_id)?.get(enemy_id);
    if (!entry) {
      return res.status(404).json({ error: 'No such enemy in this system' });
    }

    const claimed = getClaimSet(req.user.id, system_id);
    if (claimed.has(enemy_id)) {
      return res.status(409).json({ error: 'Already salvaged' });
    }
    // Mark BEFORE the await so a concurrent duplicate request 409s
    // instead of double-paying; roll back if the credit write fails so
    // the client's retry isn't locked out of real loot.
    claimed.add(enemy_id);
    let user;
    const items = [];
    try {
      await query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [entry.credits, req.user.id]);
      // Phase 4b elite drops: the template's loot_table
      //   [{ module_type_id, chance (0-1), quality: [min, max] }, ...]
      // rolls straight into cargo on claim (the client's pirate wreck is
      // the pickup; no server row needed). Server-side roll, so the
      // client can't fish for a better drop.
      if (entry.templateId) {
        const tmpl = (await getCatalog()).byId.get(entry.templateId);
        const table = Array.isArray(tmpl?.loot_table) ? tmpl.loot_table : [];
        for (const drop of table) {
          if (!drop?.module_type_id) continue;
          if (Math.random() > (drop.chance ?? 1)) continue;
          const [qmin, qmax] = Array.isArray(drop.quality) ? drop.quality : [60, 85];
          const q = Math.floor(qmin + Math.random() * Math.max(0, qmax - qmin + 1));
          const quality = { purity: q, stability: q, potency: q, density: q };
          const name = await insertModuleItem({ query }, req.user.id, drop.module_type_id, quality);
          if (name) items.push({ name, quality: q });
        }
      }
      user = await queryOne(`SELECT credits FROM users WHERE id = $1`, [req.user.id]);
    } catch (e) {
      claimed.delete(enemy_id);
      throw e;
    }

    res.json({
      success: true,
      awarded: entry.credits,
      is_flagship: entry.isFlagship,
      items,
      credits: parseInt(user.credits),
    });
  } catch (e) {
    console.error('Error claiming loot:', e);
    res.status(500).json({ error: 'Failed to claim loot' });
  }
});

export default router;
