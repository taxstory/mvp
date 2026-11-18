-- Reproduces the LIVE database as reported by 01_verify.sql on 2026-11-18 (the OK rows), on top of supabase_schema.sql, so 04 is tested
-- against what it will really meet. Test-only.
create table if not exists public.clients (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  name text, type text default 'cpa', notes text, created_at timestamptz default now());
alter table public.clients enable row level security;
create policy "own clients" on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create table if not exists public.messages (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade, direction text, body text, read boolean default false, created_at timestamptz default now());
alter table public.messages enable row level security;
create policy "own messages" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.profiles add column if not exists notif_credits_low boolean default true, add column if not exists notif_intake_complete boolean default true,
  add column if not exists notif_message_received boolean default true, add column if not exists notif_video_complete boolean default true,
  add column if not exists phone text, add column if not exists website text;
alter table public.tax_returns add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists video_bucket text, add column if not exists video_render_id text, add column if not exists video_status text, add column if not exists notes text,
  add column if not exists tax_year int, add column if not exists file_name text, add column if not exists script text;
alter table public.ria_projections add column if not exists client_id uuid references public.clients(id) on delete set null, add column if not exists notes text;
