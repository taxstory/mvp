// netlify/functions/delete-data.js — PERMANENT deletion of a client (with everything about them) or a single return.
//   { kind: 'client' | 'return', id }
// Order matters: files are removed FIRST, rows second. If file removal fails nothing is deleted and the user is told to retry, so a
// failure can never leave financial documents orphaned behind rows that no longer exist. Row deletion cascades (migration 13) to
// returns, projections, share links, messages and jobs. Everything runs through the CALLER-scoped client: row-level security and the
// storage policies restrict it to the caller's own data.
const { makeHandler, getTaxReturn, audit } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { bad, requireUuid } = require('./_validate');
const { removeFolder } = require('./_storage');

exports.config = { timeout: 26 };

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { kind, id } = body;
  if (!['client', 'return'].includes(kind)) throw bad('Invalid kind');
  requireUuid(id, 'id');
  await rateLimit(supabase, `delete-data:${user.id}`, 60, 3600, 'You have deleted a lot of items this hour. Please wait a few minutes.');

  let returnIds;
  if (kind === 'client') {
    const { data: client } = await db.from('clients').select('id').eq('id', id).maybeSingle();
    if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
    const { data: rets, error } = await db.from('tax_returns').select('id').eq('client_id', id);
    if (error) throw new Error(`Could not list returns: ${error.message}`);
    returnIds = (rets || []).map(r => r.id);
  } else {
    await getTaxReturn(db, id, user.id, 'id, user_id');
    returnIds = [id];
  }

  let deletedFiles = 0;
  for (const rid of returnIds) deletedFiles += await removeFolder(db, `${user.id}/${rid}`);     // throws → nothing else is deleted

  const { error } = kind === 'client' ? await db.from('clients').delete().eq('id', id) : await db.from('tax_returns').delete().eq('id', id);
  if (error) throw new Error(`Could not delete: ${error.message}`);

  await audit(supabase, user.id, 'data_deleted', `${kind} deleted permanently: ${returnIds.length} return(s), ${deletedFiles} file(s).`);   // counts only; no names
  return { statusCode: 200, body: JSON.stringify({ ok: true, deletedReturns: returnIds.length, deletedFiles }) };
});
