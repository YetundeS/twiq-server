# 📊 Database Schema for AI Coaching Platform

This folder contains the Supabase-compatible schema files used in this backend.

## 🧱 Table Structure

### 1. `profiles` (Complete user management)
- `id`: UUID (primary key)
- `auth_id`: Supabase Auth User ID (unique)
- `email`: User's email (unique)
- `user_name`: Display name
- `organization_name`: Optional organization
- `avatar_url`: Profile picture URL
- **Stripe Integration**: `stripe_customer_id`, `stripe_subscription_id`
- **Subscription Management**: `subscription_plan`, `subscription_quota`, `subscription_usage`, `quota_last_reset`, `is_active`
- **Email Verification**: `email_confirmed`, `email_verification_token`
- **Account Management**: `is_deleted`, `deleted_at`
- `created_at`, `updated_at`: Timestamps

### 2. `chat_sessions`
Each AI coach conversation is tracked here.

- `id`: UUID (primary key)
- `user_id`: Foreign key → `profiles.id`
- `assistant_slug`: The slug of the assistant (e.g. `carousel`, `storyteller`)
- `thread_id`: OpenAI thread ID
- `title`: Optional title for sidebar
- `created_at`, `updated_at`: Auto timestamps

### 3. `chat_messages`
Stores each message within a chat session.

- `id`: UUID (primary key)
- `session_id`: Foreign key → `chat_sessions.id`
- `sender`: `'user'` or `'assistant'`
- `content`: The message text
- `has_files`: Boolean indicating if message has file attachments
- `created_at`: Timestamp

### 4. `chat_files`
Manages file uploads and attachments for messages.

- `id`: UUID (primary key)
- `user_id`: Foreign key → `profiles.id`
- `session_id`: Foreign key → `chat_sessions.id`
- `message_id`: Foreign key → `chat_messages.id`
- `file_name`: Original filename
- `file_size`: File size in bytes
- `file_type`: MIME type
- `openai_file_id`: OpenAI file ID for assistant access
- `vector_store_id`: Optional link to vector store
- `created_at`: Timestamp

### 5. `vector_stores`
Manages OpenAI vector store lifecycle and expiration handling.

- `id`: UUID (primary key)
- `store_id`: OpenAI vector store ID (unique)
- `user_id`: Foreign key → `profiles.id`
- `session_id`: Optional link to chat session
- `name`: Store name for identification
- `file_count`: Number of files in store
- `expires_at`: When store expires
- `status`: 'active', 'expired', or 'recreating'
- `expired_at`: When store was marked expired
- `openai_metadata`: Full OpenAI response data
- `created_at`, `updated_at`: Timestamps

## 🔁 Triggers

`chat_messages` auto-updates `chat_sessions.updated_at` via a trigger, so the most recent chats can be sorted properly.

---

## 🚀 How to Set Up in Supabase

1. Open [Supabase SQL Editor](https://app.supabase.com/project/_/sql).
2. Copy each SQL file from this directory in order:
   - `01_users.sql` (Creates `profiles` table)
   - `02_chat_sessions.sql` (Creates `chat_sessions` table)
   - `03_chat_messages.sql` (Creates `chat_messages` table)
   - `04_triggers.sql` (Adds automatic timestamp triggers)
   - `05_indexes.sql` (Performance indexes)
   - `06_chat_files.sql` (File management table)
   - `07_vector_stores.sql` (Vector store management with expiration handling)
3. Run each query in sequence.

---

## 🗂 File Reference

| File                 | Purpose                                 |
|----------------------|------------------------------------------|
| `01_users.sql`       | Creates `profiles` table with full user management |
| `02_chat_sessions.sql` | Creates `chat_sessions` table         |
| `03_chat_messages.sql` | Creates `chat_messages` table with file support |
| `04_triggers.sql`    | Adds automatic timestamp update trigger |
| `05_indexes.sql`     | Performance indexes for all tables     |
| `06_chat_files.sql`  | File management and upload tracking    |
| `07_vector_stores.sql` | Vector store management with expiration handling |

---

