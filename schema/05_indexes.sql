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

-- Index for profiles: Optimize user lookup by auth_id
CREATE INDEX IF NOT EXISTS idx_profiles_auth_id 
ON profiles(auth_id);

-- Index for profiles: Optimize email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON profiles(email);

-- Index for profiles: Optimize Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer 
ON profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Partial index for active users with subscriptions
CREATE INDEX IF NOT EXISTS idx_profiles_active_users 
ON profiles(id, subscription_plan, is_active) 
WHERE is_active = true;

-- Index for email verification tokens
CREATE INDEX IF NOT EXISTS idx_profiles_verification_token 
ON profiles(email_verification_token) WHERE email_verification_token IS NOT NULL;