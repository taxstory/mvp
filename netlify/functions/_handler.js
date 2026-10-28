// netlify/functions/_handler.js
// Shared handler factory for all TaxStory Netlify functions.
// Eliminates ~80 lines of identical boilerplate from each function:
//   ✓ CORS preflight (OPTIONS)
//   ✓ Method gating
//   ✓ Env var checks
//   ✓ Supabase client creation (single instance per invocation)
//   ✓ JWT auth + user resolution
//   ✓ JSON body parsing
//   ✓ Top-level error catch → logError → 500 response
//
// Usage:
//   const { makeHandler } = require('./_handler');
//   module.exports = makeHandler(
//     ['ANTHROPIC_API_KEY'],         // required env vars beyond Supabase
//     async (event, { supabase, user, body }) => {
//       // your logic here — throw on error, return { statusCode, body }
//     }
//   );
//
// The inner function receives:
//   event    — raw Netlify event (headers, httpMethod, etc.)
//   supabase — authenticated Supabase admin client
//   user     — the authenticated Supabase user (null if skipAuth:true)
//   body     — parsed JSON body (or {} if no body)
//
// Options (third arg object):
//   skipAuth: true   — skip JWT check (for public endpoints like video-viewer)
//   method: 'GET'    — override method gate (default 'POST')

const { createClient } = require('@supabase/supabase-js');
const { logError }     = require('./_logError');
const { siteOrigin }    = require('./_site');
const { randomUUID }   = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Public (anon) key: used to build a client bound to the CALLER's JWT, so row-level security enforces ownership.
const anonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// The SPA and the functions are served from the same origin, so cross-origin access is not needed.
// Allow only the site's own origin (no wildcard). Set SITE_URL accordingly in every environment.
// No default: if SITE_URL is missing or malformed NO origin is allowed (fail closed) instead of silently allowing a hard-coded production hostname.
function buildCorsHeaders(origin) {
  return {
    'Content-Type':                'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
    'Vary':                        'Origin',
    'Cache-Control':               'no-store',
  };
}
const CORS_HEADERS = buildCorsHeaders(siteOrigin());

function json(statusCode, data, extraHeaders = {}) {
  return { statusCode, headers: { ...CORS_HEADERS, ...extraHeaders }, body: JSON.stringify(data) };
}

function makeHandler(requiredEnv = [], fn, opts = {}) {
  const method   = opts.method   || 'POST';
  const skipAuth = opts.skipAuth || false;

  return async (event) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };

    // Method gate
    if (event.httpMethod !== method) return json(405, { error: 'Method not allowed' });

    // Env checks
    // Misconfiguration details go to the logs, never to the caller.
    const missingEnv = (!SUPABASE_URL || !SUPABASE_KEY) ? ['SUPABASE_URL/SERVICE_ROLE_KEY'] : requiredEnv.filter(k => !process.env[k]);
    // Authenticated functions REQUIRE the anon key: there is deliberately no silent fallback to the service role.
    if (!skipAuth && !anonKey()) missingEnv.push('SUPABASE_ANON_KEY');
    if (missingEnv.length) {
      logError('handler-config', new Error(`Missing env: ${missingEnv.join(', ')}`), {});
      return json(500, { error: 'Service is temporarily unavailable.' });
    }

    // Two clients per invocation, with different powers:
    //   supabase — SERVICE ROLE. Bypasses row-level security. Only for what a user may not do for themselves
    //              (billing RPCs, rate limits, writes to system-managed columns, share links, audit log, storage signing).
    //   db       — bound to the CALLER's JWT. Row-level security applies, so even a missing ownership check in a function
    //              cannot read or change another tenant's rows. Use this for anything on behalf of the signed-in user.
    // tests/security/service_role_guard.test.mjs fails the build if a function starts using `supabase` for user-owned tables
    // without an entry (and a reason) in tests/security/service_role_allowlist.json.
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    let db = null;

    // Auth
    let user = null;
    if (!skipAuth) {
      const token = (event.headers['authorization'] || event.headers['Authorization'] || '').replace('Bearer ', '');
      if (!token) return json(401, { error: 'Unauthorized — missing Bearer token' });
      const { data: { user: u }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !u) return json(401, { error: 'Unauthorized — invalid or expired token' });
      user = u;
      db = createClient(SUPABASE_URL, anonKey(), {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }

    // Body
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); }
      catch { return json(400, { error: 'Invalid JSON body' }); }
      // `null`, a number, a string or an array is valid JSON but not a request: destructuring it threw a TypeError that came back as a 500 (and, on the public endpoints, an alert in the ops channel).
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Request body must be a JSON object' });
    }

    // Delegate to handler function
    try {
      return await fn(event, { supabase, db, user, body });
    } catch (err) {
      const fnName = event.path?.split('/').pop() || 'unknown';
      // Honor deliberate client errors (4xx thrown with statusCode); everything else is a sanitized 500.
      // Upstream/vendor/database messages are logged, never returned.
      const requestId = randomUUID();
      // 4xx and 503 ("busy / at capacity") are deliberate and carry developer-authored text; everything else is a sanitized 500.
      const status    = Number.isInteger(err.statusCode) && ((err.statusCode >= 400 && err.statusCode < 500) || err.statusCode === 503) ? err.statusCode : 500;
      logError(fnName, err, { userId: user?.id, requestId });
      const extra = (status === 429 || status === 503) && err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {};
      return json(status, (status < 500 || status === 503)
        ? { error: err.message, requestId, ...(err.errorCode ? { code: err.errorCode } : {}), ...(err.details ? { details: err.details } : {}) }
        : { error: 'Something went wrong. Please try again.', requestId }, extra);
    }
  };
}

// ── Shared utilities used by multiple functions ────────────────────────────

/** Fetch and validate ownership of a tax return */
async function getTaxReturn(supabase, taxReturnId, userId, select = '*') {
  const { data, error } = await supabase
    .from('tax_returns')
    .select(select)
    .eq('id', taxReturnId)
    .single();
  if (error || !data) throw Object.assign(new Error('Tax return not found'), { statusCode: 404 });
  if (data.user_id !== userId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  return data;
}

/** Fetch firm profile (non-throwing — returns {} on miss) */
async function getFirmProfile(supabase, userId) {
  const { data } = await supabase
    .from('profiles')
    .select('firm_name, brand_color, logo_url, phone, website, founding_member')
    .eq('id', userId)
    .maybeSingle();
  return data || {};
}

/** Tier limits — single source of truth */
const TIER_LIMITS = {
  trial:     { projections: 10,  credits: 3   },
  cpa_basic: { projections: 100, credits: 0   },
  cpa_pro:   { projections: 300, credits: 100 },
  ria_basic: { projections: 100, credits: 0   },
  ria_pro:   { projections: 200, credits: 50  },
  expired:   { projections: 0,   credits: 0   },
};

/** Which plan limits apply: only an ACTIVE subscription gets its tier; everything else is treated as trial. */
function effectiveTier(sub) {
  return sub?.status === 'active' && TIER_LIMITS[sub.tier] ? sub.tier : 'trial';
}

/**
 * Atomically consume one unit (kind: 'credit' | 'projection') BEFORE doing expensive work.
 * Charged once per (user, kind, jobId). Throws 402 when the allowance is exhausted.
 * Returns { charged, duplicate?, source?, tier, limits }. If the work later fails, call refundUsage with the same jobId.
 */
async function reserveUsage(supabase, userId, kind, jobId, sub) {
  const tier   = effectiveTier(sub);
  const limits = TIER_LIMITS[tier];
  const planLimit = kind === 'credit' ? limits.credits : limits.projections;
  const { data, error } = await supabase.rpc('reserve_usage', { p_user: userId, p_kind: kind, p_job: String(jobId), p_plan_limit: planLimit });
  if (error) {
    if (error.code === 'P0402') throw Object.assign(new Error('No walkthrough credits remaining. Buy a credit pack or upgrade your plan.'), { statusCode: 402 });
    if (error.code === 'P0403') throw Object.assign(new Error('You have used all the projections included in your plan this year. Upgrade your plan to continue.'), { statusCode: 402 });
    throw new Error(`reserve_usage failed: ${error.message}`);
  }
  return { ...(data || {}), tier, limits };
}

/**
 * Return a reservation after a failure. Never throws (it runs inside error handling) and returns TRUE only if the database confirmed it.
 * A FALSE result is not the end: the ledger is reconciled on a schedule (reconcile_failed_job_refunds, see reap-jobs.js), which returns any
 * credit still owed to a failed job, and an alarm fires if one is still unrefunded after an hour.
 */
async function refundUsage(supabase, userId, kind, jobId) {
  try {
    const { error } = await supabase.rpc('refund_usage', { p_user: userId, p_kind: kind, p_job: String(jobId) });
    if (error) { logError('refund_usage', new Error(error.message), { userId, kind }); return false; }
    return true;
  } catch (e) { logError('refund_usage', e, { userId, kind }); return false; }
}

/** Write to audit_log — fire-and-forget, never throws */
async function audit(supabase, userId, action, description) {
  return supabase.from('audit_log').insert({ user_id: userId, action, description }).catch(() => {});
}

module.exports = { makeHandler, json, getTaxReturn, getFirmProfile, TIER_LIMITS, effectiveTier, reserveUsage, refundUsage, audit, CORS_HEADERS, buildCorsHeaders };
