import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForm1040 } from '../../src/utils/form1040Parser.js';
// Synthetic rows in the Drake 2025 layout (figures from Drake Practice Return 1). Replace with rows from real PDFs as samples arrive.
// Rows as pdf.js yields them for a Drake 2025 client copy (Practice Return 1 figures + a Schedule 1/2/D for a business client)
const rows = [
 '1040 U.S. Individual Income Tax Return 2025', 'Form 1040 2025',
 'X Head of household (HOH)',
 '1z Add lines 1a through 1h . . . . . . . . . 1z 115,500',
 '9 Add lines 1z, 2b, 3b, 4b, 5b, 6b, 7a, and 8. This is your total income . . . . . 9 115,500',
 '11a Subtract line 10 from line 9. This is your adjusted gross income . . . . 11a 115,500',
 '12e Standard deduction or itemized deductions (from Schedule A) . . . . 12e 23,625',
 '15 Subtract line 14 from line 11b. If zero or less, enter -0-. This is your taxable income . . . 15 91,875',
 '16 Tax (see instructions). Check if any from Form(s): 8814 4972 . . . 16 13,388',
 '19 Child tax credit or credit for other dependents from Schedule 8812 . . . . 19 2,200',
 '24 Add lines 22 and 23. This is your total tax . . . . . . 24 10,588',
 '25d Add lines 25a through 25c . . . . . . 25d 17,500',
 '33 Add lines 25d, 26, and 32. These are your total payments . . . . 33 17,500',
 '35a Amount of line 34 you want refunded to you. If Form 8888 is attached, check here . . 35a 6,912',
 'SCHEDULE 1 (Form 1040) 2025',
 '3 Business income or (loss). Attach Schedule C . . . . . . . . 3 42,000',
 '5 Rental real estate, royalties, partnerships, S corporations, trusts, etc. Attach Schedule E . . . 5 (6,500)',
 'SCHEDULE 2 (Form 1040) 2025',
 '4 Self-employment tax. Attach Schedule SE . . . . . . . . . 4 5,934',
 'SCHEDULE D (Form 1040) 2025',
 '7 Net short-term capital gain or (loss). Combine lines 1a through 6 in column (h) . . . 7 (1,200)',
 '15 Net long-term capital gain or (loss). Combine lines 8a through 14 in column (h) . . . 15 9,800',
];
test('Drake 2025 layout: Form 1040 + Schedules 1, 2, D', () => {
  const r = parseForm1040(rows); const f = r.figures;
  const want = { wages:115500, totalIncome:115500, agi:115500, standardDeduction:23625, taxableIncome:91875, regularTax:13388, childTaxCredit:2200,
    totalTax:10588, federalWithheld:17500, totalPayments:17500, refund:6912, scheduleC_netProfit:42000, scheduleE_netIncome:-6500, selfEmploymentTax:5934, netSTCG:-1200, netLTCG:9800 };
  for (const [k, v] of Object.entries(want)) assert.equal(f[k], v, k);
  assert.equal(f.filingStatus, 'Head of household'); assert.equal(f.taxYear, 2025);
});

