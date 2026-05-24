// Skills API -- EVE-style passive training with a 10-skill queue.
//
// MATH MODEL
// ----------
// Per-level SP: SP_BASE * SP_MULT^(L-1) * rank_multiplier, rounded.
// Levels 1..5 for a rank-1 skill: 250 / 1414 / 8003 / 45299 / 256371 SP
//   (cumulative: 250 / 1664 / 9667 / 54966 / 311337).
// A rank-5 skill is 5x those numbers -- weeks-long to L5 at the base
// training rate, EVE-style "real commitment" feel.
//
// Training rate is a flat SP_PER_MIN (no attribute system in Phase 1).
// At 30 SP/min, rank-1 L1 trains in ~8 min, rank-1 L5 in ~6 days, and
// a rank-5 L5 takes ~36 days. Real-time clock-based: trains 24/7 while
// the player is offline.
//
// The queue is ordered (position 0 = currently training). Each entry
// targets ONE level (so "train Gunnery to L3 from L1" is two entries:
// target L2 then target L3). finishes_at is pre-computed at enqueue
// using the cumulative time of all prior entries -- so on every read
// we just check `finishes_at <= NOW` and pop completed entries in
// order, bumping the player_skills row + shifting positions down.
// For the *currently* training (head) entry, we compute the live SP
// as sp_at_entry_start + elapsed * SP_PER_MIN, capped at the target.
//
// All math runs on-read; no cron / no setInterval. Consistent and
// cheap.

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryAll, transaction } from '../db/index.js';

const router = express.Router();

const SP_BASE = 250;
const SP_MULT = 5.66;
const SP_PER_MIN = 30;
const MAX_QUEUE = 10;
const MAX_LEVEL = 5;

// SP required to advance from (level-1) to level for a skill of the
// given rank multiplier. NOT cumulative; this is one level's cost.
function spForLevel(level, rankMult) {
  if (level <= 0 || level > MAX_LEVEL) return 0;
  return Math.round(SP_BASE * Math.pow(SP_MULT, level - 1) * rankMult);
}

// Cumulative SP from 0 to `level`. spAtLevel(0) = 0, spAtLevel(5) =
// the total SP a maxed skill has banked.
function spAtLevel(level, rankMult) {
  let sum = 0;
  for (let i = 1; i <= level; i++) sum += spForLevel(i, rankMult);
  return sum;
}

// Highest level the player has "earned" with this SP total. Used when
// committing a queue entry that may have actually advanced multiple
// levels by the time we look (e.g., player offline for a week).
function levelFromSp(sp, rankMult) {
  for (let L = MAX_LEVEL; L >= 0; L--) {
    if (sp >= spAtLevel(L, rankMult)) return L;
  }
  return 0;
}

// ============================================
// LOAD + COMMIT  (used by every read)
// ============================================
// Walks the queue, pops any entries past their finishes_at, applies
// them to player_skills (bumping sp + level), shifts the remaining
// queue down. Returns the updated set of rows for the response.
async function loadAndCommit(client, userId) {
  const now = new Date();

  // Pull all skill defs first -- need rank_multiplier for cost calcs.
  const defsRes = await client.query(`SELECT * FROM skill_definitions ORDER BY sort_order ASC`);
  const defs = defsRes.rows;
  const defById = Object.fromEntries(defs.map(d => [d.id, d]));

  // Player progress + queue.
  const skillsRes = await client.query(
    `SELECT skill_id, sp, level, last_leveled_at FROM player_skills WHERE user_id = $1`, [userId]
  );
  const skills = new Map(skillsRes.rows.map(r => [r.skill_id, r]));

  const queueRes = await client.query(
    `SELECT position, skill_id, target_level, started_at, finishes_at
     FROM player_skill_queue WHERE user_id = $1 ORDER BY position ASC`,
    [userId]
  );
  let queue = queueRes.rows;

  // Pop any completed entries (in order). Each commit bumps the
  // matching player_skills row to the target_level + spAtLevel cost.
  let popped = 0;
  while (queue.length > 0 && new Date(queue[0].finishes_at) <= now) {
    const entry = queue[0];
    const def = defById[entry.skill_id];
    const rankMult = def?.rank_multiplier || 1;
    const newSp = spAtLevel(entry.target_level, rankMult);

    // Upsert the player_skills row. last_leveled_at gets set to NOW
    // on every commit so the "↩ LAST TRAINED" badge in the Skills
    // tab can mark where the player left off after a break.
    if (skills.has(entry.skill_id)) {
      await client.query(
        `UPDATE player_skills SET sp = $1, level = $2, last_leveled_at = NOW()
         WHERE user_id = $3 AND skill_id = $4`,
        [newSp, entry.target_level, userId, entry.skill_id]
      );
    } else {
      await client.query(
        `INSERT INTO player_skills (user_id, skill_id, sp, level, last_leveled_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, entry.skill_id, newSp, entry.target_level]
      );
    }
    skills.set(entry.skill_id, {
      skill_id: entry.skill_id, sp: newSp, level: entry.target_level,
      last_leveled_at: now.toISOString(),
    });

    // Remove the entry from the queue.
    await client.query(
      `DELETE FROM player_skill_queue WHERE user_id = $1 AND position = $2`,
      [userId, entry.position]
    );
    queue.shift();
    popped++;
  }

  // Shift remaining positions down so position 0 is always the head.
  // Doing this in a single UPDATE rather than per-row keeps it atomic.
  if (popped > 0 && queue.length > 0) {
    await client.query(
      `UPDATE player_skill_queue SET position = position - $1 WHERE user_id = $2`,
      [popped, userId]
    );
    queue = queue.map(q => ({ ...q, position: q.position - popped }));
  }

  // For the head entry (now-active), compute live SP for the response.
  // Stored player_skills.sp is the level-snapshot (sp at target_level - 1).
  // Live SP = that + elapsed-since-entry-started * rate, capped at target.
  let liveHeadSp = null;
  let liveHeadAtLevel = null;
  if (queue.length > 0) {
    const head = queue[0];
    const def = defById[head.skill_id];
    const rankMult = def?.rank_multiplier || 1;
    const startedAt = new Date(head.started_at);
    const elapsedMs = now.getTime() - startedAt.getTime();
    const elapsedMin = Math.max(0, elapsedMs / 60000);
    const startSp = spAtLevel(head.target_level - 1, rankMult);
    const targetSp = spAtLevel(head.target_level, rankMult);
    liveHeadSp = Math.min(targetSp, Math.round(startSp + elapsedMin * SP_PER_MIN));
    liveHeadAtLevel = head.skill_id;
  }

  return { defs, skillsById: skills, queue, liveHeadSp, liveHeadAtLevel };
}

// Compute the finishes_at for a new entry given the queue's current
// tail. If queue is empty, training starts NOW. Otherwise it starts
// when the previous tail finishes.
function computeFinishesAt(prevFinishesAt, sp) {
  const startMs = prevFinishesAt ? prevFinishesAt.getTime() : Date.now();
  const trainingMs = (sp / SP_PER_MIN) * 60000;
  return new Date(startMs + trainingMs);
}

// ============================================
// GET /api/skills  -- full snapshot
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const out = await transaction(async (client) => {
      const { defs, skillsById, queue, liveHeadSp } = await loadAndCommit(client, userId);

      // Build the response: defs decorated with player state, plus the queue.
      const skills = defs.map(d => {
        const ps = skillsById.get(d.id);
        return {
          id: d.id,
          category: d.category,
          name: d.name,
          description: d.description,
          rank_multiplier: d.rank_multiplier,
          bonus_per_level: d.bonus_per_level,
          sort_order: d.sort_order,
          level: ps?.level || 0,
          sp: ps?.sp || 0,
          last_leveled_at: ps?.last_leveled_at || null,
          sp_for_next_level: ps?.level >= MAX_LEVEL ? null : spAtLevel((ps?.level || 0) + 1, d.rank_multiplier),
          sp_at_current_level: spAtLevel(ps?.level || 0, d.rank_multiplier),
        };
      });

      const queueOut = queue.map((q, i) => {
        const isHead = i === 0;
        return {
          position: q.position,
          skill_id: q.skill_id,
          target_level: q.target_level,
          started_at: q.started_at,
          finishes_at: q.finishes_at,
          live_sp: isHead ? liveHeadSp : null,
        };
      });

      return {
        skills,
        queue: queueOut,
        sp_per_min: SP_PER_MIN,
        max_level: MAX_LEVEL,
        max_queue: MAX_QUEUE,
        now: new Date().toISOString(),
      };
    });
    res.json(out);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// ============================================
// POST /api/skills/queue/add
// body: { skill_id, target_level }
// ============================================
// target_level must be exactly (current_or_queued_level + 1). The
// client enforces this in UI, but we validate server-side too: a
// single entry is always +1 level on top of whatever the player
// will have after the queue runs.
router.post('/queue/add', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { skill_id, target_level } = req.body;
    if (!skill_id || typeof target_level !== 'number') {
      return res.status(400).json({ error: 'skill_id + target_level required' });
    }
    if (target_level < 1 || target_level > MAX_LEVEL) {
      return res.status(400).json({ error: `target_level must be 1..${MAX_LEVEL}` });
    }

    const out = await transaction(async (client) => {
      const { defs, skillsById, queue } = await loadAndCommit(client, userId);
      const def = defs.find(d => d.id === skill_id);
      if (!def) throw Object.assign(new Error('Unknown skill'), { statusCode: 404 });

      if (queue.length >= MAX_QUEUE) {
        throw Object.assign(new Error(`Queue full (${MAX_QUEUE} entries max)`), { statusCode: 400 });
      }

      // "After the queue runs" level for this skill: current level
      // plus the highest target_level for this skill already queued.
      const currentLevel = skillsById.get(skill_id)?.level || 0;
      const queuedForSkill = queue.filter(q => q.skill_id === skill_id);
      const highestQueuedLevel = queuedForSkill.reduce((m, q) => Math.max(m, q.target_level), 0);
      const effectiveLevel = Math.max(currentLevel, highestQueuedLevel);

      if (target_level !== effectiveLevel + 1) {
        throw Object.assign(
          new Error(`target_level must be ${effectiveLevel + 1} (next level for this skill)`),
          { statusCode: 400 }
        );
      }

      // Compute finishes_at chained off whatever's currently at the
      // tail of the queue. New entry's SP cost = one level at the
      // skill's rank.
      const sp = spForLevel(target_level, def.rank_multiplier);
      const tailFinishes = queue.length > 0 ? new Date(queue[queue.length - 1].finishes_at) : null;
      const startsAt = tailFinishes || new Date();
      const finishesAt = computeFinishesAt(tailFinishes, sp);
      const newPos = queue.length;

      await client.query(
        `INSERT INTO player_skill_queue (user_id, position, skill_id, target_level, started_at, finishes_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, newPos, skill_id, target_level, startsAt, finishesAt]
      );

      return { position: newPos, skill_id, target_level, started_at: startsAt, finishes_at: finishesAt };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error adding to skill queue:', error);
    res.status(500).json({ error: 'Failed to add to queue' });
  }
});

// ============================================
// POST /api/skills/queue/remove
// body: { position }
// ============================================
// Removing the head (position 0) is allowed -- it cancels the
// in-progress training and discards the partial SP (EVE behavior).
// Subsequent entries shift down + their started_at / finishes_at are
// recomputed from the new chain start (NOW if head was removed, else
// from the previous tail).
router.post('/queue/remove', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { position } = req.body;
    if (typeof position !== 'number') return res.status(400).json({ error: 'position required' });

    const out = await transaction(async (client) => {
      const { defs, queue } = await loadAndCommit(client, userId);
      if (position < 0 || position >= queue.length) {
        throw Object.assign(new Error('Position out of range'), { statusCode: 400 });
      }
      const defById = Object.fromEntries(defs.map(d => [d.id, d]));

      await client.query(
        `DELETE FROM player_skill_queue WHERE user_id = $1 AND position = $2`,
        [userId, position]
      );

      // Build the new queue array (in-memory), then rewrite positions
      // + reschedule the timing chain for any entries after the
      // removed one.
      const remaining = queue.filter((_, i) => i !== position);

      // Shift positions down for any entry that was after the removed.
      // SQL approach: decrement positions > removed.
      await client.query(
        `UPDATE player_skill_queue SET position = position - 1
         WHERE user_id = $1 AND position > $2`,
        [userId, position]
      );

      // Reschedule from the chain start onward. We have to recompute
      // any entry that's now before its old self in the chain (when
      // head was removed) OR after the removed slot.
      let prevFinishes = null;
      for (let i = 0; i < remaining.length; i++) {
        const q = remaining[i];
        const def = defById[q.skill_id];
        const rankMult = def?.rank_multiplier || 1;
        const sp = spForLevel(q.target_level, rankMult);
        const newStart = prevFinishes || new Date();
        const newFinish = computeFinishesAt(prevFinishes, sp);
        await client.query(
          `UPDATE player_skill_queue SET position = $1, started_at = $2, finishes_at = $3
           WHERE user_id = $4 AND skill_id = $5 AND target_level = $6`,
          [i, newStart, newFinish, userId, q.skill_id, q.target_level]
        );
        prevFinishes = newFinish;
      }

      return { removed_position: position };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error removing from skill queue:', error);
    res.status(500).json({ error: 'Failed to remove from queue' });
  }
});

export default router;
