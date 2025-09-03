-- Add support for pending plan changes (billing cycle-aware downgrades)
-- Migration: 06_pending_plan_changes.sql

-- Add pending plan change fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pending_plan_change text,
ADD COLUMN IF NOT EXISTS plan_change_effective_date timestamp;

-- Add comment for documentation
COMMENT ON COLUMN profiles.pending_plan_change IS 'Stores the plan user will change to at next billing cycle (for downgrades)';
COMMENT ON COLUMN profiles.plan_change_effective_date IS 'When the pending plan change will take effect (next billing date)';

-- Add index for efficient queries on pending changes
CREATE INDEX IF NOT EXISTS idx_profiles_pending_changes 
ON profiles(pending_plan_change, plan_change_effective_date) 
WHERE pending_plan_change IS NOT NULL;