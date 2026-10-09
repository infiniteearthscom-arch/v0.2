-- 097: One-time commander rename (owner 2026-10-08: "give players the option
-- to change their name one time at start of game").
--
-- users.username is the name shown everywhere (chat, presence tags,
-- leaderboards, profile, mail); login is by email, so a rename never
-- affects sign-in. POST /auth/rename (api/auth.js) changes username +
-- display_name and the two denormalised copies (chat_messages.sender_name,
-- activity_events.sender_name) in one transaction -- the same rules as
-- `npm run db:rename` -- and stamps name_changed_at so it can only happen
-- once. The launch screen offers it while the stamp is NULL. A reset
-- keeps the stamp (identity survives a progress reset).

ALTER TABLE users ADD COLUMN IF NOT EXISTS name_changed_at TIMESTAMPTZ;
