-- Complete JSON to JSONB Migration with Performance Optimizations
-- Migration: 08_complete_jsonb_migration.sql
-- This replaces the previous 08_improve_performance_defaults.sql

-- Start transaction to ensure atomicity
BEGIN;

-- Step 1: Add new JSONB columns
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_quota_new jsonb,
ADD COLUMN IF NOT EXISTS subscription_usage_new jsonb;

-- Step 2: Copy and convert existing JSON data to JSONB
UPDATE profiles 
SET subscription_quota_new = subscription_quota::jsonb
WHERE subscription_quota IS NOT NULL;

UPDATE profiles 
SET subscription_usage_new = subscription_usage::jsonb
WHERE subscription_usage IS NOT NULL;

-- Step 3: Set default values for new columns
UPDATE profiles 
SET subscription_quota_new = '{"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}'::jsonb
WHERE subscription_quota_new IS NULL;

UPDATE profiles 
SET subscription_usage_new = '{"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}'::jsonb
WHERE subscription_usage_new IS NULL;

-- Step 4: Drop old JSON columns and rename new JSONB columns
ALTER TABLE profiles DROP COLUMN IF EXISTS subscription_quota;
ALTER TABLE profiles DROP COLUMN IF EXISTS subscription_usage;
ALTER TABLE profiles RENAME COLUMN subscription_quota_new TO subscription_quota;
ALTER TABLE profiles RENAME COLUMN subscription_usage_new TO subscription_usage;

-- Step 5: Add proper defaults and constraints
ALTER TABLE profiles ALTER COLUMN subscription_quota SET DEFAULT '{"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}'::jsonb;
ALTER TABLE profiles ALTER COLUMN subscription_quota SET NOT NULL;

ALTER TABLE profiles ALTER COLUMN subscription_usage SET DEFAULT '{"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}'::jsonb;
ALTER TABLE profiles ALTER COLUMN subscription_usage SET NOT NULL;

-- Fix is_active column
UPDATE profiles SET is_active = false WHERE is_active IS NULL;
ALTER TABLE profiles ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE profiles ALTER COLUMN is_active SET NOT NULL;

-- Step 6: Create performance indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_profiles_quota_input 
ON profiles USING GIN ((subscription_quota->'input_tokens'));

CREATE INDEX IF NOT EXISTS idx_profiles_quota_output 
ON profiles USING GIN ((subscription_quota->'output_tokens'));

CREATE INDEX IF NOT EXISTS idx_profiles_quota_cached 
ON profiles USING GIN ((subscription_quota->'cached_tokens'));

CREATE INDEX IF NOT EXISTS idx_profiles_usage_input 
ON profiles USING GIN ((subscription_usage->'input_tokens'));

CREATE INDEX IF NOT EXISTS idx_profiles_usage_output 
ON profiles USING GIN ((subscription_usage->'output_tokens'));

-- Step 7: Add documentation comments
COMMENT ON COLUMN profiles.subscription_quota IS 'JSONB: User subscription quota with fields: input_tokens, output_tokens, cached_tokens';
COMMENT ON COLUMN profiles.subscription_usage IS 'JSONB: User subscription usage tracking with fields: input_tokens, output_tokens, cached_tokens';
COMMENT ON COLUMN profiles.is_active IS 'Boolean: Whether user has an active subscription (default: false)';

-- Commit the transaction
COMMIT;

-- Verification queries (run after migration)
-- SELECT column_name, data_type, column_default, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' 
-- AND column_name IN ('subscription_quota', 'subscription_usage', 'is_active')
-- ORDER BY column_name;