// netlify/functions/client-portal.js
// Client portal — lets a client see ALL their walkthroughs in one place.
//
// Flow:
//   1. CPA shares a "portal link" (/portal/:clientToken) from the client detail view
//   2. Client opens the link — no account needed
//   3. Function returns all active walkthroughs for that client
//
// Security model: the clientToken is a stable token derived from the client record.
// It's not a JWT — it's a shareable, revocable token stored on the clients table.
// The CPA can regenerate it at any time to invalidate old links.
//
// GET  ?clientToken=xxx → returns all walkthroughs for that client
// POST ?clientToken=xxx  { action: 'regenerate_token' } → rotates the token (CPA only, JWT)

const { makeHandler, json, CORS_HEADERS } = require('./_handler');
const { safeWebUrl } = require('./_validate');
const { requireSiteOrigin } = require('./_site');
const { rateLimit, clientIp } = require('./_ratelimit');
const { signedUrl } = require('./_storage');
const { buildFacts } = require('./_scriptFacts');
const crypto = require('crypto');

exports.config = { timeout: 26 };

exports.handler = async (event) => {
  const { createClient } = require('@supabase/supabase-js');
  const { logError }     = require('./_logError');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase     = createClient(SUPABASE_URL, SUPABASE_KEY);

  const CORS = { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };   // same-origin only (no wildcard)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const clientToken = (event.queryStringParameters || {}).clientToken;

  try {
    // ── GET: public portal fetch ─────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      if (!clientToken) return json(400, { error: 'clientToken required' });
      await rateLimit(supabase, `portal-ip:${clientIp(event)}`, 120, 600, 'Too many requests. Please try again in a few minutes.');

      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, name, type, portal_token, user_id, portal_token_expires_at')
        .eq('portal_token', clientToken)
        .single();

      if (clientErr || !client) return json(404, { error: 'Portal not found' });
      // Portal links expire (default 90 days, set per firm) and are replaced by rotating the token. An expired link reveals nothing but
      // how to reach the advisor.
      if (client.portal_token_expires_at && new Date(client.portal_token_expires_at) < new Date()) {
        const { data: fp } = await supabase.from('profiles').select('firm_name, phone').eq('id', client.user_id).maybeSingle();
        const { data: { user: fu } = {} } = await supabase.auth.admin.getUserById(client.user_id).catch(() => ({ data: {} }));
        return json(410, { error: 'This link has expired. Please contact your advisor for a new one.', firmName: fp?.firm_name || null, advisorEmail: fu?.email || null, advisorPhone: fp?.phone || null });
      }
      try { await supabase.rpc('touch_portal', { p_client: client.id }); } catch { /* access history for the advisor (best effort); .catch() on a query builder threw and broke the portal */ }

      // Fetch all walkthroughs for this client — most recent first
      const { data: returns } = await supabase
        .from('tax_returns')
        .select('id, tax_year, file_name, status, created_at, audio_url, video_url, pdf_summary_url, parsed_data')
        .eq('client_id', client.id)
        .eq('user_id', client.user_id)   // only this firm's returns, even if another account's row names this client
        .eq('status', 'audio_ready')  // only show completed walkthroughs to clients
        .order('tax_year', { ascending: false });

      // For each walkthrough that has a video, get its share token
      // Only links that are still live: active AND not expired.
      const { data: shareLinks } = await supabase
        .from('video_share_links')
        .select('tax_return_id, token, is_active, expires_at')
        .eq('is_active', true)
        .eq('firm_id', client.user_id)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .in('tax_return_id', (returns || []).map(r => r.id));

      const tokenByReturnId = {};
      for (const sl of shareLinks || []) {
        tokenByReturnId[sl.tax_return_id] = sl.token;
      }

      // Year-over-year: each filed return's headline outcome (from the SAME canonical figures the narration used), so the client sees their
      // tax story across years. Planning scenarios are labelled as such and carry no outcome. Only these few totals leave the server.
      const outcome = r => {
        if (Array.isArray(r.parsed_data?.scenarios)) return { kind: 'scenario' };
        const f = buildFacts(r.parsed_data || {}, r.tax_year).facts;
        const v = k => (typeof f[k]?.value === 'number' ? f[k].value : null);
        return { kind: 'return', refund: v('refund'), owed: v('amount_owed'), totalTax: v('total_tax'), agi: v('agi') };
      };
      const walkthroughs = await Promise.all((returns || []).map(async r => ({
        id:          r.id,
        taxYear:     r.tax_year,
        status:      r.status,
        ...outcome(r),
        hasVideo:    !!r.audio_url || !!r.video_url,
        pdfUrl:      await signedUrl(supabase, r.pdf_summary_url, 3600, { ownerId: client.user_id }),   // short-lived; bucket is private
        viewerToken: tokenByReturnId[r.id] || null,
        createdAt:   r.created_at,
      })));

      // Firm contact card. (Previously referenced undeclared `profile` and `link` → ReferenceError on every request.)
      const { data: profile } = await supabase
        .from('profiles').select('firm_name, phone, website').eq('id', client.user_id).maybeSingle();
      const { data: { user: firmUserData } = {} } = await supabase.auth.admin
        .getUserById(client.user_id).catch(() => ({ data: {} }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          ok: true, clientName: client.name, walkthroughs,
          firmName:  profile?.firm_name  || null,
          firmPhone: profile?.phone       || null,
          firmWeb:   safeWebUrl(profile?.website),          // never hand a client page anything but a validated https URL
          firmEmail: firmUserData?.email  || null,
        }),
      };
    }

    // ── POST: CPA rotates the portal token ───────────────────────────────────
    if (event.httpMethod === 'POST') {
      const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
      const bearerToken = authHeader.replace('Bearer ', '');
      if (!bearerToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };

      const { data: { user }, error: authErr } = await supabase.auth.getUser(bearerToken);
      if (authErr || !user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };

      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch {}
      if (body === null || typeof body !== 'object' || Array.isArray(body)) body = {};

      const { clientId } = body;
      if (!clientId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'clientId required' }) };

      // Verify the client belongs to this CPA
      const { data: existing } = await supabase
        .from('clients').select('id').eq('id', clientId).eq('user_id', user.id).single();
      if (!existing) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };

      // Generate a new secure token
      const siteUrl = requireSiteOrigin();   // BEFORE the token is rotated: a misconfigured site must not invalidate the old link and hand back a broken one
      const newToken = crypto.randomBytes(24).toString('base64url');
      // TS-005: only report success when the new token is really stored. Scoped to this firm, and the write is confirmed by the returned row:
      // a failed or zero-row update must not hand back a link that does not work while the old one stays valid.
      const { data: rotated, error: rotErr } = await supabase
        .from('clients').update({ portal_token: newToken }).eq('id', clientId).eq('user_id', user.id).select('id, portal_token');
      if (rotErr || !Array.isArray(rotated) || rotated.length !== 1 || rotated[0].portal_token !== newToken) {
        console.error('[client-portal] token rotation failed:', rotErr?.message || `rows updated: ${rotated?.length ?? 0}`);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'The portal link could not be changed. The current link still works — please try again.' }) };
      }

      const portalUrl  = `${siteUrl}/portal/${newToken}`;

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ ok: true, portalToken: newToken, portalUrl }),
      };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    if (err.statusCode === 429 || err.statusCode === 503) return { statusCode: err.statusCode, headers: { ...CORS, 'Retry-After': String(err.retryAfter || 60) }, body: JSON.stringify({ error: err.message }) };
    logError('client-portal', err, {});   // never log the portal token (a bearer credential)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) };
  }
};
