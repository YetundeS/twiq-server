-- Fix cached tokens field name inconsistency
-- Migration: 07_fix_cached_tokens_field.sql

-- Update all existing subscription_quota JSON to use consistent field names
UPDATE profiles 
SET subscription_quota = jsonb_set(
    jsonb_set(
        COALESCE(subscription_quota::jsonb, '{}'::jsonb),
        '{cached_tokens}',
        COALESCE(subscription_quota::jsonb->'cached_input_tokens', '0'::jsonb)
    ),
    '{cached_input_tokens}',
    null
)
WHERE subscription_quota IS NOT NULL 
AND subscription_quota::jsonb ? 'cached_input_tokens';

-- Also fix any subscription_usage that might have the same issue
UPDATE profiles 
SET subscription_usage = jsonb_set(
    jsonb_set(
        COALESCE(subscription_usage::jsonb, '{}'::jsonb),
        '{cached_tokens}',
        COALESCE(subscription_usage::jsonb->'cached_input_tokens', '0'::jsonb)
    ),
    '{cached_input_tokens}',
    null
)
WHERE subscription_usage IS NOT NULL 
AND subscription_usage::jsonb ? 'cached_input_tokens';

-- Add comment for documentation
COMMENT ON COLUMN profiles.subscription_quota IS 'User subscription quota with fields: input_tokens, output_tokens, cached_tokens';
COMMENT ON COLUMN profiles.subscription_usage IS 'User subscription usage tracking with fields: input_tokens, output_tokens, cached_tokens';