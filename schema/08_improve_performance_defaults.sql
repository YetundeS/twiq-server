-- Improve database performance and add proper defaults
-- Migration: 08_improve_performance_defaults.sql

-- Change json columns to jsonb for better performance
-- Note: This is a breaking change that should be done with care in production

-- First, add new jsonb columns
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_quota_new jsonb,
ADD COLUMN IF NOT EXISTS subscription_usage_new jsonb;

-- Copy data from json to jsonb
UPDATE profiles 
SET subscription_quota_new = subscription_quota::jsonb
WHERE subscription_quota IS NOT NULL;

UPDATE profiles 
SET subscription_usage_new = subscription_usage::jsonb
WHERE subscription_usage IS NOT NULL;

-- Drop old columns and rename new ones (WARNING: This is destructive)
-- Uncomment these lines only after testing in development environment:
-- ALTER TABLE profiles DROP COLUMN subscription_quota;
-- ALTER TABLE profiles DROP COLUMN subscription_usage;
-- ALTER TABLE profiles RENAME COLUMN subscription_quota_new TO subscription_quota;
-- ALTER TABLE profiles RENAME COLUMN subscription_usage_new TO subscription_usage;

-- Add proper defaults and constraints
-- ALTER TABLE profiles ALTER COLUMN subscription_quota SET DEFAULT '{"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}'::jsonb;
-- ALTER TABLE profiles ALTER COLUMN subscription_usage SET DEFAULT '{"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}'::jsonb;
-- ALTER TABLE profiles ALTER COLUMN is_active SET DEFAULT false;
-- ALTER TABLE profiles ALTER COLUMN is_active SET NOT NULL;

-- Add indexes for better query performance on jsonb fields
-- CREATE INDEX IF NOT EXISTS idx_profiles_quota_input ON profiles USING GIN ((subscription_quota->'input_tokens'));
-- CREATE INDEX IF NOT EXISTS idx_profiles_quota_output ON profiles USING GIN ((subscription_quota->'output_tokens'));

-- For now, let's just add defaults to critical fields without the destructive changes
UPDATE profiles SET is_active = false WHERE is_active IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.subscription_quota_new IS 'JSONB version of subscription quota for better performance';
COMMENT ON COLUMN profiles.subscription_usage_new IS 'JSONB version of subscription usage for better performance';