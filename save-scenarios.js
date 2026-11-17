// netlify/functions/save-scenarios.js — saves a scenario comparison to a client record.
// Replaces a direct browser insert into tax_returns, which either failed silently (row-level security) or, where allowed, skipped every
// server check. Same rules as save-return: numbers only, a short allow-listed set of text fields, SSN/EIN and contact-data checks on the one
// free-text field (the scenario label). Results are NOT stored: they are recomputed from the inputs, so a stored copy can never disagree.
const { makeHandler, audit } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { bad, requireUuid } = require('./_validate');
const { assertNoIdentifier, assertClientLabel } = require('./_pii');

exports.config = { timeout: 26 };
const FORMS   = ['1040', '1041', '1065', '1120', '1120S'];
const STATUS  = ['Married filing jointly', 'Single', 'Married filing separately', 'Head of household', 'Qualifying surviving spouse'];
const MAX_SCENARIOS = 6, MAX_KEYS = 150, MAX_ABS = 1e11;

function cleanScenario(sc, i) {
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) throw bad(`Scenario ${i + 1} is invalid`);
  const keys = Object.keys(sc);
  if (keys.length > MAX_KEYS) throw bad(`Scenario ${i + 1} has too many fields`);
  const out = {};
  for (const k of keys) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) throw bad(`Scenario ${i + 1}: invalid field name`);
    const v = sc[k];
    if (k === 'scenarioLabel') {
      const label = typeof v === 'string' ? v.trim().slice(0, 60) : '';
      assertNoIdentifier(label, 'A scenario label'); assertClientLabel(label);
      out[k] = label || `Scenario ${i + 1}`;
    } else if (k === 'filingStatus') {
      if (!STATUS.includes(v)) throw bad(`Scenario ${i + 1}: invalid filing status`);
      out[k] = v;
    } else if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > MAX_ABS) throw bad(`Scenario ${i + 1}: ${k} is out of range`);
      out[k] = v;
    } else if (typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else if (typeof v === 'string' && /^[A-Za-z][A-Za-z ()/-]{0,40}$/.test(v)) {
      out[k] = v;                                   // enum-like choices (entity type, method): letters only — no digits, so no identifiers
    } else {
      throw bad(`Scenario ${i + 1}: ${k} must be a number`);
    }
  }
  return out;
}

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  await rateLimit(supabase, `save-scenarios:${user.id}`, 60, 3600, 'You have saved a lot of scenarios this hour. Please wait a few minutes.');
  const { formType, year, clientId } = body;
  if (!FORMS.includes(formType)) throw bad('Invalid form type');
  const taxYear = Number(year);
  if (!Number.isInteger(taxYear) || taxYear < 2018 || taxYear > 2040) throw bad('Invalid tax year');
  if (!Array.isArray(body.scenarios) || !body.scenarios.length || body.scenarios.length > MAX_SCENARIOS) throw bad('Provide 1–6 scenarios');
  const scenarios = body.scenarios.map(cleanScenario);

  let client = null;
  if (clientId) {
    requireUuid(clientId, 'clientId');
    const { data } = await db.from('clients').select('id').eq('id', clientId).maybeSingle();   // caller-scoped: only the caller's clients
    if (!data) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
    client = data.id;
  }

  const label = `Scenarios — ${scenarios.map(s => s.scenarioLabel).join(' vs ')} — ${formType} ${taxYear}`.slice(0, 200);
  const { data: row, error } = await supabase.from('tax_returns').insert({
    user_id: user.id, client_id: client, file_name: label, tax_year: taxYear, status: 'scenario_set',
    parsed_data: { formType, year: taxYear, scenarios }, notes: '',
  }).select('id').single();
  if (error) throw new Error(`Could not save scenarios: ${error.message}`);
  await audit(supabase, user.id, 'scenarios_saved', `Scenario set ${row.id} (${scenarios.length} scenarios, ${formType} ${taxYear}).`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, id: row.id }) };
});
