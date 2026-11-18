// TS-005: rotating a client's portal link must only report success when the new token is actually stored.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const fnDir = path.resolve(__dirname, '../../netlify/functions');
const sbPath = require.resolve('@supabase/supabase-js', { paths: [fnDir] });

function loadWith(updateResult) {
  const calls = [];
  const chain = (table) => {
    const q = { _t: table, _op: null };
    q.select = () => q; q.eq = (k, v) => { calls.push([table, q._op || 'select', 'eq', k, v]); return q; };
    q.single = async () => ({ data: table === 'clients' ? { id: 'c1' } : null });
    q.update = (vals) => { q._op = 'update'; q._vals = vals; return q; };
    q.then = (res, rej) => (q._op === 'update' ? Promise.resolve(updateResult(q._vals)) : Promise.resolve({ data: [] })).then(res, rej);
    return q;
  };
  const client = { from: chain, auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) }, rpc: async () => ({ data: null }) };
  require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: { createClient: () => client } };
  for (const k of Object.keys(require.cache)) if (k.startsWith(fnDir) && !k.includes('node_modules')) delete require.cache[k];
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'; process.env.SITE_URL = 'https://app.example.com';
  return { handler: require(path.join(fnDir, 'client-portal.js')).handler, calls };
}
const post = { httpMethod: 'POST', headers: { authorization: 'Bearer t', origin: 'https://app.example.com' }, body: JSON.stringify({ clientId: 'c1' }), queryStringParameters: {} };

test('successful rotation returns the new link', async () => {
  const { handler, calls } = loadWith(vals => ({ data: [{ id: 'c1', portal_token: vals.portal_token }], error: null }));
  const r = await handler(post);
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.match(body.portalUrl, new RegExp(`/portal/${body.portalToken}$`));
  assert.ok(calls.some(c => c[1] === 'update' && c[3] === 'user_id' && c[4] === 'u1'), 'update must be scoped to the firm');
});

test('a database error does not return a new link', async () => {
  const { handler } = loadWith(() => ({ data: null, error: { message: 'boom' } }));
  const r = await handler(post);
  assert.equal(r.statusCode, 500);
  assert.equal(JSON.parse(r.body).portalUrl, undefined);
});

test('a zero-row update does not return a new link', async () => {
  const { handler } = loadWith(() => ({ data: [], error: null }));
  const r = await handler(post);
  assert.equal(r.statusCode, 500);
});
