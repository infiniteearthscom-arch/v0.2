-- 018: Rebalance hull prices for early game progression
-- Scout: 500 → 2000 (not buyable at game start with 1000 credits)
-- Fighter: 2000 → 3000 (reflects higher scout baseline)

UPDATE hull_types SET price = 2000 WHERE id = 'scout';
UPDATE hull_types SET price = 3000 WHERE id = 'fighter';
