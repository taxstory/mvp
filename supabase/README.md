# Supabase: what TaxStory needs

Run in the Supabase SQL editor, in this order. Every script is safe to re-run and never deletes data.

1. **`01_verify.sql`** — read-only. Lists every table, column, function, policy, bucket and security setting the app uses; anything not `OK` sorts to the top.
2. **`02_add_missing.sql`** — onboarding and video columns, buckets and storage policies.
3. **`03_pii_guards.sql`** — database-side SSN/EIN refusal on every free-text column the browser writes; repair of brand colours saved as CSS variables.
4. **`04_core_schema.sql`** — the core layer the server functions call (section C). Run it as one script.
5. **`05_access_control.sql`** — fixes from the 23 Nov access-control audit (see below). **Required if you ran 04**: without it, signed-in users
   cannot add or edit clients or send messages.
6. **`01_verify.sql`** again — every row should be `OK`. `MISSING` = not created; `EXPOSED` = a security setting is wrong.

## A. Onboarding (`02_add_missing.sql`)
- `profiles`: `practice_type`, `primary_use`, `brand_color`, `logo_url`, `onboarding_completed`, `onboarding_completed_at`
- `profiles` policies: users can SELECT and UPDATE their own row. **No INSERT policy needed** — the sign-up trigger creates the row.
- `onboarding_state` table, `user_id` unique, with SELECT / INSERT / UPDATE policies on the user's own row (the wizard upserts)

## B. Video (`02_add_missing.sql`)
- `tax_returns`: `video_url`, `video_status`, `video_render_id`, `video_bucket`
- `audio` bucket (private): accepts `video/mp4` and `video/webm`, size limit ≥ 200 MB, own-folder policy for read/write/delete
- `firm-assets` bucket (public read): own-folder upload/replace policy for logos

## C. Core layer (`04_core_schema.sql`)
Written to match exactly how `netlify/functions/*` call each function (argument names, result shapes, error codes).

| Area | Tables | Functions |
|---|---|---|
| Credits & allowances | `usage_counters` (+ pack balance), `usage_events` (one row per charge), `usage_period_rolls`, `pack_grants` | `reserve_usage`, `refund_usage`, `roll_usage_period`, `grant_pack_credits` |
| Voiceover jobs | `jobs`, `narration_approvals` (+ content-free `narration_approval_log`) | `start_audio_job`, `claim_job`, `reap_stale_jobs`, `reconcile_failed_job_refunds`, `count_unrefunded_failed_jobs` |
| Vendor spend caps | `vendor_calls` | `reserve_vendor_budget`, `settle_vendor_call`, `release_vendor_reservation`, `assume_stale_vendor_reservations` |
| Rate limits | `rate_limits` | `rate_limit_hit` |
| Sharing & viewing | `video_share_links`, `video_view_events`, `video_view_notifications` | `create_share_link_for`, `record_view_event` |
| Client portal | `clients` portal columns (expiry from `profiles.portal_ttl_days`) | `touch_portal` |
| Stripe | `stripe_events`, `subscriptions` (+ `last_event_created`) | `claim_stripe_event`, `finish_stripe_event`, `apply_subscription_state` |
| Bug reports | `feedback` | — |

Rules it enforces:
- **Every function is server-only.** Supabase lets signed-in users call new functions by default; 04 revokes that, so no one can grant themselves credits. `01_verify.sql` reports `EXPOSED` if this ever regresses.
- **Charging is exact.** A job is charged once however often it is retried; plan allowance is used before purchased credits; a refund returns the unit to where it came from; purchased credits never expire; the plan allowance resets once a year from the subscription start.
- **Starting a voiceover is all-or-nothing.** The job, the credit charge, the vendor budget hold and any approval record are one transaction: if any part fails, none of it happens.
- **Dead jobs are cleaned up.** A job whose worker stopped (no heartbeat for 16 minutes) or that never started (10 minutes) is failed and its credit returned.
- **Labels-only privacy (default):** client email/phone and link recipients are never stored. A firm that switches `privacy_mode` to `standard` can store them.
- **Storage paths** (`audio_url`, `video_url`, `pdf_summary_url`, …) on a return can be set only by the server.
- **Stripe events** are processed once, and an older event arriving late never overwrites a newer subscription state.

## D. Access control (`05_access_control.sql`)
- Privacy guards on clients and messages run with the definer's rights (04 left them unable to run for signed-in users).
- `founding_member` and `role` on a profile can only be changed by TaxStory, not the user.
- Returns and planning projections are created only by server functions (which charge the allowance and check the plan).
- Through the API a user can change only a return's or plan's notes, and a client's details (and revoke its portal link).
- A return, message or plan can only name a client of the same firm.

## Testing
`supabase/test/run.sh` builds a throwaway Postgres database shaped like production (`test/00_supabase_stub.sql` stands in for Supabase's
`auth`/`storage` schemas and roles; `test/01_live_baseline.sql` reproduces the live tables as of 2026-11-18), applies 02 → 04 (04 twice, to prove
it re-runs), runs `01_verify.sql`, then `test/10_functional.sql` (76 checks: credits, refunds, jobs, reaping, budgets, rate limits, share links,
portal, Stripe ordering, and what a signed-in user is refused), then `test/20_tenant_isolation.sql` on a fresh database: 79 checks in which
Firm B (signed in) and an anonymous caller try to read, change, delete or plant data in Firm A's account, escalate their own plan or credits,
and call server-only functions, plus checks that normal use still works. It also runs in GitHub Actions on every push.

    PGHOST=... PGPORT=... PGUSER=postgres supabase/test/run.sh

Note: `supabase_schema.sql` at the repo root is the original schema; 02–04 bring it up to date.
