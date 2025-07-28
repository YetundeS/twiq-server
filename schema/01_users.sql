-- TWIQ Profiles Table - Complete user management with subscription support
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique not null, -- References Supabase auth.users.id
  email text not null unique,
  user_name text not null,
  organization_name text,
  avatar_url text,
  
  -- Stripe Integration
  stripe_customer_id text unique,
  stripe_subscription_id text,
  
  -- Subscription Management
  subscription_plan text, -- 'basic', 'pro', 'enterprise', etc.
  subscription_quota jsonb default '{"messages": 0, "files": 0, "tokens": 0}'::jsonb,
  subscription_usage jsonb default '{"messages": 0, "files": 0, "tokens": 0}'::jsonb,
  quota_last_reset timestamp,
  is_active boolean default false,
  
  -- Email Verification
  email_confirmed boolean default false,
  email_verification_token text unique,
  
  -- Account Management
  is_deleted boolean default false,
  deleted_at timestamp,
  
  -- Timestamps
  created_at timestamp default now(),
  updated_at timestamp default now()
);
