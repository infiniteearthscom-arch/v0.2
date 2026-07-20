-- Migration 065: "Set & Forget" quest — prompt the fuel purchase
--
-- Harvesters burn Fuel Cells, but nothing in the tutorial chain told
-- the player to buy one. By "Coming Home" (collect the output) their
-- harvester had no fuel and never ran. The deploy quest now includes
-- the fuel step.

UPDATE quest_definitions
SET description = 'Dock at a planet, open the Harvesters tab, and drag your Basic Harvester from cargo onto a free slot, then assign it to a deposit. Harvesters burn fuel — buy a Fuel Cell from the Luna Station vendor (🏪 tab → Supplies) and drag it onto the harvester so it can run.'
WHERE id = 'tutorial_deploy_harvester';
