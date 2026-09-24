-- 085: Onboarding chain extension -- contracts, refining, signatures, bases.
--
-- Six tutorial quests chained after "Coming Home" (tutorial_collect_harvester,
-- the end of the harvester chain). Completion is SERVER-SIDE inside the
-- feature transactions (accept/deliver contract, refine, probe/investigate,
-- build base), and quests.js auto-completes a newly activated quest whose
-- condition the pilot already met (so doing things out of order never
-- strands the chain). Existing pilots are backfilled below.

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order) VALUES
  ('tutorial_first_contract', 'Hired Gun',
   'Stations post work on their contract boards. Dock at Luna Station, open the Station tab → Contracts, and accept any contract. Your active contracts live on the Missions board.',
   'tutorial', 'flag', '{"credits": 500}', '["tutorial_first_delivery"]', 14),
  ('tutorial_first_delivery', 'Special Delivery',
   'Complete a hauling or fetch contract. Hauls: carry the sealed cargo to the destination station and press Deliver on the Missions board. Fetch: bring the requested ore back to the posting station and Turn In.',
   'tutorial', 'flag', '{"credits": 1500}', '["tutorial_first_base"]', 15),
  ('tutorial_first_refine', 'Grade Up',
   'Quality is everything out here. Research Ore Refining (Industry tree), then dock at any station or city, open the Refinery tab and refine a stack of ore. Fewer units come out, but at a higher grade.',
   'tutorial', 'flag', '{"credits": 2000}', '["tutorial_first_signal"]', 17),
  ('tutorial_first_signal', 'Something on the Band',
   'Every system hides cosmic signatures. Research Signature Analysis (Society tree), buy or craft a Signature Probe Launcher, fit it, then open Signals (🔭) and probe a signature.',
   'tutorial', 'flag', '{"credits": 2500}', '["tutorial_first_investigate"]', 18),
  ('tutorial_first_investigate', 'Dig Site',
   'Pin a signature with three probe cycles, fly to it, and Investigate it from the Signals window. Guarded sites bring company.',
   'tutorial', 'flag', '{"credits": 3000}', '[]', 19),
  ('tutorial_first_base', 'Homestead',
   'Claim a planet. Research Base Construction (Industry tree), train Command Center Upgrades I, dock at a planet and build a Framework from its Base tab. Fit a Cargo Depot, Refinery or Research Lab once it stands.',
   'tutorial', 'flag', '{"credits": 5000}', '["tutorial_first_refine"]', 16)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, rewards = EXCLUDED.rewards,
  triggers_quests = EXCLUDED.triggers_quests, sort_order = EXCLUDED.sort_order;

-- Hook the new chain onto the end of the harvester chain.
UPDATE quest_definitions SET triggers_quests = '["tutorial_first_contract"]'::jsonb
 WHERE id = 'tutorial_collect_harvester';

-- ---- Backfill existing pilots who already finished "Coming Home" ----
-- Mark the quests they have ALREADY satisfied as completed (contracts,
-- signatures, bases are all in tables; refining leaves no record, so
-- Grade Up is never pre-completed), then activate the first unsatisfied
-- quest in chain order, pinned. Rewards for pre-completed quests are
-- not paid (they were never active).
WITH past AS (
  SELECT user_id FROM player_quests
   WHERE quest_id = 'tutorial_collect_harvester' AND status = 'completed'
), sat AS (
  SELECT p.user_id,
    EXISTS (SELECT 1 FROM player_contracts c WHERE c.user_id = p.user_id) AS q1,
    EXISTS (SELECT 1 FROM player_contracts c WHERE c.user_id = p.user_id AND c.status = 'delivered' AND c.contract_type IN ('haul','fetch')) AS q2,
    FALSE AS q3,
    EXISTS (SELECT 1 FROM player_anomaly_progress a WHERE a.user_id = p.user_id) AS q4,
    EXISTS (SELECT 1 FROM player_anomaly_progress a WHERE a.user_id = p.user_id AND a.resolved_at IS NOT NULL) AS q5,
    EXISTS (SELECT 1 FROM player_bases b WHERE b.user_id = p.user_id) AS q6
  FROM past p
), rows_ AS (
  SELECT user_id, 'tutorial_first_contract' AS quest_id, q1 AS done, 1 AS ord FROM sat UNION ALL
  SELECT user_id, 'tutorial_first_delivery', q2, 2 FROM sat UNION ALL
  SELECT user_id, 'tutorial_first_base', q6, 3 FROM sat UNION ALL
  SELECT user_id, 'tutorial_first_refine', q3, 4 FROM sat UNION ALL
  SELECT user_id, 'tutorial_first_signal', q4, 5 FROM sat UNION ALL
  SELECT user_id, 'tutorial_first_investigate', q5, 6 FROM sat
), first_open AS (
  SELECT user_id, MIN(ord) AS ord FROM rows_ WHERE NOT done GROUP BY user_id
)
INSERT INTO player_quests (user_id, quest_id, status, pinned, completed_at)
SELECT r.user_id, r.quest_id,
       CASE WHEN r.done THEN 'completed' ELSE 'active' END,
       CASE WHEN r.done THEN FALSE ELSE TRUE END,
       CASE WHEN r.done THEN NOW() ELSE NULL END
  FROM rows_ r
  LEFT JOIN first_open f ON f.user_id = r.user_id
 WHERE r.done OR r.ord = f.ord
ON CONFLICT DO NOTHING;
