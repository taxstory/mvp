// netlify/functions/_scriptTemplates.js — the deterministic backbone of every walkthrough script.
//
// WHAT IS SAID ABOUT WHICH FIGURE IS DECIDED HERE, NOT BY A MODEL. Each concept has one fixed sentence with its own placeholder; the backbone is
// built from the figures actually on the return, in a fixed order, with the outcome (refund / balance due / even) derived deterministically.
// A language model may only POLISH the wording, and sees no figures at all. A rewrite of a sentence is accepted only if it keeps exactly the same
// placeholders, still names its own concept (anchor), and passes every check in _scriptFacts.checkSegmentText; otherwise that sentence stays as the
// template. The worst case is a plain but correct script — never a wrong one, and never a refusal because the model misbehaved.
const { checkSegmentText, placeholdersOf, substitute, extractAmounts, format, PLANNING_SEGMENT } = require('./_scriptFacts');

// key → sentence (with its own placeholder), the concept words a rewrite must still contain, and where it belongs in the video
const T = {
  wages:                { text: 'Your total wages and other earned income came to {{wages}}.',                  anchor: /wage|salar|earn|tips|paid/i,          ref: 'wages',              section: 'income' },
  interest:             { text: 'You had {{interest}} of taxable interest.',                                   anchor: /interest/i,                           ref: 'interest',           section: 'income' },
  dividends:            { text: 'Ordinary dividends added {{dividends}} to your income.',                      anchor: /dividend/i,                           ref: 'dividends',          section: 'income' },
  ira_distributions:    { text: 'Taxable IRA distributions came to {{ira_distributions}}.',                    anchor: /\bIRA\b|retirement/i,                 ref: 'ira_distributions',  section: 'income' },
  pensions:             { text: 'Taxable pensions and annuities came to {{pensions}}.',                        anchor: /pension|annuit/i,                     ref: 'pensions',           section: 'income' },
  social_security:      { text: 'The taxable part of your Social Security benefits was {{social_security}}.',  anchor: /social security/i,                    ref: 'social_security',    section: 'income' },
  capital_gains:        { text: 'Your capital gains or losses came to {{capital_gains}}.',                     anchor: /capital|gain|loss|invest/i,           ref: 'capital_gains',      section: 'income' },
  business_income:      { text: 'Your business income or loss came to {{business_income}}.',                           anchor: /business|self-employ/i,               ref: 'schedule_c',         section: 'income' },
  other_income:         { text: 'Additional income reported on Schedule 1 came to {{other_income}}.',           anchor: /additional|other|schedule 1/i,                   ref: 'other_income',       section: 'income' },
  total_income:         { text: 'Adding everything up, your total income was {{total_income}}.',               anchor: /total income/i,                       ref: 'total_income',       section: 'income' },
  agi:                  { text: 'After adjustments, your adjusted gross income was {{agi}}.',                  anchor: /adjusted gross|\bAGI\b/i,             ref: 'agi',                section: 'income' },
  standard_deduction:   { text: 'Your standard or itemized deduction was {{standard_deduction}}.',             anchor: /deduction/i,                          ref: 'standard_deduction', section: 'deductions' },
  qbi_deduction:        { text: 'Your qualified business income deduction was {{qbi_deduction}}.',             anchor: /qualified business|business income deduction|\bQBI\b/i, ref: 'qbi_deduction', section: 'deductions' },
  additional_deductions:{ text: 'Additional deductions from Schedule 1-A came to {{additional_deductions}}.',  anchor: /schedule 1-A|additional deduction/i,  ref: 'standard_deduction', section: 'deductions' },
  taxable_income:       { text: 'That leaves taxable income of {{taxable_income}}.',                           anchor: /taxable income|taxed/i,               ref: 'taxable_income',     section: 'deductions' },
  total_tax:            { text: 'Your total federal tax for the year was {{total_tax}}.',               anchor: /\btax\b/i,                            ref: 'total_tax',          section: 'tax' },
  withholding:          { text: 'Total federal income tax withheld during the year was {{withholding}}.',       anchor: /withh|taken out|paycheck/i,           ref: 'withholding',        section: 'tax' },
  estimated_payments:   { text: 'Estimated tax payments and amounts applied from your prior-year return came to {{estimated_payments}}.', anchor: /estimated|applied/i,                          ref: 'withholding',        section: 'tax' },
  effective_rate:       { text: 'Your total federal tax works out to {{effective_rate}} of your adjusted gross income.', anchor: /adjusted gross|AGI|rate|percent/i,             ref: 'effective_rate',     section: 'tax' },
  refund:               { text: "Good news: you're getting a federal refund of {{refund}}.",                   anchor: /refund/i,                             ref: 'refund',             section: 'result' },
  amount_owed:          { text: 'The balance due with this return is {{amount_owed}}.',                        anchor: /balance|owe|due/i,                    ref: 'amount_owed',        section: 'result' },
  even:                 { text: 'Your payments exactly cover your tax, so nothing more is owed and nothing comes back.', anchor: /cover|exactly|even|nothing/i, ref: 'amount_owed', section: 'result' },
};
const INTRO  = { key: 'intro', text: "Let's walk through your {{tax_year}} tax return together.", anchor: /return|walk/i, ref: 'intro', section: 'intro' };
const OUTRO  = { key: 'outro', text: 'Thank you for taking a few minutes to go through your return. Please reach out to your advisor with any questions.', anchor: /thank|questions|advisor/i, ref: 'outro', section: 'outro' };

// Where each sentence's figure comes from on the form, in the form's own words. Line numbers differ by tax year (the 2025 form has 7a, 11a/11b, 12e, 13a/13b);
// every template must be re-reviewed against each year's Form 1040 and its instructions. `renderTemplateReview()` produces the review sheet (docs/TEMPLATE_REVIEW.md)
// and a test fails if that sheet is out of date, so a wording change cannot slip through without the sheet — and its sign-off column — being regenerated.
const SOURCES = {
  intro: 'Fixed text (uses the tax year)', outro: 'Fixed text', planning: 'Fixed, neutral text — never AI-written',
  wages: 'Line 1z — "Add lines 1a through 1h" (total wages and other earned income)', interest: 'Line 2b — Taxable interest', dividends: 'Line 3b — Ordinary dividends',
  ira_distributions: 'Line 4b — IRA distributions, taxable amount', pensions: 'Line 5b — Pensions and annuities, taxable amount', social_security: 'Line 6b — Social security benefits, taxable amount',
  capital_gains: 'Line 7 (7a on the 2025 form) — Capital gain or (loss)', business_income: 'Schedule 1, line 3 — Business income or (loss) (manual entry only)',
  other_income: 'Line 8 — Additional income from Schedule 1, line 10', total_income: 'Line 9 — Total income', agi: 'Line 11 (11a on the 2025 form) — Adjusted gross income',
  standard_deduction: 'Line 12 (12e on the 2025 form) — Standard deduction or itemized deductions', qbi_deduction: 'Line 13 (13a on the 2025 form) — Qualified business income deduction',
  additional_deductions: '2025 form only, line 13b — Additional deductions from Schedule 1-A', taxable_income: 'Line 15 — Taxable income',
  total_tax: 'Line 24 — Total tax (income tax PLUS other taxes such as self-employment tax — hence "total federal tax", not "income tax")',
  withholding: 'Line 25d — Total federal income tax withheld (all sources: W-2, 1099 and other forms)', estimated_payments: 'Line 26 — Estimated tax payments and amount applied from the prior-year return',
  effective_rate: 'CALCULATED: line 24 ÷ line 11 (AGI) — total federal tax as a percentage of adjusted gross income; not a Form 1040 line, never taken from a stored value',
  refund: 'Line 35a — Amount of line 34 you want refunded to you', amount_owed: 'Line 37 — Amount you owe', even: 'Derived: payments equal tax, so nothing is owed and nothing is refunded',
};

/** The review sheet: every sentence, where its figure comes from, and a column for the reviewing CPA's initials and the tax year reviewed. */
function renderTemplateReview() {
  const rows = [['intro', INTRO.text], ...ORDER.map(k => [k, T[k].text]), ['refund', T.refund.text], ['amount_owed', T.amount_owed.text], ['even', T.even.text], ['planning', PLANNING_SEGMENT.text], ['outro', OUTRO.text]];
  return `# Narration template review sheet

*Generated from \`netlify/functions/_scriptTemplates.js\` — do not edit by hand (run \`node scripts/generate_template_review.mjs\`). A test fails if this file is out of date.*

Every sentence below is fixed text; the only variable part is the figure in \`{{braces}}\`. **Each tax year, a CPA must compare every row with that year's Form 1040 and instructions** (line numbers and labels change between years — the 2025 form added lines 7a, 11a/11b, 12e, 13a/13b) and record initials and the year in the last column.

| Key | Sentence (what the client hears) | Source on the form | CPA reviewed (initials / tax year) |
|---|---|---|---|
${rows.map(([k, t]) => `| \`${k}\` | ${t.replace(/\|/g, '\\|')} | ${SOURCES[k]} | |`).join('\n')}
`;
}

// Core lines are narrated whenever present — INCLUDING when they are zero (a $0 total tax or $0 taxable income is a real, meaningful result).
// Optional income categories and deductions are narrated only when non-zero (a $0 line adds nothing).
const CORE = new Set(['total_income', 'agi', 'taxable_income', 'total_tax', 'withholding']);
const ORDER = ['wages', 'interest', 'dividends', 'ira_distributions', 'pensions', 'social_security', 'capital_gains', 'business_income', 'other_income', 'total_income', 'agi',
               'standard_deduction', 'qbi_deduction', 'additional_deductions', 'taxable_income', 'total_tax', 'withholding', 'estimated_payments', 'effective_rate'];

/** The deterministic script: [{ key, text (with placeholders), field_ref, section, anchor?, fixed? }]. */
function buildBackbone({ facts, result }) {
  const segs = [];
  if (facts.tax_year) segs.push({ ...INTRO }); else segs.push({ ...INTRO, text: "Let's walk through your tax return together.", anchor: /return|walk/i });
  for (const key of ORDER) {
    const f = facts[key]; if (!f) continue;
    if (!CORE.has(key) && f.value === 0) continue;
    const t = T[key]; segs.push({ key, text: t.text, anchor: t.anchor, field_ref: t.ref, section: t.section });
  }
  if (result === 'refund' && facts.refund) segs.push({ key: 'refund', ...pick(T.refund) });
  else if (result === 'owed' && facts.amount_owed) segs.push({ key: 'amount_owed', ...pick(T.amount_owed) });
  else if (result === 'even') segs.push({ key: 'even', ...pick(T.even) });
  segs.push({ key: 'planning', text: PLANNING_SEGMENT.text, field_ref: PLANNING_SEGMENT.field_ref, section: PLANNING_SEGMENT.section, fixed: true });   // never AI-written
  segs.push({ ...OUTRO });
  return segs.map(s => ({ ...s, field_ref: s.field_ref ?? s.ref, section: s.section }));
}
function pick(t) { return { text: t.text, anchor: t.anchor, field_ref: t.ref, section: t.section }; }

const sameMultiset = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Merge optional AI rewrites into the backbone, sentence by sentence. A rewrite is accepted only if it (1) is a string, (2) keeps exactly the template's
 * placeholders, (3) still contains a word for its own concept, (4) passes checkSegmentText. Everything else stays the template.
 * @returns {{ segments: {text,field_ref,section}[], rewritten: number, rejected: number }}
 */
function composeScript(backbone, rewrites, model) {
  let rewritten = 0, rejected = 0;
  const segments = backbone.map((b, i) => {
    let text = b.text;
    const cand = Array.isArray(rewrites) ? rewrites[i] : undefined;
    if (!b.fixed && typeof cand === 'string' && cand.trim()) {
      const ok = sameMultiset(placeholdersOf(cand), placeholdersOf(b.text)) && (!b.anchor || b.anchor.test(cand.replace(/\{\{[a-z_]+\}\}/g, ' '))) && checkSegmentText(cand, model).length === 0;
      if (ok) { text = cand.trim(); rewritten++; } else rejected++;
    }
    return { text: substitute(text, model.facts), field_ref: b.field_ref, section: b.section };
  });
  // Belt and braces: every amount in the final text must be one of OUR formatted values. If one is not, fall back to the pure template for that sentence.
  const allowed = new Set(Object.values(model.facts).filter(f => f.kind !== 'text').map(format));
  return { segments: segments.map((s, i) => extractAmounts(s.text).every(a => allowed.has(a) || allowed.has(a.replace(/^-/, ''))) ? s : { ...s, text: substitute(backbone[i].text, model.facts) }), rewritten, rejected };
}

module.exports = { buildBackbone, composeScript, sameMultiset, renderTemplateReview, SOURCES, TEMPLATE_KEYS: ['intro', ...ORDER, 'refund', 'amount_owed', 'even', 'planning', 'outro'] };
