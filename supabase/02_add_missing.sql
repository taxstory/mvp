-- TaxStory — add what the recent onboarding and video changes need. SAFE TO RE-RUN: every statement checks first and only adds what is missing.
-- It never drops, renames or rewrites existing data. Run 01_verify.sql before and after.

begin;

-- ── 1. Onboarding: profile columns ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists practice_type           text;
alter table public.profiles add column if not exists primary_use             text;
alter table public.profiles add column if not exists brand_color             text;
alter table public.profiles add column if not exists logo_url                text;
alter table public.profiles add column if not exists onboarding_completed    boolean not null default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

-- Users can read and update their own profile row (the sign-up trigger creates it; the wizard only UPDATES it).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and cmd in ('SELECT','ALL')) then
    create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and cmd in ('UPDATE','ALL')) then
    create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- ── 2. Onboarding: progress table ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,   -- primary key = the unique key the wizard's upsert needs
  step             int  not null default 1,
  firm_name        text,
  practice_type    text,
  primary_use      text,
  used_demo_return boolean,
  completed        boolean not null default false,
  brand_color      text,
  logo_url         text,
  updated_at       timestamptz not null default now()
);
-- If the table already existed, make sure every column the wizard writes is there.
alter table public.onboarding_state add column if not exists step             int not null default 1;
alter table public.onboarding_state add column if not exists firm_name        text;
alter table public.onboarding_state add column if not exists practice_type    text;
alter table public.onboarding_state add column if not exists primary_use      text;
alter table public.onboarding_state add column if not exists used_demo_return boolean;
alter table public.onboarding_state add column if not exists completed        boolean not null default false;
alter table public.onboarding_state add column if not exists brand_color      text;
alter table public.onboarding_state add column if not exists logo_url         text;
-- An existing table without a unique user_id makes every upsert fail.
do $$ begin
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid=i.indrelid join pg_attribute a on a.attrelid=c.oid and a.attnum = any(i.indkey)
    where c.relname='onboarding_state' and c.relnamespace='public'::regnamespace and i.indisunique and a.attname='user_id' and array_length(i.indkey::int2[],1)=1
  ) then
    create unique index onboarding_state_user_id_key on public.onboarding_state(user_id);
  end if;
end $$;

alter table public.onboarding_state enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='onboarding_state' and cmd in ('SELECT','ALL')) then
    create policy "Users read own onboarding"   on public.onboarding_state for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='onboarding_state' and cmd in ('INSERT','ALL')) then
    create policy "Users insert own onboarding" on public.onboarding_state for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='onboarding_state' and cmd in ('UPDATE','ALL')) then
    create policy "Users update own onboarding" on public.onboarding_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── 3. Video: columns on tax_returns ──────────────────────────────────────────────────────────────────────────
alter table public.tax_returns add column if not exists video_url       text;   -- set only by the save-video function (service role)
alter table public.tax_returns add column if not exists video_status    text;
alter table public.tax_returns add column if not exists video_render_id text;
alter table public.tax_returns add column if not exists video_bucket    text;

-- ── 4. Storage: the private `audio` bucket now also holds the rendered walkthrough video ─────────────────────
insert into storage.buckets (id, name, public) values ('audio', 'audio', false) on conflict (id) do nothing;
-- If file types are restricted, add the two video types (an unrestricted bucket is left alone).
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array['video/mp4','video/webm']) m)
 where id = 'audio' and allowed_mime_types is not null and not (allowed_mime_types @> array['video/mp4','video/webm']);
-- A 2-minute walkthrough is ~20 MB; allow up to 200 MB (matches the save-video check). Only raises a lower limit.
update storage.buckets set file_size_limit = 209715200
 where id = 'audio' and file_size_limit is not null and file_size_limit < 209715200;

-- Each user reads/writes only their own folder (<user id>/...): the browser uploads the video, signs media, and replaces a re-render.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and coalesce(qual,'')||coalesce(with_check,'') like '%''audio''%' and cmd = 'ALL') then
    create policy "Users access own audio" on storage.objects for all
      using      (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

-- ── 5. Storage: firm logos (onboarding + settings). Public read so client pages and emails can show the logo. ─
insert into storage.buckets (id, name, public) values ('firm-assets', 'firm-assets', true) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and coalesce(qual,'')||coalesce(with_check,'') like '%''firm-assets''%' and cmd in ('INSERT','ALL')) then
    create policy "Users upload own firm assets" on storage.objects for insert
      with check (bucket_id = 'firm-assets' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and coalesce(qual,'')||coalesce(with_check,'') like '%''firm-assets''%' and cmd in ('UPDATE','ALL')) then
    create policy "Users replace own firm assets" on storage.objects for update
      using      (bucket_id = 'firm-assets' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'firm-assets' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

commit;
