// src/utils/form1040Parser.js
//
// Deterministic Form 1040 reader. PURE: text rows in, validated figures out. No network, no AI, no dependencies.
//
// WHY THIS EXISTS (PII architecture): the return PDF is read in the advisor's BROWSER and never uploaded. This parser looks ONLY
// for the form's fixed, printed IRS captions ("This is your total income", "Qualified dividends", …) and the dollar amounts that
// follow them. Names, SSNs, addresses, dates of birth, dependents and bank details have no caption in this table, so they are
// never matched, never returned, and never leave the browser. The result contains numbers, the tax year, and a filing-status
// enum — nothing else. (No raw text is retained or returned; there is deliberately no "debug" output.)
//
// ACCURACY: this is a text matcher, not OCR. It needs a digitally generated PDF (selectable text). It is tested against
// synthetic returns in several layouts (tests/parser). It has NOT yet been validated against real Drake / ProConnect / Lacerte /
// CCH output — calibrate with redacted samples before relying on it. Every result carries reconciliation checks and per-field
// confidence, and the UI requires the advisor to review the figures before they are saved.

/**
 * Amounts: 1,234  $1,234.56  (1,234)  -1,234  -0-.  Deliberately NOT matched: line labels glued to a letter ("4a", "25d"),
 * form/schedule/line references in the caption ("Form 8995", "8995-A", "lines 25a through 25c"). A pure-digit echo of the line
 * number itself ("… total income 9 85,000") is filtered in lastAmount().
 */
const AMOUNT_RE = /(?<![A-Za-z0-9])(?<!\b(?:forms?|schedules?|lines?|box(?:es)?|and|or|through|worksheet)\s)\(?-?\$?\s?\d[\d,]*(?:\.\d{1,2})?\)?(?![A-Za-z0-9]|-[A-Za-z])|-0-/gi;
const LEADER = '‖';     // boundary between a caption and its amount column (printed dot leaders / a wide gap between text items)

export function parseAmount(token) {
  if (token == null) return null;
  const t = String(token).trim();
  if (t === '-0-') return 0;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /^\(\s*-/.test(t);
  const digits = t.replace(/[()$\s,-]/g, '');
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const n = Math.round(parseFloat(digits));
  return neg ? -n : n;
}

/** Normalise a row: collapse dot leaders / underscores / box glyphs so captions and amounts are separated by single spaces. */
function clean(row) {
  return String(row || '')
    // SIGN NOTATIONS other than a leading ASCII hyphen or parentheses, normalised BEFORE amounts are read (otherwise the sign is silently lost and a loss reads as a gain):
    .replace(/(?<=^|[\s(])[\u2212\u2012\u2013\u2014]\s?(?=\$?\d)/g, '-')                                   // −4,000 – 4,000 (Unicode minus / dashes before an amount)
    .replace(/<\s?(\$?\d[\d,]*(?:\.\d{1,2})?)\s?>/g, '-$1')                                              // <4,000>
    .replace(/(?<![A-Za-z0-9-])(\$?\d[\d,]*(?:\.\d{1,2})?)-(?![A-Za-z0-9-])/g, '-$1')                     // 4,000-  (never "8995-A", "1-A", "-0-" or "2024-2025")
    .replace(/[·•․‧∙⋅]+/g, ` ${LEADER} `).replace(/(?:\.\s?){2,}/g, ` ${LEADER} `)
    .replace(/_{2,}/g, ` ${LEADER} `).replace(/[|\u2502\u2503]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Last amount after `from`, ignoring a trailing echo of the line number itself (e.g. "… total income 9 85,000"). */
function lastAmount(text, labelDigits) {
  // Amounts live after the last leader. A caption such as "Form 8995 or Form 8995-A" sits BEFORE it and must not be read as a figure.
  const tail = text.includes(LEADER) ? text.slice(text.lastIndexOf(LEADER) + 1) : text;
  const nums = [...tail.matchAll(AMOUNT_RE)].map(m => m[0].trim()).filter(t => /\d/.test(t) || t === '-0-');
  if (!nums.length) return { found: false };
  const isEcho = t => /^\d{1,2}$/.test(t) && labelDigits.includes(t);
  // A bare 4-digit year ("… applied from 2023 return") is caption text, never an amount. (A real amount of $1,900–$2,039 is
  // printed with its comma, so it is not affected; an unformatted one would show up as a reconciliation warning instead.)
  const isYear = t => /^(19|20)[0-3]\d$/.test(t);
  const real = nums.filter(t => !isEcho(t) && !isYear(t));
  if (!real.length) return { found: true, blank: true };       // only the line-number echo → the line is blank
  const v = parseAmount(real[real.length - 1]);
  return v === null ? { found: false } : { found: true, value: v };
}

// ── field table ───────────────────────────────────────────────────────────────────────────────────────────────
// single: caption → one amount.  pair: a row with two columns ("a" then "b"); `second` marks where the b-column starts.
// `digits` are the line numbers whose echo may appear next to the amount.
const SINGLE = [
  { key: 'wages',                caption: /add lines 1a through 1h/i,                                digits: ['1'] },
  { key: 'wages',                caption: /total amount from form\(?s\)? w-?2/i,                      digits: ['1'], fallback: true },
  { key: 'capitalGainLoss',      caption: /capital gain or \(?loss\)?\.? attach schedule d/i,                              digits: ['7'] },
  { key: 'otherIncome',          caption: /additional income from schedule 1/i,                       digits: ['8'] },
  { key: 'totalIncome',          caption: /this is your total income/i,                               digits: ['9'] },
  { key: 'adjustmentsToIncome',  caption: /adjustments to income from schedule 1/i,                   digits: ['10'] },
  { key: 'agi',                  caption: /this is your adjusted gross income/i,                      digits: ['11'] },
  // Page-2 repeat of AGI (line 11b on the 2025 form). Used only if line 11a is blank or absent: `take()` keeps the first value found.
  { key: 'agi',                  caption: /amount from line 11a? \(?adjusted gross income\)?/i,       digits: ['11'], fallback: true },
  { key: 'standardDeduction',    caption: /standard deduction or itemized deductions/i,               digits: ['12'] },
  { key: 'qbiDeduction',         caption: /qualified business income deduction/i,                     digits: ['13'] },
  // 2025 form: new line 13b, additional deductions from Schedule 1-A (OBBBA: tips, overtime, seniors, car-loan interest).
  { key: 'additionalDeductions', caption: /additional deductions from schedule 1-a/i,                 digits: ['13'] },
  { key: 'taxableIncome',        caption: /this is your taxable income/i,                             digits: ['15'] },
  { key: 'regularTax',           caption: /\btax \(see instructions\)/i,                              digits: ['16'] },
  { key: 'totalTax',             caption: /this is your total tax/i,                                  digits: ['24'] },
  { key: 'federalWithheld',      caption: /add lines 25a through 25c/i,                               digits: ['25'] },
  { key: 'estimatedTaxPayments', caption: /estimated tax payments and amount applied/i,               digits: ['26'] },
  { key: 'totalPayments',        caption: /these are your total payments/i,                           digits: ['33'] },
  { key: 'refund',               caption: /amount of line 34 you want refunded to you/i,              digits: ['35'] },
  { key: 'amountOwed',           caption: /this is the amount you owe/i,                              digits: ['37'] },
];
const PAIRS = [
  { first: /tax-?exempt interest/i,   second: /taxable interest/i,                  a: null,                    b: 'taxableInterest',        digits: ['2'] },
  { first: /qualified dividends/i,    second: /ordinary dividends/i,                a: 'qualifiedDividends',    b: 'ordinaryDividends',      digits: ['3'] },
  { first: /ira distributions/i,      second: /taxable amount/i,                    a: 'iraDistributions',      b: 'taxableIRA',             digits: ['4'] },
  { first: /pensions and annuities/i, second: /taxable amount/i,                    a: 'pensionsAnnuities',     b: 'taxablePensions',        digits: ['5'] },
  { first: /social security benefits/i, second: /taxable amount/i,                  a: 'socialSecurityBenefits', b: 'taxableSocialSecurity', digits: ['6'] },
];
const STATUSES = [
  ['Single', /\bsingle\b/i], ['Married filing jointly', /married filing jointly/i], ['Married filing separately', /married filing separately/i],
  ['Head of household', /head of household/i], ['Qualifying surviving spouse', /qualifying surviving spouse/i],
];
const MARK = /(?:[\[(]\s*[xX✓✔☒☑■▣]\s*[\])]|[☒☑✓✔■▣]|(?:^|\s)[xX](?=\s))\s*$/;   // a "checked" mark immediately before a label

// Captions are written with plain spaces; a PDF may separate their words with wide gaps (rendered as the leader marker), so
// match on flexible whitespace instead.
const flex = (re) => new RegExp(re.source.replace(/ /g, '\\s+'), re.flags);
for (const sp of SINGLE) sp.caption = flex(sp.caption);
for (const p of PAIRS) { p.first = flex(p.first); p.second = flex(p.second); }

/** Every caption the reader looks for, by the field(s) it feeds. Used by the calibration tool; contains no taxpayer data. */
export function describeCaptions() {
  return [
    ...SINGLE.map(c => ({ keys: [c.key], caption: c.caption })),
    ...PAIRS.map(c => ({ keys: [c.a, c.b].filter(Boolean), caption: c.first })),
  ];
}

export const KEY_FIELDS = ['totalIncome', 'agi', 'taxableIncome', 'totalTax'];
const KEY_LABELS = {
  wages: 'Wages (1z)', taxableInterest: 'Taxable interest (2b)', qualifiedDividends: 'Qualified dividends (3a)', ordinaryDividends: 'Ordinary dividends (3b)',
  iraDistributions: 'IRA distributions (4a)', taxableIRA: 'Taxable IRA (4b)', pensionsAnnuities: 'Pensions & annuities (5a)', taxablePensions: 'Taxable pensions (5b)',
  socialSecurityBenefits: 'Social security (6a)', taxableSocialSecurity: 'Taxable social security (6b)', capitalGainLoss: 'Capital gain/loss (7)',
  otherIncome: 'Additional income (8)', totalIncome: 'Total income (9)', adjustmentsToIncome: 'Adjustments (10)', agi: 'Adjusted gross income (11)',
  standardDeduction: 'Standard or itemized deduction (12)', qbiDeduction: 'QBI deduction (13)', taxableIncome: 'Taxable income (15)', regularTax: 'Tax (16)', additionalDeductions: 'Schedule 1-A deductions (13b)',
  totalTax: 'Total tax (24)', federalWithheld: 'Federal tax withheld (25d)', estimatedTaxPayments: 'Estimated payments (26)', totalPayments: 'Total payments (33)',
  refund: 'Refund (35a)', amountOwed: 'Amount owed (37)',
};
export const FIELD_LABELS = KEY_LABELS;

function findTaxYear(rows) {
  for (const r of rows.slice(0, 40)) {                         // any plausible year on a "Form 1040" row (header layouts vary a lot)
    if (!/form\s*1040/i.test(r)) continue;
    const m = r.match(/(?<![0-9])(20[12][0-9])(?![0-9])/);
    if (m) return +m[1];
  }
  for (const r of rows.slice(0, 40)) {
    const m = r.match(/jan\.?\s*1\s*[–—-]\s*dec\.?\s*31,?\s*(20\d\d)/i) || r.match(/for the year\D{0,40}(20\d\d)/i);
    if (m) return +m[1];
  }
  return null;
}

function findFilingStatus(rows) {
  const hits = new Set();
  for (const raw of rows.slice(0, 60)) {
    const r = clean(raw);
    for (const [name, re] of STATUSES) {
      const m = re.exec(r); if (!m) continue;
      if (MARK.test(r.slice(0, m.index))) hits.add(name);
    }
  }
  return hits.size === 1 ? [...hits][0] : null;      // none or ambiguous → the advisor chooses; never guess
}

/**
 * Pure arithmetic reconciliation of what the return says about ITSELF (tolerance ±$2 for rounding). Exported so every relationship can be tested
 * exhaustively (tests/parser/reconciliation_matrix.test.mjs). A figure that takes part in no relationship below cannot be cross-checked — the matrix test
 * lists them, and the advisor's review is the only control for those.
 */
export function reconcile(figures) {
  const f = figures, TOL = 2, checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
  const comp = ['wages', 'taxableInterest', 'ordinaryDividends', 'taxableIRA', 'taxablePensions', 'taxableSocialSecurity', 'capitalGainLoss', 'otherIncome'];
  if (f.totalIncome !== undefined && comp.some(k => f[k] !== undefined)) {
    const sum = comp.reduce((s, k) => s + (f[k] || 0), 0);
    Math.abs(sum - f.totalIncome) <= TOL
      ? add('income', 'Income lines add up to total income', 'pass', `Sum of lines 1–8 = ${sum.toLocaleString('en-US')}`)
      : add('income', 'Income lines add up to total income', 'warn', `Lines 1–8 sum to ${sum.toLocaleString('en-US')} but total income reads ${f.totalIncome.toLocaleString('en-US')} — a line may be missing or misread.`);
  } else add('income', 'Income lines add up to total income', 'skip', 'Not enough income lines were found to check.');
  if (f.totalIncome !== undefined && f.agi !== undefined) {
    const exp = f.totalIncome - (f.adjustmentsToIncome || 0);
    Math.abs(exp - f.agi) <= TOL ? add('agi', 'AGI = total income − adjustments', 'pass', `${exp.toLocaleString('en-US')}`)
      : add('agi', 'AGI = total income − adjustments', 'warn', `Expected ${exp.toLocaleString('en-US')}, read ${f.agi.toLocaleString('en-US')}.`);
  } else add('agi', 'AGI = total income − adjustments', 'skip', 'Total income or AGI not found.');
  if (f.agi !== undefined && f.taxableIncome !== undefined && f.standardDeduction !== undefined) {
    const exp = Math.max(0, f.agi - f.standardDeduction - (f.qbiDeduction || 0) - (f.additionalDeductions || 0));
    Math.abs(exp - f.taxableIncome) <= TOL ? add('taxable', 'Taxable income = AGI − deductions', 'pass', `${exp.toLocaleString('en-US')}`)
      : add('taxable', 'Taxable income = AGI − deductions', 'warn', `Expected ${exp.toLocaleString('en-US')}, read ${f.taxableIncome.toLocaleString('en-US')} (a deduction line may be missing or misread).`);
  } else add('taxable', 'Taxable income = AGI − deductions', 'skip', 'AGI, deduction or taxable income not found.');
  if (f.totalPayments !== undefined && f.totalTax !== undefined && (f.refund !== undefined || f.amountOwed !== undefined)) {
    const net = f.totalPayments - f.totalTax, got = f.refund !== undefined ? f.refund : -f.amountOwed;
    Math.abs(net - got) <= TOL ? add('settle', 'Payments − tax = refund / amount owed', 'pass', `${net.toLocaleString('en-US')}`)
      : add('settle', 'Payments − tax = refund / amount owed', 'warn', `Payments − tax is ${net.toLocaleString('en-US')} but the return shows ${got.toLocaleString('en-US')}.`);
  } else add('settle', 'Payments − tax = refund / amount owed', 'skip', 'Payments, tax or refund/owed not found.');
  if (f.refund !== undefined && f.amountOwed !== undefined) add('both', 'Refund and amount owed are not both present', 'warn', 'Both lines 35a and 37 were read — one is probably wrong.');
  if (f.qualifiedDividends !== undefined && f.ordinaryDividends !== undefined) {
    f.qualifiedDividends <= f.ordinaryDividends + TOL ? add('qualified', 'Qualified dividends do not exceed ordinary dividends', 'pass', `${f.qualifiedDividends.toLocaleString('en-US')} of ${f.ordinaryDividends.toLocaleString('en-US')}`)
      : add('qualified', 'Qualified dividends do not exceed ordinary dividends', 'warn', `Line 3a (${f.qualifiedDividends.toLocaleString('en-US')}) is larger than line 3b (${f.ordinaryDividends.toLocaleString('en-US')}) — the two are probably swapped or misread.`);
  }
  if (f.totalPayments !== undefined && (f.federalWithheld !== undefined || f.estimatedTaxPayments !== undefined)) {
    const part = (f.federalWithheld || 0) + (f.estimatedTaxPayments || 0);   // withholding + estimates are PARTS of total payments (credits make up the rest, never negative)
    part <= f.totalPayments + TOL ? add('payments', 'Withholding + estimated payments do not exceed total payments', 'pass', `${part.toLocaleString('en-US')} of ${f.totalPayments.toLocaleString('en-US')}`)
      : add('payments', 'Withholding + estimated payments do not exceed total payments', 'warn', `Withholding and estimates add to ${part.toLocaleString('en-US')} but total payments read ${f.totalPayments.toLocaleString('en-US')}.`);
  }
  return checks;
}

/**
 * @param {string[]} rows  one string per visual row of the PDF, left-to-right (from pdfExtract.extractRows)
 * @returns {{ figures: object, filingStatus: string|null, taxYear: number|null, confidence: Record<string,'high'|'medium'>,
 *             checks: {id:string,label:string,status:'pass'|'warn'|'skip',detail:string}[], quality: 'good'|'review'|'insufficient',
 *             matched: string[], missing: string[] }}
 */
export function parseForm1040(rows) {
  const R = (rows || []).map(clean).filter(Boolean);
  const figures = {}, confidence = {};

  const take = (key, amt, conf) => {
    if (!amt.found || amt.blank || amt.value === 0 || amt.value === undefined) return;
    if (key in figures) return;                                           // first (page-1) occurrence wins
    figures[key] = amt.value; confidence[key] = conf;
  };

  for (const row of R) {
    // Captions are located on a copy where leaders are plain spaces (same length, so indices line up with `row`).
    const plain = row.split(` ${LEADER} `).join('   ');
    for (const p of PAIRS) {
      const f = p.first.exec(plain); if (!f) continue;
      const afterFirst = f.index + f[0].length;
      const s = p.second.exec(plain.slice(afterFirst));
      const cut = s ? afterFirst + s.index : -1;
      // left column: drop the trailing sub-label marker ("b") and the gap before it, so the "a" amount is what is left
      const left = cut > 0 ? row.slice(afterFirst, cut).replace(new RegExp(`[\\s${LEADER}]*\\b[a-z]\\b[\\s${LEADER}]*$`, 'i'), '') : row.slice(afterFirst);
      if (p.a) take(p.a, lastAmount(left, p.digits), 'medium');
      if (cut > 0) take(p.b, lastAmount(row.slice(cut + s[0].length), p.digits), 'high');
    }
    for (const sp of SINGLE) {
      const m = sp.caption.exec(plain); if (!m) continue;
      if (sp.fallback && sp.key in figures) continue;
      take(sp.key, lastAmount(row.slice(m.index + m[0].length), sp.digits), sp.fallback ? 'medium' : 'high');
    }
  }

  // Derived (not read from the PDF): effective rate, same definition the previous AI step used.
  if (figures.totalTax && figures.agi > 0) { figures.effectiveRate = +(figures.totalTax / figures.agi * 100).toFixed(1); confidence.effectiveRate = 'medium'; }

  const taxYear = findTaxYear(R);
  const filingStatus = findFilingStatus(R);
  if (taxYear) figures.taxYear = taxYear;
  if (filingStatus) figures.filingStatus = filingStatus;

  // ── reconciliation: the form's own arithmetic ────────────────────────────────────────────────────────────
  const checks = reconcile(figures);
  // "CR"/"DR" markers: whether CR means a positive or a negative amount depends on the software, so the sign is NOT guessed — the advisor is told to verify every figure.
  if ((Array.isArray(rows) ? rows : []).some(r => /\d[\d,]*(?:\.\d{1,2})?\s?(?:CR|DR)\b/.test(String(r)))) checks.push({ id: 'sign', label: 'Amounts carry CR/DR markers', status: 'warn', detail: 'This return marks some amounts "CR" or "DR". Their signs cannot be interpreted automatically, so verify every figure against the return.' });

  const matched = Object.keys(figures).filter(k => k in KEY_LABELS);
  const missing = KEY_FIELDS.filter(k => figures[k] === undefined);
  const warns = checks.filter(c => c.status === 'warn').length;
  const quality = matched.length < 3 || missing.length >= 3 ? 'insufficient' : (missing.length === 0 && warns === 0 && checks.some(c => c.status === 'pass') ? 'good' : 'review');
  return { figures, filingStatus, taxYear, confidence, checks, quality, matched, missing };
}
