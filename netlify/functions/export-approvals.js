// netlify/functions/export-approvals.js — lets an advisor DOWNLOAD their approval records for one client or one return (JSON), e.g. before deleting it.
// Why it exists: deleting a client/return redacts its approval records into a content-free log (19_approval_retention.sql), so an advisor who must keep the full record for
// their own professional-retention duties needs a copy first — and until now there was no screen or export for approvals at all.
// Everything runs through the CALLER-scoped client; ownership is checked first (404 for anything that is not theirs). Never uses the service role for data.
const { makeHandler, getTaxReturn } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { bad, requireUuid } = require('./_validate');

exports.config = { timeout: 26 };

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { clientId, taxReturnId } = body;
  if (!!clientId === !!taxReturnId) throw bad('Provide exactly one of clientId or taxReturnId');
  await rateLimit(supabase, `export-approvals:${user.id}`, 30, 3600, 'Too many downloads this hour. Please wait a few minutes.');

  let returns, label = null;
  if (clientId) {
    requireUuid(clientId, 'clientId');
    const { data: client } = await db.from('clients').select('id, name').eq('id', clientId).maybeSingle();
    if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
    label = client.name;
    const { data, error } = await db.from('tax_returns').select('id, tax_year').eq('client_id', clientId);
    if (error) throw new Error(`Could not list returns: ${error.message}`);
    returns = data || [];
  } else {
    requireUuid(taxReturnId, 'taxReturnId');
    returns = [await getTaxReturn(db, taxReturnId, user.id, 'id, user_id, tax_year')];
  }

  const approvals = [];
  for (const r of returns) {
    const { data, error } = await db.from('narration_approvals').select('version, approved_at, kind, note, approved_amounts, narration, narration_sha256').eq('tax_return_id', r.id);
    if (error) throw new Error(`Could not read approvals: ${error.message}`);
    for (const a of (data || []).sort((x, y) => x.version - y.version)) approvals.push({ tax_year: r.tax_year ?? null, ...a });
  }
  return { statusCode: 200, body: JSON.stringify({
    format: 'taxstory-approvals-v1', exported_at: new Date().toISOString(), scope: clientId ? 'client' : 'return', client_label: label, count: approvals.length, approvals,
    note: 'Keep this file with your own records. Once the client or return is deleted, TaxStory keeps only a content-free log (kind, version and time) of these approvals — no figures, names or notes.',
  }) };
});
