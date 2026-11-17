// netlify/functions/generate-audio-background.js — step 2 of 2. The "-background" suffix makes Netlify run it as a background
// function: it answers 202 immediately and may run for up to 15 minutes. The browser calls it with the user's JWT right after
// start-audio-job and then polls the job row.
//
// Authorization: the job row is read through the CALLER-scoped client (row-level security → only the owner can see it), the
// queued→running transition is atomic (claim_job), so a second trigger of the same job does nothing, and all file writes use the
// caller-scoped client (storage policies: own folder only). The service role is used only for what a user may not do for
// themselves: claiming, recording results in system-managed columns, refunds, and the audit log.
const { makeHandler, refundUsage, effectiveTier, TIER_LIMITS, audit } = require('./_handler');
const { requireUuid } = require('./_validate');
const { runAudioPipeline } = require('./_tts');
const { logError } = require('./_logError');
const { settleCall, releaseReservation, estimateTtsCost } = require('./_spend');

/** Retry a short, idempotent database write a few times before giving up (a blip must not discard finished audio). */
async function withRetry(label, fn, attempts = 3, delayMs = 400) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { const r = await fn(); if (r && r.error) throw new Error(`${label}: ${r.error.message}`); return r; }
    catch (e) { last = e; if (i < attempts) await new Promise(res => setTimeout(res, delayMs * i)); }
  }
  throw last;
}

exports.handler = makeHandler(['OPENAI_API_KEY'], async (event, { supabase, db, user, body }) => {
  requireUuid(body.jobId, 'jobId');
  const { data: job } = await db.from('jobs').select('id, user_id, tax_return_id, payload, status').eq('id', body.jobId).maybeSingle();
  if (!job || job.user_id !== user.id) throw Object.assign(new Error('Job not found'), { statusCode: 404 });

  const { data: claimed, error: claimErr } = await supabase.rpc('claim_job', { p_job: job.id, p_user: user.id });
  if (claimErr) throw new Error(`claim_job failed: ${claimErr.message}`);
  if (!claimed) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'already started or finished' }) };

  // The audio budget was RESERVED when the job was created (inside start_audio_job). It is settled below to the characters the vendor ACTUALLY billed —
  // all of them on success, only the scenes that succeeded if the job fails part-way — or released if nothing was billed. (call key: audio:<job id>)
  const callKey = `audio:${job.id}`;
  const settle = async (billedChars) => billedChars > 0
    ? settleCall(supabase, { callKey, userId: user.id, vendor: 'openai', actualCostUsd: estimateTtsCost(billedChars), units: billedChars })
    : releaseReservation(supabase, callKey);

  const progress = async (pct) => { await supabase.from('jobs').update({ progress: pct, heartbeat_at: new Date().toISOString() }).eq('id', job.id); };
  try {
    const out = await runAudioPipeline({
      storageClient: db, userId: user.id, taxReturnId: job.tax_return_id,
      segments: job.payload.segments, openaiKey: process.env.OPENAI_API_KEY, onProgress: progress,
    });
    await settle(out.ttsCharsBilled);   // the vendor has billed these characters whatever happens next, so reconcile the reservation to reality NOW
    // audio_* are system-managed columns (the database ignores browser writes to them) → service role, scoped to the owner.
    await withRetry('save audio', () => supabase.from('tax_returns')
      .update({ audio_url: out.audioPath, audio_segments: out.segments, status: 'audio_ready', video_url: null })   // a new voiceover makes any earlier video stale
      .eq('id', job.tax_return_id).eq('user_id', user.id));
    await withRetry('mark job succeeded', () => supabase.from('jobs').update({
      status: 'succeeded', progress: 100, finished_at: new Date().toISOString(),
      result: { audio_path: out.audioPath, segment_count: out.segments.length, total_duration_ms: out.totalDurationMs },
    }).eq('id', job.id));
    await audit(supabase, user.id, 'audio_generated', `${out.segments.length} scenes for ${job.tax_return_id} (${Math.round(out.totalDurationMs / 1000)}s).`);

    // Low-balance notice = plan allowance left + purchased credits.
    const [{ data: sub }, { data: usage }] = await Promise.all([
      db.from('subscriptions').select('tier, status').eq('user_id', user.id).maybeSingle(),
      db.from('usage_counters').select('credits_used, pack_credits_balance').eq('user_id', user.id).maybeSingle(),
    ]);
    const remaining = Math.max(0, TIER_LIMITS[effectiveTier(sub)].credits - (usage?.credits_used || 0)) + (usage?.pack_credits_balance || 0);
    if (remaining > 0 && remaining <= 3) await audit(supabase, user.id, 'credits_low', `${remaining} walkthrough credit${remaining === 1 ? '' : 's'} remaining`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    await settle(err.ttsCharsBilled || 0);   // settle what the vendor actually billed before failing (only the scenes that succeeded), or release the hold if nothing was billed; idempotent
    // The paid work failed: record a user-safe reason, return the credit (idempotent; never throws), then let the wrapper log it.
    const refunded = await refundUsage(supabase, user.id, 'credit', job.id);
    // If the refund could not be confirmed, say so honestly: the ledger reconciler returns it automatically (and an alarm fires if it cannot).
    const base = err.userMessage || 'Something went wrong generating the audio.';
    await supabase.from('jobs').update({
      status: 'failed', finished_at: new Date().toISOString(),
      error: `${base} ${refunded ? 'Your credit has been returned — please try again.' : 'Your credit will be returned automatically shortly — please try again in a few minutes.'}`,
    }).eq('id', job.id);
    logError('generate-audio-background', err, { userId: user.id, jobId: job.id });
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
});
