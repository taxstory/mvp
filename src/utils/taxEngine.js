// src/utils/taxEngine.js
// Shared federal tax calculation engine used by RIA projections and
// CPA manual-entry live estimates.
//
// FIX: brackets were previously hardcoded to a single year (2024) with
// no way to select a different year — every RIA projection silently used
// stale figures regardless of which tax year the projection was actually
// for. This version takes an explicit `year` parameter and maintains a
// dated bracket table, defaulting to the current year if none is passed.

const BRACKETS_BY_YEAR = {
  2024: {
    mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
    single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
    mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
    hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
    standardDeduction: { mfj: 29200, single: 14600, mfs: 14600, hoh: 21900 },
  },
  2025: {
    mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
    mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[375800,.35],[Infinity,.37]],
    hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
    standardDeduction: { mfj: 30000, single: 15000, mfs: 15000, hoh: 22500 },
  },
  // Add 2026 once the IRS publishes official figures (typically released
  // in Oct/Nov of the prior year). Until then, callers requesting 2026
  // will fall back to 2025 figures via getBracketsForYear's fallback logic.
};

const DEFAULT_YEAR = new Date().getFullYear();

function filingKey(status) {
  if (!status) return 'single';
  const s = status.toLowerCase();
  if (s.includes('jointly')) return 'mfj';
  if (s.includes('separately')) return 'mfs';
  if (s.includes('household')) return 'hoh';
  return 'single';
}

/**
 * Returns the bracket table + standard deduction for a given year.
 * Falls back to the most recent known year if the requested year isn't
 * in the table yet (e.g. brackets for next year not yet published),
 * rather than silently using an arbitrary hardcoded year.
 */
function getBracketsForYear(year = DEFAULT_YEAR) {
  if (BRACKETS_BY_YEAR[year]) return { year, ...BRACKETS_BY_YEAR[year] };

  const knownYears = Object.keys(BRACKETS_BY_YEAR).map(Number).sort((a, b) => b - a);
  const fallbackYear = knownYears[0];
  console.warn(`taxEngine: no bracket data for ${year}, falling back to ${fallbackYear}`);
  return { year: fallbackYear, ...BRACKETS_BY_YEAR[fallbackYear] };
}

/**
 * Calculates federal tax owed on a given taxable income.
 * @param {number} taxableIncome
 * @param {string} filingStatus - e.g. "Married filing jointly"
 * @param {number} [year] - tax year; defaults to current calendar year
 */
function calcFederalTax(taxableIncome, filingStatus, year = DEFAULT_YEAR) {
  const { [filingKey(filingStatus)]: brackets } = getBracketsForYear(year);
  let tax = 0, prev = 0;
  for (const [limit, rate] of brackets) {
    if (taxableIncome <= prev) break;
    tax += (Math.min(taxableIncome, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

/** Returns the standard deduction for a filing status + year. */
function getStandardDeduction(filingStatus, year = DEFAULT_YEAR) {
  const { standardDeduction } = getBracketsForYear(year);
  return standardDeduction[filingKey(filingStatus)] || standardDeduction.single;
}

/** Returns the marginal bracket rate for a given taxable income. */
function getMarginalRate(taxableIncome, filingStatus, year = DEFAULT_YEAR) {
  const { [filingKey(filingStatus)]: brackets } = getBracketsForYear(year);
  const bracket = brackets.find(([limit]) => taxableIncome <= limit);
  return bracket ? bracket[1] : brackets[brackets.length - 1][1];
}

module.exports = {
  calcFederalTax,
  getStandardDeduction,
  getMarginalRate,
  getBracketsForYear,
  filingKey,
  BRACKETS_BY_YEAR,
};
