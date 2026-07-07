// combat.js -- server persistence boundary for the client-local combat sim
// (combat F4 / spec A3 "server-validated loot"). The real-time fight stays
// client-side; this router only validates its OUTCOMES against the
// deterministic pirate manifest (src/game/pirateManifest.js) so loot claims
// are capped to the real spawn. Replaces the old trust-the-client
// /fitting/award-loot (removed -- it let DevTools mint credits).
//
// Claim tracking is IN-MEMORY, mirroring the client's spawn model: enemies
// respawn when the player re-enters a system, so claims reset on the
// enter-system ping the client fires from its pirate-spawn effect. A server
// restart wipes the maps -- worst case a player can re-claim one spawn's
// wrecks, which is noise at these stakes.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne } from '../db/index.js';
import { getSystemManifest } from '../game/pirateManifest.js';

const router = express.Router();
router.use(authMiddleware);

// userId -> systemId -> Set(claimed enemy ids). Bounded by concurrent
// players x systems visited since restart; trivially small.
const claimsByUser = new Map();

function getClaimSet(userId, systemId) {
  let bySystem = claimsByUser.get(userId);
  if (!bySystem) { bySystem = new Map(); claimsByUser.set(userId, bySystem); }
  let claimed = bySystem.get(systemId);
  if (!claimed) { claimed = new Set(); bySystem.set(systemId, claimed); }
  return claimed;
}

// ============================================
// POST /combat/enter-system -- reset this player's loot claims for a
// system. The client fires it whenever it (re)spawns the system's
// pirates, which is exactly when kills become re-earnable. Known gap:
// nothing verifies the fight happened before a claim -- that would
// need server-side combat. This endpoint's job is only to cap total
// loot per visit to the real spawn.
// ============================================
router.post('/enter-system', (req, res) => {
  const { system_id } = req.body;
  if (!system_id || typeof system_id !== 'string') {
    return res.status(400).json({ error: 'system_id required' });
  }
  const bySystem = claimsByUser.get(req.user.id);
  if (bySystem) bySystem.delete(system_id);
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

    const manifest = getSystemManifest(system_id);
    const entry = manifest?.get(enemy_id);
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
    try {
      await query(`UPDATE users SET credits = credits + $1 WHERE id = $2`, [entry.credits, req.user.id]);
      user = await queryOne(`SELECT credits FROM users WHERE id = $1`, [req.user.id]);
    } catch (e) {
      claimed.delete(enemy_id);
      throw e;
    }

    res.json({
      success: true,
      awarded: entry.credits,
      is_flagship: entry.isFlagship,
      credits: parseInt(user.credits),
    });
  } catch (e) {
    console.error('Error claiming loot:', e);
    res.status(500).json({ error: 'Failed to claim loot' });
  }
});

export default router;
