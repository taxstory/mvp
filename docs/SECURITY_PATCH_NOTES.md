# TaxStory v6 security patch - legacy endpoint removal

## Changes applied
- Removed `netlify/functions/parse-return.js`: legacy endpoint accepted caller-supplied storage paths, used service-role credentials, and sent full PDF documents to an AI vendor.
- Removed `netlify/functions/generate-audio.js`: legacy endpoint bypassed the transactional audio-job/credit workflow and attempted to return public media URLs.
- Added `scripts/check-deprecated-endpoints.cjs` to fail a release if either endpoint reappears.
- Added two Node security regression tests, including a negative control proving that the release guard rejects a reintroduced endpoint.
- Added a GitHub Actions security gate and package scripts `security:guard` and `test:security`.

## Verification
Run `npm run security:guard` and `npm run test:security`.

## Deployment cautions
- This ZIP is a source patch, not a live deployment. Verify that Netlify removes both functions from its deployed function inventory. Deleting local files does not necessarily prove that stale deployed functions are gone.
- Verify all clients use `save-return` and `start-audio-job`/`generate-audio-background`; test full PDF-to-audio flow in staging.
- Review all service-role endpoints, actual Supabase grants and storage policies, and privacy/vendor agreements separately.
- This patch does NOT independently validate tax calculations, authentication, or billing correctness.
