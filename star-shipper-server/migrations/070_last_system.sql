-- Migration 070: remember where the player was (2026-09-18)
-- A refresh / re-login used to drop the player back into Sol because
-- the client's currentSystem lived only in memory. users.last_system_id
-- is written on every system entry (POST /galaxy/visit, which now fires
-- on every entry, not just first discovery) and returned by
-- GET /galaxy/visits so App.jsx can restore it on login.
-- Per-user progress → also reset in /reset-account (pitfall #17).

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_system_id VARCHAR(64) NOT NULL DEFAULT 'sol';
