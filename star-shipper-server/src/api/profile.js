// Profile REST API -- Social Multiplayer Step 4 (profile half).
// =============================================================
// Public read-only profile for any player. Self and others use the
// same endpoint -- there's nothing here that needs to be hidden from
// other players (credits is already on the leaderboard; ship classes
// flown is identity, not a strategic secret).
//
//   GET /api/profile/:userId
//
// Response:
//   {
//     id, username, member_since,
//     totals: { skills_trained, systems_discovered, credits, ships_owned },
//     ship_classes: [{ name, count }, ...]       // distinct hulls flown, by count desc
//     ranks: [
//       { type, title, rank, value, value_label, value_suffix },
//       ...                                       // null rank = unranked (zero of metric)
//     ]
//   }
//
// Rank queries mirror the same SQL shape leaderboards.js uses -- the
// duplication is intentional. Coupling the two files would mean a
// dependency on leaderboards' internal catalog dict, which we'd rather
// not bake in (boards may diverge from the profile stat set).

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { queryOne, queryAll } from '../db/index.js';

const router = express.Router();

// UUID v4 shape -- cheap server-side guard so a bad ":userId" returns
// 400 instead of churning Postgres with an invalid cast.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-board rank+value lookups. Mirrors the boards in leaderboards.js
// but only the "what's this user's row" half (no top-N).
const RANK_QUERIES = [
  {
    type: 'richest',
    title: 'Richest Pilots',
    value_label: 'Credits',
    value_suffix: 'CR',
    valueSql: `SELECT credits::BIGINT AS value FROM users WHERE id = $1`,
    rankSql: `
      SELECT COUNT(*) + 1 AS rank
        FROM users
       WHERE credits > (SELECT credits FROM users WHERE id = $1)`,
  },
  {
    type: 'explorers',
    title: 'Top Explorers',
    value_label: 'Systems Discovered',
    value_suffix: '',
    valueSql: `SELECT COUNT(*)::BIGINT AS value FROM player_system_visits WHERE user_id = $1`,
    rankSql: `
      WITH self_count AS (SELECT COUNT(*) AS c FROM player_system_visits WHERE user_id = $1),
           grouped    AS (SELECT user_id, COUNT(*) AS c FROM player_system_visits GROUP BY user_id)
      SELECT COUNT(*) + 1 AS rank FROM grouped, self_count WHERE grouped.c > self_count.c`,
  },
  {
    type: 'trained',
    title: 'Most Skills Trained',
    value_label: 'Skills',
    value_suffix: '',
    valueSql: `SELECT COUNT(*)::BIGINT AS value FROM player_skills WHERE user_id = $1 AND level > 0`,
    rankSql: `
      WITH self_count AS (SELECT COUNT(*) AS c FROM player_skills WHERE user_id = $1 AND level > 0),
           grouped    AS (SELECT user_id, COUNT(*) AS c FROM player_skills WHERE level > 0 GROUP BY user_id)
      SELECT COUNT(*) + 1 AS rank FROM grouped, self_count WHERE grouped.c > self_count.c`,
  },
  {
    type: 'active_7d',
    title: 'Most Active (7d)',
    value_label: 'Activity Events',
    value_suffix: '',
    valueSql: `
      SELECT COUNT(*)::BIGINT AS value
        FROM activity_events
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
    rankSql: `
      WITH self_count AS (
             SELECT COUNT(*) AS c FROM activity_events
              WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
           ),
           grouped    AS (
             SELECT user_id, COUNT(*) AS c FROM activity_events
              WHERE created_at > NOW() - INTERVAL '7 days'
              GROUP BY user_id
           )
      SELECT COUNT(*) + 1 AS rank FROM grouped, self_count WHERE grouped.c > self_count.c`,
  },
  {
    type: 'crafters',
    title: 'Top Crafters',
    value_label: 'Modules Crafted',
    value_suffix: '',
    valueSql: `
      SELECT COUNT(*)::BIGINT AS value
        FROM activity_events
       WHERE user_id = $1 AND event_type = 'module_crafted'`,
    rankSql: `
      WITH self_count AS (
             SELECT COUNT(*) AS c FROM activity_events
              WHERE user_id = $1 AND event_type = 'module_crafted'
           ),
           grouped    AS (
             SELECT user_id, COUNT(*) AS c FROM activity_events
              WHERE event_type = 'module_crafted'
              GROUP BY user_id
           )
      SELECT COUNT(*) + 1 AS rank FROM grouped, self_count WHERE grouped.c > self_count.c`,
  },
];

router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    if (!UUID_RE.test(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    // Identity. created_at -> member_since. No password fields, no
    // email -- the only public-safe columns.
    const identity = await queryOne(
      `SELECT id, username, created_at AS member_since, credits::BIGINT AS credits
         FROM users WHERE id = $1`,
      [userId]
    );
    if (!identity) return res.status(404).json({ error: 'Pilot not found' });

    // Run everything else in parallel. Each piece is independent and
    // small; the round-trip dominates over the SQL cost.
    const [
      skillsTrainedRow,
      visitsCountRow,
      shipsCountRow,
      shipClassRows,
      ...rankPairs
    ] = await Promise.all([
      queryOne(
        `SELECT COUNT(*)::BIGINT AS c FROM player_skills WHERE user_id = $1 AND level > 0`,
        [userId]
      ),
      queryOne(
        `SELECT COUNT(*)::BIGINT AS c FROM player_system_visits WHERE user_id = $1`,
        [userId]
      ),
      queryOne(
        // Excludes pods (emergency hull, not a real ship) so the
        // count matches what the player sees in their fleet UI.
        `SELECT COUNT(*)::BIGINT AS c FROM ships WHERE user_id = $1 AND hull_type_id != 'pod'`,
        [userId]
      ),
      queryAll(
        // Distinct hull classes the player has owned. Lifetime view --
        // includes ships that are stored, lost, or sold. Pods skipped
        // for the same reason as the count above.
        `SELECT ht.name, COUNT(*)::BIGINT AS count
           FROM ships s
           JOIN hull_types ht ON ht.id = s.hull_type_id
          WHERE s.user_id = $1 AND s.hull_type_id != 'pod'
          GROUP BY ht.name
          ORDER BY count DESC, ht.name ASC`,
        [userId]
      ),
      // Spread the rank+value pairs at the end. Each board returns
      // [valueRow, rankRow]; we zip them back together below.
      ...RANK_QUERIES.flatMap(b => [
        queryOne(b.valueSql, [userId]),
        queryOne(b.rankSql, [userId]),
      ]),
    ]);

    // Re-pair the rank query results. flatMap returned 2 entries per
    // board (value then rank); chunk back into pairs.
    const ranks = RANK_QUERIES.map((b, i) => {
      const value = Number(rankPairs[i * 2]?.value || 0);
      // Unranked when the user has zero of the metric -- a numeric
      // rank would be misleading. Same convention as leaderboards.js.
      const rank = value > 0 ? Number(rankPairs[i * 2 + 1]?.rank || 0) : null;
      return {
        type: b.type,
        title: b.title,
        value_label: b.value_label,
        value_suffix: b.value_suffix,
        rank,
        value,
      };
    });

    res.json({
      id: identity.id,
      username: identity.username,
      member_since: identity.member_since,
      totals: {
        skills_trained: Number(skillsTrainedRow?.c || 0),
        systems_discovered: Number(visitsCountRow?.c || 0),
        credits: Number(identity.credits || 0),
        ships_owned: Number(shipsCountRow?.c || 0),
      },
      ship_classes: (shipClassRows || []).map(r => ({
        name: r.name,
        count: Number(r.count || 0),
      })),
      ranks,
    });
  } catch (err) {
    console.error('profile fetch error', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

export default router;
