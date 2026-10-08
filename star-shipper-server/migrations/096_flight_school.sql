-- 096: Flight school -- controls, system map and the skill queue join the
-- tutorial chain; every tutorial description now names windows and tabs
-- with the SAME icons the toolbar / Planet window actually show.
--
-- Owner 2026-10-08: "do we have quests for brand new players that cover the
-- basics ... How to fly, opening the system map, using the menus, queuing
-- your first skill?" We did not: the chain started at "fly to Luna" and
-- never mentioned WASD, the System Map or Skills. Three new links:
--   First Light   (press W/A/S/D)               -> client hook, SystemView
--   Eyes Open     (System Map click sets autopilot) -> client hook, SystemMapWindow
--   The Long Game (queue any skill)              -> SERVER-side in /skills/queue/add
-- New chain: First Light -> Eyes Open -> Into the Black -> Gear Up ->
-- Ready for Launch -> The Long Game -> Eyes Wide Open -> ... (unchanged).
-- quests.js now activates tutorial_first_light for a brand-new account.
--
-- Icon audit (toolbar + Planet window, 2026-10-08): Fitting 🔧, Fleet 🚀,
-- Cargo 📦, Craft 🔨, Missions 📋, Galaxy 🌌, Research 🔬, Signals 🔭,
-- Planet 🪐, System Map 🗺️ (bottom-right); Planet window tabs Scan 📡,
-- Mine ⛏️, Auto ⚙️ (harvesters), Station 🛰️ / City 🏙️, Base 🏠; station
-- sub-tabs Vendor 🏪 (Hulls 🚀 / Modules ⚙️ / Supplies 📦 / Sell 💰),
-- Repair 🔧, Contracts 📦, Ships 🚀. Fixed: "Navigation window (🧭)" (no
-- such button), "Harvesters tab" (it is labelled Auto), "City tab" at a
-- station, "4 plots" (bases have 8 per area since 091).

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order) VALUES
  ('tutorial_first_light', 'First Light',
   'Welcome aboard, Commander. Your Starter Scout answers to W A S D (or the arrow keys): W thrusts, A and D turn, S brakes. Give the engines a nudge. Everything else -- clicking a body to autopilot, docking, the maps -- follows from here.',
   'tutorial', 'flag', '{"credits": 250}', '["tutorial_eyes_open"]', 1),
  ('tutorial_eyes_open', 'Eyes Open',
   'Open the System Map (🗺️, bottom-right) to see every planet, station and jump gate in the system. Click Luna Station in its Bodies list to set your autopilot -- the fleet flies itself there. Esc cancels an autopilot run; any thrust key takes manual control back.',
   'tutorial', 'flag', '{"credits": 250}', '["tutorial_fly_to_luna"]', 2),
  ('tutorial_queue_skill', 'The Long Game',
   'Skills train in real time, even while you are logged out, and they gate what you can fly and fit. Open Research (🔬), pick any skill on the Skills tab and press Queue Train. Your active training shows in the top bar.',
   'tutorial', 'flag', '{"credits": 500}', '["tutorial_scan_asteroid"]', 6)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, rewards = EXCLUDED.rewards,
  triggers_quests = EXCLUDED.triggers_quests, sort_order = EXCLUDED.sort_order;

-- Chain rewires.
UPDATE quest_definitions SET triggers_quests = '["tutorial_queue_skill"]'::jsonb WHERE id = 'tutorial_fit_modules';

-- Sort order: the two new openers push everything down by two, The Long
-- Game sits after Ready for Launch. Baptism by Fire (not in the chain)
-- goes to the end so it never interleaves.
UPDATE quest_definitions SET sort_order = 3  WHERE id = 'tutorial_fly_to_luna';
UPDATE quest_definitions SET sort_order = 4  WHERE id = 'tutorial_buy_starter_kit';
UPDATE quest_definitions SET sort_order = 5  WHERE id = 'tutorial_fit_modules';
UPDATE quest_definitions SET sort_order = 7  WHERE id = 'tutorial_scan_asteroid';
UPDATE quest_definitions SET sort_order = 8  WHERE id = 'tutorial_mine_resources';
UPDATE quest_definitions SET sort_order = 9  WHERE id = 'tutorial_sell_at_luna';
UPDATE quest_definitions SET sort_order = 10 WHERE id = 'tutorial_survey_planet';
UPDATE quest_definitions SET sort_order = 11 WHERE id = 'tutorial_mine_deposit';
UPDATE quest_definitions SET sort_order = 12 WHERE id = 'tutorial_collect_minerals';
UPDATE quest_definitions SET sort_order = 13 WHERE id = 'tutorial_craft_harvester';
UPDATE quest_definitions SET sort_order = 14 WHERE id = 'tutorial_deploy_harvester';
UPDATE quest_definitions SET sort_order = 15 WHERE id = 'tutorial_collect_harvester';
UPDATE quest_definitions SET sort_order = 16 WHERE id = 'tutorial_first_contract';
UPDATE quest_definitions SET sort_order = 17 WHERE id = 'tutorial_first_delivery';
UPDATE quest_definitions SET sort_order = 18 WHERE id = 'tutorial_first_base';
UPDATE quest_definitions SET sort_order = 19 WHERE id = 'tutorial_first_refine';
UPDATE quest_definitions SET sort_order = 20 WHERE id = 'tutorial_first_signal';
UPDATE quest_definitions SET sort_order = 21 WHERE id = 'tutorial_first_investigate';
UPDATE quest_definitions SET sort_order = 30 WHERE id = 'tutorial_clear_sector';

-- Descriptions: same words as the UI, same icons as the UI.
UPDATE quest_definitions SET description =
  'Let the autopilot carry you to Luna Station; you dock automatically on arrival. Docking opens the Planet window (🪐) -- at a station that is the vendor, the repair bay, the contract board and your stored ships.'
 WHERE id = 'tutorial_fly_to_luna';
UPDATE quest_definitions SET description =
  'Pick up your free Starter Kit: in the Planet window (🪐) open the Station tab (🛰️), then Vendor (🏪) → Supplies (📦). It holds a full basic loadout for your Scout and lands in your Cargo (📦).'
 WHERE id = 'tutorial_buy_starter_kit';
UPDATE quest_definitions SET description =
  'Open Fitting (🔧), select your Scout, and drag modules from the Fittable Modules pane into every slot. Fleet (🚀) shows what each ship carries; Cargo (📦) is everything in your hold.'
 WHERE id = 'tutorial_fit_modules';
UPDATE quest_definitions SET description =
  'Fly to the asteroid belt (pick it on the System Map 🗺️) and click an unscanned asteroid to survey it. Your Sensor Suite reveals its contents. Tip: scanned asteroids show a faint green tint.'
 WHERE id = 'tutorial_scan_asteroid';
UPDATE quest_definitions SET description =
  'You can see what is in the asteroid -- now extract it. Make sure a Mining Laser is fitted (🔧), click the scanned asteroid, and let the beam run until ore lands in your Cargo (📦).'
 WHERE id = 'tutorial_mine_resources';
UPDATE quest_definitions SET description =
  'Fly back to Luna Station, dock, open the Station tab (🛰️) → Vendor (🏪) → Sell (💰), and sell your mined ore. Watch the credits go up.'
 WHERE id = 'tutorial_sell_at_luna';
UPDATE quest_definitions SET description =
  'Dock at a planet (Earth is closest), open the Scan tab (📡), and run an Orbital Scan followed by a Ground Scan to find resource deposits. Each scan consumes a probe -- if you are out of Advanced Scanner Probes, Luna Station sells them (Station 🛰️ → Vendor 🏪 → Supplies 📦).'
 WHERE id = 'tutorial_survey_planet';
UPDATE quest_definitions SET description =
  'Open the Mine tab (⛏️) on the planet, pick a revealed deposit, and start mining. Collect the harvest when the cargo cycle finishes.'
 WHERE id = 'tutorial_mine_deposit';
UPDATE quest_definitions SET description =
  'Wait for the mining cycle to fill, then click Collect on the active session (Mine tab ⛏️). The mined resources move into your Cargo (📦) and are ready to craft with.'
 WHERE id = 'tutorial_collect_minerals';
UPDATE quest_definitions SET description =
  'Open Craft (🔨), find the Basic Harvester recipe, and craft one. You will need 20 Iron and 10 Copper -- mine more if you are short.'
 WHERE id = 'tutorial_craft_harvester';
UPDATE quest_definitions SET description =
  'Dock at a planet, open the Auto tab (⚙️), and drag your Basic Harvester from cargo onto a free slot, then assign it to a deposit. Harvesters burn fuel -- buy a Fuel Cell at Luna Station (Station 🛰️ → Vendor 🏪 → Supplies 📦) and drag it onto the harvester so it can run.'
 WHERE id = 'tutorial_deploy_harvester';
UPDATE quest_definitions SET description =
  'Give the harvester time to fill its hold, then dock at the planet, open the Auto tab (⚙️), and collect the output. Passive income unlocked.'
 WHERE id = 'tutorial_collect_harvester';
UPDATE quest_definitions SET description =
  'Stations post work on their contract boards. Dock at Luna Station, open the Station tab (🛰️) → Contracts (📦), and accept any contract. Your active contracts live on the Missions board (📋).'
 WHERE id = 'tutorial_first_contract';
UPDATE quest_definitions SET description =
  'Complete a hauling or fetch contract. Hauls: carry the sealed cargo to the destination station and press Deliver on the Missions board (📋). Fetch: bring the requested ore back to the posting station and Turn In.'
 WHERE id = 'tutorial_first_delivery';
UPDATE quest_definitions SET description =
  'Claim a planet. Research Base Construction (Research 🔬, Industry tree), train Command Center Upgrades I, dock at a planet and build a Framework from its Base tab (🏠). Your base starts with 8 plots: a Smelter is the first thing to build (Foundry Basics research) -- it is where ore becomes ingots.'
 WHERE id = 'tutorial_first_base';
UPDATE quest_definitions SET description =
  'Quality is everything out here. Research Ore Refining (Research 🔬, Industry tree), craft a Base Refinery (🔨), fit it from your Base tab (🏠), queue a refining job in the base console and collect the output.'
 WHERE id = 'tutorial_first_refine';
UPDATE quest_definitions SET description =
  'Every system hides cosmic signatures. Research Signature Analysis (Research 🔬, Society tree), buy or craft a Signature Probe Launcher, fit it (🔧), then open Signals (🔭) and probe a signature.'
 WHERE id = 'tutorial_first_signal';
UPDATE quest_definitions SET description =
  'Pin a signature with three probe cycles, fly to it, and Investigate it from the Signals window (🔭). Guarded sites bring company.'
 WHERE id = 'tutorial_first_investigate';
UPDATE quest_definitions SET description =
  'Now that your ship is ready, prove you can fight. Destroy every hostile in this system -- press T to target the nearest one. They patrol the asteroid belt and the outer planets.'
 WHERE id = 'tutorial_clear_sector';

-- ---- Backfill ----
-- Anyone who already has a quest row has flown and opened menus: the two
-- openers are inserted as completed (no reward -- they were never active).
INSERT INTO player_quests (user_id, quest_id, status, completed_at, pinned)
SELECT DISTINCT user_id, q.id, 'completed', NOW(), FALSE
  FROM player_quests pq
 CROSS JOIN (VALUES ('tutorial_first_light'), ('tutorial_eyes_open')) AS q(id)
ON CONFLICT (user_id, quest_id) DO NOTHING;

-- The Long Game for pilots already past Ready for Launch: completed if they
-- have ever trained or queued a skill, otherwise activated + pinned now
-- (its trigger, Ready for Launch, has already fired for them).
INSERT INTO player_quests (user_id, quest_id, status, completed_at, pinned)
SELECT pq.user_id, 'tutorial_queue_skill',
       CASE WHEN EXISTS (SELECT 1 FROM player_skill_queue sq WHERE sq.user_id = pq.user_id)
              OR EXISTS (SELECT 1 FROM player_skills ps WHERE ps.user_id = pq.user_id AND ps.level > 0)
            THEN 'completed' ELSE 'active' END,
       CASE WHEN EXISTS (SELECT 1 FROM player_skill_queue sq WHERE sq.user_id = pq.user_id)
              OR EXISTS (SELECT 1 FROM player_skills ps WHERE ps.user_id = pq.user_id AND ps.level > 0)
            THEN NOW() ELSE NULL END,
       TRUE
  FROM player_quests pq
 WHERE pq.quest_id = 'tutorial_fit_modules' AND pq.status = 'completed'
ON CONFLICT (user_id, quest_id) DO NOTHING;
