-- Chat Files Table - Manages file uploads and attachments
create table if not exists chat_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  message_id uuid not null references chat_messages(id) on delete cascade,
  
  -- File Information
  file_name text not null,
  file_size bigint not null, -- File size in bytes
  file_type text not null, -- MIME type
  
  -- OpenAI Integration
  openai_file_id text unique, -- OpenAI file ID for assistant access
  
  -- Metadata
  created_at timestamp default now()
);

-- Index for efficient file lookups by session
create index if not exists idx_chat_files_session on chat_files(session_id);

-- Index for efficient file lookups by message
create index if not exists idx_chat_files_message on chat_files(message_id);

-- Index for efficient file lookups by user
create index if not exists idx_chat_files_user on chat_files(user_id);