// netlify/functions/reap-jobs.js — scheduled (see netlify.toml). Fails jobs that can no longer finish — never started, or
// silent for too long — and returns the customer's credit. Idempotent, so it is harmless if invoked more often than scheduled.
// Reachable over HTTP like any function, so it is rate-limited by IP and returns only a count.
const { createClient } = require('@supabase/supabase-js');
const { rateLimit, clientIp } = require('./_ratelimit');
const { logError } = require('./_logError');

exports.handler = async (event) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await rateLimit(supabase, `reap-jobs:${clientIp(event)}`, 30, 3600);
    const { data, error } = await supabase.rpc('reap_stale_jobs', {});
    if (error) throw new Error(error.message);
    // Ledger reconciliation: return any credit still owed to a failed job, then ALARM if one remains unrefunded (should always be zero).
    const { data: reconciled, error: recErr } = await supabase.rpc('reconcile_failed_job_refunds', { p_days: 14 });
    if (recErr) throw new Error(recErr.message);
    const { data: unrefunded, error: cntErr } = await supabase.rpc('count_unrefunded_failed_jobs', {});
    if (cntErr) throw new Error(cntErr.message);
    await supabase.rpc('assume_stale_vendor_reservations', { p_older: '2 hours' });   // a reservation nobody settled (a dead worker) is counted at its estimate — never forgotten
    if (unrefunded > 0) logError('refund-reconciliation', new Error(`${unrefunded} failed job(s) still have an unrefunded credit after reconciliation`), {});
    return { statusCode: 200, body: JSON.stringify({ reaped: data, reconciled, unrefunded }) };
  } catch (err) {
    if (err.statusCode === 429 || err.statusCode === 503) return { statusCode: err.statusCode, body: JSON.stringify({ error: 'Busy' }) };
    logError('reap-jobs', err, {});
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed' }) };
  }
};
