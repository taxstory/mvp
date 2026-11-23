-- Functional tests for 04_core_schema.sql. Test database only (needs the stub + all scripts applied). Every block raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ── fixtures ──
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'), ('00000000-0000-0000-0000-00000000000b', 'b@test');
insert into public.tax_returns (id, user_id, status, file_name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'parsed', 'a.pdf'),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'parsed', 'a2.pdf'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'parsed', 'b.pdf');

create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise warning 'ok  %', msg; end $$;
create or replace function pg_temp.errcode_of(q text) returns text language plpgsql as $$
begin execute q; return 'none'; exception when others then return sqlstate; end $$;

-- ── 1. credits: plan → pack → P0402; duplicates; refunds ──
do $$
declare b boolean; n int; a uuid := '00000000-0000-0000-0000-00000000000a'; r jsonb;
begin
  perform public.reserve_usage(a, 'credit', 'j1', 3); perform public.reserve_usage(a, 'credit', 'j2', 3); perform public.reserve_usage(a, 'credit', 'j3', 3);
  r := public.reserve_usage(a, 'credit', 'j1', 3);
  perform pg_temp.ok(r->>'duplicate' = 'true' and (select credits_used from usage_counters where user_id = a) = 3, 'same job charged once');
  perform pg_temp.ok(pg_temp.errcode_of($q$select public.reserve_usage('00000000-0000-0000-0000-00000000000a','credit','j4',3)$q$) = 'P0402', 'out of credits → P0402');
  perform pg_temp.ok(public.grant_pack_credits(a, 10, 'evt_pack1') and not public.grant_pack_credits(a, 10, 'evt_pack1'), 'pack granted once per event');
  perform pg_temp.ok(pg_temp.errcode_of($q$select public.grant_pack_credits('00000000-0000-0000-0000-00000000000a', 7, 'evt_x')$q$) = '22023', 'odd pack size refused');
  r := public.reserve_usage(a, 'credit', 'j4', 3);
  perform pg_temp.ok(r->>'source' = 'pack' and (select pack_credits_balance from usage_counters where user_id = a) = 9, 'pack used after plan allowance');
  b := public.refund_usage(a, 'credit', 'j4'); perform pg_temp.ok(b and (select pack_credits_balance from usage_counters where user_id = a) = 10, 'pack refund returns to balance');
  b := public.refund_usage(a, 'credit', 'j4'); perform pg_temp.ok(b and (select pack_credits_balance from usage_counters where user_id = a) = 10, 'refund is idempotent');
  b := public.refund_usage(a, 'credit', 'j2'); perform pg_temp.ok(b and (select credits_used from usage_counters where user_id = a) = 2, 'plan refund decrements');
  perform pg_temp.ok(not public.refund_usage(a, 'credit', 'nope'), 'refund of unknown job is false');
  r := public.reserve_usage(a, 'credit', 'j2', 3);
  perform pg_temp.ok(r->>'charged' = 'true' and (select count(*) from usage_events where user_id = a and job_key = 'j2' and refunded_at is null) = 1, 'refunded job can be charged again');
  perform public.reserve_usage(a, 'projection', 'p1', 1);
  perform pg_temp.ok(pg_temp.errcode_of($q$select public.reserve_usage('00000000-0000-0000-0000-00000000000a','projection','p2',1)$q$) = 'P0403', 'projection limit → P0403');
end $$;

-- ── 2. rolling the allowance year ──
do $$
declare b boolean; n int; a uuid := '00000000-0000-0000-0000-00000000000a';
begin
  perform pg_temp.ok(not public.roll_usage_period(a, now() + interval '1 month', 'inv_1'), 'monthly invoice inside the year does not reset');
  perform pg_temp.ok(not public.roll_usage_period(a, now() + interval '2 years', 'inv_1'), 'same key applied once');
  b := public.roll_usage_period(a, now(), 'sub_new', true); perform pg_temp.ok(b and (select credits_used + projections_used from usage_counters where user_id = a) = 0
                     and (select pack_credits_balance from usage_counters where user_id = a) = 10, 'forced roll resets plan counters, keeps pack');
  perform pg_temp.ok(public.roll_usage_period(a, now() + interval '1 year', 'inv_2'), 'invoice a year on resets');
end $$;

-- ── 3. rate limits ──
do $$
declare b boolean; n int; r jsonb;
begin
  perform public.rate_limit_hit('k', 2, 60); perform public.rate_limit_hit('k', 2, 60); r := public.rate_limit_hit('k', 2, 60);
  perform pg_temp.ok(r->>'allowed' = 'false' and (r->>'retry_after')::int between 1 and 60, 'third hit in window refused with retry_after');
  perform pg_temp.ok((public.rate_limit_hit('other', 2, 60))->>'allowed' = 'true', 'keys are independent');
end $$;

-- ── 4. vendor budget ──
do $$
declare n int; a uuid := '00000000-0000-0000-0000-00000000000a'; b uuid := '00000000-0000-0000-0000-00000000000b'; r jsonb;
begin
  r := public.reserve_vendor_budget(a, 'openai', 3, 10, 4, 'c1', 100);
  perform pg_temp.ok(r->>'allowed' = 'true', 'reservation within limits');
  perform pg_temp.ok((public.reserve_vendor_budget(a, 'openai', 3, 10, 4, 'c1', 100))->>'duplicate' = 'true', 'duplicate call key allowed once');
  r := public.reserve_vendor_budget(a, 'openai', 2, 10, 4, 'c2', 100);
  perform pg_temp.ok(r->>'allowed' = 'false' and r->>'blocked_by' = 'user', 'user cap');
  perform public.reserve_vendor_budget(b, 'openai', 4, 10, 5, 'c3', 1);
  r := public.reserve_vendor_budget(b, 'openai', 4, 10, 50, 'c4', 1);
  perform pg_temp.ok(r->>'allowed' = 'false' and r->>'blocked_by' = 'global', 'global cap');
  perform pg_temp.ok(public.settle_vendor_call('c1', a, 'openai', 1.5, 100) = 5.5, 'settle counts the actual (1.5 + 4 held)');
  perform public.release_vendor_reservation('c3');
  perform pg_temp.ok(public.ts_vendor_spend((now() at time zone 'utc')::date) = 1.5, 'release frees the hold');
  update vendor_calls set created_at = now() - interval '3 hours' where call_key = 'c1';
  insert into vendor_calls (call_key, user_id, vendor, est_usd, created_at) values ('stale', a, 'openai', 2, now() - interval '3 hours');
  n := public.assume_stale_vendor_reservations(interval '2 hours'); perform pg_temp.ok(n = 1 and (select status from vendor_calls where call_key = 'stale') = 'assumed', 'stale hold assumed (settled untouched)');
  delete from vendor_calls;
end $$;

-- ── 5. voiceover jobs ──
do $$
declare b boolean; n int; a uuid := '00000000-0000-0000-0000-00000000000a'; ra uuid := '10000000-0000-0000-0000-00000000000a'; r jsonb; r2 jsonb; j uuid; used int;
begin
  used := (select credits_used from usage_counters where user_id = a);
  r := public.start_audio_job(a, ra, '{"segments":[{"text":"hi"}]}', 3, 'rk1', '{"kind":"correction","sha256":"abc","amounts":[100],"note":"ok"}', 0.2, 50, 5, 1000);
  j := (r->>'job_id')::uuid;
  perform pg_temp.ok(r->>'duplicate' = 'false' and (select status from jobs where id = j) = 'queued', 'job created');
  perform pg_temp.ok((select credits_used from usage_counters where user_id = a) = used + 1, 'credit charged');
  perform pg_temp.ok(exists (select 1 from vendor_calls where call_key = 'audio:' || j and status = 'reserved'), 'budget reserved under audio:<job>');
  perform pg_temp.ok((select version from narration_approvals where tax_return_id = ra) = 1, 'approval recorded as version 1');
  r2 := public.start_audio_job(a, ra, '{}', 3, 'rk1');
  perform pg_temp.ok(r2->>'duplicate' = 'true' and r2->>'job_id' = r->>'job_id', 'same request key → same job');
  perform pg_temp.ok(pg_temp.errcode_of(format($q$select public.start_audio_job(%L, %L, '{}', 3, 'rk2')$q$, a, ra)) = 'P0409', 'second job for same return → P0409');
  perform pg_temp.ok(pg_temp.errcode_of(format($q$select public.start_audio_job(%L, '10000000-0000-0000-0000-00000000000b', '{}', 3, 'rk3')$q$, a)) = 'P0002', 'someone else''s return → P0002');
  perform pg_temp.ok(public.claim_job(j, a) and not public.claim_job(j, a), 'claimed once');
  update jobs set heartbeat_at = now() - interval '20 minutes' where id = j;
  n := public.reap_stale_jobs(a); perform pg_temp.ok(n = 1 and (select status from jobs where id = j) = 'failed', 'dead worker reaped');
  perform pg_temp.ok((select credits_used from usage_counters where user_id = a) = used, 'reaped job refunded');
  perform pg_temp.ok((select status from vendor_calls where call_key = 'audio:' || j) = 'reserved', 'running job keeps its hold (may have been billed)');
end $$;

do $$
declare b boolean; a uuid := '00000000-0000-0000-0000-00000000000a'; ra uuid := '10000000-0000-0000-0000-00000000000a'; used int; n int; e text;
begin
  used := (select credits_used from usage_counters where user_id = a); n := (select count(*) from jobs);
  begin
    perform public.start_audio_job(a, ra, '{}', 3, 'rk-budget', null, 9, 50, 5, 1);
  exception when others then
    get stacked diagnostics e = pg_exception_detail; e := sqlstate || '/' || e;
  end;
  perform pg_temp.ok(e = 'P0503/user', 'over user budget → P0503 detail user');
  perform pg_temp.ok((select count(*) from jobs) = n and (select credits_used from usage_counters where user_id = a) = used, 'budget failure rolls back job and charge');
end $$;

do $$
declare b boolean; n int; a uuid := '00000000-0000-0000-0000-00000000000a'; ra uuid := '10000000-0000-0000-0000-00000000000a'; j uuid; used int;
begin
  j := (public.start_audio_job(a, ra, '{"segments":[]}', 3, 'rk4', '{"kind":"other","amounts":[]}', 0.1, 50, 5, 1))->>'job_id';
  perform pg_temp.ok((select max(version) from narration_approvals where tax_return_id = ra) = 2, 'second approval is version 2');
  update jobs set created_at = now() - interval '15 minutes' where id = j;
  used := (select credits_used from usage_counters where user_id = a);
  n := public.reap_stale_jobs(); perform pg_temp.ok(n = 1 and (select status from vendor_calls where call_key = 'audio:' || j) = 'released', 'never-started job reaped, hold released');
  perform pg_temp.ok((select credits_used from usage_counters where user_id = a) = used - 1, 'and refunded');
  -- a failure the worker forgot to refund
  j := (public.start_audio_job(a, ra, '{}', 3, 'rk5', null, 0, 50, 5, 0))->>'job_id';
  update jobs set status = 'failed', finished_at = now() - interval '2 hours' where id = j;
  perform pg_temp.ok(public.count_unrefunded_failed_jobs() = 1, 'unrefunded failure counted');
  n := public.reconcile_failed_job_refunds(14); perform pg_temp.ok(n = 1, 'reconciliation refunds it'); perform pg_temp.ok(public.count_unrefunded_failed_jobs() = 0, 'nothing left unrefunded');
end $$;

-- ── 6. share links, viewing, portal, labels-only privacy ──
do $$
declare b boolean; n int; a uuid := '00000000-0000-0000-0000-00000000000a'; ra uuid := '10000000-0000-0000-0000-00000000000a'; t text; r jsonb; c uuid;
begin
  t := public.create_share_link_for(a, ra, 'Smith 2025', 30, 'email', 'client@example.com');
  perform pg_temp.ok(length(t) >= 40 and t !~ '[+/=]', 'URL-safe token');
  perform pg_temp.ok((select sent_to from video_share_links where token = t) is null, 'labels-only: recipient not stored');
  perform pg_temp.ok(pg_temp.errcode_of(format($q$select public.create_share_link_for(%L, '10000000-0000-0000-0000-00000000000b', 'x')$q$, a)) = 'P0002', 'cannot share another firm''s return');
  perform pg_temp.ok(pg_temp.errcode_of(format($q$select public.create_share_link_for(%L, %L, 'ssn 123-45-6789')$q$, a, ra)) = '23514', 'SSN in label refused');
  r := public.record_view_event(t, 'link_opened'); perform public.record_view_event(t, 'link_opened');
  perform public.record_view_event(t, 'view_progress', 50, 'ua', 'US');
  perform pg_temp.ok(r->>'ok' = 'true' and (r->>'firm_id')::uuid = a, 'view event returns firm');
  perform pg_temp.ok((select count(*) from video_view_events where event_type = 'link_opened') = 1, 'reload within 30 min counts once');
  update video_share_links set expires_at = now() - interval '1 minute' where token = t;
  perform pg_temp.ok((public.record_view_event(t, 'view_start'))->>'ok' = 'false', 'expired link records nothing');
  perform pg_temp.ok((public.record_view_event('nope', 'view_start'))->>'ok' = 'false', 'unknown token');

  insert into clients (user_id, name, email, phone) values (a, 'Smith household', 'x@y.z', '555') returning id into c;
  perform pg_temp.ok((select email is null and phone is null from clients where id = c), 'labels-only: client contact not stored');
  update profiles set privacy_mode = 'standard', portal_ttl_days = 30 where id = a;
  update clients set email = 'x@y.z', portal_token = 'tok' where id = c;
  perform pg_temp.ok((select email from clients where id = c) = 'x@y.z', 'standard mode stores contact');
  perform pg_temp.ok((select portal_token_expires_at::date from clients where id = c) = (now() + interval '30 days')::date, 'portal expiry follows firm setting');
  perform public.touch_portal(c); perform public.touch_portal(c);
  perform pg_temp.ok((select portal_access_count from clients where id = c) = 2, 'portal visits counted');
  update clients set portal_token = 'tok2' where id = c;
  perform pg_temp.ok((select portal_access_count from clients where id = c) = 0, 'new token resets count');
  update clients set portal_token = null where id = c;
  perform pg_temp.ok((select portal_token_expires_at from clients where id = c) is null, 'revoked token clears expiry');
  update profiles set privacy_mode = 'labels_only' where id = a;
end $$;

-- ── 7. Stripe ──
do $$
declare b boolean; n int; a uuid := '00000000-0000-0000-0000-00000000000a';
begin
  perform pg_temp.ok(public.claim_stripe_event('evt_1', 'x') = 'claimed', 'first delivery claimed');
  perform pg_temp.ok(public.claim_stripe_event('evt_1', 'x') = 'in_progress', 'concurrent delivery waits');
  perform public.finish_stripe_event('evt_1', true);
  perform pg_temp.ok(public.claim_stripe_event('evt_1', 'x') = 'duplicate', 'done event is a duplicate');
  perform public.claim_stripe_event('evt_2', 'x'); perform public.finish_stripe_event('evt_2', false);
  perform pg_temp.ok(public.claim_stripe_event('evt_2', 'x') = 'claimed', 'failed event can be retried');
  perform pg_temp.ok((select attempts from stripe_events where id = 'evt_2') = 2, 'attempts counted');

  perform pg_temp.ok(public.apply_subscription_state(a, 'sub_1', 'cus_1', 'incomplete', 'cpa_basic', now(), 100), 'incomplete status accepted');
  perform pg_temp.ok(public.apply_subscription_state(a, 'sub_1', 'cus_1', 'active', 'cpa_pro', now() + interval '30 days', 200), 'newer event applied');
  perform pg_temp.ok(not public.apply_subscription_state(a, 'sub_1', 'cus_1', 'past_due', 'cpa_basic', now(), 150), 'older event ignored');
  perform pg_temp.ok((select count(*) from subscriptions where user_id = a) = 1 and (select tier || status from subscriptions where user_id = a) = 'cpa_proactive', 'one row, latest state');
  perform pg_temp.ok(pg_temp.errcode_of(format($q$select public.apply_subscription_state(%L,'s','c','active','gold',now(),300)$q$, a)) = '22023', 'unknown tier refused');
end $$;

-- ── 8. what a signed-in user can and cannot do ──
-- Supabase's default grants come from the stub's ALTER DEFAULT PRIVILEGES, so migrations' REVOKEs stand (do not re-grant here).
set role authenticated;
\o /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false), set_config('request.jwt.claim.role', 'authenticated', false);
\o
do $$
declare b boolean; n int;
begin
  perform pg_temp.ok(pg_temp.errcode_of($q$select public.reserve_usage('00000000-0000-0000-0000-00000000000b','credit','x',999)$q$) = '42501', 'user cannot call reserve_usage');
  perform pg_temp.ok(pg_temp.errcode_of($q$select public.grant_pack_credits('00000000-0000-0000-0000-00000000000b',50,'free')$q$) = '42501', 'user cannot grant credits');
  perform pg_temp.ok(pg_temp.errcode_of($q$select public.apply_subscription_state('00000000-0000-0000-0000-00000000000b','s','c','active','cpa_pro',now(),1)$q$) = '42501', 'user cannot set subscription');
  perform pg_temp.ok((select count(*) from public.jobs) = 0 and (select count(*) from public.video_share_links) = 0 and (select count(*) from public.usage_events) = 0, 'user B sees none of user A''s rows');
  perform pg_temp.ok(pg_temp.errcode_of($q$insert into public.jobs (user_id, tax_return_id) values ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b')$q$) = '42501', 'user cannot insert jobs');
  update public.usage_counters set pack_credits_balance = 999;
  perform pg_temp.ok(coalesce((select pack_credits_balance from public.usage_counters where user_id = '00000000-0000-0000-0000-00000000000b'), 0) < 999, 'user cannot edit own balance');
  update public.tax_returns set notes = 'call Tuesday', audio_url = '00000000-0000-0000-0000-00000000000a/x.mp3' where id = '10000000-0000-0000-0000-00000000000b';
end $$;
reset role;
do $$
declare b boolean; n int;
begin
  perform pg_temp.ok((select notes = 'call Tuesday' and audio_url is null from public.tax_returns where id = '10000000-0000-0000-0000-00000000000b'), 'user may edit notes but not storage paths');
end $$;
\o /dev/null
select set_config('request.jwt.claim.role', '', false), set_config('request.jwt.claim.sub', '', false);
\o

-- ── 9. deleting a return removes its links/events/approvals, leaving a content-free approval record ──
do $$
declare b boolean; n int;
begin
  delete from tax_returns where id = '10000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok(not exists (select 1 from narration_approvals) and not exists (select 1 from video_share_links) and not exists (select 1 from video_view_events), 'cascade');
  perform pg_temp.ok((select count(*) from narration_approval_log) = 2, 'approval log kept (no narration)');
end $$;

\echo ALL FUNCTIONAL TESTS PASSED
