-- 105: inline links in quest text (owner 2026-10-09: "links in the quest
-- text for skills and research that open the window on the right tab, with
-- a visual cue next to the relevant skill/research").
--
-- Markup, rendered by client components/ui/QuestText.jsx (Missions board +
-- pinned tiles); plain text elsewhere renders unchanged:
--   [[skill:<skill_definitions.id>|Label]]  Research window, Skills tab, skill selected + pulsing
--   [[tech:<tech_definitions.id>|Label]]    Research window, Research tab, node's tree + pulsing
--   [[window:<gameStore.windows key>|Label]] opens that window
-- db:verify checks every skill / tech id used in a description exists.
-- Only the tutorial texts that NAME a skill, a research node or a window
-- change; wording otherwise as in 096 / 104.

UPDATE quest_definitions SET description =
  'Open the [[window:systemMap|System Map (🗺️)]] to see every planet, station and jump gate in the system. Click Luna Station in its Bodies list to set your autopilot -- the fleet flies itself there. Esc cancels an autopilot run; any thrust key takes manual control back.'
 WHERE id = 'tutorial_eyes_open';

UPDATE quest_definitions SET description =
  'Open [[window:shipBuilder|Fitting (🔧)]], select your Scout, and drag modules from the Fittable Modules pane into every slot. [[window:fleet|Fleet (🚀)]] shows what each ship carries; [[window:inventory|Cargo (📦)]] is everything in your hold.'
 WHERE id = 'tutorial_fit_modules';

UPDATE quest_definitions SET description =
  'Skills train in real time, even while you are logged out, and they gate what you can fly and fit. Open [[window:research|Research (🔬)]], pick any skill on the Skills tab -- [[skill:ind_mining_ops|Mining Operations]] is a fine first pick -- and press Queue Train. Your active training shows in the top bar.'
 WHERE id = 'tutorial_queue_skill';

UPDATE quest_definitions SET description =
  'Fly to the asteroid belt (pick it on the [[window:systemMap|System Map 🗺️]]) and click an unscanned asteroid to survey it. Your Sensor Suite reveals its contents. Tip: scanned asteroids show a faint green tint.'
 WHERE id = 'tutorial_scan_asteroid';

UPDATE quest_definitions SET description =
  'You can see what is in the asteroid -- now extract it. Make sure a Mining Laser is fitted ([[window:shipBuilder|Fitting 🔧]]), click the scanned asteroid, and let the beam run until ore lands in your [[window:inventory|Cargo (📦)]].'
 WHERE id = 'tutorial_mine_resources';

UPDATE quest_definitions SET description =
  'Open [[window:crafting|Craft (🔨)]], find the Basic Harvester recipe, and craft one. You will need 20 Iron and 10 Copper -- mine more if you are short.'
 WHERE id = 'tutorial_craft_harvester';

UPDATE quest_definitions SET description =
  'Stations post work on their contract boards. Dock at Luna Station, open the Station tab (🛰️) → Contracts (📦), and accept any contract. Your active contracts live on the [[window:questLog|Missions board (📋)]].'
 WHERE id = 'tutorial_first_contract';

UPDATE quest_definitions SET description =
  'Complete a hauling or fetch contract. Hauls: carry the sealed cargo to the destination station. Fetch: bring the requested ore back to the posting station. Either way, dock there and press Deliver on the [[window:questLog|Missions board (📋)]].'
 WHERE id = 'tutorial_first_delivery';

UPDATE quest_definitions SET description =
  'Claim a planet. Research [[tech:tech_base_construction|Base Construction]] (Industry tree), train [[skill:pln_cc_upgrades|Command Center Upgrades]] I, dock at a planet and build a Framework from its Base tab (🏠). Your base starts with 8 plots: a Smelter is the first thing to build ([[tech:tech_foundry_1|Foundry Basics]] research) -- it is where ore becomes ingots.'
 WHERE id = 'tutorial_first_base';

UPDATE quest_definitions SET description =
  'Quality is everything out here. Research [[tech:tech_refining|Ore Refining]] (Industry tree), craft a Base Refinery ([[window:crafting|Craft 🔨]]), fit it from your Base tab (🏠), queue a refining job in the base console and collect the output.'
 WHERE id = 'tutorial_first_refine';

UPDATE quest_definitions SET description =
  'Every system hides cosmic signatures. Research [[tech:tech_signature_analysis|Signature Analysis]] (Society tree), buy or craft a Signature Probe Launcher, fit it ([[window:shipBuilder|Fitting 🔧]]), then open [[window:anomalies|Signals (🔭)]] and probe a signature.'
 WHERE id = 'tutorial_first_signal';

UPDATE quest_definitions SET description =
  'Pin a signature with three probe cycles, fly to it, and Investigate it from the [[window:anomalies|Signals window (🔭)]]. Guarded sites bring company.'
 WHERE id = 'tutorial_first_investigate';
