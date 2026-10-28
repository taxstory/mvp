// netlify/functions/_spend.js — vendor-cost control by RESERVATION. The budget is enforced by reserving the estimated cost atomically BEFORE a paid call
// (reserve_vendor_budget: check-and-hold in one locked step, so concurrent requests cannot jointly exceed it), then settling to the ACTUAL billed amount afterwards
// or releasing the hold if no paid call was made. A call that never settles is counted at its estimate (assume_stale_vendor_reservations, run by the reaper).
// Rates are ESTIMATES from environment variables — keep them at or above the vendors' prices; hard limits in the vendors' dashboards remain the authoritative stop.
// Audio reserves INSIDE the start_audio_job transaction (see start-audio-job.js); this module serves the model call and the worker's settlement.
const { logError } = require('./_logError');

const num = (name, dflt) => { const v = parseFloat(process.env[name]); return Number.isFinite(v) && v > 0 ? v : dflt; };
const rates  = () => ({ anthropicInPerM: num('ANTHROPIC_INPUT_USD_PER_MTOK', 3), anthropicOutPerM: num('ANTHROPIC_OUTPUT_USD_PER_MTOK', 15), ttsPerMChar: num('OPENAI_TTS_USD_PER_MCHAR', 15) });
const limits = () => ({ global: num('DAILY_VENDOR_BUDGET_USD', 50), user: num('USER_DAILY_VENDOR_BUDGET_USD', 5) });

const estimateAnthropicCost = (inTok, outTok) => { const r = rates(); return (inTok / 1e6) * r.anthropicInPerM + (outTok / 1e6) * r.anthropicOutPerM; };
const estimateTtsCost = chars => (chars / 1e6) * rates().ttsPerMChar;

/** Atomically check AND hold `estCostUsd`. Never throws; an unreachable database counts as "not allowed" (fail closed). */
async function reserveBudget(supabase, { userId, vendor, estCostUsd, units = 0, callKey }) {
  const l = limits();
  try {
    const { data, error } = await supabase.rpc('reserve_vendor_budget', { p_user: userId, p_vendor: vendor, p_est: estCostUsd, p_global_limit: l.global, p_user_limit: l.user, p_call_key: callKey, p_units: Math.round(units) });
    if (error || !data) { logError('vendor-budget', new Error(error?.message || 'no result'), {}); return { allowed: false, blocked_by: 'unavailable' }; }
    if (data.allowed && Number(data.global_spend) > 0.8 * l.global) logError('vendor-budget', new Error(`Global vendor spend (incurred + reserved) is above 80% of today's budget ($${Number(data.global_spend).toFixed(2)} of $${l.global})`), {});
    return data;
  } catch (e) { logError('vendor-budget', e, {}); return { allowed: false, blocked_by: 'unavailable' }; }
}
/** Reconcile a call to the amount ACTUALLY billed (idempotent). Best effort: the money is already spent, so a failure to record is logged, never thrown. */
async function settleCall(supabase, { callKey, userId, vendor, actualCostUsd, units = 0 }) {
  try {
    const { data, error } = await supabase.rpc('settle_vendor_call', { p_call_key: callKey, p_user: userId, p_vendor: vendor, p_actual: actualCostUsd, p_units: Math.round(units) });
    if (error) { logError('vendor-spend', new Error(error.message), {}); return null; }
    if (Number(data) > limits().global) logError('vendor-budget', new Error(`Global daily vendor budget EXCEEDED ($${Number(data).toFixed(2)} of $${limits().global})`), {});
    return data;
  } catch (e) { logError('vendor-spend', e, {}); return null; }
}
/** No paid call was made: free the hold. Best effort (an unreleased hold is counted at its estimate until the reaper assumes it, which is conservative). */
async function releaseReservation(supabase, callKey) {
  try { const { error } = await supabase.rpc('release_vendor_reservation', { p_call_key: callKey }); if (error) logError('vendor-spend', new Error(error.message), {}); }
  catch (e) { logError('vendor-spend', e, {}); }
}

module.exports = { estimateAnthropicCost, estimateTtsCost, reserveBudget, settleCall, releaseReservation, rates, limits };
