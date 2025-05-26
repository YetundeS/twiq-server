# 📊 Database Schema for AI Coaching Platform

This folder contains the Supabase-compatible schema files used in this backend.

## 🧱 Table Structure

### 1. `users`
- `id`: UUID (primary key)
- `auth_id`: Supabase Auth User ID
- `email`: User's email
- `full_name`: Optional name
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 2. `chat_sessions`
Each AI coach conversation is tracked here.

- `id`: UUID (primary key)
- `user_id`: Foreign key → `users.id`
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
- `created_at`: Timestamp

## 🔁 Triggers

`chat_messages` auto-updates `chat_sessions.updated_at` via a trigger, so the most recent chats can be sorted properly.

---

## 🚀 How to Set Up in Supabase

1. Open [Supabase SQL Editor](https://app.supabase.com/project/_/sql).
2. Copy each SQL file from this directory in order:
   - `01_users.sql`
   - `02_chat_sessions.sql`
   - `03_chat_messages.sql`
   - `04_triggers.sql`
3. Run each query.

---

## 🗂 File Reference

| File                 | Purpose                                 |
|----------------------|------------------------------------------|
| `01_users.sql`       | Creates `users` table                    |
| `02_chat_sessions.sql` | Creates `chat_sessions` table         |
| `03_chat_messages.sql` | Creates `chat_messages` table         |
| `04_triggers.sql`    | Adds automatic timestamp update trigger |

---

