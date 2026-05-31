-- Migration 059: Corporations (Social Multiplayer Step 7).
-- ============================================
-- Persistent player groups. Each player can be in AT MOST one corp at
-- a time (enforced by the PRIMARY KEY on corporation_members.user_id).
-- The corp's `ticker` (2-5 chars, all caps) rides on the presence
-- ship_visual descriptor so peers see your affiliation in-system.
--
-- v1 roles: 'founder' (1 per corp), 'officer' (can invite + kick),
-- 'member' (read-only on roster). v2 will add promote/demote +
-- disband; v1 deliberately skips both -- founder leaving a corp with
-- members is a future problem (probably "founder can't leave until
-- they transfer or kick everyone").
--
-- Member count is denormalized on the corp row -- avoids the
-- repeated COUNT(*) GROUP BY in roster + leaderboard surfaces. Updated
-- via the per-membership trigger so it stays accurate even if a row is
-- DELETE'd via cascade (e.g. user deletion).
-- ============================================

CREATE TABLE corporations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Names are case-sensitive unique; tickers are uppercase. Both
  -- shape-validated in the API layer (alphanumeric + spaces for names,
  -- alphanumeric for tickers).
  name         VARCHAR(64) NOT NULL UNIQUE,
  ticker       VARCHAR(8)  NOT NULL UNIQUE,
  description  TEXT,
  founder_id   UUID NOT NULL REFERENCES users(id),
  founded_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Starts at 0; the trigger below bumps it to 1 when the founder
  -- row is inserted into corporation_members. Avoids double-counting
  -- on corp creation.
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0)
);

CREATE TABLE corporation_members (
  user_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  corp_id   UUID NOT NULL REFERENCES corporations(id) ON DELETE CASCADE,
  role      VARCHAR(16) NOT NULL DEFAULT 'member'
            CHECK (role IN ('founder', 'officer', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corp_members_corp ON corporation_members(corp_id, role);

CREATE TABLE corporation_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corp_id     UUID NOT NULL REFERENCES corporations(id) ON DELETE CASCADE,
  inviter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  -- One pending invite per (corp, invitee) -- re-inviting a player
  -- after they reject is fine, but only one invite at a time per pair.
  UNIQUE (corp_id, invitee_id)
);

CREATE INDEX idx_corp_invites_invitee ON corporation_invites(invitee_id);

-- Keep corporations.member_count accurate across INSERT / DELETE on
-- corporation_members. Triggered counts beat re-querying COUNT(*) on
-- every roster read.
CREATE OR REPLACE FUNCTION corp_member_count_bump() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE corporations SET member_count = member_count + 1 WHERE id = NEW.corp_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE corporations SET member_count = member_count - 1 WHERE id = OLD.corp_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_corp_member_count
  AFTER INSERT OR DELETE ON corporation_members
  FOR EACH ROW EXECUTE FUNCTION corp_member_count_bump();
