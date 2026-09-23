-- 078: Hauling contracts (contract board v1) -- see docs/contracts-spec.md
--
-- Boards are procedural (regenerated from the seed on every read), so
-- only ACCEPTED contracts are stored. The sealed cargo the pilot carries
-- is an ordinary inventory item (1 cargo unit per unit) tagged with the
-- contract id in item_data.

CREATE TABLE IF NOT EXISTS player_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_key VARCHAR(160) NOT NULL,          -- system|station|bucket|index (regenerable)
  contract_type VARCHAR(20) NOT NULL DEFAULT 'haul',
  tier INTEGER NOT NULL DEFAULT 1,
  origin_system_id VARCHAR(64) NOT NULL,       -- star_systems.procedural_id
  origin_station VARCHAR(100) NOT NULL,        -- celestial_bodies.name of the port
  dest_system_id VARCHAR(64) NOT NULL,
  dest_station VARCHAR(100) NOT NULL,
  hops INTEGER NOT NULL DEFAULT 1,
  cargo_label VARCHAR(100),
  cargo_volume INTEGER NOT NULL,
  reward INTEGER NOT NULL,                     -- base reward at acceptance (before Negotiation)
  rush BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active | delivered | failed | expired | abandoned
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  payout INTEGER                               -- credits actually paid (delivered only)
);

CREATE INDEX IF NOT EXISTS idx_player_contracts_user_status ON player_contracts(user_id, status);
-- One live copy of a given offer per pilot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_contracts_live_key
  ON player_contracts(user_id, contract_key) WHERE status = 'active';

-- The freight itself. Stacks up to the largest contract; 1 volume per unit
-- so a 300-unit parcel needs 300 cargo. Not sellable, not craftable.
INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults, volume_per_unit)
VALUES ('sealed_cargo', 'Sealed Cargo', 'Contract freight. Deliver it intact to the destination port to get paid.',
        'cargo', '📦', 100000, '{}', 1.0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
  icon = EXCLUDED.icon, max_stack = EXCLUDED.max_stack, volume_per_unit = EXCLUDED.volume_per_unit;

-- Contracting now gates the contract board: +1 contract tier and +1 active
-- contract per level (base tier 1, 2 active). The bonus value becomes 1 per
-- level so the server can read the level straight off `contracts_flat`.
UPDATE skill_definitions
   SET description = 'Contract board access. +1 contract tier and +1 active contract per level (base: tier 1, 2 active).',
       bonus_per_level = '{"type":"contracts_flat","value":1}'::jsonb
 WHERE id = 'trd_contracting';
