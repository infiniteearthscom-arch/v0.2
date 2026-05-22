// Research API -- Civ-style tech tree with strict prereqs.
//
// MODEL
// -----
// Single shared RP pool stored on users.research_points. RP trickles
// passively at RP_PER_MIN (1/min) -- the on-read math is
//   live_rp = stored_rp + minutes_since(users.research_points_updated_at)
// We commit (write stored_rp + bump updated_at) only on spend (unlock).
// Until colonies + Research Lab buildings land, this is the only RP
// source; Phase 2 will swap to "base trickle + per-building bonus."
//
// Unlocks happen instantly on spend -- no additional "research takes
// N days" timer. The cost itself (and the climbing 4x per-tier curve)
// IS the time investment.
//
// Tree shape: 5 trees x 3 tiers. Tier 1 has no prereqs (entry nodes).
// Tier 2 requires its tier-1 node; tier 3 requires its tier-2.
// Strict prereqs are encoded in tech_definitions.prerequisites JSONB.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryAll, queryOne, transaction } from '../db/index.js';

const router = express.Router();

const RP_PER_MIN = 1;

// live_rp = stored_rp + minutes_since(updated_at) * RP_PER_MIN.
// Returns integers (RP is whole numbers in the UI).
function liveRpFromRow(userRow, now) {
  const stored = userRow.research_points || 0;
  const updated = new Date(userRow.research_points_updated_at);
  const elapsedMin = Math.max(0, (now.getTime() - updated.getTime()) / 60000);
  return Math.floor(stored + elapsedMin * RP_PER_MIN);
}

// Commit accrued RP to the DB and reset the checkpoint. Returns the
// new stored RP. Caller passes an already-running client (transactional).
async function commitRp(client, userId, now) {
  const userRow = await client.query(
    `SELECT research_points, research_points_updated_at FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  const live = liveRpFromRow(userRow.rows[0], now);
  await client.query(
    `UPDATE users SET research_points = $1, research_points_updated_at = $2 WHERE id = $3`,
    [live, now, userId]
  );
  return live;
}

// ============================================
// GET /api/research  -- full snapshot
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const [userRow, defs, unlocked] = await Promise.all([
      queryOne(`SELECT research_points, research_points_updated_at FROM users WHERE id = $1`, [userId]),
      queryAll(`SELECT * FROM tech_definitions ORDER BY tree ASC, tier ASC, sort_order ASC`),
      queryAll(`SELECT tech_id, unlocked_at FROM player_research WHERE user_id = $1`, [userId]),
    ]);

    const unlockedSet = new Set(unlocked.map(u => u.tech_id));
    const liveRp = liveRpFromRow(userRow, now);

    // Decorate each tech with its locked / available / unlocked status.
    // 'locked' = prereqs not all unlocked. 'available' = prereqs met + not yet unlocked.
    const techs = defs.map(d => {
      const prereqs = Array.isArray(d.prerequisites) ? d.prerequisites : [];
      const isUnlocked = unlockedSet.has(d.id);
      const prereqsMet = prereqs.every(p => unlockedSet.has(p));
      let status;
      if (isUnlocked) status = 'unlocked';
      else if (!prereqsMet) status = 'locked';
      else status = 'available';
      return {
        id: d.id,
        tree: d.tree,
        tier: d.tier,
        name: d.name,
        description: d.description,
        rp_cost: d.rp_cost,
        prerequisites: prereqs,
        unlocks: d.unlocks,
        sort_order: d.sort_order,
        status,
        unlocked_at: unlocked.find(u => u.tech_id === d.id)?.unlocked_at || null,
      };
    });

    res.json({
      techs,
      research_points: liveRp,
      rp_per_min: RP_PER_MIN,
      now: now.toISOString(),
    });
  } catch (error) {
    console.error('Error fetching research:', error);
    res.status(500).json({ error: 'Failed to fetch research' });
  }
});

// ============================================
// POST /api/research/unlock
// body: { tech_id }
// ============================================
// Validates: tech exists, not already unlocked, all prereqs unlocked,
// live_rp >= rp_cost. Deducts cost + inserts player_research row.
// Returns the updated RP + the unlock's payload so the client can
// react (e.g. unlock fleet_cap bump, refresh module list).
router.post('/unlock', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tech_id } = req.body;
    if (!tech_id) return res.status(400).json({ error: 'tech_id required' });

    const out = await transaction(async (client) => {
      const now = new Date();

      const techRes = await client.query(
        `SELECT * FROM tech_definitions WHERE id = $1`, [tech_id]
      );
      const tech = techRes.rows[0];
      if (!tech) throw Object.assign(new Error('Unknown tech'), { statusCode: 404 });

      const alreadyRes = await client.query(
        `SELECT 1 FROM player_research WHERE user_id = $1 AND tech_id = $2`,
        [userId, tech_id]
      );
      if (alreadyRes.rows[0]) {
        throw Object.assign(new Error('Already unlocked'), { statusCode: 400 });
      }

      // Prereq check.
      const prereqs = Array.isArray(tech.prerequisites) ? tech.prerequisites : [];
      if (prereqs.length > 0) {
        const have = await client.query(
          `SELECT tech_id FROM player_research WHERE user_id = $1 AND tech_id = ANY($2::TEXT[])`,
          [userId, prereqs]
        );
        const haveSet = new Set(have.rows.map(r => r.tech_id));
        const missing = prereqs.filter(p => !haveSet.has(p));
        if (missing.length > 0) {
          throw Object.assign(
            new Error(`Missing prerequisite(s): ${missing.join(', ')}`),
            { statusCode: 400 }
          );
        }
      }

      // Commit accrued RP first so we're spending against the *current*
      // live RP, then validate cost.
      const liveRp = await commitRp(client, userId, now);
      if (liveRp < tech.rp_cost) {
        throw Object.assign(
          new Error(`Insufficient RP (have ${liveRp}, need ${tech.rp_cost})`),
          { statusCode: 400 }
        );
      }

      // Deduct + record. updated_at is already NOW from commitRp.
      const newRp = liveRp - tech.rp_cost;
      await client.query(
        `UPDATE users SET research_points = $1 WHERE id = $2`,
        [newRp, userId]
      );
      await client.query(
        `INSERT INTO player_research (user_id, tech_id) VALUES ($1, $2)`,
        [userId, tech_id]
      );

      return {
        tech_id,
        name: tech.name,
        unlocks: tech.unlocks,
        research_points: newRp,
      };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error unlocking tech:', error);
    res.status(500).json({ error: 'Failed to unlock tech' });
  }
});

export default router;
