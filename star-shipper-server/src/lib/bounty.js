// Bounty board (Social Multiplayer Step 8).
// =============================================================
// Single-kill bounty contracts. Posters lock credit escrow at post
// time; claimers report a kill matching the bounty's target spec and
// take the payout. v1 trusts the client's kill report -- same cheat
// surface as the existing combat loop. Bounded by what posters are
// willing to lose, so self-regulating.

import { transaction, queryAll, queryOne } from '../db/index.js';
import { logActivity } from './activity.js';

// Hulls the client uses on pirate spawns. Mirrors the pirate hull
// pool in SystemView. Server validates incoming target_hull_class
// against this list so bounties can only be posted for real pirate
// classes (and the magic value 'any').
const TARGET_HULLS = new Set([
  'any',
  'fighter', 'scout', 'frigate', 'destroyer', 'capital',
  'gunship', 'corvette', 'interceptor',
]);

function makeErr(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ============================================================
// POST
// ============================================================
export async function postBounty({ userId, targetHullClass, targetSystemId, rewardCredits, description }) {
  const hull = String(targetHullClass || '').toLowerCase();
  if (!TARGET_HULLS.has(hull)) {
    throw makeErr(400, `Unknown target hull class. Allowed: ${[...TARGET_HULLS].join(', ')}`);
  }
  const reward = parseInt(rewardCredits, 10);
  if (!(reward > 0) || !Number.isInteger(reward)) {
    throw makeErr(400, 'reward_credits must be a positive integer');
  }

  return await transaction(async (client) => {
    // Lock + validate poster's credits.
    const userRow = await client.query(
      `SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]
    );
    const credits = parseInt(userRow.rows[0]?.credits || 0);
    if (credits < reward) {
      throw makeErr(400, `Insufficient credits (need ${reward}, have ${credits})`);
    }
    await client.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [reward, userId]);

    const ins = await client.query(
      `INSERT INTO bounties (poster_id, target_hull_class, target_system_id, reward_credits, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, hull, targetSystemId || null, reward, description || null]
    );
    return ins.rows[0];
  });
}

// ============================================================
// CANCEL
// ============================================================
export async function cancelBounty({ userId, bountyId }) {
  return await transaction(async (client) => {
    const r = await client.query(
      `SELECT * FROM bounties WHERE id = $1 FOR UPDATE`, [bountyId]
    );
    const bounty = r.rows[0];
    if (!bounty) throw makeErr(404, 'Bounty not found');
    if (bounty.poster_id !== userId) throw makeErr(403, 'Not your bounty');
    if (bounty.status !== 'open') throw makeErr(400, `Cannot cancel (status=${bounty.status})`);

    // Refund escrow.
    await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`,
      [bounty.reward_credits, userId]);
    await client.query(`UPDATE bounties SET status = 'cancelled' WHERE id = $1`, [bountyId]);
    return { ok: true };
  });
}

// ============================================================
// CLAIM
// Caller reports a kill that satisfies the bounty's target spec.
// Server validates the spec match (hull class + system, if pinned)
// and pays out. v1 trusts the client's report; a future server-
// authoritative combat layer can promote this to a verified claim.
// ============================================================
export async function claimBounty({ userId, bountyId, killedHullClass, killSystemId, senderName }) {
  return await transaction(async (client) => {
    const r = await client.query(
      `SELECT * FROM bounties WHERE id = $1 FOR UPDATE`, [bountyId]
    );
    const bounty = r.rows[0];
    if (!bounty) throw makeErr(404, 'Bounty not found');
    if (bounty.status !== 'open') throw makeErr(400, `Bounty is not open (status=${bounty.status})`);
    if (bounty.poster_id === userId) throw makeErr(400, "You can't claim your own bounty");
    if (new Date(bounty.expires_at) < new Date()) {
      throw makeErr(400, 'Bounty has expired');
    }

    // Target validation. 'any' matches any hull; otherwise must match.
    const reportedHull = String(killedHullClass || '').toLowerCase();
    if (bounty.target_hull_class !== 'any' && bounty.target_hull_class !== reportedHull) {
      throw makeErr(400, `Kill does not match bounty target (${bounty.target_hull_class} required, you reported ${reportedHull})`);
    }
    if (bounty.target_system_id && bounty.target_system_id !== killSystemId) {
      throw makeErr(400, `Kill must be in system ${bounty.target_system_id}`);
    }

    // Pay out. Credits already deducted from poster at post time --
    // we ONLY credit the claimer here.
    await client.query(`UPDATE users SET credits = credits + $1 WHERE id = $2`,
      [bounty.reward_credits, userId]);
    await client.query(
      `UPDATE bounties SET status = 'claimed', claimer_id = $1, claimed_at = NOW() WHERE id = $2`,
      [userId, bountyId]
    );

    // Activity ticker: claim is the social-graph-interesting event.
    // Payload includes the reward so the ticker can show "X claimed
    // a 50,000 cr bounty on a Pirate Capital."
    logActivity({
      userId, senderName: senderName || 'Pilot',
      type: 'bounty_claimed', systemId: killSystemId || null,
      payload: {
        target_hull: bounty.target_hull_class,
        reward: bounty.reward_credits,
      },
    });

    return { ok: true, reward_credits: bounty.reward_credits };
  });
}

// ============================================================
// LIST
// ============================================================
export async function listOpenBounties({ systemId } = {}) {
  // Reward DESC so the most valuable bounties surface first; created_at
  // tie-break leaves the older posts above the newer ones (rewards
  // long-standing requests). 'any-system' bounties always appear in
  // every system's list -- the WHERE clause unions them in.
  if (systemId) {
    return queryAll(
      `SELECT b.*, u.username AS poster_name
         FROM bounties b
         JOIN users u ON u.id = b.poster_id
        WHERE b.status = 'open'
          AND (b.target_system_id = $1 OR b.target_system_id IS NULL)
        ORDER BY b.reward_credits DESC, b.created_at DESC
        LIMIT 200`,
      [systemId]
    );
  }
  return queryAll(
    `SELECT b.*, u.username AS poster_name
       FROM bounties b
       JOIN users u ON u.id = b.poster_id
      WHERE b.status = 'open'
      ORDER BY b.reward_credits DESC, b.created_at DESC
      LIMIT 200`,
    []
  );
}

export async function listMyBounties({ userId }) {
  return queryAll(
    `SELECT b.*, u.username AS claimer_name
       FROM bounties b
       LEFT JOIN users u ON u.id = b.claimer_id
      WHERE b.poster_id = $1 AND b.status IN ('open', 'claimed')
      ORDER BY b.status ASC, b.created_at DESC
      LIMIT 100`,
    [userId]
  );
}

export default {
  TARGET_HULLS,
  postBounty, cancelBounty, claimBounty,
  listOpenBounties, listMyBounties,
};
