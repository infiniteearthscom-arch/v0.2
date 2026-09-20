-- Migration 073: one-time position sync grace for warp-range gating (2026-09-19)
-- Phase 3b validates every system entry against users.last_system_id.
-- Accounts that existed before 070 still carry the default 'sol' even
-- though their client may be sitting in a far system, so their first
-- jump after this deploy would be validated from Sol and refused.
-- last_system_synced = FALSE lets POST /galaxy/sync-position accept the
-- client's current system ONCE without validation, then flips TRUE.
-- New accounts default TRUE (they really do start in Sol), so this is
-- not a teleport for fresh characters.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_system_synced BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE users SET last_system_synced = FALSE;
