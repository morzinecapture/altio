-- Migration: User blocking system
-- Required by Apple & Google for apps with user-generated content (reviews, messages, photos)
-- Allows users to block other users; frontend filters blocked users from messages, reviews, feed

-- 1. Table blocked_users
CREATE TABLE blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blocked_users_unique UNIQUE (blocker_id, blocked_id),
  CONSTRAINT blocked_users_no_self_block CHECK (blocker_id != blocked_id)
);

-- 2. Indexes
CREATE INDEX idx_blocked_users_blocker ON blocked_users (blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users (blocked_id);

-- 3. RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- User can see their own blocks
CREATE POLICY "Users can view their own blocks"
  ON blocked_users FOR SELECT
  USING (blocker_id = auth.uid());

-- User can block someone
CREATE POLICY "Users can block other users"
  ON blocked_users FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

-- User can unblock someone
CREATE POLICY "Users can unblock users"
  ON blocked_users FOR DELETE
  USING (blocker_id = auth.uid());

-- 4. Comments on related tables (frontend must filter blocked users)
COMMENT ON TABLE messages IS 'Chat messages between owner and provider on a mission. Frontend MUST filter out messages from users in blocked_users table.';
COMMENT ON TABLE reviews IS 'Post-mission reviews. Frontend MUST filter out reviews from users in blocked_users table.';
