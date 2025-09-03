-- Add message_count column to chat_sessions table
-- This column tracks the number of messages in each chat session

ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_sessions_message_count ON chat_sessions(message_count);

-- Update existing sessions to have accurate message counts
-- This will count messages from the chat_messages table for each session
UPDATE chat_sessions 
SET message_count = (
  SELECT COUNT(*) 
  FROM chat_messages 
  WHERE chat_messages.session_id = chat_sessions.id
)
WHERE message_count = 0 OR message_count IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN chat_sessions.message_count IS 'Total number of messages in this chat session';