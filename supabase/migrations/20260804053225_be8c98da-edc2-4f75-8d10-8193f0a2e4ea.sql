create table if not exists public.agent_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  origin text not null,
  login_url text,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, label)
);

grant select, insert, update, delete on public.agent_credentials to authenticated;
grant all on public.agent_credentials to service_role;
alter table public.agent_credentials enable row level security;

drop policy if exists "own credentials read" on public.agent_credentials;
create policy "own credentials read" on public.agent_credentials
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own credentials insert" on public.agent_credentials;
create policy "own credentials insert" on public.agent_credentials
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own credentials update" on public.agent_credentials;
create policy "own credentials update" on public.agent_credentials
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own credentials delete" on public.agent_credentials;
create policy "own credentials delete" on public.agent_credentials
  for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.agent_credential_secrets (
  credential_id uuid primary key
    references public.agent_credentials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);

revoke all on public.agent_credential_secrets from anon;
revoke all on public.agent_credential_secrets from authenticated;
grant all on public.agent_credential_secrets to service_role;
alter table public.agent_credential_secrets enable row level security;

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id uuid references public.agent_credentials(id) on delete set null,
  task text not null default 'login'
    check (task in ('login', 'bugfix', 'verify')),
  goal text not null default '',
  target_url text not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'running', 'succeeded',
                      'failed', 'timed_out', 'cancelled')),
  timeout_ms integer not null default 60000
    check (timeout_ms between 10000 and 300000),
  attempt integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  approved_at timestamptz,
  approval_note text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  summary text,
  error text,
  skip_reason text,
  credits_charged numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists agent_sessions_user_idx
  on public.agent_sessions (user_id, created_at desc);

grant select, insert, update on public.agent_sessions to authenticated;
grant all on public.agent_sessions to service_role;
alter table public.agent_sessions enable row level security;

drop policy if exists "own sessions read" on public.agent_sessions;
create policy "own sessions read" on public.agent_sessions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own sessions insert" on public.agent_sessions;
create policy "own sessions insert" on public.agent_sessions
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own sessions cancel" on public.agent_sessions;
create policy "own sessions cancel" on public.agent_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seq integer not null,
  attempt integer not null default 1,
  kind text not null,
  label text not null,
  detail jsonb not null default '{}'::jsonb,
  ok boolean not null default true,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists agent_actions_session_idx
  on public.agent_actions (session_id, seq);

grant select on public.agent_actions to authenticated;
grant all on public.agent_actions to service_role;
alter table public.agent_actions enable row level security;

drop policy if exists "own actions read" on public.agent_actions;
create policy "own actions read" on public.agent_actions
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.agent_screenshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt integer not null default 1,
  kind text not null default 'failure',
  caption text,
  data_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_screenshots_session_idx
  on public.agent_screenshots (session_id, created_at);

grant select on public.agent_screenshots to authenticated;
grant all on public.agent_screenshots to service_role;
alter table public.agent_screenshots enable row level security;

drop policy if exists "own screenshots read" on public.agent_screenshots;
create policy "own screenshots read" on public.agent_screenshots
  for select to authenticated using (auth.uid() = user_id);