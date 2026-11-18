# Supabase: what TaxStory needs

Run in the Supabase SQL editor, in this order:

1. **`01_verify.sql`** — read-only. Lists every table, column, function, policy and bucket the app uses; anything not `OK` sorts to the top.
2. **`02_add_missing.sql`** — adds only what the onboarding and video changes need, skipping anything already there. Safe to re-run.
3. **`03_pii_guards.sql`** — database-side SSN/EIN refusal on every free-text column the browser writes, and repair of brand colours saved as CSS variables. Safe to re-run.
4. **`01_verify.sql`** again — everything in groups A and B should now be `OK`.

## A. Onboarding (added by `02_add_missing.sql`)
- `profiles`: `practice_type`, `primary_use`, `brand_color`, `logo_url`, `onboarding_completed`, `onboarding_completed_at`
- `profiles` policies: users can SELECT and UPDATE their own row. **No INSERT policy needed** — the sign-up trigger creates the row.
- `onboarding_state` table, `user_id` unique, with SELECT / INSERT / UPDATE policies on the user's own row (the wizard upserts)

## B. Video (added by `02_add_missing.sql`)
- `tax_returns`: `video_url`, `video_status`, `video_render_id`, `video_bucket`
- `audio` bucket (private): accepts `video/mp4` and `video/webm`, size limit ≥ 200 MB, own-folder policy for read/write/delete
- `firm-assets` bucket (public read): own-folder upload/replace policy for logos

## C. Core app objects (check only — not created by the script)
These carry business rules (credit charging and refunds, vendor spend caps, rate limits, share-link tokens, view tracking).
If `01_verify.sql` reports any of them MISSING, do not improvise: send the output and the definitions will be written to match the code.

- Tables: `jobs`, `clients`, `messages`, `narration_approvals`, `video_share_links`, `video_view_notifications`, `subscriptions`, `usage_counters`, `ria_projections`, `audit_log`, `feedback`
- Functions: `start_audio_job`, `claim_job`, `reap_stale_jobs`, `reserve_usage`, `refund_usage`, `reconcile_failed_job_refunds`, `count_unrefunded_failed_jobs`,
  `reserve_vendor_budget`, `settle_vendor_call`, `release_vendor_reservation`, `assume_stale_vendor_reservations`, `rate_limit_hit`,
  `create_share_link_for`, `record_view_event`, `touch_portal`, `handle_new_user` (+ trigger `on_auth_user_created`),
  `looks_like_identifier`, `guard_client_contact` (PII guards — `looks_like_identifier` should also catch nine digits typed without dashes, matching `_pii.js`)

Note: `supabase_schema.sql` at the repo root is out of date — it defines only a fraction of the above. Treat the live database as the source of truth.

## Free voiceover re-generation (pending)
To let an advisor re-generate a voiceover for the same return within 24 hours without using another credit, the change belongs inside
`start_audio_job` (it charges and creates the job in one transaction). Export the current definition and send it over:

    select pg_get_functiondef('public.start_audio_job'::regproc);

The change will keep the same signature, so no app code changes are needed.
