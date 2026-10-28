// netlify/functions/_scriptFacts.js — the fact layer between a return's figures and anything an AI writes about them.
//
// PRINCIPLE: the model explains; it never supplies a number. Narration is written with PLACEHOLDERS ({{total_tax}}); this module
// substitutes the verified values. A script is rejected — never silently accepted — if it contains a literal digit, an unavailable
// placeholder, wording that contradicts the outcome (refund vs. amount owed), a placeholder next to a label that names a different figure,
// or advice / prediction / guarantee language. Zero is a real value (nullish checks, never truthiness).

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const first = (...vals) => vals.find(isNum);                    // first FINITE number — zero counts

const MONEY = 'money', PCT = 'percent', YEAR = 'year', TEXT = 'text';
const GLOSSARY = {
  tax_year: 'the tax year of this return', filing_status: 'filing status',
  wages: 'wages, salaries and tips (Form 1040 line 1z)', interest: 'taxable interest (line 2b)', dividends: 'ordinary dividends (line 3b)',
  ira_distributions: 'taxable IRA distributions (line 4b)', pensions: 'taxable pensions and annuities (line 5b)', social_security: 'taxable Social Security benefits (line 6b)',
  capital_gains: 'capital gain or loss (line 7)', business_income: 'business or self-employment profit', other_income: 'additional income from Schedule 1 (line 8)',
  total_income: 'total income for the year (line 9) — everything before deductions', agi: 'adjusted gross income (line 11)',
  standard_deduction: 'the standard or itemized deduction taken (line 12)', qbi_deduction: 'qualified business income deduction (line 13)',
  additional_deductions: 'additional deductions from Schedule 1-A (line 13b)', taxable_income: 'taxable income (line 15) — the amount the tax is calculated on',
  total_tax: 'total federal tax for the year (line 24): income tax plus any other taxes included in the total, such as self-employment tax — NOT the refund and NOT what was withheld', withholding: 'federal income tax already paid through paycheck withholding (line 25d)',
  estimated_payments: 'estimated tax payments already made (line 26)', effective_rate: 'total federal tax (line 24) as a percentage of adjusted gross income — always CALCULATED from those two figures, never taken from a stored value',
  refund: 'the refund the client will receive', amount_owed: 'the balance the client owes with the return',
};

/** Build the facts from parsed_data in either shape (PDF reader camelCase, manual-entry snake_case). Only present values are returned. */
function buildFacts(pd, taxYear) {
  pd = pd || {};
  const f = Object.create(null);                       // no prototype: a placeholder named constructor / __proto__ is just an unavailable figure
  const put = (key, value, kind) => { if (value !== undefined && value !== null && !(typeof value === 'number' && !Number.isFinite(value))) f[key] = { value, kind }; };
  put('tax_year', first(taxYear, pd.tax_year, pd.taxYear), YEAR);
  const status = pd.filing_status ?? pd.filingStatus; put('filing_status', typeof status === 'string' ? status : undefined, TEXT);
  put('wages', first(pd.wages), MONEY);
  put('interest', first(pd.taxableInterest), MONEY);
  put('dividends', first(pd.ordinaryDividends), MONEY);
  put('ira_distributions', first(pd.taxableIRA), MONEY);
  put('pensions', first(pd.taxablePensions), MONEY);
  put('social_security', first(pd.taxableSocialSecurity), MONEY);
  put('capital_gains', first(pd.capital_gains, pd.capitalGainLoss), MONEY);
  put('business_income', first(pd.business_income, pd.scheduleC_netProfit), MONEY);
  put('other_income', first(pd.other_income, pd.otherIncome), MONEY);
  put('total_income', first(pd.total_income, pd.totalIncome), MONEY);
  put('agi', first(pd.agi), MONEY);
  put('standard_deduction', first(pd.standard_deduction, pd.standardDeduction), MONEY);
  put('qbi_deduction', first(pd.qbi_deduction, pd.qbiDeduction), MONEY);
  put('additional_deductions', first(pd.additionalDeductions), MONEY);
  put('taxable_income', first(pd.taxable_income, pd.taxableIncome), MONEY);
  put('total_tax', first(pd.federal_tax, pd.totalTax), MONEY);
  put('withholding', first(pd.withholding, pd.federalWithheld), MONEY);
  put('estimated_payments', first(pd.estimatedTaxPayments), MONEY);
  const agi = f.agi?.value, tax = f.total_tax?.value, warnings = [];
  // The effective rate is DERIVED from the verified AGI and total tax — a stored value is never trusted (an auditor showed a stored 90% overriding the correct 12%).
  // A stored value is only COMPARED: a disagreement becomes a warning, and with no usable AGI/tax the rate is simply left out.
  const storedRate = first(pd.effective_rate, pd.effectiveRate);
  if (isNum(agi) && agi > 0 && isNum(tax)) {
    const computed = +(tax / agi * 100).toFixed(1); put('effective_rate', computed, PCT);
    if (isNum(storedRate) && Math.abs(storedRate - computed) > 0.1) warnings.push({ field: 'effective_rate', message: `A stored effective rate (${storedRate}%) differs from the rate calculated from AGI and total tax (${computed}%). The calculated rate was used.` });
  } else if (isNum(storedRate)) warnings.push({ field: 'effective_rate', message: `A stored effective rate (${storedRate}%) could not be verified because AGI or total tax is missing (or AGI is not positive). It was not used.` });

  // The outcome: exactly one of refund / owed / even / unknown. Derived once, here — the model is told, never asked.
  const net = first(pd.refund_or_owed, isNum(pd.refund) && pd.refund > 0 ? pd.refund : undefined, isNum(pd.amountOwed) && pd.amountOwed > 0 ? -pd.amountOwed : undefined,
                    isNum(pd.refund) || isNum(pd.amountOwed) ? 0 : undefined);
  let result = 'unknown';
  if (isNum(net)) { result = net > 0 ? 'refund' : net < 0 ? 'owed' : 'even'; if (net > 0) put('refund', net, MONEY); if (net < 0) put('amount_owed', -net, MONEY); }
  // If the return states total payments, its own refund/owed line must agree with payments − tax (±$2). A disagreement is surfaced, never silently narrated.
  const pay = first(pd.totalPayments);
  if (isNum(pay) && isNum(tax) && isNum(net) && Math.abs((pay - tax) - net) > 2) warnings.push({ field: 'refund_or_owed', message: `Total payments minus total tax is ${fmtMoney(pay - tax)}, but the return states ${fmtMoney(net)}. The return's own figure was used.` });
  return { facts: f, result, warnings };
}

const fmtMoney = v => `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
function format(fact) {
  if (fact.kind === MONEY) return fmtMoney(fact.value);
  if (fact.kind === PCT)   return `${Math.round(fact.value * 10) / 10}%`;
  return String(fact.value);
}
/** The list shown to the model: name — current value — meaning. */
function describeFacts({ facts }) { return Object.entries(facts).map(([k, f]) => `{{${k}}} = ${format(f)}  (${GLOSSARY[k] || k})`).join('\n'); }

// ── validation ────────────────────────────────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;
const ADVICE = /\b(you should|you ought|you must|you need to|we recommend|i recommend|we suggest|i suggest|consider (making|converting|contributing|increasing|moving|selling|buying|opening|funding|maxing)|guarantee[sd]?|promise[sd]?|risk[- ]free|loophole|avoid(ing)? (paying )?(your )?taxes|evade|evasion|tax[- ]free|next year you|you will (save|owe|get|receive|pay|lose)|will (definitely|certainly))\b/i;
const OUTCOME_WORDS = {
  refund: { forbid: /\b(you owe|you'll owe|you will owe|balance due|amount (you )?owe|owing|underpaid|pay the irs|pay (it|the balance))\b/i, why: 'talks about owing money although the return produces a refund' },
  owed:   { forbid: /\brefund(ed|s)?\b/i, why: 'mentions a refund although the return shows a balance owed' },
  even:   { forbid: /\b(refund|you owe|balance due)\b/i, why: 'mentions a refund or balance although the return breaks even' },
  unknown:{ forbid: /\b(refund|you owe|balance due|owing)\b/i, why: 'states an outcome that is not in the return data' },
};
// A placeholder must not sit right after a label that names a DIFFERENT figure (checked in the ~30 characters of its own sentence before it).
const LABEL_GUARD = {
  refund:         /\b(owe|owed|owing|balance due|total tax|withh\w*|taxable|deduction|income)\b/i,
  amount_owed:    /\b(refund\w*|withh\w*|total tax|taxable|deduction|income)\b/i,
  total_tax:      /\b(refund\w*|owe|owed|owing|withh\w*|taxable|deduction|adjusted gross)\b/i,
  withholding:    /\b(refund\w*|owe|owed|owing|total tax|taxable|deduction|adjusted gross)\b/i,
  estimated_payments: /\b(refund\w*|owe|owed|owing|total tax|taxable|withh\w*)\b/i,
  agi:            /\b(taxable|total tax|refund\w*|owe|owed|owing|withh\w*|deduction)\b/i,
  taxable_income: /\b(adjusted gross|agi|total tax|refund\w*|owe|owed|owing|withh\w*)\b/i,
  total_income:   /\b(adjusted gross|agi|taxable|total tax|refund\w*|owe|owed|owing|withh\w*)\b/i,
  effective_rate: /\b(refund\w*|owe|owed|owing|withh\w*|bracket)\b/i,
};
/**
 * Checks ONE piece of narration text. Used on every AI rewrite of a template sentence. Returns a list of generic problems (never echoing the text).
 * Rules: only available figures; no literal digits; no advice/prediction/guarantee; wording consistent with the outcome; no figure next to a label for a
 * different figure; sensible length.
 */
function checkSegmentText(text, { facts, result }) {
  const problems = [];
  if (typeof text !== 'string' || !text.trim()) return ['empty text'];
  const t = text.trim();
  if (t.length < 15 || t.length > 420) problems.push(t.length < 15 ? 'too short' : 'too long');
  for (const name of [...t.matchAll(PLACEHOLDER)].map(m => m[1])) if (!facts[name]) problems.push(`uses unavailable figure {{${name}}}`);
  const bare = t.replace(PLACEHOLDER, '');
  if (/\p{Nd}/u.test(bare)) problems.push('contains a literal number');                       // ANY Unicode digit (full-width, Arabic-Indic …), not only ASCII 0-9
  if (numberWordAmounts(bare).length) problems.push('contains a number written in words');  // "thirty thousand dollars", "fifteen percent"
  if (/\{\{|\}\}/.test(t.replace(PLACEHOLDER, ''))) problems.push('malformed placeholder');
  if (ADVICE.test(t)) problems.push('gives advice, a prediction or a guarantee');
  const rule = OUTCOME_WORDS[result]; if (rule.forbid.test(t)) problems.push(rule.why);
  for (const m of t.matchAll(PLACEHOLDER)) {
    const guard = Object.hasOwn(LABEL_GUARD, m[1]) ? LABEL_GUARD[m[1]] : null; if (!guard) continue;
    if (guard.test(t.slice(0, m.index).split(/[.!?;]/).pop().slice(-30))) problems.push(`places {{${m[1]}}} right after a label that names a different figure`);
  }
  return [...new Set(problems)];
}
const placeholdersOf = text => [...String(text).matchAll(PLACEHOLDER)].map(m => m[1]).sort();
const substitute = (text, facts) => text.replace(PLACEHOLDER, (_, k) => format(facts[k]));

/** Deterministic, neutral planning segment (replaces AI-written "planning tips"): contains no figures and no advice. */
const PLANNING_SEGMENT = { text: "There may be a few planning ideas worth reviewing for next year. Your advisor will walk you through anything that fits your situation.", field_ref: 'planning_tip', section: 'planning' };

// ── amounts in free text (used to check advisor-edited narration, and the final text of every script) ─────────────────────────────────────────────────────────
// An "amount" is anything a listener would hear as a dollar figure or a rate: $-prefixed numbers, comma-grouped numbers, numbers with a k / thousand / million suffix,
// numbers followed by "dollars", percentages ("12%", "12 percent"), AND numbers written in words ("eight thousand nine hundred dollars", "fifteen percent").
// Years, line numbers and small counts ("3 forms", "line 24", "1040") are not amounts. All forms are reduced to ONE canonical string ("$8,900", "12.5%").
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const SUFFIX = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };
const moneyStr = v => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const pctStr = v => `${+(+v).toFixed(2)}%`;

/** Numbers written in words: [{ canonical, value }]. A run counts when it is ≥ 100 (it contains hundred/thousand/million) or is followed by dollars / percent. */
function numberWordAmounts(text) {
  const out = [], words = [...String(text).matchAll(/[A-Za-z]+/g)];
  for (let i = 0; i < words.length;) {
    const w = words[i][0].toLowerCase(); const isNum = x => x in UNITS || x in SCALES;
    // a run starts at a UNIT word ("twelve", "eight") or at "a" before a scale ("a hundred"); a BARE scale word ("12 thousand", "1.2 million") is the suffix of a digit amount, not a number of its own
    if (!(w in UNITS || (w === 'a' && words[i + 1] && words[i + 1][0].toLowerCase() in SCALES))) { i++; continue; }
    let j = i, total = 0, current = 0, last = i;
    while (j < words.length) {
      const x = words[j][0].toLowerCase(), gap = j > i ? text.slice(words[j - 1].index + words[j - 1][0].length, words[j].index) : '';
      if (j > i && !/^[\s-]+$/.test(gap)) break;                                  // runs are joined only by spaces or hyphens ("twenty-five", "eight thousand nine hundred")
      if (x === 'and' && j + 1 < words.length && isNum(words[j + 1][0].toLowerCase())) { j++; continue; }
      if (x === 'a' && j === i) { current = 1; j++; continue; }
      if (x in UNITS) current += UNITS[x]; else if (x in SCALES) { if (x === 'hundred') current = (current || 1) * 100; else { total += (current || 1) * SCALES[x]; current = 0; } } else break;
      last = j; j++;
    }
    const value = total + current, nextWord = (words[last + 1]?.[0] || '').toLowerCase(), between = words[last + 1] ? text.slice(words[last].index + words[last][0].length, words[last + 1].index) : '';
    const followed = /^\s+$/.test(between) ? nextWord : '';
    if (/^(percent|percentage)$/.test(followed)) out.push({ canonical: pctStr(value), value, kind: 'pct' });
    else if (value >= 100 || /^(dollars?|bucks|usd)$/.test(followed)) out.push({ canonical: moneyStr(value), value, kind: 'money' });
    i = Math.max(last + 1, i + 1);
  }
  return out;
}

function extractAmounts(text) {
  const t = String(text).normalize('NFKC'), out = [];                              // NFKC folds full-width digits (３０) to ASCII
  if (/[^\x00-\x7F]/.test(t.replace(/[^\p{Nd}]/gu, '').replace(/[0-9]/g, '')) ) out.push('[non-standard digits]');   // Arabic-Indic etc.: cannot be read reliably, so it is always held for approval
  const num = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?', suf = '(?:\\s?(k|thousand|million|billion|m|bn))?';
  const seen = [];
  const mark = (m) => { seen.push([m.index, m.index + m[0].length]); };
  const covered = (i) => seen.some(([a, b]) => i >= a && i < b);
  for (const m of t.matchAll(new RegExp(`(-?)\\$\\s?(${num})${suf}(?![A-Za-z])`, 'gi'))) { mark(m); const v = parseFloat(m[2].replace(/,/g, '')) * (m[3] ? SUFFIX[m[3].toLowerCase()] : 1); out.push(moneyStr(m[1] ? -v : v)); }
  for (const m of t.matchAll(new RegExp(`(?<![\\d$.,])(${num})\\s?(dollars?|bucks|usd)\\b`, 'gi'))) { if (covered(m.index)) continue; mark(m); out.push(moneyStr(parseFloat(m[1].replace(/,/g, '')))); }
  for (const m of t.matchAll(new RegExp(`(?<![\\d$.,])(\\d+(?:\\.\\d+)?)\\s?(k|thousand|million|billion)\\b`, 'gi'))) { if (covered(m.index)) continue; mark(m); out.push(moneyStr(parseFloat(m[1]) * SUFFIX[m[2].toLowerCase()])); }
  // a trailing comma or period is punctuation, not part of the number ("8,900, which…")
  for (const m of t.matchAll(/(?<![\d$.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?!\d|,\d)/g)) { if (covered(m.index)) continue; mark(m); out.push(moneyStr(parseFloat(m[1].replace(/,/g, '')))); }
  for (const m of t.matchAll(/(?<![\d$.,])(\d+(?:\.\d+)?)\s?(%|percent\b|percentage points?\b)/gi)) out.push(pctStr(parseFloat(m[1])));
  for (const w of numberWordAmounts(t)) out.push(w.canonical);
  return out;
}

/** Amounts in `texts` that do not correspond to a figure on the return. Money matches exactly (±$1), or by rounding to $10/$100/$1,000 but ONLY when the rounded figure is within 5%
 *  of the real one ("$800" for $770 is fair; "$1,000" for $770 is a 30% misstatement and is held). Percentages: ±0.1 or the whole-number rounding. */
function unverifiedAmounts(texts, { facts }) {
  const money = Object.values(facts).filter(f => f.kind === MONEY).map(f => Math.abs(f.value));
  const pct = Object.values(facts).filter(f => f.kind === PCT).map(f => f.value);
  const bad = [];
  for (const tx of texts) for (const a of extractAmounts(tx)) {
    if (a === '[non-standard digits]') { bad.push(a); continue; }
    if (a.endsWith('%')) { const v = parseFloat(a); if (!pct.some(p => Math.abs(p - v) <= 0.1 || Math.round(p) === v)) bad.push(a); continue; }
    const v = Math.abs(parseFloat(a.replace(/[$,]/g, '')));
    if (!money.some(m => Math.abs(m - v) <= 1 || ([10, 100, 1000].some(u => Math.round(m / u) * u === v) && Math.abs(m - v) / Math.max(m, 1) <= 0.05))) bad.push(a);
  }
  return [...new Set(bad)];
}

module.exports = { buildFacts, describeFacts, checkSegmentText, placeholdersOf, substitute, PLANNING_SEGMENT, extractAmounts, numberWordAmounts, unverifiedAmounts, format, GLOSSARY };
