// _scenarioScript.js — narration for a PLANNING SCENARIO comparison (current plan vs the option the advisor chose).
// Fixed sentences only (no AI). The figures come from the advisor's browser (the tax engine runs there); they are ESTIMATES, so the audio step
// treats every amount as not-on-a-return and requires the advisor's recorded approval before anything is narrated (kind: estimate_or_projection).
const { bad } = require('./_validate');
const { assertNoIdentifier, assertClientLabel } = require('./_pii');

const fmt = v => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');
const pct = v => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

/** Validate what the browser sent: indexes into the SAVED scenario set and four numbers. Labels are taken from the saved set, never the request. */
function readScenarioRequest(body, saved) {
  const scenarios = saved?.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length < 2) throw bad('This scenario set needs at least two scenarios to compare.');
  if ((saved.formType || '1040') !== '1040') throw bad('Scenario walkthroughs are available for Form 1040 scenarios.');
  const s = body.scenario || {};
  const base = Number(s.baseIndex), chosen = Number(s.chosenIndex);
  if (!Number.isInteger(base) || !Number.isInteger(chosen) || base === chosen || !scenarios[base] || !scenarios[chosen]) throw bad('Choose two different scenarios.');
  const f = s.figures || {};
  const nums = ['base_tax', 'scenario_tax', 'base_rate', 'scenario_rate'];
  for (const k of nums) if (typeof f[k] !== 'number' || !Number.isFinite(f[k]) || Math.abs(f[k]) > 1e10) throw bad(`Invalid figure: ${k}`);
  if (f.base_rate < 0 || f.base_rate > 100 || f.scenario_rate < 0 || f.scenario_rate > 100) throw bad('Rates must be percentages');
  const label = (x, i) => { const t = String(x?.scenarioLabel || `Scenario ${String.fromCharCode(65 + i)}`).trim().slice(0, 60); assertNoIdentifier(t, 'A scenario label'); assertClientLabel(t); return t; };
  const figures = {
    base_tax: Math.round(f.base_tax), scenario_tax: Math.round(f.scenario_tax),
    tax_difference: Math.round(f.base_tax) - Math.round(f.scenario_tax),
    base_rate: Math.round(f.base_rate * 10) / 10, scenario_rate: Math.round(f.scenario_rate * 10) / 10,
  };
  return { baseIndex: base, chosenIndex: chosen, baseLabel: label(scenarios[base], base), chosenLabel: label(scenarios[chosen], chosen), year: saved.year, figures };
}

function composeScenarioScript({ baseLabel, chosenLabel, year, figures: f }) {
  const d = f.tax_difference;
  const diff = Math.abs(d) < 50
    ? 'That is about the same federal tax either way.'
    : d > 0 ? `That is ${fmt(d)} less in federal tax.` : `That is ${fmt(-d)} more in federal tax.`;
  return [
    { text: `Let's look at a planning option for ${year}.`,                                                      field_ref: 'intro',          section: 'intro',  key: 'scenario_intro' },
    { text: `Under “${baseLabel}”, your estimated federal tax for ${year} is ${fmt(f.base_tax)}.`,                  field_ref: 'base_tax',       section: 'tax',    key: 'scenario_base' },
    { text: `With “${chosenLabel}”, it would be ${fmt(f.scenario_tax)}.`,                                          field_ref: 'scenario_tax',   section: 'tax',    key: 'scenario_option' },
    { text: diff,                                                                                                 field_ref: 'tax_difference', section: 'result', key: 'scenario_diff' },
    { text: `Your estimated federal tax rate would go from ${pct(f.base_rate)} to ${pct(f.scenario_rate)}.`,      field_ref: 'scenario_rate',  section: 'result', key: 'scenario_rate' },
    { text: 'These are estimates based on the figures your advisor entered, not a filed return. Your advisor will walk you through the trade-offs before you decide.', field_ref: 'planning_tip', section: 'planning', key: 'scenario_caveat' },
    { text: 'Thank you for taking a few minutes to go through this option. Please reach out to your advisor with any questions.', field_ref: 'outro', section: 'outro', key: 'outro' },
  ];
}

module.exports = { readScenarioRequest, composeScenarioScript };
