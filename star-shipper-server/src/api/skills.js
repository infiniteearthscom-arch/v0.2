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
import { GATE_CONFIG } from '../game/fitGates.js';

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

  // Per-user mutex: the client fires GET /skills from several
  // components at once, and two concurrent commits both popped the
  // same finished head entry then both ran the position-shift UPDATE,
  // corrupting queue positions into negatives. Locking the users row
  // serializes every skill operation for this user (reads commit the
  // queue, so reads mutate too). Audit fix 2026-09-02.
  await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

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
// BANKED PARTIAL PROGRESS (2026-09-18)
// ============================================
// player_skills.sp may now sit BETWEEN level snapshots: when the head
// entry is removed, its live SP is banked there instead of discarded.
// A later queue entry for that skill's next level starts from the
// banked SP, not from the level floor.
//
// Implementation trick: the entry's started_at is shifted EARLIER by
// the banked amount ("virtual start"), and finishes_at = started_at +
// the FULL level duration. Every existing formula -- live SP =
// levelStartSp + elapsed × rate, client progress bars = (now -
// started_at) / (finishes_at - started_at), the finishes_at pop check
// -- then shows the banked progress without any other change.
function bankedOffsetMs(skillRow, def, targetLevel) {
  if (!skillRow) return 0;
  if ((skillRow.level || 0) !== targetLevel - 1) return 0;
  const floorSp = spAtLevel(skillRow.level || 0, def?.rank_multiplier || 1, def?.sp_per_level_override || null);
  const banked = Math.max(0, (skillRow.sp || 0) - floorSp);
  return (banked / SP_PER_MIN) * 60000;
}

// Schedule one queue entry off the previous entry's finishes_at (or
// NOW for the head). Returns { startsAt, finishesAt } with the banked
// offset baked into startsAt.
function scheduleEntry(prevFinishesAt, def, targetLevel, skillRow) {
  const chainStartMs = prevFinishesAt ? prevFinishesAt.getTime() : Date.now();
  const startsAt = new Date(chainStartMs - bankedOffsetMs(skillRow, def, targetLevel));
  const sp = spForLevel(targetLevel, def?.rank_multiplier || 1, def?.sp_per_level_override || null);
  const finishesAt = computeFinishesAt(startsAt, sp);
  return { startsAt, finishesAt };
}

// ============================================
// GET /api/skills  -- full snapshot
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const out = await transaction(async (client) => {
      const { defs, skillsById, queue, liveHeadSp, liveHeadAtLevel } = await loadAndCommit(client, userId);

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
          // The currently-training skill reports its LIVE SP so the
          // per-skill progress bar advances; everyone else reports the
          // stored value (a level snapshot, or banked partial progress).
          sp: (d.id === liveHeadAtLevel && liveHeadSp != null) ? liveHeadSp : (ps?.sp || 0),
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
        // Phase 3 capability gates (module tiers / hull classes / fleet
        // size) so the Ship Builder shows the same locks the server
        // enforces. Single source: src/game/fitGates.js.
        fit_gates: GATE_CONFIG,
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

      // Chain off whatever's currently at the tail of the queue. Any
      // banked partial SP for this skill (from a previously removed
      // head) shortens the entry via a virtual earlier start.
      const tailFinishes = queue.length > 0 ? new Date(queue[queue.length - 1].finishes_at) : null;
      const { startsAt, finishesAt } = scheduleEntry(tailFinishes, def, target_level, skillsById.get(skill_id));
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
// Removing the head (position 0) cancels the in-progress training and
// BANKS its partial SP into player_skills.sp (2026-09-18 -- it used to
// be discarded). Re-queueing that skill later resumes from the banked
// SP. Removing a later entry leaves everything before it untouched
// (the old code rescheduled the head from NOW, silently wiping its
// progress). Entries after the removed slot shift down and re-chain.
// Cascade: later entries for the SAME skill at higher levels are
// removed too -- they'd otherwise train L3 with L2 never completed.
router.post('/queue/remove', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { position } = req.body;
    if (typeof position !== 'number') return res.status(400).json({ error: 'position required' });

    const out = await transaction(async (client) => {
      const { defs, skillsById, queue, liveHeadSp } = await loadAndCommit(client, userId);
      if (position < 0 || position >= queue.length) {
        throw Object.assign(new Error('Position out of range'), { statusCode: 400 });
      }
      const defById = Object.fromEntries(defs.map(d => [d.id, d]));
      const removed = queue[position];

      // Bank the head's live SP before it disappears.
      if (position === 0 && liveHeadSp != null) {
        const existing = skillsById.get(removed.skill_id);
        if (existing) {
          await client.query(
            `UPDATE player_skills SET sp = GREATEST(sp, $1) WHERE user_id = $2 AND skill_id = $3`,
            [liveHeadSp, userId, removed.skill_id]
          );
          existing.sp = Math.max(existing.sp || 0, liveHeadSp);
        } else {
          await client.query(
            `INSERT INTO player_skills (user_id, skill_id, sp, level) VALUES ($1, $2, $3, 0)`,
            [userId, removed.skill_id, liveHeadSp]
          );
          skillsById.set(removed.skill_id, { skill_id: removed.skill_id, sp: liveHeadSp, level: 0 });
        }
      }

      // Removed set = the target + any later entry of the same skill
      // at a higher level (dependents).
      const dropIdx = new Set([position]);
      queue.forEach((q, i) => {
        if (i > position && q.skill_id === removed.skill_id && q.target_level > removed.target_level) dropIdx.add(i);
      });
      const remaining = queue.filter((_, i) => !dropIdx.has(i));

      // Rewrite the whole queue in place: entries before `position`
      // keep their exact rows; entries from `position` on re-chain off
      // the previous survivor (or NOW if the head went).
      await client.query(`DELETE FROM player_skill_queue WHERE user_id = $1`, [userId]);
      let prevFinishes = position > 0 ? new Date(queue[position - 1].finishes_at) : null;
      for (let i = 0; i < remaining.length; i++) {
        const q = remaining[i];
        let startsAt, finishesAt;
        if (i < position) {
          startsAt = new Date(q.started_at);
          finishesAt = new Date(q.finishes_at);
        } else {
          ({ startsAt, finishesAt } = scheduleEntry(prevFinishes, defById[q.skill_id], q.target_level, skillsById.get(q.skill_id)));
        }
        await client.query(
          `INSERT INTO player_skill_queue (user_id, position, skill_id, target_level, started_at, finishes_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, i, q.skill_id, q.target_level, startsAt, finishesAt]
        );
        prevFinishes = finishesAt;
      }

      return { removed_position: position, removed_count: dropIdx.size, banked_sp: position === 0 ? liveHeadSp : null };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error removing from skill queue:', error);
    res.status(500).json({ error: 'Failed to remove from queue' });
  }
});

// ============================================
// POST /api/skills/queue/reorder
// body: { order: [position, position, ...] }  -- every current position
//        exactly once, in the desired new order
// ============================================
// Drag-and-drop reorder (2026-09-20). Rules:
//   * position 0 of the new order is what trains; if the old head moves
//     down, its live SP is BANKED (same as removing it) and the new head
//     starts now (from its own banked SP, if any).
//   * per-skill level order must stay ascending (L2 before L3).
//   * everything re-chains from the new head; entries keep their banked
//     offsets via scheduleEntry.
router.post('/queue/reorder', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order (array of positions) required' });

    const out = await transaction(async (client) => {
      const { defs, skillsById, queue, liveHeadSp } = await loadAndCommit(client, userId);
      const n = queue.length;
      const want = order.map(Number);
      const valid = want.length === n && new Set(want).size === n && want.every(p => Number.isInteger(p) && p >= 0 && p < n);
      if (!valid) throw Object.assign(new Error('order must list every queue position exactly once'), { statusCode: 400 });
      const defById = Object.fromEntries(defs.map(d => [d.id, d]));
      const byPos = new Map(queue.map(q => [q.position, q]));
      const reordered = want.map(p => byPos.get(p));

      // Per-skill level order must stay ascending.
      const seenLevel = new Map();
      for (const q of reordered) {
        const prev = seenLevel.get(q.skill_id);
        if (prev != null && q.target_level < prev) {
          throw Object.assign(new Error(`${defById[q.skill_id]?.name || q.skill_id} level ${q.target_level} can't train before level ${prev}`), { statusCode: 400 });
        }
        seenLevel.set(q.skill_id, q.target_level);
      }

      const oldHead = queue[0];
      const newHead = reordered[0];
      const headChanged = !!oldHead && (oldHead.skill_id !== newHead.skill_id || oldHead.target_level !== newHead.target_level);

      // Bank the displaced head's live SP.
      if (headChanged && liveHeadSp != null) {
        const existing = skillsById.get(oldHead.skill_id);
        if (existing) {
          await client.query(
            `UPDATE player_skills SET sp = GREATEST(sp, $1) WHERE user_id = $2 AND skill_id = $3`,
            [liveHeadSp, userId, oldHead.skill_id]
          );
          existing.sp = Math.max(existing.sp || 0, liveHeadSp);
        } else {
          await client.query(
            `INSERT INTO player_skills (user_id, skill_id, sp, level) VALUES ($1, $2, $3, 0)`,
            [userId, oldHead.skill_id, liveHeadSp]
          );
          skillsById.set(oldHead.skill_id, { skill_id: oldHead.skill_id, sp: liveHeadSp, level: 0 });
        }
      }

      // Rewrite the queue. The head keeps its exact row if it didn't
      // change; everything else re-chains.
      await client.query(`DELETE FROM player_skill_queue WHERE user_id = $1`, [userId]);
      let prevFinishes = null;
      for (let i = 0; i < reordered.length; i++) {
        const q = reordered[i];
        let startsAt, finishesAt;
        if (i === 0 && !headChanged) {
          startsAt = new Date(q.started_at);
          finishesAt = new Date(q.finishes_at);
        } else {
          ({ startsAt, finishesAt } = scheduleEntry(prevFinishes, defById[q.skill_id], q.target_level, skillsById.get(q.skill_id)));
        }
        await client.query(
          `INSERT INTO player_skill_queue (user_id, position, skill_id, target_level, started_at, finishes_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, i, q.skill_id, q.target_level, startsAt, finishesAt]
        );
        prevFinishes = finishesAt;
      }
      return { head_changed: headChanged, banked_sp: headChanged ? liveHeadSp : null };
    });

    res.json({ success: true, ...out });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Error reordering skill queue:', error);
    res.status(500).json({ error: 'Failed to reorder queue' });
  }
});

export default router;
