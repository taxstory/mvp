// netlify/functions/save-ria.js — creates an Investment Planning (RIA) projection and charges the allowance.
// Browsers cannot insert into ria_projections (revoked in 13_pii_minimization_and_metering.sql); this is the only way a row is created.
// Strict numeric allow-list; the only free text is an optional client label (SSN/EIN tripwire applies).
const { makeHandler, reserveUsage, refundUsage, audit } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { bad } = require('./_validate');
const { assertNoIdentifier } = require('./_pii');
const { randomUUID } = require('crypto');

exports.config = { timeout: 26 };

const NUM = { // field → [min, max, integer?]
  current_age: [18, 110, true], retirement_age: [18, 110, true], annual_income: [0, 1e9], ira_balance: [0, 1e10], roth_balance: [0, 1e10],
  k401_balance: [0, 1e10], taxable_balance: [0, 1e10], annual_contribution: [0, 1e8], growth_rate: [-10, 30], lifetime_tax_estimate: [0, 1e11],
};
const ALLOWED = new Set([...Object.keys(NUM), 'client_name', 'filing_status', 'projection_data']);

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const keys = Object.keys(body);
  if (keys.some(k => !ALLOWED.has(k))) throw bad('Unexpected field');
  const row = {};
  for (const [k, [min, max, int]] of Object.entries(NUM)) {
    if (body[k] === undefined || body[k] === null) continue;
    const v = body[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) throw bad(`Invalid ${k.replace(/_/g, ' ')}`);
    row[k] = v;
  }
  if (row.retirement_age !== undefined && row.current_age !== undefined && row.retirement_age < row.current_age) throw bad('Retirement age must not be before current age');
  if (body.filing_status !== undefined) {
    if (typeof body.filing_status !== 'string' || !/^[A-Za-z][A-Za-z ,'\-]{1,39}$/.test(body.filing_status)) throw bad('Invalid filing status');
    row.filing_status = body.filing_status.trim();
  }
  if (body.client_name !== undefined && body.client_name !== null) {
    if (typeof body.client_name !== 'string') throw bad('Invalid client name');
    row.client_name = body.client_name.trim().slice(0, 100);
    assertNoIdentifier(row.client_name, 'Client name');
  }
  if (body.projection_data !== undefined && body.projection_data !== null) {
    const rows = body.projection_data;
    if (!Array.isArray(rows) || rows.length > 80) throw bad('Invalid projection data');
    row.projection_data = rows.map(r => {
      if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length > 20) throw bad('Invalid projection data');
      const o = {};
      for (const [k, v] of Object.entries(r)) {
        if (!/^[A-Za-z0-9_]{1,24}$/.test(k) || typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e12) throw bad('Invalid projection data');
        o[k] = v;
      }
      return o;
    });
  }
  await rateLimit(supabase, `save-ria:${user.id}`, 60, 3600, 'You have saved a lot of plans this hour. Please wait a few minutes.');

  const id = randomUUID();
  const { data: sub } = await db.from('subscriptions').select('tier, status').eq('user_id', user.id).maybeSingle();
  await reserveUsage(supabase, user.id, 'projection', id, sub);
  try {
    const { error } = await supabase.from('ria_projections').insert({ id, user_id: user.id, ...row, notes: '' });
    if (error) throw new Error(`Could not save plan: ${error.message}`);
  } catch (err) { await refundUsage(supabase, user.id, 'projection', id); throw err; }
  await audit(supabase, user.id, 'ria_saved', 'Investment plan saved.');
  return { statusCode: 200, body: JSON.stringify({ ok: true, id }) };
});
