create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  sender text check (sender in ('user', 'assistant')) not null,
  content text not null,
  has_files boolean default false, -- Indicates if message has attached files
  created_at timestamp default now()
);
