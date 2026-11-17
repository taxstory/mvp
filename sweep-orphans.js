// netlify/functions/sweep-orphans.js — scheduled daily (netlify.toml). Backstop for "permanent deletion": removes files in the private
// audio bucket whose return no longer exists (deleted through some path other than delete-data, e.g. cascade, an account removal, or
// a delete during a running job). Only folders named like a UUID are considered; anything else is left alone. Returns counts only.
const { createClient } = require('@supabase/supabase-js');
const { rateLimit, clientIp } = require('./_ratelimit');
const { isUuid } = require('./_validate');
const { removeFolder } = require('./_storage');
const { logError } = require('./_logError');

const MAX_FOLDERS = 500;
async function listAll(st, prefix, pages = 5) {
  const out = [];
  for (let p = 0; p < pages; p++) {
    const { data, error } = await st.list(prefix, { limit: 100, offset: p * 100 });
    if (error) throw new Error(error.message);
    out.push(...(data || [])); if (!data || data.length < 100) break;
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await rateLimit(supabase, `sweep-orphans:${clientIp(event)}`, 10, 3600);
    const st = supabase.storage.from('audio');
    let checked = 0, removedFiles = 0, orphanFolders = 0;
    for (const u of (await listAll(st, '')).filter(e => !e.id && isUuid(e.name))) {
      const folders = (await listAll(st, u.name)).filter(e => !e.id && isUuid(e.name)).map(e => e.name);
      if (!folders.length) continue;
      const { data: rows, error } = await supabase.from('tax_returns').select('id').in('id', folders);
      if (error) throw new Error(error.message);
      const live = new Set((rows || []).map(r => r.id));
      for (const rid of folders) {
        if (++checked > MAX_FOLDERS) break;
        if (!live.has(rid)) { removedFiles += await removeFolder(supabase, `${u.name}/${rid}`); orphanFolders++; }
      }
      if (checked > MAX_FOLDERS) break;
    }
    // Retention for client contact data (only stored when a firm turns labels-only mode off): a recipient address is kept 90 days after its
    // share link expires, and on a message for 90 days, then cleared. The link, the message text and the view history stay.
    const RETAIN_DAYS = Number(process.env.CONTACT_RETENTION_DAYS || 90);
    const cutoff = new Date(Date.now() - RETAIN_DAYS * 86400000).toISOString();
    const r1 = await supabase.from('video_share_links').update({ sent_to: null }).not('sent_to', 'is', null).lt('expires_at', cutoff);
    const r2 = await supabase.from('messages').update({ sent_to: null }).not('sent_to', 'is', null).lt('created_at', cutoff);
    const r3 = await supabase.from('video_view_notifications').update({ sent_to: null }).not('sent_to', 'is', null).lt('created_at', cutoff);
    for (const [k, r] of [['share_links', r1], ['messages', r2], ['view_notifications', r3]]) if (r.error) logError(`contact-retention:${k}`, r.error);
    return { statusCode: 200, body: JSON.stringify({ checked, orphanFolders, removedFiles }) };
  } catch (err) {
    if (err.statusCode === 429 || err.statusCode === 503) return { statusCode: err.statusCode, body: JSON.stringify({ error: 'Busy' }) };
    logError('sweep-orphans', err, {});
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed' }) };
  }
};
