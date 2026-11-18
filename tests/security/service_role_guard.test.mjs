// TS-004: fails if any Netlify function uses the SERVICE-ROLE Supabase client (which bypasses row-level security) in a way that is not
// listed, with a reason, in service_role_allowlist.json — and if the service-role key is read anywhere not listed. Stale entries fail too,
// so the allowlist always describes the code as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const fnDir = new URL('../../netlify/functions/', import.meta.url);
const allow = JSON.parse(readFileSync(new URL('./service_role_allowlist.json', import.meta.url)));

export function inventory(source) {
  const s = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const uses = new Set();
  for (const m of s.matchAll(/\bsupabase\s*\.\s*(from|rpc)\(\s*['"]([a-z_]+)['"]/g)) uses.add(`${m[1]}:${m[2]}`);
  for (const m of s.matchAll(/\bsupabase\s*\.\s*storage\s*\.\s*from\(\s*['"]([a-z_-]+)['"]/g)) uses.add(`storage:${m[1]}`);
  if (/\bsupabase\s*\.\s*auth\s*\.\s*admin\b/.test(s)) uses.add('auth:admin');
  if (/\bsupabase\s*\.\s*(from|rpc)\(\s*[^'"\s)]/.test(s)) uses.add('DYNAMIC');
  return { uses, readsKey: /SERVICE_ROLE_KEY/.test(s) };
}

const files = readdirSync(fnDir).filter(f => f.endsWith('.js'));

test('every service-role use is allow-listed with a reason', () => {
  const problems = [];
  for (const f of files) {
    const { uses } = inventory(readFileSync(new URL(f, fnDir), 'utf8'));
    for (const u of uses) {
      const reason = allow.uses?.[f]?.[u];
      if (!reason || reason.trim().length < 15) problems.push(`${f}: service-role "${u}" is not in service_role_allowlist.json (or has no reason)`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the service-role key is read only in listed files', () => {
  const extra = files.filter(f => inventory(readFileSync(new URL(f, fnDir), 'utf8')).readsKey && !allow.service_key_files?.[f]);
  assert.deepEqual(extra, [], `service-role key used outside the allowlist: ${extra.join(', ')}`);
});

test('no stale allowlist entries', () => {
  const stale = [];
  for (const [f, entries] of Object.entries(allow.uses || {})) {
    let uses = new Set();
    try { uses = inventory(readFileSync(new URL(f, fnDir), 'utf8')).uses; } catch { stale.push(`${f}: file no longer exists`); continue; }
    for (const u of Object.keys(entries)) if (!uses.has(u)) stale.push(`${f}: "${u}" is listed but no longer used`);
  }
  for (const f of Object.keys(allow.service_key_files || {})) {
    try { if (!inventory(readFileSync(new URL(f, fnDir), 'utf8')).readsKey) stale.push(`${f}: listed as reading the key but does not`); }
    catch { stale.push(`${f}: file no longer exists`); }
  }
  assert.deepEqual(stale, []);
});

test('the guard catches a new, unlisted service-role use', () => {
  const { uses } = inventory("const x = await supabase.from('clients').select('*');");
  assert.ok(uses.has('from:clients') && !allow.uses['save-return.js']['from:clients']);
});
