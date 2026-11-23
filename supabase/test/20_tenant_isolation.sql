-- Tenant-isolation attack suite. Two synthetic firms: A (victim) and B (attacker). Every check is an attack that must FAIL.
-- It runs as Supabase's `authenticated` role with B's identity, exactly what B can do by calling the API directly with the public key and
-- B's own login (no frontend involved), plus the `anon` role (no login). Test database only (supabase/test/run.sh).
-- Each check prints "ok" or "VULNERABLE"; the script fails at the end if any check is vulnerable.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ── fixtures (as the server / database owner) ──
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'firm-a@test'), ('bbbbbbbb-0000-0000-0000-00000000000b', 'firm-b@test');
insert into public.clients (id, user_id, name) values
  ('aaaaaaaa-c000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A household'),
  ('bbbbbbbb-c000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B household');
update public.clients set portal_token = 'A-PORTAL-TOKEN-0000000000000000000000000000' where id = 'aaaaaaaa-c000-0000-0000-00000000000a';
insert into public.tax_returns (id, user_id, client_id, status, file_name, parsed_data) values
  ('aaaaaaaa-7000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-c000-0000-0000-00000000000a', 'audio_ready', 'a.pdf', '{"agi": 100000}'),
  ('bbbbbbbb-7000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-c000-0000-0000-00000000000b', 'parsed', 'b.pdf', '{"agi": 50000}');
insert into public.messages (user_id, client_id, direction, body) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-c000-0000-0000-00000000000a', 'inbound', 'A private message');
insert into public.ria_projections (id, user_id, client_label, inputs) values ('aaaaaaaa-9000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A plan', '{}');
\o /dev/null
select public.create_share_link_for('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-7000-0000-0000-00000000000a', 'A link', 30, 'copied', null);
select public.grant_pack_credits('aaaaaaaa-0000-0000-0000-00000000000a', 10, 'evt_a');
\o
insert into public.usage_counters (user_id) values ('bbbbbbbb-0000-0000-0000-00000000000b') on conflict do nothing;
insert into public.subscriptions (user_id, tier, status) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'cpa_pro', 'active');
insert into storage.objects (bucket_id, name, owner) values ('audio', 'aaaaaaaa-0000-0000-0000-00000000000a/aaaaaaaa-7000-0000-0000-00000000000a/voice.mp3', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.onboarding_state (user_id) values ('aaaaaaaa-0000-0000-0000-00000000000a') on conflict do nothing;

create table public._results (n serial, check_name text, ok boolean, detail text);
grant insert, select on public._results to authenticated, anon; grant usage on sequence public._results_n_seq to authenticated, anon;
create or replace function pg_temp.expect(ok boolean, name text, detail text default '') returns void language plpgsql as $$
begin insert into public._results (check_name, ok, detail) values (name, ok, detail); end $$;
-- runs a statement; returns 'denied' if it raised a permission/policy error, else the number of rows it affected
create or replace function pg_temp.try(q text) returns text language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n::text;
exception when insufficient_privilege or check_violation or raise_exception or foreign_key_violation then return 'denied';
  when others then return 'error: ' || sqlerrm;
end $$;
create or replace function pg_temp.cnt(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute 'select count(*) from (' || q || ') x' into n; return n; end $$;

-- Supabase's default table grants come from the stub's ALTER DEFAULT PRIVILEGES (as on a real project), so a REVOKE in a migration stands.
grant select, insert, update, delete on storage.objects to authenticated, anon;

-- ═══════ as Firm B (signed in, calling the API directly) ═══════
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-00000000000b', false), set_config('request.jwt.claim.role', 'authenticated', false) \gset
do $$
declare t text; r text;
begin
  -- 1. READ: B sees none of A's rows, in any table
  foreach t in array array['profiles','clients','tax_returns','messages','ria_projections','jobs','usage_counters','usage_events','subscriptions',
                           'video_share_links','video_view_events','video_view_notifications','narration_approvals','audit_log','onboarding_state','stripe_events',
                           'vendor_calls','rate_limits','pack_grants','feedback'] loop
    perform pg_temp.expect(pg_temp.cnt(format('select 1 from public.%I where %s', t,
      case t when 'profiles' then 'id = ''aaaaaaaa-0000-0000-0000-00000000000a'''
             when 'video_share_links' then 'firm_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''
             when 'video_view_events' then 'firm_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''
             when 'video_view_notifications' then 'firm_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''
             when 'stripe_events' then 'true' when 'rate_limits' then 'true' when 'pack_grants' then 'true' when 'vendor_calls' then 'true'
             else 'user_id = ''aaaaaaaa-0000-0000-0000-00000000000a''' end)) = 0, 'B cannot read A''s ' || t);
  end loop;
  perform pg_temp.expect(pg_temp.cnt('select 1 from public.clients where portal_token is not null and user_id <> auth.uid()') = 0, 'B cannot read A''s portal token');
  perform pg_temp.expect(pg_temp.cnt('select 1 from storage.objects where name like ''aaaaaaaa%''') = 0, 'B cannot list or download A''s files');

  -- 2. UPDATE / DELETE A's rows: nothing changes
  r := pg_temp.try('update public.tax_returns set notes = ''x'' where user_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot edit A''s returns', r);
  r := pg_temp.try('delete from public.tax_returns where user_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot delete A''s returns', r);
  r := pg_temp.try('update public.clients set name = ''pwned'' where user_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot edit A''s clients', r);
  r := pg_temp.try('delete from public.clients where user_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot delete A''s clients', r);
  r := pg_temp.try('update public.profiles set firm_name = ''pwned'' where id = ''aaaaaaaa-0000-0000-0000-00000000000a'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot edit A''s profile', r);
  r := pg_temp.try('delete from public.messages where user_id = ''aaaaaaaa-0000-0000-0000-00000000000a'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot delete A''s messages', r);
  r := pg_temp.try('update public.video_share_links set is_active = false'); perform pg_temp.expect(r in ('0','denied'), 'B cannot revoke A''s share links', r);
  r := pg_temp.try('delete from storage.objects where name like ''aaaaaaaa%'''); perform pg_temp.expect(r in ('0','denied'), 'B cannot delete A''s files', r);

  -- 3. WRITE INTO A's account
  r := pg_temp.try('insert into public.clients (user_id, name) values (''aaaaaaaa-0000-0000-0000-00000000000a'', ''planted'')'); perform pg_temp.expect(r = 'denied', 'B cannot create clients in A''s account', r);
  r := pg_temp.try('insert into public.messages (user_id, body) values (''aaaaaaaa-0000-0000-0000-00000000000a'', ''planted'')'); perform pg_temp.expect(r = 'denied', 'B cannot plant messages in A''s inbox', r);
  r := pg_temp.try('update public.clients set user_id = ''aaaaaaaa-0000-0000-0000-00000000000a'' where user_id = auth.uid()'); perform pg_temp.expect(r = 'denied', 'B cannot move its rows into A''s account', r);
  r := pg_temp.try('insert into storage.objects (bucket_id, name) values (''audio'', ''aaaaaaaa-0000-0000-0000-00000000000a/x/evil.mp3'')'); perform pg_temp.expect(r = 'denied', 'B cannot upload into A''s folder', r);

  -- 4. CROSS-TENANT REFERENCES: B's own rows pointing at A's client (would surface in A's client portal / inbox)
  r := pg_temp.try('update public.tax_returns set client_id = ''aaaaaaaa-c000-0000-0000-00000000000a'' where id = ''bbbbbbbb-7000-0000-0000-00000000000b'''); perform pg_temp.expect(r = 'denied' or (select client_id from public.tax_returns where id = 'bbbbbbbb-7000-0000-0000-00000000000b') = 'bbbbbbbb-c000-0000-0000-00000000000b', 'B cannot attach its return to A''s client', r);
  r := pg_temp.try('insert into public.messages (user_id, client_id, body) values (auth.uid(), ''aaaaaaaa-c000-0000-0000-00000000000a'', ''hi'')'); perform pg_temp.expect(r = 'denied', 'B cannot attach a message to A''s client', r);

  -- 5. PRIVILEGE ESCALATION on B's own account
  r := pg_temp.try('update public.profiles set founding_member = true where id = auth.uid()'); perform pg_temp.expect(r = 'denied'
      or not (select founding_member from public.profiles where id = auth.uid()), 'B cannot make itself a founding member (45% discount)', r);
  r := pg_temp.try('update public.usage_counters set pack_credits_balance = 999 where user_id = auth.uid()'); perform pg_temp.expect(r in ('0','denied'), 'B cannot give itself credits', r);
  r := pg_temp.try('update public.subscriptions set tier = ''cpa_pro'', status = ''active'' where user_id = auth.uid()'); perform pg_temp.expect(r in ('0','denied'), 'B cannot upgrade its own plan', r);
  r := pg_temp.try('insert into public.subscriptions (user_id, tier, status) values (auth.uid(), ''cpa_pro'', ''active'')'); perform pg_temp.expect(r = 'denied', 'B cannot insert a paid subscription', r);
  r := pg_temp.try('insert into public.tax_returns (user_id, status, file_name) values (auth.uid(), ''parsed'', ''free.pdf'')'); perform pg_temp.expect(r = 'denied', 'B cannot save returns without the projection allowance (direct insert)', r);
  r := pg_temp.try('insert into public.ria_projections (user_id, client_label, inputs) values (auth.uid(), ''free'', ''{}'')'); perform pg_temp.expect(r = 'denied', 'B cannot save planning projections without the plan check (direct insert)', r);
  r := pg_temp.try('update public.tax_returns set parsed_data = ''{"agi": 1}'', status = ''audio_ready'' where id = ''bbbbbbbb-7000-0000-0000-00000000000b'''); perform pg_temp.expect(r = 'denied'
      or (select parsed_data->>'agi' from public.tax_returns where id = 'bbbbbbbb-7000-0000-0000-00000000000b') = '50000', 'B cannot rewrite a return''s figures or status (bypassing the approval record)', r);
  r := pg_temp.try('update public.tax_returns set audio_url = ''aaaaaaaa-0000-0000-0000-00000000000a/aaaaaaaa-7000-0000-0000-00000000000a/voice.mp3'' where id = ''bbbbbbbb-7000-0000-0000-00000000000b'''); perform pg_temp.expect(r = 'denied'
      or (select audio_url from public.tax_returns where id = 'bbbbbbbb-7000-0000-0000-00000000000b') is null, 'B cannot point its return at A''s audio file', r);
  r := pg_temp.try('update public.clients set portal_token = ''guessable'' where user_id = auth.uid()'); perform pg_temp.expect(r = 'denied'
      or not exists (select 1 from public.clients where portal_token = 'guessable'), 'B cannot choose its own (weak) portal token', r);
  r := pg_temp.try('insert into public.jobs (user_id, tax_return_id) values (auth.uid(), ''bbbbbbbb-7000-0000-0000-00000000000b'')'); perform pg_temp.expect(r = 'denied', 'B cannot create voiceover jobs directly', r);
  r := pg_temp.try('insert into public.audit_log (user_id, action) values (auth.uid(), ''forged'')'); perform pg_temp.expect(r = 'denied', 'B cannot forge audit log entries', r);
  r := pg_temp.try('delete from public.narration_approvals where user_id = auth.uid()'); perform pg_temp.expect(r in ('0','denied'), 'B cannot delete its approval records', r);

  -- 6. SERVER-ONLY FUNCTIONS (RPC) — all must be refused
  foreach t in array array[
    'select public.grant_pack_credits(auth.uid(), 50, ''free'')',
    'select public.reserve_usage(auth.uid(), ''credit'', ''x'', 999)',
    'select public.refund_usage(auth.uid(), ''credit'', ''x'')',
    'select public.apply_subscription_state(auth.uid(), ''s'', ''c'', ''active'', ''cpa_pro'', now(), 9999999999)',
    'select public.roll_usage_period(auth.uid(), now(), ''k'', true)',
    'select public.create_share_link_for(''aaaaaaaa-0000-0000-0000-00000000000a'', ''aaaaaaaa-7000-0000-0000-00000000000a'', ''stolen'')',
    'select public.start_audio_job(auth.uid(), ''bbbbbbbb-7000-0000-0000-00000000000b'', ''{}'', 999)',
    'select public.touch_portal(''aaaaaaaa-c000-0000-0000-00000000000a'')',
    'select public.record_view_event(''x'', ''view_complete'')',
    'select public.claim_stripe_event(''evt'', ''x'')',
    'select public.reap_stale_jobs()',
    'select public.rate_limit_hit(''k'', 1, 1)'] loop
    begin execute t; perform pg_temp.expect(false, 'RPC refused: ' || split_part(split_part(t, 'public.', 2), '(', 1));
    exception when insufficient_privilege then perform pg_temp.expect(true, 'RPC refused: ' || split_part(split_part(t, 'public.', 2), '(', 1)); end;
  end loop;
end $$;
reset role;

-- ═══════ anonymous (no login) ═══════
set role anon;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) \gset
do $$
declare t text; r text;
begin
  foreach t in array array['profiles','clients','tax_returns','messages','video_share_links','subscriptions','usage_counters','jobs'] loop
    perform pg_temp.expect(pg_temp.cnt(format('select 1 from public.%I', t)) = 0, 'Anonymous cannot read ' || t);
  end loop;
  r := pg_temp.try('insert into public.messages (user_id, body) values (''aaaaaaaa-0000-0000-0000-00000000000a'', ''spam'')'); perform pg_temp.expect(r = 'denied', 'Anonymous cannot plant messages', r);
  perform pg_temp.expect(pg_temp.cnt('select 1 from storage.objects') = 0, 'Anonymous cannot list files');
  begin perform public.record_view_event('x', 'view_complete'); perform pg_temp.expect(false, 'Anonymous cannot call RPCs');
  exception when insufficient_privilege then perform pg_temp.expect(true, 'Anonymous cannot call RPCs'); end;
end $$;
reset role;

-- ═══════ legitimate use still works (regression: never weaken to pass) ═══════
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-00000000000b', false), set_config('request.jwt.claim.role', 'authenticated', false) \gset
do $$
declare r text;
begin
  r := pg_temp.try('update public.profiles set firm_name = ''B Advisors'', phone = ''555'', brand_color = ''#123456'', privacy_mode = ''standard'', portal_ttl_days = 30 where id = auth.uid()'); perform pg_temp.expect(r = '1', 'B can edit its own profile settings', r);
  r := pg_temp.try('insert into public.clients (user_id, name) values (auth.uid(), ''New client'')'); perform pg_temp.expect(r = '1', 'B can add a client', r);
  r := pg_temp.try('update public.clients set notes = ''call Tuesday'', portal_token = null where user_id = auth.uid() and name = ''B household'''); perform pg_temp.expect(r = '1', 'B can edit client notes and revoke a portal link', r);
  r := pg_temp.try('update public.tax_returns set notes = ''reviewed'' where id = ''bbbbbbbb-7000-0000-0000-00000000000b'''); perform pg_temp.expect(r = '1', 'B can add notes to its return', r);
  r := pg_temp.try('insert into public.messages (user_id, client_id, direction, body) values (auth.uid(), ''bbbbbbbb-c000-0000-0000-00000000000b'', ''outbound'', ''hello'')'); perform pg_temp.expect(r = '1', 'B can message its own client', r);
  r := pg_temp.try('update public.messages set read = true, read_at = now() where user_id = auth.uid()'); perform pg_temp.expect(r <> 'denied', 'B can mark messages read', r);
  r := pg_temp.try('delete from public.tax_returns where id = ''bbbbbbbb-7000-0000-0000-00000000000b'''); perform pg_temp.expect(r = '1', 'B can delete its own return', r);
  r := pg_temp.try('insert into storage.objects (bucket_id, name) values (''audio'', ''bbbbbbbb-0000-0000-0000-00000000000b/r/video.mp4'')'); perform pg_temp.expect(r = '1', 'B can upload into its own folder', r);
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false) \gset
\pset footer off
select case when ok then 'ok         ' else 'VULNERABLE ' end || check_name || case when ok then '' else '   [got: ' || coalesce(detail,'') || ']' end as result from public._results order by n;
select count(*) filter (where not ok) as vulnerable, count(*) as checks from public._results \gset
\echo :vulnerable vulnerable of :checks checks
select case when :vulnerable > 0 then 1/0 end;   -- fail the run if anything is vulnerable
