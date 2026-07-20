-- Migration 063: "Gear Up" quest — Starter Kit is free
--
-- The kit price dropped from 500 cr to FREE (one per account,
-- enforced server-side in /buy-module via the completed Gear Up
-- quest). The quest description still told players it cost 500 cr,
-- and didn't say which vendor section the kit lives in — players
-- were finding the FREE "Starter Scout" row on the Hulls tab and
-- assuming it was the mislabeled kit.

UPDATE quest_definitions
SET description = 'Pick up your free Starter Kit from the Luna Station vendor (🏪 tab → Supplies section). It contains a full basic loadout for your Scout.'
WHERE id = 'tutorial_buy_starter_kit';
