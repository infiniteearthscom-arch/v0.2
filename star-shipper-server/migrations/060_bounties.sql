-- Migration 060: Bounties (Social Multiplayer Step 8).
-- ============================================
-- Single-kill bounty contracts. A poster locks credit escrow when
-- posting; a claimer reports the kill via /api/bounty/:id/claim and
-- pockets the reward. One claim per bounty (status flips
-- open -> claimed), so each bounty is a discrete contract.
--
-- v1 trusts the client's kill report. The cheat surface is bounded
-- by what posters are willing to pay -- a player who fakes a kill is
-- robbing the poster, who'll stop posting. Self-regulating for low
-- stakes. v2 would hook into a server-validated combat path (which
-- doesn't exist today; combat is client-authoritative).
--
-- target_hull_class: matches the pirate's hull class string the
-- client already uses (e.g. 'fighter', 'scout', 'frigate',
-- 'destroyer', 'capital'). 'any' matches any pirate hull. Validated
-- by lib/bounty.js's TARGET_HULLS list; the column itself is
-- VARCHAR so adding new pirate hulls doesn't require a migration.
--
-- target_system_id: nullable; null = "any system."  Otherwise the
-- claim must match the procedural system id where the kill happened.
-- ============================================

CREATE TABLE bounties (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_hull_class  VARCHAR(32) NOT NULL,
  target_system_id   VARCHAR(64),  -- nullable: any system
  reward_credits     BIGINT      NOT NULL CHECK (reward_credits > 0),
  description        TEXT,
  status             VARCHAR(16) NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'claimed', 'cancelled', 'expired')),
  claimer_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at         TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Browse open bounties, optionally filtered by system. Partial index
-- keeps it tight -- finished/cancelled rows linger for the activity
-- timeline + history queries but the browse path doesn't pay.
CREATE INDEX idx_bounty_open ON bounties(target_system_id, reward_credits DESC, created_at DESC)
  WHERE status = 'open';

-- "My bounties" list + claim attribution.
CREATE INDEX idx_bounty_poster ON bounties(poster_id, status);
CREATE INDEX idx_bounty_claimer ON bounties(claimer_id) WHERE claimer_id IS NOT NULL;
