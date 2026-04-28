// src/utils/taxEngine.js
// TaxStory RIA Multi-Year Projection Engine
// 2024 Federal Tax Brackets, LTCG rates, NIIT, Social Security, RMD calculations

// ── 2024 Federal Income Tax Brackets ────────────────────────────────────────
const BRACKETS_2024 = {
  single: [
    { min: 0,       max: 11600,  rate: 0.10 },
    { min: 11600,   max: 47150,  rate: 0.12 },
    { min: 47150,   max: 100525, rate: 0.22 },
    { min: 100525,  max: 191950, rate: 0.24 },
    { min: 191950,  max: 243725, rate: 0.32 },
    { min: 243725,  max: 609350, rate: 0.35 },
    { min: 609350,  max: Infinity, rate: 0.37 },
  ],
  mfj: [
    { min: 0,       max: 23200,  rate: 0.10 },
    { min: 23200,   max: 94300,  rate: 0.12 },
    { min: 94300,   max: 201050, rate: 0.22 },
    { min: 201050,  max: 383900, rate: 0.24 },
    { min: 383900,  max: 487450, rate: 0.32 },
    { min: 487450,  max: 731200, rate: 0.35 },
    { min: 731200,  max: Infinity, rate: 0.37 },
  ],
};

// ── 2024 LTCG Rates ──────────────────────────────────────────────────────────
const LTCG_BRACKETS_2024 = {
  single: [
    { max: 47025,  rate: 0 },
    { max: 518900, rate: 0.15 },
    { max: Infinity, rate: 0.20 },
  ],
  mfj: [
    { max: 94050,  rate: 0 },
    { max: 583750, rate: 0.15 },
    { max: Infinity, rate: 0.20 },
  ],
};

// ── NIIT (Net Investment Income Tax) ─────────────────────────────────────────
const NIIT_THRESHOLD = { single: 200000, mfj: 250000 };
const NIIT_RATE = 0.038;

// ── IRS Uniform Lifetime Table (for RMD calculation) ────────────────────────
const RMD_DIVISORS = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
  84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
};

export function calcFederalTax(taxableIncome, filingStatus = 'single') {
  const brackets = BRACKETS_2024[filingStatus] || BRACKETS_2024.single;
  let tax = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxable = Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += taxable * bracket.rate;
  }
  return Math.round(tax);
}

export function calcLTCGTax(ltcgAmount, ordinaryIncome, filingStatus = 'single') {
  const brackets = LTCG_BRACKETS_2024[filingStatus] || LTCG_BRACKETS_2024.single;
  const totalIncome = ordinaryIncome + ltcgAmount;
  let tax = 0;
  let prev = ordinaryIncome;
  for (const bracket of brackets) {
    if (prev >= bracket.max) continue;
    const taxable = Math.min(totalIncome, bracket.max) - Math.max(prev, ordinaryIncome);
    if (taxable > 0) tax += taxable * bracket.rate;
    prev = bracket.max;
  }
  return Math.round(Math.max(0, tax));
}

export function calcNIIT(investmentIncome, agi, filingStatus = 'single') {
  const threshold = NIIT_THRESHOLD[filingStatus] || NIIT_THRESHOLD.single;
  const excess    = Math.max(0, agi - threshold);
  const subject   = Math.min(investmentIncome, excess);
  return Math.round(subject * NIIT_RATE);
}

export function calcRMD(accountBalance, age) {
  const divisor = RMD_DIVISORS[Math.min(Math.max(age, 72), 95)];
  if (!divisor) return 0;
  return Math.round(accountBalance / divisor);
}

export function calcSocialSecurityInclusion(ssBenefit, otherIncome, filingStatus = 'single') {
  const combinedIncome = otherIncome + ssBenefit * 0.5;
  const threshold1 = filingStatus === 'mfj' ? 32000 : 25000;
  const threshold2 = filingStatus === 'mfj' ? 44000 : 34000;

  if (combinedIncome <= threshold1) return 0;
  if (combinedIncome <= threshold2) {
    return Math.min(ssBenefit * 0.5, (combinedIncome - threshold1) * 0.5);
  }
  return Math.min(ssBenefit * 0.85,
    (threshold2 - threshold1) * 0.5 * 0.5 + (combinedIncome - threshold2) * 0.85
  );
}

/**
 * Run a multi-year projection.
 * @param {object} inputs - projection parameters
 * @returns {Array} year-by-year results
 */
export function runProjection(inputs) {
  const {
    currentAge,
    filingStatus = 'single',
    projectionYears = 10,
    ordinaryIncome = 0,
    ltcgIncome = 0,
    investmentIncome = 0,
    iraBalance = 0,
    rothBalance = 0,
    ssBenefit = 0,
    ssStartAge = 67,
    inflationRate = 0.03,
    portfolioGrowthRate = 0.07,
    standardDeduction = filingStatus === 'mfj' ? 29200 : 14600,
  } = inputs;

  const results = [];
  let currentIRABalance  = iraBalance;
  let currentRothBalance = rothBalance;

  for (let yr = 0; yr < projectionYears; yr++) {
    const age      = currentAge + yr;
    const year     = new Date().getFullYear() + yr;
    const inflMult = Math.pow(1 + inflationRate, yr);

    // Income projections
    const scaledOrdinary  = ordinaryIncome  * inflMult;
    const scaledLTCG      = ltcgIncome      * inflMult;
    const scaledInvestment = investmentIncome * inflMult;
    const scaledSS        = age >= ssStartAge ? ssBenefit * inflMult : 0;

    // RMD
    const rmd = age >= 73 ? calcRMD(currentIRABalance, age) : 0;

    // Social Security inclusion
    const ssInclusion = calcSocialSecurityInclusion(
      scaledSS,
      scaledOrdinary + rmd + scaledInvestment,
      filingStatus
    );

    // AGI
    const agi = scaledOrdinary + rmd + ssInclusion + scaledInvestment;

    // Taxable income
    const taxableIncome = Math.max(0, agi - standardDeduction);

    // Tax calculations
    const federalTax = calcFederalTax(taxableIncome, filingStatus);
    const ltcgTax    = calcLTCGTax(scaledLTCG, taxableIncome, filingStatus);
    const niit       = calcNIIT(scaledInvestment + scaledLTCG, agi + scaledLTCG, filingStatus);
    const totalTax   = federalTax + ltcgTax + niit;
    const effectiveRate = agi + scaledLTCG > 0
      ? totalTax / (agi + scaledLTCG)
      : 0;

    // Update balances (IRA decreases by RMD, grows by portfolio rate)
    currentIRABalance  = (currentIRABalance - rmd) * (1 + portfolioGrowthRate);
    currentRothBalance = currentRothBalance * (1 + portfolioGrowthRate);

    results.push({
      year, age,
      ordinaryIncome:  Math.round(scaledOrdinary),
      ltcgIncome:      Math.round(scaledLTCG),
      ssIncome:        Math.round(scaledSS),
      ssInclusion:     Math.round(ssInclusion),
      rmd:             Math.round(rmd),
      agi:             Math.round(agi),
      taxableIncome:   Math.round(taxableIncome),
      federalTax:      Math.round(federalTax),
      ltcgTax:         Math.round(ltcgTax),
      niit:            Math.round(niit),
      totalTax:        Math.round(totalTax),
      effectiveRate:   Math.round(effectiveRate * 10000) / 100, // as %
      iraBalance:      Math.round(currentIRABalance),
      rothBalance:     Math.round(currentRothBalance),
    });
  }

  return results;
}
