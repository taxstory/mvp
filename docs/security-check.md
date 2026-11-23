# Pre-launch security check — 23 Nov 2026

Six-step check from the "vibe-coded apps leak" checklist, run against the code in this repository. Production was not reachable from the
audit environment, so anything that lives only in a dashboard (Supabase, Netlify, Stripe, OpenAI, Anthropic) is marked **YOU** and listed in
`launch-verdict.md`. Earlier, deeper audits this builds on: `CPA_USER_AUDIT_2026-11.md`, `PII_AUDIT_2026-10.md`, the Access-Control Audit
doc (79-check tenant-isolation suite, `supabase/test/20_tenant_isolation.sql`).

## What the app is (from the code)
- Backend: Supabase (Postgres + Auth + Storage) and Netlify Functions (`netlify/functions`). Frontend: React/Vite SPA.
- Auth: Supabase Auth, email + password. Functions verify the caller's token in `_handler.js` and query as that user (row security applies).
- Paid APIs: Anthropic (script, `generate-script.js`), OpenAI text-to-speech (`generate-audio-background.js` via `start-audio-job.js`), Stripe.
- Public endpoints: `video-viewer`, `client-message`, `client-portal` (link-token based), `stripe-webhook` (Stripe-signed). Public forms: sign-up, sign-in, reset, client message.
- Secrets: read only from Netlify environment variables in functions. The browser gets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_*`, `VITE_SUPPORT_EMAIL`, `VITE_ENABLE_PLANNING`, `VITE_TURNSTILE_SITE_KEY` (optional) — all public by design.

## Step 1 — Legal basics
| Check | Result |
|---|---|
| Privacy policy exists (`/privacy`, `/terms`, `/dpa`) | PASS |
| Policy lists every third party that touches data | FIXED — Netlify (hosts the functions that process returns) was missing from the privacy policy and the DPA sub-processor list; added |
| Data location: database / hosting region | **YOU** — confirm the Supabase project region and state it in the DPA |
| No plain-text passwords; no user-data exports to personal email/sheets | PASS — passwords are handled only by Supabase Auth; the one server-side use (`delete-account.js`) re-checks it with Supabase and never stores it |
| GPL-style licences in shipped dependencies | PASS — none. Front end: MIT/ISC/Apache/0BSD plus `mediabunny` (MPL-2.0: file-level, fine unmodified). Functions: MIT/ISC/BSD/BlueOak |
| DPA claims match reality | REVIEW — "audit logging for all data access events" and "API key rotation policies" overstate what exists (the audit log covers actions, not every read) |

## Step 2 — Database
| Check | Result |
|---|---|
| Row security on every table, policies limited to own rows | PASS (scripts) — 79/79 tenant-isolation checks after `05_access_control.sql` |
| Tested as logged-out visitor and as two different users | PASS — `supabase/test/run.sh`, now in CI on every push |
| Live database matches the scripts | **YOU** — run `05_access_control.sql`, then `01_verify.sql` (section 12 all OK) |
| Server-side validation on every write | PASS — `_validate.js` on every function that takes input; lengths, UUIDs, URLs, colours, narration size capped; database CHECKs and triggers back it up |
| Errors generic to users, detailed in logs | PASS — `_handler.js` returns "Something went wrong" + request ID for 5xx, logs the detail (`_logError.js` strips tokens/PII). No function returns a raw database error |

## Step 3 — Login (account enumeration)
Tested in a browser with the sign-in service mocked to return its real error shapes.
| Test | Before | After |
|---|---|---|
| Wrong password | Showed Supabase's text (generic, but raw) | PASS — "Email or password is incorrect." for any credential failure |
| Wrong password five times | Supabase's built-in per-IP limit; message raw | PASS (code) — "Too many attempts…". Limits themselves: **YOU** (Supabase → Auth → Rate Limits) |
| Reset for an unknown email | Same screen as a real one, but the per-email "wait N seconds" error only appears for real accounts | FIXED — every outcome except "service down" shows the same "If there's an account…" screen |
| Verification link clicked twice | Needs a real email | NOT TESTED here — expected: second click is an expired link, user lands on sign-in. Click it yourself (verdict step 6) |
| Sign-up with an existing email | Safe only if "Confirm email" is ON in Supabase; if OFF, the raw "User already registered" was shown | FIXED — treated exactly like a new sign-up |
| **Password reset could not be completed** | The emailed link landed on the "send me a link" form; there was no way to set a new password | FIXED — the link now opens "Choose a new password"; expired links say so |

Regression test: `tests/security/auth_messages.test.mjs`.

## Step 4 — Audit (headers, OWASP, leaks, secrets)
| Check | Result |
|---|---|
| Security headers | PASS — CSP enforced, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; token pages `no-referrer`/`no-store`/`noindex`. Verify live at securityheaders.com (**YOU**) |
| Secret keys in the shipped bundle | PASS — built bundle scanned: no `sk_`, `whsec_`, `sk-ant-`, OpenAI, Resend or service-role keys; no service-role JWT |
| Secret keys in git history (178 commits) | PASS — none; no `.env`/key files tracked |
| Data shipped with the page before login (the coffee-franchise leak) | PASS — the bundle holds no customer data (only the fictional sample returns and our own contact addresses). All data loads after sign-in, through row security |
| Broken access control (OWASP A01) | PASS after 05 — see Access-Control Audit |
| Injection / XSS (A03) | PASS — React escaping; server HTML via `_html.js` escaping; the one `document.write` (printable summary) uses only numbers and labels, and the CSP blocks inline script |
| Vulnerable components (A06) | LOW — `react-router-dom` 6.x open-redirect advisory: not exploitable here (no navigation to user-supplied URLs); fix needs the v7 upgrade. Functions: `minimatch` via `resend → @react-email/render → js-beautify` (formats our own email HTML; not reachable by user input) |
| Raw service errors shown in the app | LOW — a few in-app screens (logo upload, password change) show Supabase's message to the signed-in user. Reveals nothing an attacker can't already see |

## Step 5 — Abuse and cost
| Check | Result |
|---|---|
| Rate limits on every function | PASS — `_ratelimit.js` on every function except the Stripe webhook (Stripe-signed) and the audio worker (job claimed once, budget reserved up front) |
| Paid-API spend caps in code | PASS — `_spend.js` reserves budget before every paid call: $50/day global, $5/day per user; `DAILY_VENDOR_BUDGET_USD=0` is the kill switch |
| Rate limits on sign-in / sign-up / reset | Supabase Auth built-ins. **YOU** — check Auth → Rate Limits |
| Bot protection on public forms, checked server-side | ADDED, OFF — Cloudflare Turnstile wired into sign-up, sign-in and reset (`components/Captcha.jsx`); Supabase verifies the token. Turns on with two settings (**YOU**). Why it matters: every sign-up gets 3 free walkthrough credits, which spend real OpenAI/Anthropic money; the per-user cap limits each account, not the number of accounts |
| CORS locked to own domain | PASS — functions answer only `SITE_URL`; fails closed if unset |
| Spending caps and alerts in vendor dashboards | **YOU** — OpenAI, Anthropic, Supabase spend cap, Netlify, Resend |

## Step 6 — Scanner
| Scanner | Result |
|---|---|
| `npm audit` (production deps) | 2 moderate (front end), 4 moderate (functions) — assessed above, none reachable |
| ESLint security + no-unsanitized rules (Semgrep's rule registry is blocked from the audit environment) | 27 flags, reviewed: regex warnings on fixed internal patterns; the worst real case (email pattern in `_validate.js`) is quadratic and bounded by the 20,000-character script cap (~0.25 s), behind sign-in and rate limits. No action |
| Claude Security deep scan (`/claude-security`) | **YOU** — needs Claude Code on your machine; worth one run before launch |
