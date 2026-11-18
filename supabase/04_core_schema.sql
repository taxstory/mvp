-- TaxStory — 04_core_schema.sql
-- The core database layer the server functions call: credits and allowances, the voiceover job queue, vendor spend caps, rate limits,
-- share links and view tracking, the client portal, narration approvals, and Stripe billing.
--
-- Written to match exactly how netlify/functions/* call each function (argument names, result shape, error codes).
-- SAFE TO RE-RUN: it only adds what is missing and replaces this script's own functions/triggers/policies. It never drops data.
-- Run after 02_add_missing.sql and 03_pii_guards.sql, then run 01_verify.sql: every row should be OK.
--
-- Security model: every function here is SECURITY DEFINER and callable ONLY by the service role (the Netlify functions). Supabase
-- grants EXECUTE on new functions to anon/authenticated by default, which would let any signed-in user grant themselves credits —
-- so execute is revoked from them explicitly at the end.

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Columns on existing tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists privacy_mode    text    not null default 'labels_only';
alter table public.profiles add column if not exists portal_ttl_days int     not null default 90;
alter table public.profiles add column if not exists founding_member boolean not null default false;

alter table public.clients add column if not exists email                   text;
alter table public.clients add column if not exists phone                   text;
alter table public.clients add column if not exists firm_name               text;
alter table public.clients add column if not exists portal_token            text;
alter table public.clients add column if not exists portal_token_expires_at timestamptz;
alter table public.clients add column if not exists portal_access_count     int not null default 0;
alter table public.clients add column if not exists portal_last_accessed_at timestamptz;
alter table public.clients add column if not exists created_at              timestamptz not null default now();
create unique index if not exists clients_portal_token_key on public.clients (portal_token) where portal_token is not null;

alter table public.messages add column if not exists sent_at    timestamptz not null default now();
alter table public.messages add column if not exists sent_to    text;
alter table public.messages add column if not exists read_at    timestamptz;
alter table public.messages add column if not exists created_at timestamptz not null default now();

alter table public.tax_returns add column if not exists script_json     jsonb;
alter table public.tax_returns add column if not exists audio_segments  jsonb;
alter table public.tax_returns add column if not exists pdf_summary_url text;
alter table public.tax_returns add column if not exists notes           text;
alter table public.tax_returns add column if not exists created_at      timestamptz not null default now();

alter table public.usage_counters add column if not exists projections_used      int not null default 0;
alter table public.usage_counters add column if not exists credits_used          int not null default 0;
alter table public.usage_counters add column if not exists pack_credits_balance  int not null default 0;
alter table public.usage_counters add column if not exists pack_credits_lifetime int not null default 0;
alter table public.usage_counters add column if not exists period_start          timestamptz default now();
alter table public.usage_counters add column if not exists updated_at            timestamptz default now();

alter table public.audit_log add column if not exists description text;

alter table public.subscriptions add column if not exists last_event_created bigint;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists updated_at         timestamptz default now();

-- Value rules. Existing CHECK constraints on these columns are replaced (only CHECKs on that one column are touched):
--   subscriptions.status — every Stripe subscription status (the original list rejected 'incomplete' and 'paused', so the webhook failed);
--   tax_returns.status  — adds 'scenario_set' (saved planning comparisons).
-- NOT VALID: the rule applies to new and changed rows; existing rows are not re-checked, so this cannot fail on old data.
do $$
declare c record;
begin
  for c in select con.conname, rel.relname
             from pg_constraint con join pg_class rel on rel.oid = con.conrelid join pg_namespace n on n.oid = rel.relnamespace
            where n.nspname = 'public' and con.contype = 'c'
              and ((rel.relname = 'subscriptions' and pg_get_constraintdef(con.oid) ~ '\mstatus\M' and pg_get_constraintdef(con.oid) !~ '\mtier\M')
                or (rel.relname = 'tax_returns'   and pg_get_constraintdef(con.oid) ~ '\mstatus\M')
                or (rel.relname = 'profiles'      and pg_get_constraintdef(con.oid) ~ '\mprivacy_mode\M'))
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')) not valid;
alter table public.tax_returns add constraint tax_returns_status_check
  check (status in ('uploaded','parsing','parsed','script_ready','audio_ready','video_ready','error','scenario_set')) not valid;
alter table public.profiles add constraint profiles_privacy_mode_check check (privacy_mode in ('labels_only','standard')) not valid;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. New tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Voiceover jobs (start-audio-job → generate-audio-background; reaped by reap-jobs).
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tax_return_id uuid not null references public.tax_returns(id) on delete cascade,
  kind          text not null default 'audio',
  status        text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  progress      int  not null default 0,
  payload       jsonb not null default '{}'::jsonb,
  result        jsonb,
  error         text,
  request_key   text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  heartbeat_at  timestamptz,
  finished_at   timestamptz
);
create unique index if not exists jobs_request_key_key on public.jobs (user_id, request_key) where request_key is not null;
create unique index if not exists jobs_one_active_per_return on public.jobs (tax_return_id) where status in ('queued','running');
create index if not exists jobs_status_idx on public.jobs (status, created_at);

-- Credit / projection ledger: one row per charged unit, so charging is idempotent and refunds are exact.
create table if not exists public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('credit','projection')),
  job_key      text not null,
  source       text not null check (source in ('plan','pack')),
  period_start timestamptz,
  created_at   timestamptz not null default now(),
  refunded_at  timestamptz,
  unique (user_id, kind, job_key)
);
create table if not exists public.usage_period_rolls (key text primary key, user_id uuid references auth.users(id) on delete cascade, applied boolean, created_at timestamptz not null default now());
create table if not exists public.pack_grants (event_id text primary key, user_id uuid references auth.users(id) on delete cascade, credits int not null, created_at timestamptz not null default now());

-- Stripe webhook idempotency.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text,
  status      text not null default 'processing' check (status in ('processing','done','failed')),
  attempts    int  not null default 1,
  claimed_at  timestamptz not null default now(),
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Fixed-window rate limits.
create table if not exists public.rate_limits (key text not null, window_start timestamptz not null, hits int not null default 0, primary key (key, window_start));

-- Vendor (OpenAI / Anthropic) spend: reserve → settle / release / assume. Spend for a day = settled actuals + held estimates.
create table if not exists public.vendor_calls (
  call_key   text primary key,
  user_id    uuid references auth.users(id) on delete set null,
  vendor     text not null,
  day        date not null default (now() at time zone 'utc')::date,
  est_usd    numeric(12,6) not null default 0,
  actual_usd numeric(12,6),
  units      int not null default 0,
  status     text not null default 'reserved' check (status in ('reserved','settled','released','assumed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists vendor_calls_day_idx on public.vendor_calls (day, user_id);

-- Advisor approvals of narrated amounts that are not on the return (an audit record).
create table if not exists public.narration_approvals (
  id               uuid primary key default gen_random_uuid(),
  tax_return_id    uuid not null references public.tax_returns(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  version          int  not null,
  kind             text not null,
  narration        jsonb,
  narration_sha256 text,
  approved_amounts jsonb not null default '[]'::jsonb,
  note             text,
  approved_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (tax_return_id, version)
);
-- When an approval is deleted (its return or client deleted), a content-free record of it is kept: who, when, what kind, which version.
create table if not exists public.narration_approval_log (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, tax_return_id uuid,
  version int, kind text, approved_at timestamptz, deleted_at timestamptz not null default now()
);

-- Share links, view events, and "client watched" notifications.
create table if not exists public.video_share_links (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  firm_id         uuid not null references public.profiles(id) on delete cascade,
  tax_return_id   uuid not null references public.tax_returns(id) on delete cascade,
  label           text,
  delivery_method text,
  sent_to         text,
  expires_at      timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists video_share_links_return_idx on public.video_share_links (tax_return_id);
create table if not exists public.video_view_events (
  id            uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.video_share_links(id) on delete cascade,
  firm_id       uuid not null references public.profiles(id) on delete cascade,
  tax_return_id uuid,
  event_type    text not null check (event_type in ('link_opened','view_start','view_progress','view_complete')),
  watch_pct     int,
  created_at    timestamptz not null default now()
);
create index if not exists video_view_events_link_idx on public.video_view_events (share_link_id, created_at);
create table if not exists public.video_view_notifications (
  id            uuid primary key default gen_random_uuid(),
  share_link_id uuid not null unique references public.video_share_links(id) on delete cascade,
  firm_id       uuid not null references public.profiles(id) on delete cascade,
  event_type    text not null default 'view_complete',
  sent_to       text,
  created_at    timestamptz not null default now()
);

-- In-app bug reports (report-bug).
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text, title text, description text, page_url text, severity text,
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Row-level security. New tables: owners may READ their own rows; every write goes through the server (service role).
--    Tables with no policy at all are server-only.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.jobs                     enable row level security;
alter table public.usage_events             enable row level security;
alter table public.usage_period_rolls       enable row level security;
alter table public.pack_grants              enable row level security;
alter table public.stripe_events            enable row level security;
alter table public.rate_limits              enable row level security;
alter table public.vendor_calls             enable row level security;
alter table public.narration_approvals      enable row level security;
alter table public.narration_approval_log   enable row level security;
alter table public.video_share_links        enable row level security;
alter table public.video_view_events        enable row level security;
alter table public.video_view_notifications enable row level security;
alter table public.feedback                 enable row level security;

drop policy if exists ts_jobs_read_own                 on public.jobs;
drop policy if exists ts_usage_events_read_own         on public.usage_events;
drop policy if exists ts_approvals_read_own            on public.narration_approvals;
drop policy if exists ts_approval_log_read_own         on public.narration_approval_log;
drop policy if exists ts_share_links_read_own          on public.video_share_links;
drop policy if exists ts_view_events_read_own          on public.video_view_events;
drop policy if exists ts_view_notifications_read_own   on public.video_view_notifications;
create policy ts_jobs_read_own               on public.jobs                     for select using (auth.uid() = user_id);
create policy ts_usage_events_read_own       on public.usage_events             for select using (auth.uid() = user_id);
create policy ts_approvals_read_own          on public.narration_approvals      for select using (auth.uid() = user_id);
create policy ts_approval_log_read_own       on public.narration_approval_log   for select using (auth.uid() = user_id);
create policy ts_share_links_read_own        on public.video_share_links        for select using (auth.uid() = firm_id);
create policy ts_view_events_read_own        on public.video_view_events        for select using (auth.uid() = firm_id);
create policy ts_view_notifications_read_own on public.video_view_notifications for select using (auth.uid() = firm_id);

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Triggers
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4a. Storage paths on tax_returns (voiceover, video, PDF) are set only by the server, which checks ownership before signing them —
--     a signed-in user cannot point their return at someone else's file. (script/status/parsed_data stay writable: the server
--     updates those with the user's own token.)
create or replace function public.ts_protect_return_columns() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;   -- the server (service role) may set them
  if tg_op = 'INSERT' then
    new.audio_url := null; new.audio_segments := null; new.pdf_summary_url := null;
    new.video_url := null; new.video_status := null; new.video_render_id := null;
  else
    new.audio_url := old.audio_url; new.audio_segments := old.audio_segments; new.pdf_summary_url := old.pdf_summary_url;
    new.video_url := old.video_url; new.video_status := old.video_status; new.video_render_id := old.video_render_id;
  end if;
  return new;
end $$;
drop trigger if exists ts_protect_return_columns on public.tax_returns;
create trigger ts_protect_return_columns before insert or update on public.tax_returns for each row execute function public.ts_protect_return_columns();

-- 4b. Labels-only privacy mode: client contact details are never stored (the default). Applied to clients, share links and messages.
create or replace function public.ts_firm_labels_only(p_firm uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select privacy_mode from public.profiles where id = p_firm), 'labels_only') = 'labels_only'
$$;
create or replace function public.guard_client_contact() returns trigger language plpgsql as $$
begin
  if public.ts_firm_labels_only(new.user_id) then new.email := null; new.phone := null; end if;
  return new;
end $$;
drop trigger if exists guard_client_contact on public.clients;
create trigger guard_client_contact before insert or update on public.clients for each row execute function public.guard_client_contact();

create or replace function public.guard_link_contact() returns trigger language plpgsql as $$
begin
  if public.ts_firm_labels_only(coalesce(to_jsonb(new)->>'firm_id', to_jsonb(new)->>'user_id')::uuid) then new.sent_to := null; end if;
  return new;
end $$;
drop trigger if exists guard_link_contact on public.video_share_links;
create trigger guard_link_contact before insert or update on public.video_share_links for each row execute function public.guard_link_contact();
drop trigger if exists guard_link_contact on public.messages;
create trigger guard_link_contact before insert or update on public.messages for each row execute function public.guard_link_contact();

-- 4c. Portal links expire after the firm's portal_ttl_days (default 90). A new token restarts the clock and the access count.
create or replace function public.ts_portal_token_expiry() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.portal_token is distinct from (case when tg_op = 'UPDATE' then old.portal_token end) then
    if new.portal_token is null then
      new.portal_token_expires_at := null;
    else
      new.portal_token_expires_at := now() + make_interval(days => greatest(1, least(365,
        coalesce((select portal_ttl_days from public.profiles where id = new.user_id), 90))));
      new.portal_access_count := 0; new.portal_last_accessed_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ts_portal_token_expiry on public.clients;
create trigger ts_portal_token_expiry before insert or update of portal_token on public.clients for each row execute function public.ts_portal_token_expiry();

-- 4d. Deleted approvals leave a content-free record.
create or replace function public.ts_log_deleted_approval() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.narration_approval_log (user_id, tax_return_id, version, kind, approved_at)
  select old.user_id, old.tax_return_id, old.version, old.kind, old.approved_at
   where exists (select 1 from auth.users where id = old.user_id);   -- not when the whole account is being deleted
  return old;
end $$;
drop trigger if exists ts_log_deleted_approval on public.narration_approvals;
create trigger ts_log_deleted_approval after delete on public.narration_approvals for each row execute function public.ts_log_deleted_approval();

-- 4e. The SSN/EIN refusal from 03_pii_guards.sql, now on the tables this script created (share-link labels) and any new columns.
create or replace function public.looks_like_identifier(t text) returns boolean language sql immutable as $$ select public.ts_has_identifier(t) $$;
do $$
declare r record; cols_present text; args_present text;
begin
  for r in select * from (values
      ('clients', 'name, notes'), ('tax_returns', 'notes'), ('ria_projections', 'notes'), ('messages', 'body'), ('video_share_links', 'label')
    ) as v(tbl, cols)
  loop
    select string_agg(quote_ident(trim(c)), ', '), string_agg(quote_literal(trim(c)), ', ') into cols_present, args_present
      from unnest(string_to_array(r.cols, ',')) c
     where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = trim(c));
    if cols_present is not null then
      execute format('drop trigger if exists ts_reject_identifiers on public.%I', r.tbl);
      execute format('create trigger ts_reject_identifiers before insert or update of %s on public.%I for each row execute function public.ts_reject_identifiers(%s)',
        cols_present, r.tbl, args_present);
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Functions called by the server
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- A URL-safe random token (≈244 random bits) without pgcrypto.
create or replace function public.ts_random_token() returns text language sql volatile as $$
  select translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_')
$$;

-- ── Rate limits ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w  int := greatest(1, p_window_seconds);
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / w) * w);
  n  int;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, ws, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '2 days'; end if;   -- housekeeping
  return jsonb_build_object('allowed', n <= p_limit, 'hits', n,
    'retry_after', greatest(1, ceil(extract(epoch from (ws + make_interval(secs => w) - now())))::int));
end $$;

-- ── Credits and projections ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Charge one unit, once per (user, kind, job). Plan allowance first, then purchased credits. Raises P0402 (credits) / P0403 (projections).
create or replace function public.reserve_usage(p_user uuid, p_kind text, p_job text, p_plan_limit int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u  public.usage_counters%rowtype;
  ev public.usage_events%rowtype;
  used int; src text;
begin
  if p_kind not in ('credit','projection') then raise exception 'invalid kind %', p_kind using errcode = '22023'; end if;
  insert into public.usage_counters (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into u from public.usage_counters where user_id = p_user for update;

  select * into ev from public.usage_events where user_id = p_user and kind = p_kind and job_key = p_job for update;
  if found and ev.refunded_at is null then
    return jsonb_build_object('charged', false, 'duplicate', true, 'source', ev.source);
  end if;

  used := case when p_kind = 'credit' then u.credits_used else u.projections_used end;
  if used < coalesce(p_plan_limit, 0) then
    src := 'plan';
    if p_kind = 'credit' then update public.usage_counters set credits_used = credits_used + 1, updated_at = now() where user_id = p_user;
    else update public.usage_counters set projections_used = projections_used + 1, updated_at = now() where user_id = p_user; end if;
  elsif p_kind = 'credit' and u.pack_credits_balance > 0 then
    src := 'pack';
    update public.usage_counters set pack_credits_balance = pack_credits_balance - 1, updated_at = now() where user_id = p_user;
  elsif p_kind = 'credit' then
    raise exception 'No walkthrough credits remaining' using errcode = 'P0402';
  else
    raise exception 'Projection allowance used' using errcode = 'P0403';
  end if;

  if ev.id is not null then   -- a refunded charge being retried with the same key
    update public.usage_events set source = src, period_start = u.period_start, refunded_at = null, created_at = now() where id = ev.id;
  else
    insert into public.usage_events (user_id, kind, job_key, source, period_start) values (p_user, p_kind, p_job, src, u.period_start);
  end if;
  return jsonb_build_object('charged', true, 'source', src);
end $$;

-- Return a charge. TRUE if returned now or already returned; FALSE if there was nothing to return. Plan units are given back only if the
-- allowance year has not rolled over since the charge (a new year has already reset the count).
create or replace function public.refund_usage(p_user uuid, p_kind text, p_job text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.usage_events%rowtype; cur timestamptz;
begin
  select * into ev from public.usage_events where user_id = p_user and kind = p_kind and job_key = p_job for update;
  if not found then return false; end if;
  if ev.refunded_at is not null then return true; end if;
  select period_start into cur from public.usage_counters where user_id = p_user for update;
  if ev.source = 'pack' then
    update public.usage_counters set pack_credits_balance = pack_credits_balance + 1, updated_at = now() where user_id = p_user;
  elsif cur is not distinct from ev.period_start then
    if p_kind = 'credit' then update public.usage_counters set credits_used = greatest(0, credits_used - 1), updated_at = now() where user_id = p_user;
    else update public.usage_counters set projections_used = greatest(0, projections_used - 1), updated_at = now() where user_id = p_user; end if;
  end if;
  update public.usage_events set refunded_at = now() where id = ev.id;
  return true;
end $$;

-- ── Vendor spend caps ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.ts_vendor_spend(p_day date, p_user uuid default null) returns numeric language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(case status when 'settled' then coalesce(actual_usd, est_usd) when 'reserved' then est_usd when 'assumed' then est_usd else 0 end), 0)
    from public.vendor_calls where day = p_day and (p_user is null or user_id = p_user)
$$;

create or replace function public.reserve_vendor_budget(p_user uuid, p_vendor text, p_est numeric, p_global_limit numeric, p_user_limit numeric,
  p_call_key text, p_units int default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d date := (now() at time zone 'utc')::date; g numeric; us numeric;
begin
  perform pg_advisory_xact_lock(hashtext('ts-vendor-budget:' || d::text));   -- concurrent reservations cannot jointly exceed the cap
  g := public.ts_vendor_spend(d); us := public.ts_vendor_spend(d, p_user);
  if exists (select 1 from public.vendor_calls where call_key = p_call_key) then
    return jsonb_build_object('allowed', true, 'duplicate', true, 'global_spend', g, 'user_spend', us);
  end if;
  if g + coalesce(p_est, 0) > p_global_limit then
    return jsonb_build_object('allowed', false, 'blocked_by', 'global', 'global_spend', g, 'user_spend', us);
  end if;
  if us + coalesce(p_est, 0) > p_user_limit then
    return jsonb_build_object('allowed', false, 'blocked_by', 'user', 'global_spend', g, 'user_spend', us);
  end if;
  insert into public.vendor_calls (call_key, user_id, vendor, day, est_usd, units, status) values (p_call_key, p_user, p_vendor, d, coalesce(p_est, 0), coalesce(p_units, 0), 'reserved');
  return jsonb_build_object('allowed', true, 'global_spend', g + coalesce(p_est, 0), 'user_spend', us + coalesce(p_est, 0));
end $$;

-- Record what the vendor actually billed (idempotent). Returns today's global spend.
create or replace function public.settle_vendor_call(p_call_key text, p_user uuid, p_vendor text, p_actual numeric, p_units int default 0)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare d date := (now() at time zone 'utc')::date;
begin
  insert into public.vendor_calls (call_key, user_id, vendor, day, est_usd, actual_usd, units, status, settled_at)
  values (p_call_key, p_user, p_vendor, d, coalesce(p_actual, 0), coalesce(p_actual, 0), coalesce(p_units, 0), 'settled', now())
  on conflict (call_key) do update set actual_usd = excluded.actual_usd, units = excluded.units, status = 'settled', settled_at = now();
  return public.ts_vendor_spend(d);
end $$;

create or replace function public.release_vendor_reservation(p_call_key text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.vendor_calls set status = 'released', settled_at = now() where call_key = p_call_key and status = 'reserved'
$$;

-- A reservation nobody settled (a worker died) is counted at its estimate from now on — never forgotten.
create or replace function public.assume_stale_vendor_reservations(p_older interval default interval '2 hours')
returns int language sql security definer set search_path = public, pg_temp as $$
  with a as (update public.vendor_calls set status = 'assumed' where status = 'reserved' and created_at < now() - p_older returning 1)
  select count(*)::int from a
$$;

-- ── Voiceover jobs ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- One transaction: create the job, charge a credit, reserve the vendor budget, record any approval. Any failure rolls back all of it.
-- Errors: P0002 return not found · P0409 a job is already running for this return · P0402 no credits · P0503 daily budget (DETAIL user|global).
create or replace function public.start_audio_job(p_user uuid, p_tax_return uuid, p_payload jsonb, p_plan_limit int, p_request_key text default null,
  p_approval jsonb default null, p_est_cost numeric default 0, p_global_limit numeric default 50, p_user_limit numeric default 5, p_est_units int default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare j uuid; b jsonb; v int;
begin
  if p_request_key is not null then
    select id into j from public.jobs where user_id = p_user and request_key = p_request_key;
    if found then return jsonb_build_object('job_id', j, 'duplicate', true); end if;
  end if;
  perform 1 from public.tax_returns where id = p_tax_return and user_id = p_user for update;
  if not found then raise exception 'Return not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.jobs where tax_return_id = p_tax_return and status in ('queued','running')) then
    raise exception 'A walkthrough is already being generated for this return' using errcode = 'P0409';
  end if;

  insert into public.jobs (user_id, tax_return_id, payload, request_key) values (p_user, p_tax_return, coalesce(p_payload, '{}'::jsonb), p_request_key)
  returning id into j;
  perform public.reserve_usage(p_user, 'credit', j::text, p_plan_limit);
  b := public.reserve_vendor_budget(p_user, 'openai', p_est_cost, p_global_limit, p_user_limit, 'audio:' || j::text, p_est_units);
  if not coalesce((b->>'allowed')::boolean, false) then
    raise exception 'Daily vendor budget reached' using errcode = 'P0503', detail = coalesce(b->>'blocked_by', 'global');
  end if;

  if p_approval is not null then
    select coalesce(max(version), 0) + 1 into v from public.narration_approvals where tax_return_id = p_tax_return;
    insert into public.narration_approvals (tax_return_id, user_id, version, kind, narration, narration_sha256, approved_amounts, note)
    values (p_tax_return, p_user, v, p_approval->>'kind', p_payload->'segments', p_approval->>'sha256',
            coalesce(p_approval->'amounts', '[]'::jsonb), p_approval->>'note');
  end if;
  return jsonb_build_object('job_id', j, 'duplicate', false);
end $$;

-- queued → running, once. FALSE if someone else already claimed it (or it finished).
create or replace function public.claim_job(p_job uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.jobs set status = 'running', started_at = now(), heartbeat_at = now()
   where id = p_job and user_id = p_user and status = 'queued';
  return found;
end $$;

-- Fail (and refund) jobs whose worker died: running with no heartbeat for 16 minutes (background functions stop at 15), or never started
-- after 10 minutes. With p_user, only that user's jobs. Returns how many were reaped.
create or replace function public.reap_stale_jobs(p_user uuid default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id, user_id, status from public.jobs
            where (p_user is null or user_id = p_user)
              and ((status = 'running' and coalesce(heartbeat_at, started_at, created_at) < now() - interval '16 minutes')
                or (status = 'queued'  and created_at < now() - interval '10 minutes'))
            for update skip locked
  loop
    update public.jobs set status = 'failed', finished_at = now(),
      error = 'This walkthrough stopped before it finished. Your credit has been returned — please try again.' where id = r.id;
    perform public.refund_usage(r.user_id, 'credit', r.id::text);
    if r.status = 'queued' then perform public.release_vendor_reservation('audio:' || r.id::text); end if;   -- never started: nothing was billed
    n := n + 1;
  end loop;
  return n;
end $$;

-- Return any credit still owed to a job that failed in the last p_days (the safety net behind refundUsage).
create or replace function public.reconcile_failed_job_refunds(p_days int default 14)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select j.id, j.user_id from public.jobs j
             join public.usage_events e on e.user_id = j.user_id and e.kind = 'credit' and e.job_key = j.id::text and e.refunded_at is null
            where j.status = 'failed' and j.finished_at > now() - make_interval(days => greatest(1, p_days))
  loop
    if public.refund_usage(r.user_id, 'credit', r.id::text) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Alarm input: failed jobs (over an hour old) whose credit is still not returned.
create or replace function public.count_unrefunded_failed_jobs()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.jobs j
    join public.usage_events e on e.user_id = j.user_id and e.kind = 'credit' and e.job_key = j.id::text and e.refunded_at is null
   where j.status = 'failed' and j.finished_at < now() - interval '1 hour' and j.finished_at > now() - interval '30 days'
$$;

-- ── Share links, viewing, client portal ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.create_share_link_for(p_user_id uuid, p_tax_return_id uuid, p_label text, p_expires_days int default 30,
  p_delivery_method text default 'link', p_sent_to text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare t text;
begin
  perform 1 from public.tax_returns where id = p_tax_return_id and user_id = p_user_id;
  if not found then raise exception 'Return not found' using errcode = 'P0002'; end if;
  loop
    t := public.ts_random_token();
    exit when not exists (select 1 from public.video_share_links where token = t);
  end loop;
  insert into public.video_share_links (token, firm_id, tax_return_id, label, delivery_method, sent_to, expires_at)
  values (t, p_user_id, p_tax_return_id, left(p_label, 100), p_delivery_method, p_sent_to,
          now() + make_interval(days => greatest(1, least(365, coalesce(p_expires_days, 30)))));
  return t;
end $$;

-- Records a viewing event for a token-holder (no login). link_opened is recorded at most once per 30 minutes per link (page reloads).
create or replace function public.record_view_event(p_token text, p_event_type text, p_watch_pct int default null, p_viewer_ua text default null,
  p_viewer_country text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.video_share_links%rowtype;
begin
  if p_event_type not in ('link_opened','view_start','view_progress','view_complete') then return jsonb_build_object('ok', false, 'reason', 'event'); end if;
  select * into l from public.video_share_links where token = p_token;
  if not found or not l.is_active or (l.expires_at is not null and l.expires_at < now()) then return jsonb_build_object('ok', false, 'reason', 'link'); end if;
  if not (p_event_type = 'link_opened' and exists (select 1 from public.video_view_events
           where share_link_id = l.id and event_type = 'link_opened' and created_at > now() - interval '30 minutes')) then
    insert into public.video_view_events (share_link_id, firm_id, tax_return_id, event_type, watch_pct)
    values (l.id, l.firm_id, l.tax_return_id, p_event_type, case when p_watch_pct between 0 and 100 then p_watch_pct end);
  end if;
  return jsonb_build_object('ok', true, 'firm_id', l.firm_id, 'share_link_id', l.id, 'tax_return_id', l.tax_return_id);
end $$;

create or replace function public.touch_portal(p_client uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.clients set portal_access_count = portal_access_count + 1, portal_last_accessed_at = now() where id = p_client
$$;

-- ── Stripe billing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- 'claimed' (process it) · 'duplicate' (already done) · 'in_progress' (another delivery is processing it; Stripe retries later).
-- A failed attempt, or one stuck in processing for 5 minutes, can be claimed again.
create or replace function public.claim_stripe_event(p_id text, p_type text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.stripe_events%rowtype;
begin
  insert into public.stripe_events (id, type) values (p_id, p_type) on conflict (id) do nothing;
  if found then return 'claimed'; end if;
  select * into e from public.stripe_events where id = p_id for update;
  if e.status = 'done' then return 'duplicate'; end if;
  if e.status = 'processing' and e.claimed_at > now() - interval '5 minutes' then return 'in_progress'; end if;
  update public.stripe_events set status = 'processing', claimed_at = now(), attempts = attempts + 1, finished_at = null where id = p_id;
  return 'claimed';
end $$;

create or replace function public.finish_stripe_event(p_id text, p_ok boolean)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.stripe_events set status = case when p_ok then 'done' else 'failed' end, finished_at = now() where id = p_id
$$;

-- Applies a subscription's state unless a NEWER Stripe event has already been applied (events can arrive out of order). TRUE if applied.
create or replace function public.apply_subscription_state(p_user uuid, p_sub_id text, p_customer text, p_status text, p_tier text,
  p_period_end timestamptz, p_event_created bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare rid uuid; last bigint;
begin
  if p_tier not in ('cpa_basic','cpa_pro','ria_basic','ria_pro') then raise exception 'unknown tier %', p_tier using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('ts-sub:' || p_user::text));
  select id, last_event_created into rid, last from public.subscriptions
   where user_id = p_user order by (stripe_subscription_id = p_sub_id) desc nulls last, updated_at desc nulls last limit 1;
  if rid is not null and last is not null and last > p_event_created then return false; end if;
  if rid is null then
    insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, last_event_created, updated_at)
    values (p_user, p_customer, p_sub_id, p_tier, p_status, p_period_end, p_event_created, now());
  else
    update public.subscriptions set stripe_customer_id = p_customer, stripe_subscription_id = p_sub_id, tier = p_tier, status = p_status,
      current_period_end = p_period_end, last_event_created = p_event_created, updated_at = now() where id = rid;
  end if;
  return true;
end $$;

-- Allowances are ANNUAL from the subscription start. p_force (a new subscription) always starts a fresh year; a monthly invoice resets
-- only once a full year has passed. Idempotent per p_key. Purchased credits are never reset. TRUE if the counters were reset.
create or replace function public.roll_usage_period(p_user uuid, p_period_start timestamptz, p_key text, p_force boolean default false)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare cur timestamptz; do_reset boolean;
begin
  insert into public.usage_period_rolls (key, user_id) values (p_key, p_user) on conflict (key) do nothing;
  if not found then return false; end if;
  insert into public.usage_counters (user_id) values (p_user) on conflict (user_id) do nothing;
  select period_start into cur from public.usage_counters where user_id = p_user for update;
  do_reset := p_force or cur is null or p_period_start >= cur + interval '1 year' - interval '2 days';   -- 2 days' slack for invoice timing
  if do_reset then
    update public.usage_counters set credits_used = 0, projections_used = 0, period_start = coalesce(p_period_start, now()), updated_at = now()
     where user_id = p_user;
  end if;
  update public.usage_period_rolls set applied = do_reset where key = p_key;
  return do_reset;
end $$;

-- Purchased credit pack, once per Stripe event. Never expires.
create or replace function public.grant_pack_credits(p_user uuid, p_credits int, p_event_id text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_credits not in (10, 25, 50) then raise exception 'invalid pack size %', p_credits using errcode = '22023'; end if;
  insert into public.pack_grants (event_id, user_id, credits) values (p_event_id, p_user, p_credits) on conflict (event_id) do nothing;
  if not found then return false; end if;
  insert into public.usage_counters (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.usage_counters set pack_credits_balance = pack_credits_balance + p_credits, pack_credits_lifetime = pack_credits_lifetime + p_credits,
    updated_at = now() where user_id = p_user;
  return true;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Only the server may call these. (Supabase lets anon/authenticated execute new functions by default.)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare f text;
begin
  foreach f in array array[
    'rate_limit_hit(text,int,int)', 'reserve_usage(uuid,text,text,int)', 'refund_usage(uuid,text,text)',
    'ts_vendor_spend(date,uuid)', 'reserve_vendor_budget(uuid,text,numeric,numeric,numeric,text,int)', 'settle_vendor_call(text,uuid,text,numeric,int)',
    'release_vendor_reservation(text)', 'assume_stale_vendor_reservations(interval)',
    'start_audio_job(uuid,uuid,jsonb,int,text,jsonb,numeric,numeric,numeric,int)', 'claim_job(uuid,uuid)', 'reap_stale_jobs(uuid)',
    'reconcile_failed_job_refunds(int)', 'count_unrefunded_failed_jobs()',
    'create_share_link_for(uuid,uuid,text,int,text,text)', 'record_view_event(text,text,int,text,text)', 'touch_portal(uuid)',
    'claim_stripe_event(text,text)', 'finish_stripe_event(text,boolean)',
    'apply_subscription_state(uuid,text,text,text,text,timestamptz,bigint)', 'roll_usage_period(uuid,timestamptz,text,boolean)',
    'grant_pack_credits(uuid,int,text)', 'ts_random_token()', 'ts_firm_labels_only(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
