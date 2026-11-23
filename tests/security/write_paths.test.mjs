// Regression guard for the access-control rules in supabase/05_access_control.sql. With the user's own session (the browser, or `db` in a
// server function) only a return's / plan's NOTES may be changed, returns and plans are never inserted, and profiles are never upserted
// (users have no INSERT permission on profiles). The database silently ignores or refuses such writes, so code that tries them is broken
// in production even though it looks fine; these tests fail the build instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir, ext) => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : files(p, ext);
  return ext.some(e => p.endsWith(e)) ? [p] : [];
});
const browser = files('src', ['.js', '.jsx']);
const server  = files('netlify/functions', ['.js']).filter(p => !p.includes('node_modules'));

// a write call (insert/update/upsert) on a table, with the text of its first argument
function writes(src, client) {
  const re = new RegExp(`${client}\\s*\\.from\\(\\s*['"]([a-z_]+)['"]\\s*\\)\\s*\\.(insert|update|upsert)\\(\\s*(\\{[^}]*\\}|[^)]*)`, 'g');
  return [...src.matchAll(re)].map(m => ({ table: m[1], op: m[2], arg: m[3] }));
}
const notesOnly = arg => /^\{\s*notes\s*\}$|^\{\s*notes\s*:[^,]*\}$/.test(arg.trim());

test('the browser never inserts returns or plans, and only edits their notes', () => {
  const bad = [];
  for (const f of browser) for (const w of writes(readFileSync(f, 'utf8'), 'supabase'))
    if (['tax_returns', 'ria_projections'].includes(w.table) && (w.op !== 'update' || !notesOnly(w.arg))) bad.push(`${f}: ${w.op} ${w.table} ${w.arg.slice(0, 60)}`);
  assert.deepEqual(bad, []);
});

test('the browser never upserts or inserts profiles (no INSERT permission: the write is refused)', () => {
  const bad = [];
  for (const f of browser) for (const w of writes(readFileSync(f, 'utf8'), 'supabase'))
    if (w.table === 'profiles' && w.op !== 'update') bad.push(`${f}: ${w.op} profiles`);
  assert.deepEqual(bad, []);
});

test('server functions change returns and plans with the service role, not the user session', () => {
  const bad = [];
  for (const f of server) for (const w of writes(readFileSync(f, 'utf8'), 'db'))
    if (['tax_returns', 'ria_projections'].includes(w.table) && !(w.op === 'update' && notesOnly(w.arg))) bad.push(`${f}: db.${w.op} ${w.table}`);
  assert.deepEqual(bad, []);
});

test('the browser never sets founding_member, role or a portal token value', () => {
  const bad = [];
  for (const f of browser) {
    const s = readFileSync(f, 'utf8');
    for (const w of writes(s, 'supabase')) {
      if (w.table === 'profiles' && /founding_member|\brole\b/.test(w.arg)) bad.push(`${f}: profiles ${w.arg.slice(0, 60)}`);
      if (w.table === 'clients' && /portal_token\s*:(?!\s*null)/.test(w.arg)) bad.push(`${f}: clients portal_token`);
    }
  }
  assert.deepEqual(bad, []);
});
