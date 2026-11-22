# Rollback and emergency runbook

Keep this short and boring. Most problems are fixed fastest by going back to the last version that worked, then investigating.

## 1. A deploy broke the site (most common)

**Fastest, about 30 seconds, no code needed.**
Netlify → your site → **Deploys** → click the last deploy that worked → **Publish deploy**.
The site switches back instantly. Netlify keeps every previous deploy.

Then lock it so a new push doesn't redeploy the broken version while you investigate:
Deploys → **Stop auto publishing**. Turn it back on once the fix is merged.

**Permanent fix in git** (so `main` matches what is live):

    git revert <bad-commit>       # creates a new commit that undoes it; never rewrite main's history
    git push origin main

Known-good points are tagged in git (`git tag -l 'release-*'`). To see what changed since one:
`git diff release-2026-11-22 main --stat`.

## 2. Database

The SQL scripts in `supabase/` only **add** things (tables, columns, functions, policies). They never drop data,
and they are safe to re-run. Rolling the **app** back to an older version is safe with the newer database:
the older code ignores the extra tables and columns.

There is no "down" script on purpose. If a script itself caused a problem, fix it forward (re-run the corrected
script) rather than deleting tables that hold customer data.

**Restoring data** (someone deleted something, or data is corrupted): Supabase → Database → **Backups**.
Daily backups and point-in-time recovery need a paid Supabase plan. See the launch checklist.

## 3. Emergency off-switches (no deploy needed)

Netlify → Site configuration → Environment variables, change the value, then **Deploys → Trigger deploy**
(functions read the new value on the next deploy).

| Problem | Switch | Effect |
|---|---|---|
| AI or voiceover costs running away | `DAILY_VENDOR_BUDGET_USD = 0` | Every paid AI call is refused; credits are not charged |
| One customer burning budget | `USER_DAILY_VENDOR_BUDGET_USD` lower (e.g. `1`) | Caps each account per day |
| Planning modules misbehaving | `VITE_ENABLE_PLANNING = false` (or delete it) | Hides scenario and investment pages |
| Sign-up abuse | Supabase → Authentication → Sign In / Providers → turn off **Allow new users to sign up** | Existing users unaffected |
| Payments misbehaving | Stripe → Developers → Webhooks → **Disable** the endpoint | Stripe queues events and retries them for 3 days once re-enabled |
| A leaked key | Rotate it at the vendor (OpenAI, Stripe, Resend, Supabase), paste the new value in Netlify, trigger a deploy | Old key stops working immediately at the vendor |

Also set a **hard monthly limit** in the OpenAI dashboard (Settings → Limits). It is the backstop if everything above fails.

## 4. After any incident

1. Note what happened, when, and who was affected (`docs/` is fine).
2. If client data may have been exposed, that is a privacy incident: follow the breach steps in the DPA and notify affected firms.
3. Add a test that would have caught it.
