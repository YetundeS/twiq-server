-- Performance indexes for TWIQ application

-- Index for chat_sessions: Optimize user's sessions listing by assistant
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_assistant_created 
ON chat_sessions(user_id, assistant_slug, created_at DESC);

-- Index for chat_sessions: Optimize fetching sessions by user
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created 
ON chat_sessions(user_id, created_at DESC);

-- Index for chat_messages: Optimize message retrieval by session
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created 
ON chat_messages(session_id, created_at ASC);

-- Index for chat_files: Optimize file retrieval by session and user
CREATE INDEX IF NOT EXISTS idx_chat_files_session_user 
ON chat_files(session_id, user_id);

-- Index for chat_files: Optimize file retrieval by message
CREATE INDEX IF NOT EXISTS idx_chat_files_message 
ON chat_files(message_id);

-- Index for profiles: Optimize user lookup by auth_id (if not already exists)
CREATE INDEX IF NOT EXISTS idx_profiles_auth_id 
ON profiles(auth_id);

-- Partial index for active users (if subscription status tracking exists)
CREATE INDEX IF NOT EXISTS idx_profiles_active_users 
ON profiles(id) 
WHERE is_active = true;