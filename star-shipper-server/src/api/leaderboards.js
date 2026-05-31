// Leaderboards REST API -- Social Multiplayer Step 4 (boards half).
// =============================================================
// One endpoint, multiple boards selected by :type. All boards are
// computed live from existing tables (users, player_system_visits,
// player_skills, activity_events) -- no leaderboard cache table, no
// background aggregation job. Player base is tiny so live queries
// stay cheap; revisit if it becomes a bottleneck.
//
//   GET /api/leaderboards/:type?limit=25
//
// Boards (v1):
//   richest       -- users.credits DESC
//   explorers     -- COUNT(player_system_visits) per user
//   trained       -- COUNT(player_skills WHERE level > 0) per user
//   active_7d     -- COUNT(activity_events) in last 7 days per user
//   crafters      -- COUNT(activity_events WHERE type=module_crafted)
//
// Response shape:
//   {
//     type, title, value_label, value_suffix,
//     entries: [{ rank, user_id, username, value }],
//     your_rank,    // user's rank galaxy-wide (may be > entries.length)
//     your_value,   // user's raw value for the metric (0 if untrained)
//     generated_at, // ISO timestamp -- lets the client show "as of ..."
//   }

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { queryAll, queryOne } from '../db/index.js';

const router = express.Router();

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

// Each board specifies how to fetch the top-N list AND the requesting
// user's own rank/value. Kept side-by-side per type so SQL stays
// readable and the schemas can diverge cleanly without a switch in
// every helper.
const BOARDS = {
  richest: {
    title: 'Richest Pilots',
    value_label: 'Credits',
    value_suffix: 'CR',
    topSql: `
      SELECT u.id AS user_id, u.username, u.credits::BIGINT AS value
        FROM users u
       WHERE u.credits > 0
       ORDER BY u.credits DESC, u.username ASC
       LIMIT $1`,
    selfValueSql: `SELECT credits::BIGINT AS value FROM users WHERE id = $1`,
    rankSql: `
      SELECT COUNT(*) + 1 AS rank
        FROM users
       WHERE credits > (SELECT credits FROM users WHERE id = $1)`,
  },

  explorers: {
    title: 'Top Explorers',
    value_label: 'Systems Discovered',
    value_suffix: '',
    topSql: `
      SELECT u.id AS user_id, u.username, COUNT(psv.system_procedural_id)::BIGINT AS value
        FROM users u
        JOIN player_system_visits psv ON psv.user_id = u.id
       GROUP BY u.id, u.username
       ORDER BY value DESC, u.username ASC
       LIMIT $1`,
    selfValueSql: `SELECT COUNT(*)::BIGINT AS value FROM player_system_visits WHERE user_id = $1`,
    rankSql: `
      WITH self_count AS (SELECT COUNT(*) AS c FROM player_system_visits WHERE user_id = $1),
           grouped    AS (SELECT user_id, COUNT(*) AS c FROM player_system_visits GROUP BY user_id)
      SELECT COUNT(*) + 1 AS rank FROM grouped, self_count WHERE grouped.c > self_count.c`,
  },

  trained: {
    title: 'Most Skills Trained',
    value_label: 'Skills',
    value_suffix: '',
    topSql: `
      SELECT u.id AS user_id, u.username, COUNT(ps.skill_id)::BIGINT AS value
        FROM users u
        JOIN player_skills ps ON ps.user_id = u.id AND ps.level > 0
       GROUP BY u.id, u.username
       ORDER BY value DESC, u.username ASC
       LIMIT $1`,
    selfValueSql: `SELECT COUNT(*)::BIGINT AS value FROM player_skills WHERE user_id = $1 AND level > 0`,
    rankSql: `
      WITH self_count AS (SELECT COUNT(*) AS c FROM player_skills WHERE user_id = $1 AND level > 0),
           grouped    AS (SELECT user_id, COUNT(*) AS c FROM player_skills WHERE level > 0 GROUP BY user_id)
      SELECT COUNT(*) + 1 AS rank FROM grouped, self_count WHERE grouped.c > self_count.c`,
  },

  active_7d: {
    title: 'Most Active (7d)',
    value_label: 'Activity Events',
    value_suffix: '',
    topSql: `
      SELECT u.id AS user_id, u.username, COUNT(ae.id)::BIGINT AS value
        FROM users u
        JOIN activity_events ae ON ae.user_id = u.id
       WHERE ae.created_at > NOW() - INTERVAL '7 days'
       GROUP BY u.id, u.username
       ORDER BY value DESC, u.username ASC
       LIMIT $1`,
    selfValueSql: `
      SELECT COUNT(*)::BIGINT AS value
        FROM activity_events
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '7 days'`,
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

  crafters: {
    title: 'Top Crafters',
    value_label: 'Modules Crafted',
    value_suffix: '',
    topSql: `
      SELECT u.id AS user_id, u.username, COUNT(ae.id)::BIGINT AS value
        FROM users u
        JOIN activity_events ae ON ae.user_id = u.id
       WHERE ae.event_type = 'module_crafted'
       GROUP BY u.id, u.username
       ORDER BY value DESC, u.username ASC
       LIMIT $1`,
    selfValueSql: `
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
};

// Lightweight index endpoint so the client can list the boards without
// hardcoding the catalog. Returns titles + value labels only -- the
// actual rows come from the per-type endpoint below.
router.get('/', authMiddleware, async (req, res) => {
  res.json({
    boards: Object.entries(BOARDS).map(([type, b]) => ({
      type, title: b.title, value_label: b.value_label, value_suffix: b.value_suffix,
    })),
  });
});

router.get('/:type', authMiddleware, async (req, res) => {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const board = BOARDS[type];
    if (!board) return res.status(404).json({ error: `Unknown leaderboard: ${type}` });

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    // Top-N + self-rank + self-value in parallel. self-rank is a
    // separate query because it has to look at every row, not just the
    // top N -- can't be derived from the top list alone (the player
    // might be ranked 200th).
    const [topRows, selfRankRow, selfValueRow] = await Promise.all([
      queryAll(board.topSql, [limit]),
      queryOne(board.rankSql, [req.user.id]),
      queryOne(board.selfValueSql, [req.user.id]),
    ]);

    // Postgres BIGINT comes back as a string. Coerce to Number so the
    // client can math + display without surprises. Values are bounded
    // by realistic player activity, well within Number.MAX_SAFE_INTEGER.
    const entries = topRows.map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      username: r.username,
      value: Number(r.value || 0),
    }));

    const yourValue = Number(selfValueRow?.value || 0);
    // If the player has zero of the metric, their "rank" from the
    // window query above is meaningless (everyone with > 0 outranks
    // them). Surface this as null so the client can show "unranked"
    // instead of "rank N" where N is misleading.
    const yourRank = yourValue > 0 ? Number(selfRankRow?.rank || 0) : null;

    res.json({
      type,
      title: board.title,
      value_label: board.value_label,
      value_suffix: board.value_suffix,
      entries,
      your_rank: yourRank,
      your_value: yourValue,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('leaderboards error', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

export default router;
