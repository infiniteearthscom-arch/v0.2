-- 079: Find-resource ("fetch") contracts on the contract board.
-- docs/contracts-spec.md. Same player_contracts table as hauling (078):
-- contract_type = 'fetch', cargo_volume = units required, cargo_label =
-- resource name, plus the resource id + quality floor below. Turn-in is
-- at the posting station (dest = origin).

ALTER TABLE player_contracts
  ADD COLUMN IF NOT EXISTS fetch_resource_type_id INTEGER REFERENCES resource_types(id),
  ADD COLUMN IF NOT EXISTS fetch_min_quality INTEGER;
