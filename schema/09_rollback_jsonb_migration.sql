-- Rollback Migration for JSONB Changes
-- Migration: 09_rollback_jsonb_migration.sql
-- Use this ONLY if you need to rollback the JSONB migration

-- WARNING: Only run this if you need to revert back to JSON columns
-- This will convert JSONB back to JSON (potential data loss of JSONB-specific features)

BEGIN;

-- Step 1: Create temporary JSON columns
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_quota_json json,
ADD COLUMN IF NOT EXISTS subscription_usage_json json;

-- Step 2: Convert JSONB back to JSON
UPDATE profiles 
SET subscription_quota_json = subscription_quota::json
WHERE subscription_quota IS NOT NULL;

UPDATE profiles 
SET subscription_usage_json = subscription_usage::json
WHERE subscription_usage IS NOT NULL;

-- Step 3: Drop JSONB columns and rename JSON columns
ALTER TABLE profiles DROP COLUMN IF EXISTS subscription_quota;
ALTER TABLE profiles DROP COLUMN IF EXISTS subscription_usage;
ALTER TABLE profiles RENAME COLUMN subscription_quota_json TO subscription_quota;
ALTER TABLE profiles RENAME COLUMN subscription_usage_json TO subscription_usage;

-- Step 4: Remove JSONB-specific constraints and defaults
ALTER TABLE profiles ALTER COLUMN subscription_quota DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN subscription_quota DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN subscription_usage DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN subscription_usage DROP NOT NULL;

-- Step 5: Drop JSONB-specific indexes
DROP INDEX IF EXISTS idx_profiles_quota_input;
DROP INDEX IF EXISTS idx_profiles_quota_output;
DROP INDEX IF EXISTS idx_profiles_quota_cached;
DROP INDEX IF EXISTS idx_profiles_usage_input;
DROP INDEX IF EXISTS idx_profiles_usage_output;

-- Step 6: Revert is_active changes if needed
ALTER TABLE profiles ALTER COLUMN is_active DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN is_active DROP NOT NULL;

-- Step 7: Update comments
COMMENT ON COLUMN profiles.subscription_quota IS 'JSON: User subscription quota (reverted from JSONB)';
COMMENT ON COLUMN profiles.subscription_usage IS 'JSON: User subscription usage tracking (reverted from JSONB)';
COMMENT ON COLUMN profiles.is_active IS 'Boolean: Whether user has an active subscription (reverted from NOT NULL)';

COMMIT;

-- Note: After running this rollback, you may need to manually set some values back to NULL
-- if that was the original state before the JSONB migration