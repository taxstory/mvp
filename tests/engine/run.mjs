// Engine validation harness (TS-002). Every case in cases.json must be either VERIFIED against an independently established result in
// expected.json (compared on every run) or explicitly PENDING with a reason. It FAILS when expected.json is missing, when a case is in
// neither list, or when any verified figure differs by more than the tolerance — a run can no longer "pass" without comparing anything.
import { readFileSync, existsSync } from 'node:fs';
import { calcFullFederalTax, SUPPORTED_TAX_YEARS } from '../../src/utils/taxEngine.js';
const dir = new URL('.', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', dir)));
const expPath = new URL('expected.json', dir);
if (!existsSync(expPath)) { console.error('FAIL: tests/engine/expected.json is missing — the engine cannot be checked against anything.'); process.exit(1); }
const EXP = JSON.parse(readFileSync(expPath));
const expected = EXP.verified || {};
const pending  = EXP.pending  || {};
const TOL = Number(process.env.ENGINE_TOLERANCE ?? 1);   // whole-dollar rounding only
export const FIELDS = ['agi','actualDeduction','seniorDeduction','tipsDeduction','overtimeDeduction','autoLoanDeduction','qbiDeduction','taxableIncome',
  'ordinaryTax','ltcgTax','amtLiability','seTax','niit','additionalMedicare','ctc','nonrefundableCreditsApplied','additionalChildTaxCredit','totalFederalTax'];
const out = []; let failures = 0;
// The server's manual-entry year list must match the engine's official tables.
{
  const src = readFileSync(new URL('../../netlify/functions/save-return.js', import.meta.url), 'utf8');
  const m = src.match(/const MANUAL_YEARS = \[([^\]]*)\]/);
  const server = m ? m[1].split(',').map(x => Number(x.trim())) : [];
  if (JSON.stringify(server) !== JSON.stringify(SUPPORTED_TAX_YEARS)) { failures++; console.error(`save-return MANUAL_YEARS ${JSON.stringify(server)} != engine SUPPORTED_TAX_YEARS ${JSON.stringify(SUPPORTED_TAX_YEARS)}`); }
}
for (const c of cases) {
  if (!expected[c.id] && !pending[c.id]) { failures++; console.error(`${c.id}: not verified and not listed as pending in expected.json`); }
  if (expected[c.id] && pending[c.id]) { failures++; console.error(`${c.id}: listed as both verified and pending`); }
  const r = calcFullFederalTax(c.inputs, c.year);
  const row = { id: c.id, year: c.year, title: c.title };
  for (const f of FIELDS) row[f] = Math.round(r[f] || 0);
  row.scope = (r.scope?.reasons || []).map(x => `${x.level}:${x.code}`).join(' ');
  for (const [f, v] of Object.entries(expected[c.id] || {})) if (!(f in row) || Math.abs(row[f] - v) > TOL) { failures++; console.error(`${c.id} ${f}: engine ${row[f]} vs expected ${v}`); }
  out.push(row);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else console.table(out.map(({ id, agi, taxableIncome, totalFederalTax, scope }) => ({ id, agi, taxableIncome, totalFederalTax, scope })));
for (const id of Object.keys(expected)) if (!cases.some(c => c.id === id)) { failures++; console.error(`${id}: in expected.json but not in cases.json`); }
const nVer = cases.filter(c => expected[c.id]).length;
console.log(`Engine: ${nVer} of ${cases.length} cases verified against independent results; ${cases.length - nVer} pending tax-software comparison.`);
if (failures) { console.error(`FAIL: ${failures} problem(s)`); process.exit(1); }
