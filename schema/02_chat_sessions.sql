create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  assistant_slug text not null,
  thread_id text not null,
  title text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);
