-- 104: "Fuel Up" -- a tutorial step between Set & Forget (deploy a
-- harvester) and Coming Home (collect from it). Owner 2026-10-09: the
-- deploy quest mentioned fuel in passing but completed on the deploy, so
-- Coming Home activated while the harvester sat unfueled and never filled.
-- Now: Set & Forget -> Fuel Up -> Coming Home. Fuel Up completes
-- SERVER-side inside POST /harvesters/refuel (completeQuestInTx; the
-- response carries `quest` for the client toast) and has an AUTO_SATISFY
-- predicate (any harvester of yours that has fuel or is running).

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order) VALUES
  ('tutorial_fuel_harvester', 'Fuel Up',
   'A harvester without fuel just sits there. Buy a Fuel Cell at Luna Station (Station 🛰️ → Vendor 🏪 → Supplies 📦; 20 cr, 6 hours of running), dock back at the planet, open the Auto tab (⚙️) and drag the cell onto your harvester. It starts pulling ore the moment it has fuel.',
   'tutorial', 'flag', '{"credits": 500}', '["tutorial_collect_harvester"]', 15)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, rewards = EXCLUDED.rewards,
  triggers_quests = EXCLUDED.triggers_quests, sort_order = EXCLUDED.sort_order;

-- Set & Forget now hands off to Fuel Up and only talks about the deploy.
UPDATE quest_definitions SET
  triggers_quests = '["tutorial_fuel_harvester"]'::jsonb,
  description = 'Dock at a planet, open the Auto tab (⚙️), and drag your Basic Harvester from cargo onto a free slot, then assign it to a deposit. It will not run yet -- fuel comes next.'
WHERE id = 'tutorial_deploy_harvester';

-- Everything after it moves down one.
UPDATE quest_definitions SET sort_order = 16 WHERE id = 'tutorial_collect_harvester';
UPDATE quest_definitions SET sort_order = 17 WHERE id = 'tutorial_first_contract';
UPDATE quest_definitions SET sort_order = 18 WHERE id = 'tutorial_first_delivery';
UPDATE quest_definitions SET sort_order = 19 WHERE id = 'tutorial_first_base';
UPDATE quest_definitions SET sort_order = 20 WHERE id = 'tutorial_first_refine';
UPDATE quest_definitions SET sort_order = 21 WHERE id = 'tutorial_first_signal';
UPDATE quest_definitions SET sort_order = 22 WHERE id = 'tutorial_first_investigate';

-- ---- Backfill ----
-- Every pilot past Set & Forget gets Fuel Up: completed (no reward) if
-- Coming Home is already done or any of their harvesters has fuel / is
-- running; otherwise ACTIVE + pinned -- that is exactly the stuck pilot
-- this fixes. Coming Home stays as it is for them (it cannot complete
-- without fuel anyway).
INSERT INTO player_quests (user_id, quest_id, status, completed_at, pinned)
SELECT pq.user_id, 'tutorial_fuel_harvester',
       CASE WHEN done.ok THEN 'completed' ELSE 'active' END,
       CASE WHEN done.ok THEN NOW() ELSE NULL END,
       TRUE
  FROM player_quests pq
 CROSS JOIN LATERAL (
   SELECT (EXISTS (SELECT 1 FROM player_quests c WHERE c.user_id = pq.user_id AND c.quest_id = 'tutorial_collect_harvester' AND c.status = 'completed')
        OR EXISTS (SELECT 1 FROM deployed_harvesters dh WHERE dh.user_id = pq.user_id AND (dh.fuel_remaining_hours > 0 OR dh.status IN ('active','full')))) AS ok
 ) done
 WHERE pq.quest_id = 'tutorial_deploy_harvester' AND pq.status = 'completed'
ON CONFLICT (user_id, quest_id) DO NOTHING;

-- Set & Forget (owner 2026-10-09, same pass): completes when the harvester
-- gets a DEPOSIT, not on the drop -- server-side in /harvesters/deploy
-- (with deposit_id) and /harvesters/assign-deposit. Text says so; Coming
-- Home reminds the pilot the machine only runs while fueled.
UPDATE quest_definitions SET
  description = 'Dock at a planet, open the Auto tab (⚙️), drag your Basic Harvester from cargo onto a free slot, then click the harvester and assign it a deposit. The job is done once it has a deposit to dig -- fuel comes next.'
WHERE id = 'tutorial_deploy_harvester';
UPDATE quest_definitions SET
  description = 'Give the harvester time to fill its hold -- it only runs while it has fuel, so keep a Fuel Cell on it. Then dock at the planet, open the Auto tab (⚙️), and collect the output. Passive income unlocked.'
WHERE id = 'tutorial_collect_harvester';

-- Special Delivery (owner 2026-10-09): the Missions board button is
-- DELIVER for fetch contracts too, so the text says one word.
UPDATE quest_definitions SET description =
  'Complete a hauling or fetch contract. Hauls: carry the sealed cargo to the destination station. Fetch: bring the requested ore back to the posting station. Either way, dock there and press Deliver on the Missions board (📋).'
WHERE id = 'tutorial_first_delivery';
