// netlify/functions/delete-account.js — PERMANENT, self-service deletion of an advisor's account and everything in it.
//   { confirm: 'DELETE', password }
// Safeguards: typed confirmation, the account password re-checked here (a stolen or left-open session alone cannot delete an account),
// tight rate limit. Order: (1) cancel the Stripe subscription — if that fails NOTHING is deleted, so nobody is billed for a deleted account;
// (2) files (voiceovers, videos, logo); (3) rows; (4) the login itself. Stripe's own invoice and payment records are NOT deleted: they are
// the business's financial records (retention), held by Stripe.
const { createClient } = require('@supabase/supabase-js');
const { makeHandler, audit } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { bad } = require('./_validate');
const { removeFolder } = require('./_storage');
const { logError } = require('./_logError');

exports.config = { timeout: 26 };
const fail = (status, msg) => Object.assign(new Error(msg), { statusCode: status });
const MISSING_TABLE = '42P01';

exports.handler = makeHandler([], async (event, { supabase, user, body }) => {
  if (body.confirm !== 'DELETE') throw bad('Type DELETE to confirm.');
  if (typeof body.password !== 'string' || !body.password) throw bad('Enter your password to confirm.');
  await rateLimit(supabase, `delete-account:${user.id}`, 5, 3600, 'Too many attempts. Please wait an hour and try again.');

  // ── Re-authenticate with the password (separate client, no session kept) ──
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !user.email) throw fail(500, 'Account deletion is not configured. Please contact support.');
  const authCheck = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: pwErr } = await authCheck.auth.signInWithPassword({ email: user.email, password: body.password });
  if (pwErr) throw fail(401, 'That password is not correct.');
  await authCheck.auth.signOut({ scope: 'local' }).catch(() => {});

  await audit(supabase, user.id, 'account_deletion_started', 'Account deletion confirmed with password.');
  const uid = user.id;

  // ── 1. Stop billing first ──
  const { data: subs } = await supabase.from('subscriptions').select('stripe_subscription_id, status').eq('user_id', uid);
  const live = (subs || []).filter(s => s.stripe_subscription_id && ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'].includes(s.status));
  if (live.length) {
    if (!process.env.STRIPE_SECRET_KEY) throw fail(500, 'Billing is not configured, so the subscription could not be cancelled. Nothing was deleted. Please contact support.');
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    for (const s of live) {
      try { await stripe.subscriptions.cancel(s.stripe_subscription_id); }
      catch (e) {
        if (e?.code !== 'resource_missing') {
          logError('delete-account:stripe', e, { user: uid });
          throw fail(502, 'Your subscription could not be cancelled, so nothing was deleted. Please try again or contact support.');
        }
      }
    }
  }

  // ── 2. Files: every return folder in the private bucket, then the logo folder ──
  let files = 0;
  try {
    const { data: entries, error } = await supabase.storage.from('audio').list(uid, { limit: 1000 });
    if (error) throw error;
    for (const e of entries || []) files += e.id ? 0 : await removeFolder(supabase, `${uid}/${e.name}`);   // folders (no id) = one per return
    files += await removeFolder(supabase, uid);                                                         // anything directly in the user folder
    files += await removeFolder(supabase, uid, 'firm-assets');
  } catch (e) {
    logError('delete-account:files', e, { user: uid });
    throw fail(500, 'Your files could not be removed, so nothing else was deleted. Your subscription is cancelled. Please try again or contact support.');
  }

  // ── 3. Rows (explicit, child tables first; the database cascades are a backstop, not relied on) ──
  const { data: rets } = await supabase.from('tax_returns').select('id').eq('user_id', uid);
  const returnIds = (rets || []).map(r => r.id);
  const steps = [
    returnIds.length ? ['narration_approvals', q => q.in('tax_return_id', returnIds)] : null,
    ['jobs',                     q => q.eq('user_id', uid)],
    ['video_view_notifications', q => q.eq('firm_id', uid)],
    ['video_share_links',        q => q.eq('firm_id', uid)],
    ['messages',                 q => q.eq('user_id', uid)],
    ['tax_returns',              q => q.eq('user_id', uid)],
    ['ria_projections',          q => q.eq('user_id', uid)],
    ['clients',                  q => q.eq('user_id', uid)],
    ['onboarding_state',         q => q.eq('user_id', uid)],
    ['feedback',                 q => q.eq('user_id', uid)],
    ['usage_counters',           q => q.eq('user_id', uid)],
    ['subscriptions',            q => q.eq('user_id', uid)],
    ['profiles',                 q => q.eq('id', uid)],
  ].filter(Boolean);
  for (const [table, where] of steps) {
    const { error } = await where(supabase.from(table).delete());
    if (error && error.code !== MISSING_TABLE) {
      logError('delete-account:rows', error, { user: uid, table });
      throw fail(500, 'Part of your data could not be deleted. Your subscription is cancelled and your files are removed. Please contact support to finish.');
    }
  }

  // ── 4. The login. The audit log follows the database's rules for deleted users (it holds ids and actions, no client data). ──
  const { error: authErr } = await supabase.auth.admin.deleteUser(uid);
  if (authErr) {
    logError('delete-account:auth', authErr, { user: uid });
    throw fail(500, 'Your data was deleted, but the login could not be removed. Please contact support to finish.');
  }
  console.info(`[delete-account] completed for ${uid}: ${files} files, ${returnIds.length} returns`);
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
