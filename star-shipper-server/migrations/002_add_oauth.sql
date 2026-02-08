-- Add OAuth provider support to users table
-- Allows login via Google, Discord, or email/password

-- Add OAuth columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32) DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);

-- Make password_hash optional (OAuth users won't have one)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Index for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(auth_provider, oauth_id);
