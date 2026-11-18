# TaxStory onboarding loop fix

Changes:
- AuthContext now exposes refreshProfile() and surfaces profile read failures.
- Onboarding checks every database write for errors, and does not advance on failure.
- Completion verifies the profile write, refreshes auth context, then navigates.
- Existing firm logos are preserved if no replacement is selected.
- A failed logo upload is reported instead of silently ignored.

Deployment prerequisites:
- Confirm profiles row exists for the authenticated user and the columns firm_name, practice_type, primary_use, brand_color, onboarding_completed, onboarding_completed_at exist.
- Confirm onboarding_state table exists with a unique user_id and the columns used by the wizard.
- Confirm authenticated user has RLS UPDATE/SELECT on their own profiles row and UPSERT on their own onboarding_state row.
- Confirm the latest Netlify deployment contains the updated bundle and test with a newly created test account.

Limitations: No live Supabase or Netlify access; this is a source-level fix, not a production verification.
