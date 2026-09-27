-- ============================================================
--  Morphix — Supabase Schema
--  Run this in the Supabase SQL Editor (once) to create all tables.
--  All tables use uuid as primary key with auto-generation fallback
--  so that migrated records (which have numeric IDs from IndexedDB)
--  are accepted as-is via upsert.
-- ============================================================

-- Enable the pgcrypto extension (needed for gen_random_uuid)
create extension if not exists "pgcrypto";

-- ── users ──────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            text primary key,
  email         text unique not null,
  username      text,
  password_hash text,
  tier          text default 'base',
  email_verified boolean default false,
  preferences   jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── avatars ────────────────────────────────────────────────────────────────
create table if not exists public.avatars (
  id            text primary key,
  user_id       text references public.users(id) on delete cascade,
  name          text,
  base          text,
  customization jsonb default '{}',
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── themes ─────────────────────────────────────────────────────────────────
create table if not exists public.themes (
  id         text primary key,
  name       text,
  config     jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── elements ───────────────────────────────────────────────────────────────
create table if not exists public.elements (
  id         text primary key,
  name       text,
  type       text,
  config     jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── templates ──────────────────────────────────────────────────────────────
create table if not exists public.templates (
  id          text primary key,
  name        text,
  category    text,
  description text,
  config      jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── projects ───────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  name       text,
  config     jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── api_keys ───────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id         text primary key,
  project_id text references public.projects(id) on delete cascade,
  user_id    text references public.users(id) on delete cascade,
  key        text,
  name       text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── usage ──────────────────────────────────────────────────────────────────
create table if not exists public.usage (
  id         text primary key,
  user_id    text references public.users(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  event      text,
  meta       jsonb default '{}',
  timestamp  timestamptz default now()
);

-- ── billing ────────────────────────────────────────────────────────────────
create table if not exists public.billing (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  amount     numeric,
  currency   text default 'usd',
  status     text,
  meta       jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── preferences ────────────────────────────────────────────────────────────
create table if not exists public.preferences (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  theme      text default 'default',
  language   text default 'en',
  settings   jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── analytics ──────────────────────────────────────────────────────────────
create table if not exists public.analytics (
  id         text primary key,
  user_id    text references public.users(id) on delete set null,
  event_type text,
  path       text,
  meta       jsonb default '{}',
  timestamp  timestamptz default now()
);

-- ── sessions ───────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  token      text,
  active     boolean default true,
  created_at timestamptz default now(),
  expires_at timestamptz,
  updated_at timestamptz default now()
);

-- ── metadata (generic KV store) ────────────────────────────────────────────
create table if not exists public.metadata (
  id         text primary key,
  key        text,
  value      jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── RLS: disable for now (enable & add policies when you add Supabase Auth) ─
alter table public.users        disable row level security;
alter table public.avatars      disable row level security;
alter table public.themes       disable row level security;
alter table public.elements     disable row level security;
alter table public.templates    disable row level security;
alter table public.projects     disable row level security;
alter table public.api_keys     disable row level security;
alter table public.usage        disable row level security;
alter table public.billing      disable row level security;
alter table public.preferences  disable row level security;
alter table public.analytics    disable row level security;
alter table public.sessions     disable row level security;
alter table public.metadata     disable row level security;
