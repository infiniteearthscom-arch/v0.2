-- Migration 061: Mail messages (Social Multiplayer Step 9).
-- ============================================
-- Async player-to-player messaging. Standard inbox model: messages
-- live on the recipient's side with a `read_at` timestamp; the
-- sender doesn't get a copy in v1 (no Sent Items tab yet -- planned).
--
-- sender_id is NULLABLE so system-generated mail ("Your sell order
-- filled at Luna") can land in inboxes too. The system_sent flag
-- mirrors that semantically and gives the UI a cheap way to render
-- "From: System" rows differently from player mail.
-- ============================================

CREATE TABLE mail_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject       VARCHAR(128) NOT NULL,
  body          TEXT NOT NULL,
  sent_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  read_at       TIMESTAMP WITH TIME ZONE,
  system_sent   BOOL NOT NULL DEFAULT false
);

-- The two access patterns:
--   "newest messages in my inbox" -- DESC by sent_at, scoped by recipient
--   "unread count badge"          -- partial index, no sent_at sort
CREATE INDEX idx_mail_inbox ON mail_messages(recipient_id, sent_at DESC);
CREATE INDEX idx_mail_unread ON mail_messages(recipient_id) WHERE read_at IS NULL;
