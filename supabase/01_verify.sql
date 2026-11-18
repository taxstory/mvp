-- TaxStory — Supabase readiness check (READ-ONLY: changes nothing).
-- Run in the Supabase SQL editor. Every row should say OK. Anything MISSING is what needs to be added.

with
need_cols(tbl, col) as (values
  ('profiles','id'),('profiles','firm_name'),('profiles','brand_color'),('profiles','logo_url'),('profiles','practice_type'),('profiles','primary_use'),
  ('profiles','onboarding_completed'),('profiles','onboarding_completed_at'),('profiles','privacy_mode'),('profiles','portal_ttl_days'),('profiles','founding_member'),
  ('profiles','phone'),('profiles','website'),('profiles','notif_credits_low'),('profiles','notif_intake_complete'),('profiles','notif_message_received'),('profiles','notif_video_complete'),
  ('onboarding_state','user_id'),('onboarding_state','step'),('onboarding_state','firm_name'),('onboarding_state','practice_type'),('onboarding_state','primary_use'),
  ('onboarding_state','used_demo_return'),('onboarding_state','completed'),('onboarding_state','brand_color'),('onboarding_state','logo_url'),
  ('tax_returns','id'),('tax_returns','user_id'),('tax_returns','client_id'),('tax_returns','tax_year'),('tax_returns','file_name'),('tax_returns','status'),('tax_returns','parsed_data'),
  ('tax_returns','script'),('tax_returns','script_json'),('tax_returns','audio_url'),('tax_returns','audio_segments'),('tax_returns','pdf_summary_url'),
  ('tax_returns','video_url'),('tax_returns','video_status'),('tax_returns','video_render_id'),('tax_returns','video_bucket'),
  ('jobs','id'),('jobs','user_id'),('jobs','tax_return_id'),('jobs','status'),('jobs','progress'),('jobs','payload'),('jobs','error'),('jobs','heartbeat_at'),('jobs','finished_at'),
  ('clients','id'),('clients','user_id'),('clients','name'),('clients','type'),('clients','notes'),('clients','portal_token'),('clients','portal_token_expires_at'),
  ('messages','id'),('messages','user_id'),('messages','client_id'),('messages','body'),('messages','direction'),('messages','read'),('messages','sent_at'),('messages','sent_to'),
  ('narration_approvals','tax_return_id'),('narration_approvals','version'),('narration_approvals','kind'),('narration_approvals','narration'),('narration_approvals','narration_sha256'),
  ('narration_approvals','approved_amounts'),('narration_approvals','approved_at'),('narration_approvals','note'),
  ('video_share_links','id'),('video_share_links','token'),('video_share_links','firm_id'),('video_share_links','tax_return_id'),('video_share_links','label'),
  ('video_share_links','expires_at'),('video_share_links','is_active'),('video_share_links','sent_to'),
  ('video_view_notifications','id'),('video_view_notifications','firm_id'),('video_view_notifications','share_link_id'),('video_view_notifications','event_type'),('video_view_notifications','sent_to'),
  ('subscriptions','user_id'),('subscriptions','tier'),('subscriptions','status'),('subscriptions','stripe_customer_id'),('subscriptions','stripe_subscription_id'),
  ('usage_counters','user_id'),('usage_counters','credits_used'),('usage_counters','pack_credits_balance'),
  ('ria_projections','id'),('ria_projections','user_id'),('ria_projections','client_id'),('ria_projections','notes'),
  ('audit_log','id'),('audit_log','user_id'),('audit_log','action'),('audit_log','description'),('audit_log','created_at'),
  ('feedback','id'),
  ('stripe_events','id')
),
need_fns(fn) as (values
  ('handle_new_user'),('start_audio_job'),('claim_job'),('reap_stale_jobs'),('reserve_usage'),('refund_usage'),('reconcile_failed_job_refunds'),('count_unrefunded_failed_jobs'),
  ('reserve_vendor_budget'),('settle_vendor_call'),('release_vendor_reservation'),('assume_stale_vendor_reservations'),('rate_limit_hit'),
  ('create_share_link_for'),('record_view_event'),('touch_portal'),
  ('looks_like_identifier'),('guard_client_contact'),('ts_has_identifier'),('ts_reject_identifiers'),
  ('apply_subscription_state'),('claim_stripe_event'),('finish_stripe_event'),('grant_pack_credits'),('roll_usage_period')   -- Stripe webhook (billing)   -- database-side PII guards (SSN/EIN tripwire; no contact data in labels-only mode)
),
checks as (
  select 1 as grp, 'table'::text as kind, t.tbl as object,
         case when exists (select 1 from information_schema.tables x where x.table_schema='public' and x.table_name=t.tbl) then 'OK' else 'MISSING' end as status
  from (select distinct tbl from need_cols) t
  union all
  select 2, 'column', c.tbl||'.'||c.col,
         case when exists (select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=c.tbl and x.column_name=c.col) then 'OK' else 'MISSING' end
  from need_cols c
  union all
  select 3, 'function', f.fn||'()',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f.fn) then 'OK' else 'MISSING' end
  from need_fns f
  union all
  select 4, 'trigger', 'on_auth_user_created (creates the profile row at sign-up)',
         case when exists (select 1 from pg_trigger where tgname='on_auth_user_created') then 'OK' else 'MISSING' end
  union all
  select 5, 'unique', 'onboarding_state.user_id is unique (needed for upsert)',
         case when exists (
           select 1 from pg_index i join pg_class c on c.oid=i.indrelid join pg_attribute a on a.attrelid=c.oid and a.attnum = any(i.indkey)
           where c.relname='onboarding_state' and i.indisunique and a.attname='user_id' and array_length(i.indkey::int2[],1)=1) then 'OK' else 'MISSING' end
  union all
  select 6, 'rls policy', 'onboarding_state: '||cmd||' own row',
         case when exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename='onboarding_state' and (p.cmd=v.cmd or p.cmd='ALL')) then 'OK' else 'MISSING' end
  from (values ('SELECT'),('INSERT'),('UPDATE')) v(cmd)
  union all
  select 6, 'rls policy', 'profiles: '||cmd||' own row',
         case when exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename='profiles' and (p.cmd=v.cmd or p.cmd='ALL')) then 'OK' else 'MISSING' end
  from (values ('SELECT'),('UPDATE')) v(cmd)
  union all
  select 7, 'bucket', b.id,
         case when exists (select 1 from storage.buckets x where x.id=b.id) then 'OK' else 'MISSING' end
  from (values ('audio'),('firm-assets')) b(id)
  union all
  select 8, 'bucket setting', 'audio bucket accepts video/mp4 and video/webm',
         case when not exists (select 1 from storage.buckets where id='audio') then 'MISSING'
              when (select allowed_mime_types from storage.buckets where id='audio') is null then 'OK'
              when (select allowed_mime_types from storage.buckets where id='audio') @> array['video/mp4','video/webm'] then 'OK' else 'MISSING' end
  union all
  select 8, 'bucket setting', 'audio bucket file size limit >= 50 MB (or unset)',
         case when not exists (select 1 from storage.buckets where id='audio') then 'MISSING'
              when coalesce((select file_size_limit from storage.buckets where id='audio'), 52428800) >= 52428800 then 'OK' else 'MISSING' end
  union all
  select 9, 'storage policy', 'audio bucket: '||cmd||' own folder (browser video upload, signing, replace)',
         case when exists (select 1 from pg_policies p where p.schemaname='storage' and p.tablename='objects' and (p.cmd=v.cmd or p.cmd='ALL')
                           and coalesce(p.qual,'')||coalesce(p.with_check,'') like '%audio%') then 'OK' else 'MISSING' end
  from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) v(cmd)
)
select kind, object, status from checks order by (status='OK'), grp, object;
