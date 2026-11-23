# Launch verdict — 23 Nov 2026

**FIX FIRST.** The code is in launch shape; production is not until steps 1–4 below are done. Nothing in the code needs more work to launch.

## Must do before launch (dashboards — only you can)
1. **Supabase SQL editor:** run `supabase/05_access_control.sql`, then `supabase/01_verify.sql` (section 12 all OK), then the orphan query at the bottom of 05 (expect 0 rows). Without 05, adding clients and sending messages are broken if 04 was run.
2. **Supabase → Authentication → Sign In / Providers → Email:** "Confirm email" ON. Minimum password length 8. Turn on leaked-password protection if your plan has it.
3. **Supabase → Authentication → Rate Limits:** keep the defaults or tighter (sign-in/sign-up ~30 per 5 min per IP; emails sent per hour low). Set SMTP to Resend first, or the built-in email limit (a few per hour) will block real sign-ups.
4. **Spending caps with alerts:** OpenAI (monthly limit + alert at 50%), Anthropic (spend limit), Supabase (spend cap ON), Netlify (usage alerts). The app's own caps ($50/day total, $5/day per user) are a second line, not the first.

## Should do before launch
5. **Bot protection (recommended):** create a Cloudflare Turnstile site for tellmytaxstory.com. Put the site key in Netlify as `VITE_TURNSTILE_SITE_KEY` and deploy. Then, and only then, Supabase → Authentication → Attack Protection → CAPTCHA: Turnstile + the secret key. Reverse order locks everyone out until the deploy lands. Then add Cloudflare to the privacy policy's third-party list.
6. **Click the four login tests on production** (takes five minutes): wrong password ×5, reset for a made-up email, click a verification link twice, sign up with your own existing email. Each should look like the browser test results in `security-check.md`.
7. **Headers:** run the production URL through securityheaders.com; expect an A.
8. **Data location:** confirm the Supabase project region and add it to the DPA. Fix the two DPA claims that overstate (audit logging of all access, key-rotation policy).
9. **Deep scan:** run Claude Security (`/claude-security`) in Claude Code on your machine.

## Results
| Step | Verdict |
|---|---|
| 1. Legal basics | PASS after fix (Netlify added to sub-processors); data region to confirm |
| 2. Database | PASS in tests (79/79); live database pending 05 |
| 3. Login | PASS after fixes (no account enumeration; reset flow completed) |
| 4. Audit | PASS — no secrets in bundle or history, no pre-login data, headers strong; two low dependency advisories not reachable |
| 5. Abuse & cost | PASS in code; dashboard caps and Turnstile pending |
| 6. Scanner | PASS — no actionable findings |

## What this check did not cover
- Production itself (not reachable from the audit environment): live headers, live database policies, dashboard settings.
- Load / denial-of-service testing, penetration testing by a person, Stripe and email deliverability end-to-end.
- Business-logic review of the tax engine (see engine verification status in `CPA_USER_AUDIT_2026-11.md`).
- You handle tax returns (financial data, §7216): a paid third-party audit before SOC 2 is the right next step, not this checklist.
