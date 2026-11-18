# Release readiness — November 17, 2026 (v19)

**Verdict: NOT ready for general release. Ready for a deploy preview and a controlled pilot once the blockers below are cleared.**

## Verified in code (this audit)
- Production build passes. Tax engine (34 cases + server/engine year sync), parser fixture, security guard and security tests pass.
- Every Netlify function loads with its dependencies (the Stripe webhook needs its env vars at load time, as expected).
- Lint for runtime errors (undefined names, duplicate keys, unreachable code): front end and functions clean. Four unused imports only.
- No secrets committed (Stripe, Resend, Anthropic, OpenAI, Supabase JWT patterns).
- Every database table and function the code calls is listed in `supabase/01_verify.sql` (five Stripe-webhook functions and `stripe_events` were missing — added).
- Dependencies: no high/critical advisories. Moderate: React Router open-redirect via backslash (fix needs v7; the app never navigates to a user-supplied path, so not exposed), and a minimatch DoS deep in the email library (server-side, no user input reaches it).

## Blockers (must clear before any real client data)
1. **Deploy and smoke-test.** Nothing since v1 is live. Push v19 to a Netlify deploy preview; walk sign-up → onboarding → import → projection → script → audio → render → share → client view (desktop Chrome + iPhone). The in-browser video encoder has only been tested on frames, not a full encode.
2. **Supabase.** Run `02_add_missing.sql`, `03_pii_guards.sql`, then `01_verify.sql` until every row is OK.
3. **Netlify settings.** `SITE_URL`; `STRIPE_PRICE_*` names the code reads (current `VITE_STRIPE_*` names are not read); `INTERNAL_API_KEY`; `TAXSTORY_TEAM_EMAIL`; a plan that runs background functions; leave `REMOTION_*` unset; keep `VITE_ENABLE_PLANNING` off.
4. **Billing tests missing.** The webhook cites `tests/security/webhook.test.mjs`, `billing.test.mjs`, `service_role_guard.test.mjs` and `tests/parser/reconciliation_matrix.test.mjs`; none are in the repo. Find them or re-create them, and run a Stripe test-mode purchase, renewal, failed payment, credit pack and cancellation end to end.
5. **Accuracy evidence.** Complete the engine workbook (2024/2025 cases in tax software now) and calibrate the PDF reader on fictional returns printed from real software (`/calibrate`).
6. **Legal/compliance.** DPAs with every processor; §7216 position for CPAs sending client return information to TaxStory (counsel: auxiliary-service-provider treatment vs client consent language in your terms).

## Accepted limits (disclosed in-app)
AMT and above-threshold QBI simplified; EIC qualifying-child tests assumed; Schedule 1-A detail not read from PDFs; projections hold prior-year figures unless adjusted; one video rendered at a time in the browser.

## After pilot
React Router v7 upgrade; switch CSP from report-only to enforced (check PostHog asset loads first); batch generation and server-side rendering; remove unused imports.
