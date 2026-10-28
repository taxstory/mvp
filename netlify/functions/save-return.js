// netlify/functions/save-return.js — creates (or re-imports) a tax projection.
//
// REPLACES parse-return. The return PDF is read in the BROWSER (pdf.js + a deterministic Form 1040 parser); it is never
// uploaded and never reaches this server or any AI vendor. What arrives here is a small set of NUMBERS the advisor has
// reviewed. Therefore:
//   * only allow-listed numeric fields are accepted; ANY unknown key is rejected (not silently dropped), so a client bug or a
//     tampered request that tries to send text, names or identifiers fails loudly;
//   * strings are accepted only for two enum-like fields (filing status; no digits allowed);
//   * the payload is re-checked with the SSN/EIN tripwire as a last line of defence;
//   * the projection allowance is charged HERE (atomic, refunded on failure). Browsers cannot insert projections (RLS).
//
// Request:  { source: 'pdf' | 'manual' | 'copy', figures, taxYear?, clientId?, clientName?, replaceId?, copyOf? }
// Response: { ok: true, id }
const { makeHandler, getTaxReturn, reserveUsage, refundUsage, audit } = require('./_handler');
const { rateLimit }   = require('./_ratelimit');
const { bad, requireUuid, isUuid } = require('./_validate');
const { assertNoIdentifier, assertClientLabel, looksLikeIdentifier } = require('./_pii');
const { randomUUID }  = require('crypto');

exports.config = { timeout: 26 };

// Fields the PDF parser (camelCase) may produce. Identical to the list the old AI extraction was limited to.
const PDF_KEYS = new Set([
  'taxYear','filingStatus','wages','taxableInterest','qualifiedDividends','ordinaryDividends',
  'iraDistributions','taxableIRA','pensionsAnnuities','taxablePensions','socialSecurityBenefits',
  'taxableSocialSecurity','capitalGainLoss','scheduleC_netProfit','scheduleE_netIncome','otherIncome',
  'totalIncome','adjustmentsToIncome','agi','standardDeduction','itemizedDeductions','qbiDeduction',
  'taxableIncome','additionalDeductions','regularTax','alternativeMinTax','selfEmploymentTax','totalTax','totalPayments',
  'federalWithheld','estimatedTaxPayments','refund','amountOwed','effectiveRate','marginalRate',
  'numberOfDependents',
]);
// Fields the manual-entry form produces (snake_case) — includes computed results and boolean planning flags.
const MANUAL_KEYS = new Set([
  'filing_status','wages','business_income','capital_gains','tip_income','overtime_income','other_income','total_income','agi',
  'standard_deduction','senior_deduction','qbi_deduction','taxable_income','federal_tax','se_tax','niit','amt_liability',
  'effective_rate','marginal_rate','bracket_headroom','withholding','refund_or_owed','tax_year','flags',
]);
const STATUS_KEYS = new Set(['filingStatus', 'filing_status']);
const YEAR_KEYS   = new Set(['taxYear', 'tax_year']);
const COUNT_KEYS  = new Set(['numberOfDependents']);
const RATE_KEYS   = new Set(['effectiveRate', 'marginalRate', 'effective_rate', 'marginal_rate']);
const MAX_AMOUNT  = 1e11;

function validateFigures(figures, allowed) {
  if (!figures || typeof figures !== 'object' || Array.isArray(figures)) throw bad('figures must be an object');
  const keys = Object.keys(figures);
  if (keys.length === 0 || keys.length > 60) throw bad('figures has an invalid number of fields');
  const out = {};
  for (const k of keys) {
    const v = figures[k];
    if (!allowed.has(k)) throw bad('Unexpected field in figures');                    // never echo the key: it is client-supplied
    if (STATUS_KEYS.has(k)) {
      if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z ,'\-]{1,39}$/.test(v)) throw bad('Invalid filing status');
      out[k] = v.trim();
    } else if (k === 'flags') {
      if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 40) throw bad('Invalid flags');
      out.flags = {};
      for (const [fk, fv] of Object.entries(v)) {
        if (!/^[A-Za-z0-9_]{1,40}$/.test(fk) || !(typeof fv === 'boolean' || (typeof fv === 'number' && Number.isFinite(fv)))) throw bad('Invalid flags');
        out.flags[fk] = fv;
      }
    } else {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('Figures must be numbers');
      if (YEAR_KEYS.has(k)) { if (!Number.isInteger(v) || v < 2015 || v > new Date().getFullYear() + 1) throw bad('Invalid tax year'); }
      else if (COUNT_KEYS.has(k)) { if (!Number.isInteger(v) || v < 0 || v > 30) throw bad('Invalid dependents count'); }
      else if (RATE_KEYS.has(k)) { if (v < 0 || v > 100) throw bad('Invalid rate'); }
      else if (Math.abs(v) > MAX_AMOUNT) throw bad('A figure is outside the allowed range');
      out[k] = v;
    }
  }
  if (looksLikeIdentifier(JSON.stringify(out))) throw bad('Figures contain something that looks like an identifier');   // belt and braces
  return out;
}

/** Find the caller's client by id, or by exact (case-insensitive) name, or create one. All through `db` (row-level security). */
async function resolveClient(db, user, { clientId, clientName }) {
  if (clientId) {
    requireUuid(clientId, 'clientId');
    const { data } = await db.from('clients').select('id').eq('id', clientId).maybeSingle();
    if (!data) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
    return data.id;
  }
  const name = typeof clientName === 'string' ? clientName.trim().slice(0, 100) : '';
  if (!name) return null;
  assertNoIdentifier(name, 'Client label');
  assertClientLabel(name);
  const { data: existing } = await db.from('clients').select('id, name').eq('user_id', user.id).ilike('name', name.replace(/[%_\\]/g, m => '\\' + m)).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await db.from('clients').insert({ user_id: user.id, name, type: 'cpa' }).select('id').single();
  if (error) throw new Error(`Could not create client: ${error.message}`);
  return created.id;
}

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const source = body.source;
  if (!['pdf', 'manual', 'copy'].includes(source)) throw bad('Invalid source');
  await rateLimit(supabase, `save-return:${user.id}`, 60, 3600, 'You have saved a lot of projections this hour. Please wait a few minutes.');

  // ── Re-import figures into an EXISTING return (no new charge). Any walkthrough built from the old figures is invalidated. ──
  if (body.replaceId !== undefined) {
    requireUuid(body.replaceId, 'replaceId');
    if (source !== 'pdf') throw bad('Only PDF imports can replace figures');
    const figures = validateFigures(body.figures, PDF_KEYS);
    await getTaxReturn(db, body.replaceId, user.id, 'id, user_id');
    const { error } = await db.from('tax_returns').update({ parsed_data: figures, tax_year: figures.taxYear || null, status: 'parsed', script_json: null }).eq('id', body.replaceId);
    if (error) throw new Error(`Could not update return: ${error.message}`);
    // audio/video columns are system-managed (the database ignores browser writes to them), so clearing them needs the service role
    await supabase.from('tax_returns').update({ audio_url: null, audio_segments: null, pdf_summary_url: null }).eq('id', body.replaceId).eq('user_id', user.id);
    await audit(supabase, user.id, 'return_reimported', 'Figures replaced; walkthrough invalidated.');
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: body.replaceId }) };
  }

  // ── Decide the figures ──
  let figures, taxYear, clientId, label;
  if (source === 'copy') {
    requireUuid(body.copyOf, 'copyOf');
    const src = await getTaxReturn(db, body.copyOf, user.id, 'id, user_id, client_id, tax_year, parsed_data');
    if (!src.parsed_data) throw bad('Nothing to copy');
    figures = src.parsed_data; taxYear = src.tax_year; clientId = src.client_id; label = 'Copy';
  } else {
    figures = validateFigures(body.figures, source === 'pdf' ? PDF_KEYS : MANUAL_KEYS);
    taxYear = figures.taxYear ?? figures.tax_year ?? null;
    if (body.taxYear !== undefined && (!Number.isInteger(body.taxYear) || body.taxYear < 2015 || body.taxYear > new Date().getFullYear() + 1)) throw bad('Invalid tax year');
    taxYear = body.taxYear ?? taxYear;
    clientId = await resolveClient(db, user, body);
    label = source === 'manual' ? 'Manual projection' : 'Tax return';
  }
  if (source === 'copy') clientId = clientId || null;

  // ── Charge, then create. The database refuses browser inserts of projections, so this is the only way one comes to exist. ──
  const id = randomUUID();
  const { data: sub } = await db.from('subscriptions').select('tier, status').eq('user_id', user.id).maybeSingle();
  await reserveUsage(supabase, user.id, 'projection', id, sub);
  try {
    const { error } = await supabase.from('tax_returns').insert({
      id, user_id: user.id, client_id: clientId || null, file_name: label, tax_year: taxYear, status: 'parsed', parsed_data: figures, notes: '',
    });
    if (error) throw new Error(`Could not save projection: ${error.message}`);
  } catch (err) {
    await refundUsage(supabase, user.id, 'projection', id);
    throw err;
  }
  await audit(supabase, user.id, 'return_saved', `Projection saved (${source}).`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, id }) };
});

exports._test = { validateFigures, PDF_KEYS, MANUAL_KEYS };
