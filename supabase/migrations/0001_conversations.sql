-- Saved AI conversations, per account (ChatGPT/Gemini-style history).
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor) for project gkwcekrthkkumwfztlln,
-- or via `supabase db push` if you link the CLI later.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'New conversation',
  reference   text,                                   -- passage context, e.g. "John 1" (nullable)
  messages    jsonb not null default '[]'::jsonb,     -- [{ role, text, prompt, response }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Each user can only read/write their own conversations.
alter table public.conversations enable row level security;

create policy "Users manage own conversations"
  on public.conversations for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fast "most recent first" listing per user.
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
