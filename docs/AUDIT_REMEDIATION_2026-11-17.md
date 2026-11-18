# Code audit remediation — November 17, 2026 (v23)

| ID | Finding | Status | What changed | Proof |
|---|---|---|---|---|
| TS-001 | Legacy `parse-return` / `generate-audio` in a nested functions copy; guard only checked top-level paths | **Fixed in code; repo still needs the git sync** | `scripts/check-deprecated-endpoints.cjs` now scans the whole repository and also fails on any nested functions directory. It runs at the start of `npm run build`, so Netlify refuses to deploy while either problem exists. | 6 tests (top-level, nested, elsewhere, nested tree, clean tree, release source). The current GitHub tree fails the guard (5 problems). |
| TS-002 | Engine harness passed with no expected results | **Fixed (7 of 35 verified)** | `expected.json` is required; every case is either verified (compared at $1) or listed as pending with a reason. Missing file, unlisted case or any variance fails. 6 simple cases are checked by an independent calculator (`tests/engine/independent_expected.py`, brackets typed from the revenue procedures); 1 case (D01) matches Drake's printed 2025 Practice Return 1. | All 7 match. Fails on a missing file and on a $50 change. |
| TS-003 | Parser suite crashed on a missing fixtures folder | **Fixed** | Missing/empty fixtures folder is an explicit test failure. A reviewed, clearly-labelled synthetic Drake 2025 fixture is included. | 18 parser tests pass; deleting the folder gives a named failure. |
| TS-004 | Referenced service-role guard did not exist | **Fixed** | `tests/security/service_role_guard.test.mjs` + `service_role_allowlist.json`: every service-role use (table, RPC, storage, admin API) in every function must be listed with a reason; stale entries also fail. | Adding an unlisted `supabase.from('clients')` fails the suite. |
| TS-005 | Portal token rotation reported success without checking the write | **Fixed** | Update is scoped to the firm, returns the row, and success requires exactly one row holding the new token; otherwise 500 and "the current link still works". | 3 tests (success, DB error, zero rows); all fail against the previous code. |
| — | Onboarding loop | **Code verified; needs live test** | Wizard checks every write, confirms `onboarding_completed`, refreshes the profile before leaving. | Live test with a new account after Supabase is restored. |

## Still open
- **Tax-engine accuracy:** 28 cases pending tax-software comparison (TaxStory-Engine-Validation.xlsx). The audit's P0 is not closed until they are verified.
- **Billing/audio concurrency and retries:** needs Stripe test mode and a live database (start_audio_job, webhook idempotency).
- **Deployment:** sync GitHub to this package with git (the upload button cannot delete files); `npm run build` will now refuse to build the current GitHub tree.
