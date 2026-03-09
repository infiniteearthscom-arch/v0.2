// Quest System API Routes
// Handles quest state, completion, and reward delivery

import express from 'express';
import { authMiddleware } from '../auth/index.js';
import { query, queryOne, queryAll, transaction } from '../db/index.js';

const router = express.Router();

// ============================================
// GET PLAYER QUESTS (active + completed)
// Auto-activates the first tutorial quest for new players.
// ============================================

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // First-time player: auto-activate the opening quest
    const existing = await queryOne(
      `SELECT COUNT(*) as count FROM player_quests WHERE user_id = $1`,
      [userId]
    );
    if (parseInt(existing.count) === 0) {
      await query(
        `INSERT INTO player_quests (user_id, quest_id)
         VALUES ($1, 'tutorial_buy_starter_scout')
         ON CONFLICT DO NOTHING`,
        [userId]
      );
    }

    const quests = await queryAll(`
      SELECT
        pq.id, pq.quest_id, pq.status, pq.progress, pq.activated_at, pq.completed_at,
        qd.title, qd.description, qd.category, qd.completion_condition,
        qd.completion_target, qd.rewards, qd.sort_order
      FROM player_quests pq
      JOIN quest_definitions qd ON pq.quest_id = qd.id
      WHERE pq.user_id = $1
      ORDER BY pq.status DESC, qd.sort_order ASC
    `, [userId]);

    res.json({ quests });
  } catch (error) {
    console.error('Error fetching quests:', error);
    res.status(500).json({ error: 'Failed to fetch quests' });
  }
});

// ============================================
// COMPLETE A QUEST + DELIVER REWARDS
// Verifies quest is active, marks complete, gives rewards,
// and activates any triggered follow-on quests.
// ============================================

router.post('/complete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { quest_id } = req.body;

    if (!quest_id) return res.status(400).json({ error: 'quest_id required' });

    const result = await transaction(async (client) => {
      // Verify quest is active for this player
      const pqResult = await client.query(
        `SELECT pq.*, qd.rewards, qd.triggers_quests, qd.title
         FROM player_quests pq
         JOIN quest_definitions qd ON pq.quest_id = qd.id
         WHERE pq.user_id = $1 AND pq.quest_id = $2 AND pq.status = 'active'`,
        [userId, quest_id]
      );
      if (!pqResult.rows[0]) {
        // Already completed or doesn't exist — not an error, just a no-op
        return { already_complete: true };
      }

      const quest = pqResult.rows[0];
      const rewards = quest.rewards || {};
      const triggersQuests = quest.triggers_quests || [];

      // Mark complete
      await client.query(
        `UPDATE player_quests SET status = 'completed', completed_at = NOW()
         WHERE user_id = $1 AND quest_id = $2`,
        [userId, quest_id]
      );

      // Deliver credit reward
      if (rewards.credits) {
        await client.query(
          `UPDATE users SET credits = credits + $1 WHERE id = $2`,
          [rewards.credits, userId]
        );
      }

      // Deliver item rewards
      if (rewards.items && rewards.items.length > 0) {
        for (const item of rewards.items) {
          // Try to add to existing stack first
          const existing = await client.query(
            `SELECT id, quantity FROM player_resource_inventory
             WHERE user_id = $1 AND item_type = 'item' AND item_id = $2
             LIMIT 1`,
            [userId, item.item_id]
          );

          if (existing.rows[0]) {
            await client.query(
              `UPDATE player_resource_inventory SET quantity = quantity + $1 WHERE id = $2`,
              [item.quantity, existing.rows[0].id]
            );
          } else {
            const slotResult = await client.query(`
              SELECT s.slot FROM generate_series(0,
                COALESCE((SELECT MAX(slot_index) + 1 FROM player_resource_inventory WHERE user_id = $1), 0)
              ) s(slot)
              WHERE s.slot NOT IN (
                SELECT slot_index FROM player_resource_inventory WHERE user_id = $1 AND slot_index IS NOT NULL
              )
              ORDER BY s.slot ASC LIMIT 1
            `, [userId]);
            const nextSlot = parseInt(slotResult.rows[0]?.slot) || 0;

            await client.query(
              `INSERT INTO player_resource_inventory (user_id, item_type, item_id, quantity, slot_index, item_data)
               VALUES ($1, 'item', $2, $3, $4, '{}')`,
              [userId, item.item_id, item.quantity, nextSlot]
            );
          }
        }
      }

      // Activate triggered follow-on quests
      for (const nextQuestId of triggersQuests) {
        await client.query(
          `INSERT INTO player_quests (user_id, quest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, nextQuestId]
        );
      }

      // Return updated credits for immediate HUD sync
      const userRow = await client.query(`SELECT credits FROM users WHERE id = $1`, [userId]);

      return {
        quest_id,
        title: quest.title,
        rewards,
        triggered_quests: triggersQuests,
        credits: parseInt(userRow.rows[0]?.credits || 0),
      };
    });

    if (result.already_complete) {
      return res.json({ success: true, already_complete: true });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error completing quest:', error);
    res.status(500).json({ error: 'Failed to complete quest' });
  }
});

export default router;
