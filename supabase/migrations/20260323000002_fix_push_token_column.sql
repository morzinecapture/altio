-- Fix: Add expo_push_token column to users table
-- The API code (api.ts registerPushToken) writes to users.expo_push_token
-- but this column was never created. The push_tokens table exists separately
-- but isn't used by the code. Adding the column to align with the codebase.

ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
