#!/usr/bin/env node

// Script to create tables in Supabase using the provided schema.
//
// SECURITY: credentials come from the environment only. A service-role key was
// previously hardcoded in this file and is considered leaked — rotate it. See
// docs/KEY_ROTATION.md.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from the repo root without adding a dependency.
if (existsSync(join(__dirname, '.env'))) {
  const { config } = await import('dotenv');
  config({ path: join(__dirname, '.env') });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKeyService = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKeyService) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Add them to .env (see .env.example) and re-run. Never commit real keys.'
  );
  process.exit(1);
}

// SQL schema from supabase_schema.sql
const supabaseSchemaSQL = `
-- Enable the pgcrypto extension (needed for gen_random_uuid)
create extension if not exists "pgcrypto";

-- Users table
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

-- Avatars table
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

-- Themes table
create table if not exists public.themes (
  id         text primary key,
  name       text,
  config     jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Elements table
create table if not exists public.elements (
  id         text primary key,
  name       text,
  type       text,
  config     jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Templates table
create table if not exists public.templates (
  id          text primary key,
  name        text,
  category    text,
  description text,
  config      jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Projects table
create table if not exists public.projects (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  name       text,
  config     jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- API Keys table
create table if not exists public.api_keys (
  id         text primary key,
  project_id text references public.projects(id) on delete cascade,
  user_id    text references public.users(id) on delete cascade,
  key        text,
  name       text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Usage table
create table if not exists public.usage (
  id         text primary key,
  user_id    text references public.users(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  event      text,
  meta       jsonb default '{}',
  timestamp  timestamptz default now()
);

-- Billing table
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

-- Preferences table
create table if not exists public.preferences (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  theme      text default 'default',
  language   text default 'en',
  settings   jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Analytics table
create table if not exists public.analytics (
  id         text primary key,
  user_id    text references public.users(id) on delete set null,
  event_type text,
  path       text,
  meta       jsonb default '{}',
  timestamp  timestamptz default now()
);

-- Sessions table
create table if not exists public.sessions (
  id         text primary key,
  user_id    text references public.users(id) on delete cascade,
  token      text,
  active     boolean default true,
  created_at timestamptz default now(),
  expires_at timestamptz,
  updated_at timestamptz default now()
);

-- Metadata table
create table if not exists public.metadata (
  id         text primary key,
  key        text,
  value      jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Disable RLS for now
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
`;

// Function to execute SQL via Supabase REST API
async function executeSQL(sql) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKeyService}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql: sql,
    }),
  });
  
  const data = await response.json();
  if (!response.ok) {
    console.error('Error executing SQL:', data.error);
    return false;
  }
  console.log('SQL executed successfully.');
  return true;
}

// Execute the schema
async function createTables() {
  try {
    // Split the SQL into chunks to avoid exceeding request size
    const sqlChunks = supabaseSchemaSQL.split(';').filter(line => line.trim().length > 0);
    
    for (const sqlChunk of sqlChunks) {
      const success = await executeSQL(sqlChunk + ';');
      if (!success) {
        console.error('Failed to execute chunk:', sqlChunk);
        return;
      }
    }
    
    console.log('All tables created successfully in Superbase.');
  } catch (error) {
    console.error('Failed to create tables:', error);
  }
}

// Run the script
createTables();