// Engine validation harness. `node tests/engine/run.mjs` prints engine figures for every case.
// When expected.json holds software figures ({ "B01": { "totalFederalTax": 4019, ... } }), it compares them and exits 1 on any variance above the tolerance (CI gate).
import { readFileSync, existsSync } from 'node:fs';
import { calcFullFederalTax } from '../../src/utils/taxEngine.js';
const dir = new URL('.', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', dir)));
const expPath = new URL('expected.json', dir);
const expected = existsSync(expPath) ? JSON.parse(readFileSync(expPath)) : {};
const TOL = Number(process.env.ENGINE_TOLERANCE ?? 5);
export const FIELDS = ['agi','actualDeduction','seniorDeduction','tipsDeduction','overtimeDeduction','autoLoanDeduction','qbiDeduction','taxableIncome',
  'ordinaryTax','ltcgTax','amtLiability','seTax','niit','additionalMedicare','ctc','nonrefundableCreditsApplied','additionalChildTaxCredit','totalFederalTax'];
const out = []; let failures = 0;
for (const c of cases) {
  const r = calcFullFederalTax(c.inputs, c.year);
  const row = { id: c.id, year: c.year, title: c.title };
  for (const f of FIELDS) row[f] = Math.round(r[f] || 0);
  row.scope = (r.scope?.reasons || []).map(x => `${x.level}:${x.code}`).join(' ');
  for (const [f, v] of Object.entries(expected[c.id] || {})) if (Math.abs(row[f] - v) > TOL) { failures++; console.error(`${c.id} ${f}: engine ${row[f]} vs expected ${v}`); }
  out.push(row);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else console.table(out.map(({ id, agi, taxableIncome, totalFederalTax, scope }) => ({ id, agi, taxableIncome, totalFederalTax, scope })));
if (failures) { console.error(`${failures} variance(s) above $${TOL}`); process.exit(1); }
