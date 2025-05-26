create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique not null,
  email text not null,
  full_name text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);
