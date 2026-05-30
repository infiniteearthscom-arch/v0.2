-- Migration 056: Chat channel_id to VARCHAR (multiplayer Phase 2: chat).
-- ============================================
-- The original chat_messages table (migration 001) typed channel_id as
-- UUID. That worked for hubs + missions + whispers (all UUID-keyed),
-- but the social-multiplayer chat feature needs `channel_type = 'system'`
-- where channel_id holds the procedural system id (strings like 'sol'
-- or '42'), not a UUID.
--
-- Widening the column to VARCHAR(64) accepts both UUIDs (chars fit
-- fine) and procedural system ids. No data loss -- table is empty in
-- prod (chat was never wired client-side; the legacy hub:* / mission:*
-- handlers in socketHandler.js had no client consumers).
--
-- Index recreated to use the new type. The composite (channel_type,
-- channel_id, created_at DESC) still serves the only access pattern
-- ("last N messages in this channel") that the REST history endpoint
-- needs.
-- ============================================

-- Drop the existing index that references the column.
DROP INDEX IF EXISTS idx_chat_channel;

-- Widen channel_id. USING clause handles any existing UUID rows by
-- casting them to text; no-op in practice (table is empty in prod).
ALTER TABLE chat_messages
  ALTER COLUMN channel_id TYPE VARCHAR(64)
  USING channel_id::text;

-- Recreate the read-path index on the new column type.
CREATE INDEX idx_chat_channel ON chat_messages(channel_type, channel_id, created_at DESC);
