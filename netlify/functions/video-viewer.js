// netlify/functions/video-viewer.js
// Public endpoint — no auth required.
// GET  ?token=xxx  → validates token, returns viewer data
// POST ?token=xxx  → records a view event; on view_complete the advisor is notified in-process (see _notify.js)

const { makeHandler, json, CORS_HEADERS } = require('./_handler');
const { rateLimit, clientIp } = require('./_ratelimit');
const crypto = require('crypto');
const { signedUrl, publicSegment } = require('./_storage');
const { notifyViewComplete } = require('./_notify');

exports.config = { timeout: 26 };

// GET handler — validate token and return viewer payload
async function handleGet(supabase, token) {
  const { data: link, error } = await supabase
    .from('video_share_links')
    .select(`id, token, is_active, expires_at,
      tax_return_id, firm_id,
      tax_returns(id, tax_year, audio_url, video_url, pdf_summary_url, script_json, audio_segments, parsed_data),
      profiles:firm_id(firm_name, brand_color, logo_url, phone)`)
    .eq('token', token)
    .single();

  if (error || !link) return json(404, { error: 'Link not found or expired' });

  // Look up the advisor's email once; revoked/expired pages need it too, so the
  // client always has somebody to contact instead of a dead end.
  const getAdvisorEmail = async () => {
    const { data } = await supabase.auth.admin.getUserById(link.firm_id).catch(() => ({ data: {} }));
    return data?.user?.email || null;
  };
  const contact = async () => ({
    firmName:     link.profiles?.firm_name || null,
    advisorEmail: await getAdvisorEmail(),
    advisorPhone: link.profiles?.phone || null,
  });

  if (!link.is_active) return json(410, { error: 'This link has been revoked', ...(await contact()) });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return json(410, { error: 'This link has expired', ...(await contact()) });
  }

  // Record link_opened (idempotent — viewer page may load multiple times)
  await supabase.rpc('record_view_event', { p_token: token, p_event_type: 'link_opened' }).catch(() => {});

  const advisor = await contact();
  // Signed ONLY now, after the token has been validated. Short-lived so a leaked URL stops working;
  // a revoked link can therefore never be used to mint a fresh file URL.
  const tr = link.tax_returns || {};
  const audioUrl = await signedUrl(supabase, tr.audio_url, 4 * 3600, { ownerId: link.firm_id });   // refuses paths outside the firm's folder
  const pdfUrl   = await signedUrl(supabase, tr.pdf_summary_url, 3600, { ownerId: link.firm_id });
  const videoUrl = await signedUrl(supabase, tr.video_url, 4 * 3600, { ownerId: link.firm_id });   // was returned as a raw storage path, which no browser can play
  // The transcript must match what the client HEARS: the narrated segments (with measured durations), not the first draft of the script, which the
  // advisor may have edited before generating audio, or regenerated since.
  const rawSegs  = (Array.isArray(tr.audio_segments) && tr.audio_segments.length ? tr.audio_segments : tr.script_json) || [];
  const segments = Array.isArray(rawSegs) ? rawSegs.map(publicSegment) : rawSegs;
  // Only the single headline number is exposed, not the parsed return.
  const rawRefund = link.tax_returns?.parsed_data?.refund_or_owed;
  const refundOrOwed = Number.isFinite(Number(rawRefund)) && rawRefund !== null && rawRefund !== '' ? Number(rawRefund) : null;

  return json(200, {
    ok:          true,
    taxYear:     link.tax_returns?.tax_year,
    audioUrl,
    videoUrl,
    pdfUrl,
    segments,
    firmName:    link.profiles?.firm_name   || 'TaxStory',
    brandColor:  link.profiles?.brand_color || '#6B5CE7',
    logoUrl:     link.profiles?.logo_url    || null,
    advisorEmail:advisor.advisorEmail,
    advisorPhone:advisor.advisorPhone,
    refundOrOwed,
  });
}

// POST handler — record a view event; on completion notify the advisor
const EVENT_TYPES = ['link_opened', 'view_start', 'view_progress', 'view_complete'];
async function handlePost(supabase, token, body) {
  const { eventType } = body;
  if (!EVENT_TYPES.includes(eventType)) return json(400, { error: 'Unknown event' });
  const pct = body.watchPct == null ? null : Math.max(0, Math.min(100, Math.round(Number(body.watchPct))));
  if (pct !== null && !Number.isFinite(pct)) return json(400, { error: 'Invalid watchPct' });

  const { data, error } = await supabase.rpc('record_view_event', {
    p_token: token, p_event_type: eventType, p_watch_pct: pct, p_viewer_ua: null, p_viewer_country: null,
  });
  if (error) return json(400, { error: 'Could not record the event' });

  // The notification runs in-process and is AWAITED: a serverless container is frozen after the response is returned, so a
  // fire-and-forget request could be dropped. notifyViewComplete never throws (failures are logged) so viewing is never affected.
  if (eventType === 'view_complete' && data?.ok && data.firm_id) {
    await notifyViewComplete(supabase, { shareLinkId: data.share_link_id, taxReturnId: data.tax_return_id, firmId: data.firm_id, watchPct: pct });
  }
  return json(200, { ok: true });
}

// Route by method — video-viewer handles GET and POST
exports.handler = async (event) => {
  const { createClient } = require('@supabase/supabase-js');
  const { logError }     = require('./_logError');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (!['GET','POST'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });

  const token = (event.queryStringParameters || {}).token || (event.pathParameters || {}).token;
  if (!token) return json(400, { error: 'Token required' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const tokenId  = crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 10);   // log a fingerprint, NEVER the bearer token

  try {
    // Abuse controls: per-IP (probing/enumeration) and per-token (hot links, view-event floods).
    await rateLimit(supabase, `viewer-ip:${clientIp(event)}`, 300, 600, 'Too many requests. Please try again in a few minutes.');
    await rateLimit(supabase, `viewer-token:${tokenId}`, event.httpMethod === 'GET' ? 120 : 200, 3600, 'Too many requests for this link. Please try again later.');
    if (event.httpMethod === 'GET') return await handleGet(supabase, token);

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Invalid JSON' });
    return await handlePost(supabase, token, body);
  } catch (err) {
    if (err.statusCode === 429 || err.statusCode === 503) return json(err.statusCode, { error: err.message }, { 'Retry-After': String(err.retryAfter || 60) });
    logError('video-viewer', err, { tokenId });
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
