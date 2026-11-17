// netlify/functions/_ratelimit.js — fixed-window rate limiting backed by the database (rate_limit_hit in 12_billing_integrity.sql).
//
// FAILS CLOSED. If the limiter cannot be consulted (RPC error or exception) the request is REFUSED with 503 + Retry-After. It used to fail
// open. Every function here depends on the same database, so a limiter outage almost always coincides with a database outage, and failing open
// bought almost no availability while removing the protection on exactly the endpoints that cost money (AI, TTS, email) or accept
// unauthenticated tokens. (Independent audit, Oct 2026.) Vendor-side hard spending limits and an edge-level limiter are still recommended:
// a database limiter must not be the only protection.
const { logError } = require('./_logError');

/** Best-effort client IP behind Netlify's proxy. */
function clientIp(event) {
  const h = event?.headers || {};
  return String(h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64);
}

const unavailable = () => Object.assign(new Error('The service is busy right now. Please try again in a moment.'), { statusCode: 503, retryAfter: 30 });

/** Count one hit; throws 429 (with retryAfter) when over the limit, and 503 when the limiter itself is unavailable. */
async function rateLimit(supabase, key, limit, windowSeconds, message = 'Too many requests. Please try again shortly.') {
  let res;
  try { res = await supabase.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds }); }
  catch (e) { logError('rate-limit', e, { key: key.split(':')[0] }); throw unavailable(); }
  if (res.error) { logError('rate-limit', new Error(res.error.message), { key: key.split(':')[0] }); throw unavailable(); }
  if (res.data && res.data.allowed === false) {
    throw Object.assign(new Error(message), { statusCode: 429, retryAfter: res.data.retry_after || windowSeconds });
  }
}

/**
 * Account-independent circuit breaker on paid vendor calls: at most `limit` per rolling day across ALL users, from an env var so it can be
 * tuned without a deploy. A leaked account, a bug, or an attacker with many free trials cannot spend more than this per day.
 * (Set hard monthly limits in the Anthropic and OpenAI dashboards as well.)
 */
async function globalDailyCap(supabase, name, envVar, defaultLimit) {
  const limit = Math.max(1, parseInt(process.env[envVar], 10) || defaultLimit);
  try { await rateLimit(supabase, `global:${name}`, limit, 86400, 'TaxStory has reached its daily capacity for this feature. Please try again later.'); }
  catch (e) { if (e.statusCode === 429) { logError('global-cap', new Error(`Daily cap reached: ${name} (${limit})`), {}); throw Object.assign(e, { statusCode: 503, retryAfter: 3600 }); } throw e; }
}

module.exports = { rateLimit, clientIp, globalDailyCap };
