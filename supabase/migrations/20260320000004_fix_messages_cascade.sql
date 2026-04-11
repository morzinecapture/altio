-- ══════════════════════════════════════════════════════════════════
-- Fix cascade rules on messages table for safe account deletion
-- messages.sender_id and messages.receiver_id need SET NULL
-- so deleting a user doesn't fail on FK constraint
-- ══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
    -- sender_id → SET NULL
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='messages' AND column_name='sender_id') THEN
      ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;
      ALTER TABLE messages
        ADD CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- receiver_id → SET NULL
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='messages' AND column_name='receiver_id') THEN
      ALTER TABLE messages ALTER COLUMN receiver_id DROP NOT NULL;
      ALTER TABLE messages
        ADD CONSTRAINT messages_receiver_id_fkey
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
