// netlify/functions/start-audio-job.js — step 1 of 2 for walkthrough audio. Fast: validates, approves, charges and queues in ONE database transaction.
// Step 2 is generate-audio-background (a Netlify background function, up to 15 minutes). The browser polls the `jobs` row.
//
// ATOMIC: the credit reservation, the job row and (when needed) the narration approval are created by one database function (start_audio_job), so a failure
// at any step rolls back everything — there is no separate "refund if the insert fails" step to go wrong. An optional requestKey makes a retried click return
// the same job instead of a second one. The reconciler and the reaper remain as the secondary safety net for jobs that fail LATER.
//
// UNVERIFIED AMOUNTS: narration is compared with the return's figures. An amount that is not on the return (a projection, an estimate, a correction) can only
// be narrated with a RECORDED approval: the advisor must approve exactly those amounts, say what kind they are, and say why. The approval is stored with the
// exact narration (hash + snapshot), versioned per return; changing the amounts or the narration requires a new approval.
const { makeHandler, getTaxReturn, TIER_LIMITS, effectiveTier } = require('./_handler');
const { rateLimit, globalDailyCap } = require('./_ratelimit');
const { requireUuid, validateNarration, bad } = require('./_validate');
const { buildFacts, unverifiedAmounts } = require('./_scriptFacts');
const { assertNoIdentifier } = require('./_pii');
const { estimateTtsCost, limits } = require('./_spend');
const { createHash } = require('crypto');

exports.config = { timeout: 26 };
const KINDS = ['estimate_or_projection', 'correction', 'other'];

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  const { segments, script } = validateNarration({ segments: body.segments, script: body.script });     // bounds the spend: scene count, per-scene and total length
  const scenes = segments?.length ? segments : [{ text: script, field_ref: 'intro', section: 'intro' }];
  const requestKey = body.requestKey == null ? null : String(body.requestKey);
  if (requestKey !== null && !/^[A-Za-z0-9_-]{8,100}$/.test(requestKey)) throw bad('Invalid requestKey');

  const ret = await getTaxReturn(db, taxReturnId, user.id, 'id, user_id, parsed_data, tax_year');       // ownership enforced by RLS and re-checked here

  // Amounts not on the return need a recorded, specific approval.
  const unverified = unverifiedAmounts(scenes.map(s => s.text), buildFacts(ret.parsed_data, ret.tax_year));
  let approval = null;
  if (unverified.length) {
    const want = [...unverified].sort(), given = Array.isArray(body.approval?.amounts) ? body.approval.amounts.map(String).sort() : null;
    if (!given || given.length !== want.length || given.some((v, i) => v !== want[i])) {
      throw Object.assign(new Error(`The narration mentions ${want.slice(0, 5).join(', ')}, which ${want.length === 1 ? 'does' : 'do'} not match any figure on this return. Check the wording, or approve ${want.length === 1 ? 'it' : 'them'} as written.`),
        { statusCode: 422, errorCode: 'unverified_amounts', details: { amounts: want } });
    }
    const kind = body.approval.kind, note = typeof body.approval.note === 'string' ? body.approval.note.trim() : '';
    if (!KINDS.includes(kind)) throw bad('Say whether these amounts are an estimate or projection, a correction, or something else.');
    if (note.length < 3 || note.length > 300) throw bad('Add a short note (3–300 characters) explaining where these amounts come from.');
    assertNoIdentifier(note, 'The note');
    approval = { sha256: createHash('sha256').update(JSON.stringify(scenes)).digest('hex'), amounts: want, kind, note };
  }

  await rateLimit(supabase, `audio-job:${user.id}`, 30, 3600, 'You have started too many walkthroughs this hour. Please wait a few minutes and try again.');
  await globalDailyCap(supabase, 'audio-job', 'GLOBAL_DAILY_AUDIO_JOBS', 500);                          // request-count circuit breaker (secondary)
  const chars = scenes.reduce((n, s) => n + s.text.length, 0);                                           // the audio budget is reserved INSIDE the atomic start below (primary spend control)

  await supabase.rpc('reap_stale_jobs', { p_user: user.id });                                            // fail (and refund) this user's stuck jobs so they cannot block a retry

  const { data: sub } = await db.from('subscriptions').select('tier, status').eq('user_id', user.id).maybeSingle();
  const planLimit = TIER_LIMITS[effectiveTier(sub)].credits;
  const { data, error } = await supabase.rpc('start_audio_job', { p_user: user.id, p_tax_return: taxReturnId, p_payload: { segments: scenes }, p_plan_limit: planLimit, p_request_key: requestKey, p_approval: approval,
    p_est_cost: estimateTtsCost(chars), p_global_limit: limits().global, p_user_limit: limits().user, p_est_units: chars });
  if (error) {
    if (error.code === 'P0402') throw Object.assign(new Error('No walkthrough credits remaining. Buy a credit pack or upgrade your plan.'), { statusCode: 402 });
    if (error.code === 'P0503') {   // over the daily vendor budget: nothing was created, charged or held (the whole transaction rolled back)
      const user_ = /user/.test(String(error.details || '')); throw Object.assign(new Error(user_ ? "You've reached today's usage limit for generated content. It resets tomorrow." : 'TaxStory has reached its daily capacity for this feature. Please try again later.'), { statusCode: user_ ? 429 : 503, retryAfter: 3600 });
    }
    if (error.code === 'P0409' || error.code === '23505') throw Object.assign(new Error('A walkthrough is already being generated for this return.'), { statusCode: 409 });
    if (error.code === 'P0002') throw Object.assign(new Error('Return not found'), { statusCode: 404 });
    throw new Error(`Could not start the job: ${error.message}`);
  }
  return { statusCode: 202, body: JSON.stringify({ ok: true, jobId: data.job_id, duplicate: data.duplicate === true }) };
});
