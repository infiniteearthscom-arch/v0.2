-- 080: Bounty contracts on the contract board (docs/contracts-spec.md).
-- contract_type = 'bounty': destroy N pirates matching a target spec, then
-- turn in at the posting station. Kills are verified server-side: a kill
-- counts when /combat/claim-loot validates the wreck salvage against the
-- spawn manifest (so you must salvage the wreck to log the kill).
--   cargo_volume = kills required, cargo_label = target description.

ALTER TABLE player_contracts
  ADD COLUMN IF NOT EXISTS target_tier INTEGER,               -- kills must be this tier or higher
  ADD COLUMN IF NOT EXISTS target_template_id VARCHAR(64),    -- named target (elite) or NULL
  ADD COLUMN IF NOT EXISTS target_flagship BOOLEAN NOT NULL DEFAULT FALSE, -- only fleet flagships count
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_player_contracts_bounty_active
  ON player_contracts(user_id) WHERE status = 'active' AND contract_type = 'bounty';
