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
// Base skill queue size for a fresh player. Each level of the
// Leadership skill `lead_training_discipline` adds one more slot
// (max queue = 3 + level, capped at 10 once the skill is L7).
const BASE_QUEUE = 3;
const TRAINING_DISCIPLINE_ID = 'lead_training_discipline';
const MAX_LEVEL = 5;

// Migration 054: per-skill `sp_per_level_override` (JSONB array of SP
// costs) lets a single skill define exact SP per level, overriding the
// smooth exponential curve. Array length implicitly defines that
// skill's max level (overrides MAX_LEVEL=5). Used by Training
// Discipline to hit specific real-time training durations (L1=7d,
// L7=60d) the rank_multiplier curve can't reach exactly.
function maxLevelFor(def) {
  if (def?.sp_per_level_override && Array.isArray(def.sp_per_level_override)) {
    return def.sp_per_level_override.length;
  }
  return MAX_LEVEL;
}

// SP required to advance from (level-1) to level for a skill of the
// given rank multiplier. NOT cumulative; this is one level's cost.
// When `override` (array) is provided, reads from index level-1.
function spForLevel(level, rankMult, override = null) {
  if (override && Array.isArray(override) && level >= 1 && level <= override.length) {
    return Math.round(override[level - 1]);
  }
  if (level <= 0 || level > MAX_LEVEL) return 0;
  return Math.round(SP_BASE * Math.pow(SP_MULT, level - 1) * rankMult);
}

// Cumulative SP from 0 to `level`. spAtLevel(0) = 0, spAtLevel(N) =
// the total SP a player has banked at level N (where N can be up to
// the skill's effective max).
function spAtLevel(level, rankMult, override = null) {
  const max = (override && Array.isArray(override)) ? override.length : MAX_LEVEL;
  let sum = 0;
  for (let i = 1; i <= Math.min(level, max); i++) sum += spForLevel(i, rankMult, override);
  return sum;
}

// Highest level the player has "earned" with this SP total. Used when
// committing a queue entry that may have actually advanced multiple
// levels by the time we look (e.g., player offline for a week).
function levelFromSp(sp, rankMult, override = null) {
  const max = (override && Array.isArray(override)) ? override.length : MAX_LEVEL;
  for (let L = max; L >= 0; L--) {
    if (sp >= spAtLevel(L, rankMult, override)) return L;
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
    const override = def?.sp_per_level_override || null;
    const newSp = spAtLevel(entry.target_level, rankMult, override);

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
    const override = def?.sp_per_level_override || null;
    const startedAt = new Date(head.started_at);
    const elapsedMs = now.getTime() - startedAt.getTime();
    const elapsedMin = Math.max(0, elapsedMs / 60000);
    const startSp = spAtLevel(head.target_level - 1, rankMult, override);
    const targetSp = spAtLevel(head.target_level, rankMult, override);
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

      // Research-gated skills: load the player's unlocked tech set so
      // the response can flag locked rows (`tech_unlocked: false`). The
      // UI dims + disables training; the queue/add handler enforces it.
      const techRows = await client.query(
        `SELECT tech_id FROM player_research WHERE user_id = $1`, [userId]
      );
      const unlockedTech = new Set(techRows.rows.map(r => r.tech_id));
      const techNameRows = await client.query(`SELECT id, name FROM tech_definitions`);
      const techNameById = Object.fromEntries(techNameRows.rows.map(r => [r.id, r.name]));

      // Build the response: defs decorated with player state, plus the queue.
      const skills = defs.map(d => {
        const ps = skillsById.get(d.id);
        const techGate = d.requires_tech || null;
        const techUnlocked = !techGate || unlockedTech.has(techGate);
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
          sp_for_next_level: ps?.level >= maxLevelFor(d) ? null : spAtLevel((ps?.level || 0) + 1, d.rank_multiplier, d.sp_per_level_override),
          sp_at_current_level: spAtLevel(ps?.level || 0, d.rank_multiplier, d.sp_per_level_override),
          // Per-skill max level so client UIs can iterate the right
          // number of levels (Training Discipline has 7 instead of 5).
          max_level: maxLevelFor(d),
          // Pass override through so any client-side cost preview can
          // mirror the server's math without re-deriving from rank.
          sp_per_level_override: d.sp_per_level_override || null,
          // Research-gating: tells the client to render a lock badge +
          // disable the Queue Train button until the tech is unlocked.
          requires_tech: techGate,
          requires_tech_name: techGate ? (techNameById[techGate] || techGate) : null,
          tech_unlocked: techUnlocked,
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
        // Effective queue cap = BASE_QUEUE (3) + Training Discipline
        // level. The per-skill max_level lives on each skill row
        // (above) so the UI can iterate Training Discipline's 7
        // levels even though the global default is 5.
        // `skills` here is the response ARRAY (defs decorated above).
        // The per-player Map lives in `skillsById` from loadAndCommit.
        max_queue: BASE_QUEUE + (skillsById.get(TRAINING_DISCIPLINE_ID)?.level || 0),
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
    const out = await transaction(async (client) => {
      const { defs, skillsById, queue } = await loadAndCommit(client, userId);
      const def = defs.find(d => d.id === skill_id);
      if (!def) throw Object.assign(new Error('Unknown skill'), { statusCode: 404 });

      // Research gate: skills with requires_tech can't be queued until
      // the player has researched that tech. Mirrors the buy-module +
      // craft gates so the obtain ladder reads end-to-end.
      if (def.requires_tech) {
        const techRow = await client.query(
          `SELECT 1 FROM player_research WHERE user_id = $1 AND tech_id = $2`,
          [userId, def.requires_tech]
        );
        if (techRow.rows.length === 0) {
          const techDef = await client.query(
            `SELECT name FROM tech_definitions WHERE id = $1`, [def.requires_tech]
          );
          const techName = techDef.rows[0]?.name || def.requires_tech;
          throw Object.assign(
            new Error(`Requires research: ${techName}`),
            { statusCode: 403, requires_tech: def.requires_tech }
          );
        }
      }

      // target_level cap is per-skill -- defaults to MAX_LEVEL=5,
      // overridden to override.length when sp_per_level_override is
      // set (Training Discipline = 7 levels).
      const maxForThis = maxLevelFor(def);
      if (target_level < 1 || target_level > maxForThis) {
        throw Object.assign(new Error(`target_level must be 1..${maxForThis}`), { statusCode: 400 });
      }

      // Dynamic queue cap: 3 base + Training Discipline level.
      const dynamicMax = BASE_QUEUE + (skillsById.get(TRAINING_DISCIPLINE_ID)?.level || 0);
      if (queue.length >= dynamicMax) {
        throw Object.assign(
          new Error(`Queue full (${dynamicMax} entries max -- train Training Discipline to unlock more slots)`),
          { statusCode: 400 }
        );
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
      const sp = spForLevel(target_level, def.rank_multiplier, def.sp_per_level_override);
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
        const sp = spForLevel(q.target_level, rankMult, def?.sp_per_level_override);
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
