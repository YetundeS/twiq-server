-- Vector Stores Table - Manages OpenAI vector store lifecycle and expiration
create table if not exists vector_stores (
  id uuid primary key default gen_random_uuid(),
  store_id text unique not null, -- OpenAI vector store ID
  user_id uuid not null references profiles(id) on delete cascade,
  session_id uuid references chat_sessions(id) on delete set null, -- Optional link to chat session
  
  -- Store metadata
  name text not null,
  file_count integer default 0,
  
  -- Expiration management
  expires_at timestamp not null,
  status text check (status in ('active', 'expired', 'recreating')) default 'active',
  expired_at timestamp,
  
  -- OpenAI metadata
  openai_metadata jsonb, -- Store full OpenAI response for debugging
  
  -- Timestamps
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Add vector_store_id column to chat_files table
alter table chat_files 
add column if not exists vector_store_id text references vector_stores(store_id) on delete set null;

-- Indexes for efficient queries
create index if not exists idx_vector_stores_user_status 
on vector_stores(user_id, status);

create index if not exists idx_vector_stores_expires_at 
on vector_stores(expires_at) where status = 'active';

create index if not exists idx_vector_stores_session 
on vector_stores(session_id) where session_id is not null;

create index if not exists idx_chat_files_vector_store 
on chat_files(vector_store_id) where vector_store_id is not null;

-- Function to update updated_at timestamp
create or replace function update_vector_store_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update updated_at
create trigger update_vector_store_updated_at_trigger
  before update on vector_stores
  for each row
  execute procedure update_vector_store_updated_at();