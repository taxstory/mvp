# PII audit — October 2026

Scope: front end, Netlify functions, storage, third-party processors. Source-level review; the live Supabase database (policies, triggers, guard functions) was not inspected — run `supabase/01_verify.sql`.

## Data inventory
| Data | Where it lives | Notes |
|---|---|---|
| Return PDF | Advisor's browser only | Parsed client-side; never uploaded. |
| Return figures | `tax_returns.parsed_data` | Allow-listed numbers only (`save-return`); SSN/EIN tripwire. |
| Client label, notes | `clients` | Labels-only mode by default: no email/phone stored (DB guard `guard_client_contact`). |
| Client email | Used once to send a share email | Stored in `video_share_links.sent_to` / `messages.sent_to` only when the firm turns labels-only mode off. |
| Narration | `tax_returns.audio_segments`, `jobs.payload`, `narration_approvals` | Figures only, no names. Job copy now cleared after 7 days. |
| Voiceover, rendered video | Private `audio` bucket, owner folder | Signed URLs (hours); deleted with the return (`delete-data`, `sweep-orphans`). |
| Firm logo | Public `firm-assets` bucket | Firm branding, not client data. |
| Messages | `messages` | Inbound messages redacted for SSN/EIN server-side. |

## Third parties
Supabase (all stored data) · Netlify (functions, logs) · OpenAI (narration text for TTS: figures only) · Anthropic (optional wording polish, off by default: figures only) · Resend (client email address and first-name label, for delivery) · Stripe (advisor billing) · Sentry (errors, scrubbed) · PostHog (advisor product analytics, scrubbed; not loaded on client pages).
Each needs a signed DPA on file.

## Findings fixed in this pass
1. **Bearer tokens sent to PostHog and Sentry.** Page-view URLs, error reports and network breadcrumbs included share tokens, portal tokens and Supabase auth tokens (password-reset links). URLs are now scrubbed; console breadcrumbs dropped; request headers/cookies removed.
2. **Analytics on taxpayer-facing pages.** PostHog ran on `/view/*` and `/portal/*`. It no longer loads there; elsewhere it keeps no cookie/localStorage ID and drops IP.
3. **SSNs typed without dashes were not caught** by the identifier tripwire (`123456789`). Server and browser checks now catch nine bare digits (amounts, decimals, longer numbers excluded).
4. **Browser-written free text had no identifier check and hid failures:** return notes, investment notes, client label/notes, outbound messages, scenario labels. Each now checks before saving and reports a failed write instead of showing "Saved".
5. **Share-link label and client name were not checked** for identifiers (the label is shown on the client's page, the name is emailed).
6. **Narration kept indefinitely in finished jobs.** Cleared after 7 days by the scheduled `reap-jobs`.

## Follow-up pass (done)
- **Self-service account deletion** — Settings → Delete account (type DELETE + password). Cancels the Stripe subscription first (aborts if that fails), removes files, rows, then the login. Stripe invoices are retained as financial records.
- **Contact-data retention** — recipient addresses cleared 90 days after a share link expires (and on messages / view notifications after 90 days) by the daily `sweep-orphans`. Override with `CONTACT_RETENTION_DAYS`.
- **Database guards** — `supabase/03_pii_guards.sql` adds `ts_has_identifier` and a refusal trigger on clients (name, notes), tax_returns.notes, ria_projections.notes, messages.body, video_share_links.label.
- **Scenario saves** now go through `save-scenarios` (numbers only, label checked); results are not stored.
- **Found while doing this:** `audit()` and two best-effort RPC calls used `.catch()` on Supabase query builders, which have no `.catch` — every audited endpoint threw after doing its work, and every share link and client-portal visit failed. Fixed.
- **Brand colours** were saved as CSS variables, which the server rejects, so every firm's emails and videos used violet. Swatches now save hex; `03_pii_guards.sql` repairs stored values.

## Video pipeline check
- Script: built from the return's numbers only; the optional AI polish sees sentence templates with placeholders — no names, figures or identifiers.
- Narration sent to the voice vendor (OpenAI): advisor edits are now refused if they contain an SSN/EIN, an email address, a phone number, or the client's own label; only `text`, `field_ref`, `section` and `key` are stored per scene (other fields the browser sent were stored verbatim).
- Video frames: firm name, tax year and figures — no client name. File name and storage path contain no names.
- Transcript on the client page: the narrated text, under the same checks.

## Still open
- **DPAs** with every processor above; list them in the SOC 2 vendor register.
