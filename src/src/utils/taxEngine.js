// src/utils/taxEngine.js
// TaxStory Federal Tax Engine — CPA + RIA Grade
// Version 3.0 — updated for OBBBA (One Big Beautiful Bill Act, signed Jul 4 2025)
//
// Covers:
//   ✓ Ordinary income tax (2024 / 2025 / 2026, all filing statuses)
//   ✓ LTCG / Qualified dividend preferential rates (all years)
//   ✓ Standard deduction (inflation-adjusted per year incl. 2026)
//   ✓ OBBBA 2025: Senior deduction ($6,000, age 65+, phased out)
//   ✓ OBBBA 2025: No-tax-on-tips deduction (2025-2028)
//   ✓ OBBBA 2025: No-tax-on-overtime deduction (2025-2028)
//   ✓ OBBBA 2025: SALT cap raised to $40,000 with phase-down above $500k
//   ✓ OBBBA 2025: Auto loan interest deduction (up to $10,000)
//   ✓ Self-employment tax (Schedule SE) + 50% deduction
//   ✓ QBI deduction §199A (simplified, OBBBA-permanent)
//   ✓ NIIT 3.8% (Form 8960, statutory thresholds)
//   ✓ Additional Medicare Tax 0.9% (Form 8959)
//   ✓ AMT (Form 6251) — OBBBA 50% phase-out rate from 2026
//   ✓ Child Tax Credit — $2,200 (2025+), $2,000 (2024)
//   ✓ IRMAA 2025 + 2026 (Part B + D, two-year lookback)
//   ✓ RMD (Uniform Lifetime Table, SECURE 2.0, age 73+)
//   ✓ Social Security taxability — full provisional income method
//   ✓ Capital loss carryforward (tracks year-over-year)
//   ✓ Depreciation recapture §1250 (25% rate)
//   ✓ Quarterly estimated tax / safe harbor calc
//   ✓ Roth conversion optimizer (bracket headroom + tax cost)
//   ✓ Year-parameterized — all data keyed by tax year

// ─── 2026 BRACKET DATA (IRS Rev Proc 2025-32, OBBBA-adjusted) ─────────────────
// Note: 10% and 12% brackets received ~4% inflation adjustment under OBBBA;
// brackets above 12% received ~2.3%. Standard deduction: $32,200 MFJ / $16,100 single.

const BRACKETS_BY_YEAR = {
  2024: {
    ordinary: {
      mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
    },
    ltcg: {
      mfj:    [[94050,0],[583750,.15],[Infinity,.20]],
      single: [[47025,0],[518900,.15],[Infinity,.20]],
      mfs:    [[47025,0],[291850,.15],[Infinity,.20]],
      hoh:    [[63000,0],[551350,.15],[Infinity,.20]],
    },
    standardDeduction: { mfj: 29200, single: 14600, mfs: 14600, hoh: 21900 },
    agedBlindAddition: { mfj: 1550,  single: 1950,  mfs: 1550,  hoh: 1950  },
    amt: {
      exemption: { mfj: 133300, single: 85700,  mfs: 66650,  hoh: 85700  },   // Rev. Proc. 2023-34 (verify)
      phaseout:  { mfj: 1218700,single: 609350, mfs: 609350, hoh: 609350 },
      phaseoutRate: 0.25,
      rate1: .26, rate2: .28, breakpoint: 232600,    // (220,700 was the 2023 figure)
    },
    ctcPerChild: 2000,
    saltCap: 10000,
  },
  2025: {
    ordinary: {
      mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[375800,.35],[Infinity,.37]],
      hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
    },
    ltcg: {
      mfj:    [[96700,0],[600050,.15],[Infinity,.20]],
      single: [[48350,0],[533400,.15],[Infinity,.20]],
      mfs:    [[48350,0],[300000,.15],[Infinity,.20]],
      hoh:    [[64750,0],[566700,.15],[Infinity,.20]],
    },
    standardDeduction: { mfj: 31500, single: 15750, mfs: 15750, hoh: 23625 },  // post-OBBBA (Rev. Proc. 2025-32)
    agedBlindAddition: { mfj: 1600,  single: 2000,  mfs: 1600,  hoh: 2000  },
    amt: {
      // OBBBA: TCJA-level exemptions made permanent; phase-out thresholds reset to
      // 2018 values of $500k single / $1M MFJ and indexed for inflation from 2026.
      // For 2025 we still use the TCJA-inflation-adjusted values.
      exemption: { mfj: 137000, single: 88100,  mfs: 68500,  hoh: 88100  },
      phaseout:  { mfj: 1252700,single: 626350, mfs: 626350, hoh: 626350 },
      phaseoutRate: 0.25,
      rate1: .26, rate2: .28, breakpoint: 239100,   // Rev. Proc. 2024-40
    },
    ctcPerChild: 2200,     // OBBBA raised from $2,000 to $2,200 in 2025
    saltCap: 40000,        // OBBBA raised from $10,000 to $40,000 for 2025-2029
    saltPhaseoutStart: 500000,  // MAGI above which SALT cap reduces 30 cents per dollar
    seniorDeduction: 6000, // OBBBA 2025-2028: additional deduction for age 65+
    seniorDeductionPhaseout: { single: 75000, mfj: 150000 }, // MAGI phase-out start
    tipsExclusion: true,   // OBBBA 2025-2028 (§224): qualified tips are a DEDUCTION (below AGI), capped at $25,000, reduced $100 per $1,000 of MAGI over $150k/$300k — see calcTipsDeduction
    overtimeExclusion: true, // OBBBA 2025-2028 (§225): qualified overtime premium is a DEDUCTION (below AGI), capped at $12,500 ($25,000 joint), same phase-out — see calcOvertimeDeduction
    autoLoanDeduction: 10000, // OBBBA 2025-2028: up to $10,000 on qualifying vehicle loan interest
  },
  2026: {
    // Source: IRS Rev Proc 2025-32 (published Oct 2025)
    // Official figures (Rev. Proc. 2025-32), verified Oct 2026
    ordinary: {
      mfj:    [[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]],
      single: [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[640600,.35],[Infinity,.37]],
      mfs:    [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[384350,.35],[Infinity,.37]],
      hoh:    [[17700,.10],[67450,.12],[105700,.22],[201750,.24],[256200,.32],[640600,.35],[Infinity,.37]],
    },
    ltcg: {
      // Official — Rev. Proc. 2025-32 §3.03
      mfj:    [[98900,0],[613700,.15],[Infinity,.20]],
      single: [[49450,0],[545500,.15],[Infinity,.20]],
      mfs:    [[49450,0],[306850,.15],[Infinity,.20]],
      hoh:    [[66200,0],[579600,.15],[Infinity,.20]],
    },
    standardDeduction: { mfj: 32200, single: 16100, mfs: 16100, hoh: 24150 },
    agedBlindAddition: { mfj: 1650,  single: 2050,  mfs: 1650,  hoh: 2050  },
    amt: {
      // OBBBA: phase-out reset to $500k single / $1M MFJ (2018 base), indexed from 2026
      // Phase-out RATE increased from 25% to 50% starting 2026
      exemption: { mfj: 140200, single: 90100,  mfs: 70100,  hoh: 90100  },
      phaseout:  { mfj: 1000000, single: 500000, mfs: 500000, hoh: 500000 },  // OBBBA reset; Rev. Proc. 2025-32
      phaseoutRate: 0.50,  // OBBBA change: was 0.25 pre-2026
      rate1: .26, rate2: .28, breakpoint: 244500,   // Rev. Proc. 2025-32
    },
    ctcPerChild: 2200,     // OBBBA: permanent at $2,200, indexed for inflation
    saltCap: 40400,        // OBBBA: 101% of 2025 cap
    saltPhaseoutStart: 505000,   // the $500,000 threshold is indexed by 1% too (IRC §164(b)(7) as amended; verify)
    seniorDeduction: 6000, // OBBBA 2025-2028
    seniorDeductionPhaseout: { single: 75000, mfj: 150000 },
    tipsExclusion: true,
    overtimeExclusion: true,
    autoLoanDeduction: 10000,
  },
};

// NIIT — statutory, never inflation-adjusted (IRC §1411)
const NIIT_THRESHOLDS = { mfj: 250000, single: 200000, mfs: 125000, hoh: 200000 };
const NIIT_RATE = 0.038;

// Additional Medicare Tax (IRC §3101(b)(2))
const ADDL_MEDICARE_THRESHOLDS = { mfj: 250000, single: 200000, mfs: 125000, hoh: 200000 };
const ADDL_MEDICARE_RATE = 0.009;

// SE Tax
const SE_TAX_RATE       = 0.153;
const SE_TAX_RATE_ABOVE = 0.029;
const SS_WAGE_BASE = { 2024: 168600, 2025: 176100, 2026: 184500 };  // SSA; 2026 announced Oct 24, 2025

// QBI §199A thresholds by year
const QBI_THRESHOLDS = {
  2024: { mfj: 383900, other: 191950, phaseRange: { mfj: 100000, other: 50000 } },
  2025: { mfj: 394600, other: 197300, phaseRange: { mfj: 100000, other: 50000 } },
  // 2026: thresholds sit at the 24% bracket tops (Rev. Proc. 2025-32; verify); OBBBA widened the W-2/UBIA phase-in range to $150,000 / $75,000 from 2026.
  2026: { mfj: 403500, other: 201750, phaseRange: { mfj: 150000, other: 75000 } },
};

// IRMAA 2025 (based on 2023 MAGI)
// Medicare income-related monthly adjustment amounts (CMS), based on MAGI from two years earlier. Upper bounds are inclusive; the top two tiers begin AT $500,000 ($750,000 joint).
// 2025 amounts (verify against CMS): the previous table mixed 2024 surcharges into 2025 thresholds.
const IRMAA_2025 = {
  single: [
    { maxMAGI: 106000,   partB: 0,      partD: 0     },
    { maxMAGI: 133000,   partB: 74.00,  partD: 13.70 },
    { maxMAGI: 167000,   partB: 185.00, partD: 35.30 },
    { maxMAGI: 200000,   partB: 295.90, partD: 57.00 },
    { maxMAGI: 499999,   partB: 406.90, partD: 78.60 },
    { maxMAGI: Infinity, partB: 443.90, partD: 85.80 },
  ],
  mfj: [
    { maxMAGI: 212000,   partB: 0,      partD: 0     },
    { maxMAGI: 266000,   partB: 74.00,  partD: 13.70 },
    { maxMAGI: 334000,   partB: 185.00, partD: 35.30 },
    { maxMAGI: 400000,   partB: 295.90, partD: 57.00 },
    { maxMAGI: 749999,   partB: 406.90, partD: 78.60 },
    { maxMAGI: Infinity, partB: 443.90, partD: 85.80 },
  ],
};

// IRMAA 2026 (based on 2024 MAGI, $202.90 standard Part B)
// 2026 amounts as recalled from the CMS announcement: VERIFY before relying on them (the previous table had guessed middle tiers: thresholds 164,000/191,000 and Part D 36.30/58.20/80.10).
const IRMAA_2026 = {
  single: [
    { maxMAGI: 109000,   partB: 0,      partD: 0     },
    { maxMAGI: 137000,   partB: 81.20,  partD: 14.50 },
    { maxMAGI: 171000,   partB: 202.90, partD: 37.50 },
    { maxMAGI: 205000,   partB: 324.60, partD: 60.40 },
    { maxMAGI: 499999,   partB: 446.30, partD: 83.30 },
    { maxMAGI: Infinity, partB: 487.00, partD: 91.00 },
  ],
  mfj: [
    { maxMAGI: 218000,   partB: 0,      partD: 0     },
    { maxMAGI: 274000,   partB: 81.20,  partD: 14.50 },
    { maxMAGI: 342000,   partB: 202.90, partD: 37.50 },
    { maxMAGI: 410000,   partB: 324.60, partD: 60.40 },
    { maxMAGI: 749999,   partB: 446.30, partD: 83.30 },
    { maxMAGI: Infinity, partB: 487.00, partD: 91.00 },
  ],
};

// IRS Uniform Lifetime Table (SECURE 2.0, for RMD calculation from age 73)
// IRS Uniform Lifetime Table (effective 2022). Ages 72 (born 1950 or earlier) and 101–120+ were missing, so age 72 silently used the age-100 divisor (a $1,000,000 balance gave $156,250).
const ULT = {
  72:27.4, 73:26.5, 74:25.5, 75:24.6, 76:23.7, 77:22.9, 78:22.0, 79:21.1,
  80:20.2, 81:19.4, 82:18.5, 83:17.7, 84:16.8, 85:16.0, 86:15.2,
  87:14.4, 88:13.7, 89:12.9, 90:12.2, 91:11.5, 92:10.8, 93:10.1,
  94:9.5,  95:8.9,  96:8.4,  97:7.8,  98:7.3,  99:6.8,  100:6.4,
  101:6.0, 102:5.6, 103:5.2, 104:4.9, 105:4.6, 106:4.3, 107:4.1, 108:3.9, 109:3.7, 110:3.5,
  111:3.4, 112:3.3, 113:3.1, 114:3.0, 115:2.9, 116:2.8, 117:2.7, 118:2.5, 119:2.3, 120:2.0,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function filingKey(status) {
  if (!status) return 'single';
  const s = status.toLowerCase();
  if (s.includes('jointly') || s.includes('surviving spouse')) return 'mfj';
  if (s.includes('separately')) return 'mfs';
  if (s.includes('household')) return 'hoh';
  return 'single';
}

const DEFAULT_YEAR = new Date().getFullYear();

// -- Tax-law versioning ----------------------------------------------------------------------------------------------------------------------
// Years with official tables. Any other year is REJECTED by calcFullFederalTax unless the caller asks for a planning SCENARIO ({ scenario: true }); a scenario holds the latest dollar
// figures (no inflation indexing), REMOVES provisions on their scheduled end dates, and says so in `scope` / `lawAssumptions`. (Unknown years used to silently reuse 2026 - including
// every temporary provision - and be labelled with the requested year.)
export const SUPPORTED_TAX_YEARS = [2024, 2025, 2026];
export class TaxYearNotSupportedError extends Error {
  constructor(year) { super(`No official tax tables for ${year}. Supported years: ${SUPPORTED_TAX_YEARS.join(', ')}. For a planning scenario pass { scenario: true } and review the stated assumptions.`); this.name = 'TaxYearNotSupportedError'; this.code = 'TAX_YEAR_UNSUPPORTED'; this.year = year; }
}
export const LAW_PROVISIONS = [
  { id: 'tips',      label: 'Qualified tips deduction',          from: 2025, through: 2028 },
  { id: 'overtime',  label: 'Qualified overtime deduction',      from: 2025, through: 2028 },
  { id: 'senior',    label: 'Senior deduction ($6,000)',         from: 2025, through: 2028 },
  { id: 'auto_loan', label: 'Auto-loan interest deduction',      from: 2025, through: 2028 },
  { id: 'salt_cap',  label: 'SALT cap of about $40,000 (1% a year)', from: 2025, through: 2029, then: 'The SALT cap reverts to $10,000 in 2030.' },
  { id: 'ev_credit', label: 'Clean-vehicle credit (section 30D)',       from: 2000, through: 2025 },
  { id: 'energy',    label: 'Home-energy credits (sections 25C/25D)',   from: 2000, through: 2025 },
];
export function taxOptionsFor(year) { return SUPPORTED_TAX_YEARS.includes(year) ? {} : { scenario: true }; }
export function getLawAssumptions(year) {
  const supported = SUPPORTED_TAX_YEARS.includes(year), latest = Math.max(...SUPPORTED_TAX_YEARS);
  return {
    year, supported, parametersYear: supported ? year : latest,
    inEffect: LAW_PROVISIONS.filter(x => x.from <= year && year <= x.through).map(x => x.label),
    expired: LAW_PROVISIONS.filter(x => x.through < year).map(x => x.label),
    assumptions: supported ? [] : [
      `Dollar figures (brackets, standard deduction, thresholds) are held at ${latest} levels - no inflation indexing.`,
      'Provisions scheduled to end before this year are removed (listed in "expired").',
      'No future legislation is assumed.' ],
  };
}
let _quietWarn = false;
function _scenarioSalt(y) {          // OBBBA: cap and threshold grow 1% a year through 2029, then the cap reverts to $10,000 with no phase-down
  if (y <= 2026) return {};
  if (y >= 2030) return { saltCap: 10000, saltPhaseoutStart: 0 };
  const g = Math.pow(1.01, y - 2025); return { saltCap: Math.round(40000 * g), saltPhaseoutStart: Math.round(500000 * g) };
}

export function getBracketsForYear(year = DEFAULT_YEAR) {
  if (BRACKETS_BY_YEAR[year]) return { year, parametersYear: year, ...BRACKETS_BY_YEAR[year] };
  const known = Object.keys(BRACKETS_BY_YEAR).map(Number).sort((a,b) => b-a);
  const fallback = known[0];
  if (!_quietWarn) console.warn(`taxEngine: no tax tables for ${year}; holding ${fallback} dollar figures (scenario)`);
  // The year stays the REQUESTED year so scheduled expirations apply; only the dollar tables are held at the latest known year.
  return { ...BRACKETS_BY_YEAR[fallback], year, parametersYear: fallback, ..._scenarioSalt(year) };
}

function calcBracketTax(taxable, brackets) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

// ─── INDIVIDUAL COMPUTATIONS ──────────────────────────────────────────────────

export function calcOrdinaryTax(ordinaryTaxableIncome, filingStatus, year = DEFAULT_YEAR) {
  const { ordinary } = getBracketsForYear(year);
  const fk = filingKey(filingStatus);
  return calcBracketTax(Math.max(0, ordinaryTaxableIncome), ordinary[fk] || ordinary.single);
}

export function calcLTCGTax(ltcgAndQD, ordinaryTaxableIncome, filingStatus, year = DEFAULT_YEAR) {
  if (ltcgAndQD <= 0) return 0;
  const { ltcg } = getBracketsForYear(year);
  const fk = filingKey(filingStatus);
  const brackets = ltcg[fk] || ltcg.single;
  // LTCG stacks on top of ordinary — find where ordinary income puts us in the LTCG brackets
  const totalTaxable   = ordinaryTaxableIncome + ltcgAndQD;
  const taxOnTotal     = calcBracketTax(totalTaxable, brackets);
  const taxOnOrdinary  = calcBracketTax(ordinaryTaxableIncome, brackets);
  return Math.max(0, taxOnTotal - taxOnOrdinary);
}

export function calcDepreciationRecaptureTax(unrecaptured1250Gain) {
  // §1250 unrecaptured depreciation on real property taxed at max 25% rate
  return Math.max(0, unrecaptured1250Gain) * 0.25;
}

export function calcSETax(netSEIncome, year = DEFAULT_YEAR) {
  if (netSEIncome <= 0) return { seTax: 0, seDeduction: 0 };
  const netEarnings = netSEIncome * 0.9235; // net earnings from self-employment
  const wageBase    = SS_WAGE_BASE[year] || SS_WAGE_BASE[2026];   // unknown year: the latest known base (was 2025)
  const ssTax = Math.min(netEarnings, wageBase) * SE_TAX_RATE;
  const medicareTax = netEarnings > wageBase
    ? (netEarnings - wageBase) * SE_TAX_RATE_ABOVE
    : 0;
  const seTax = Math.round(ssTax + medicareTax);
  return { seTax, seDeduction: Math.round(seTax * 0.5) };
}

export function calcNIIT(netInvestmentIncome, magi, filingStatus) {
  const threshold = NIIT_THRESHOLDS[filingKey(filingStatus)] || NIIT_THRESHOLDS.single;
  const excessMAGI = Math.max(0, magi - threshold);
  // IRC §1411: 3.8% of the LESSER of net investment income or MAGI over the threshold — and never negative. A net investment LOSS (rental loss, capital loss) used to produce a negative
  // NIIT that reduced total tax (a $3,000 capital loss took $114 off the bill; a $22,500 rental loss took $855).
  return Math.round(Math.max(0, Math.min(netInvestmentIncome, excessMAGI)) * NIIT_RATE);
}

export function calcAdditionalMedicareTax(wages, businessIncome, magi, filingStatus) {
  // IRC §3101(b)(2) / Form 8959: 0.9% of WAGES over the threshold plus SELF-EMPLOYMENT earnings over the threshold reduced by wages. Investment income and gains are not
  // subject to it. (This once taxed MAGI over the threshold: wages $100,000 plus a $1,000,000 gain was charged $8,100.) `magi` is kept only for call compatibility.
  const threshold = ADDL_MEDICARE_THRESHOLDS[filingKey(filingStatus)];
  const w  = Math.max(0, wages || 0);
  const se = Math.max(0, (businessIncome || 0) * 0.9235);
  return Math.round((Math.max(0, w - threshold) + Math.max(0, se - Math.max(0, threshold - w))) * ADDL_MEDICARE_RATE);
}

export function calcAMT(taxableIncome, regularTax, filingStatus, year = DEFAULT_YEAR, opts = {}) {
  const { amt } = getBracketsForYear(year);
  if (!amt) return { amtLiability: 0, tentativeMinTax: 0 };
  const fk = filingKey(filingStatus);

  let exemption = amt.exemption[fk] || amt.exemption.single;
  const phaseoutStart = amt.phaseout[fk] || amt.phaseout.single;
  const phaseoutRate  = amt.phaseoutRate || 0.25;

  // Phase out exemption
  // AMTI = taxable income + ISO spread + the deduction AMT disallows (the standard deduction, or SALT for an itemizer; §56(b)(1)).
  const amtIncome = taxableIncome + (opts.iso || 0) + (opts.addBack || 0);
  const phaseoutReduction = Math.max(0, (amtIncome - phaseoutStart) * phaseoutRate);
  exemption = Math.max(0, exemption - phaseoutReduction);

  const amtTaxableIncome = Math.max(0, amtIncome - exemption);
  const breakpoint = fk === 'mfs' ? amt.breakpoint / 2 : amt.breakpoint;
  const tax2628 = x => Math.min(x, breakpoint) * amt.rate1 + Math.max(0, x - breakpoint) * amt.rate2;
  let tentativeMinTax = tax2628(amtTaxableIncome);
  // Form 6251 Part III: long-term gains and qualified dividends keep their 0/15/20% rates inside the AMT. Applying 26%/28% to them (as this once did) produced a phantom
  // AMT bill on any capital-gain-heavy return (a $600,000 gain with no wages was charged $51,213 of AMT). The result is the smaller of the two computations.
  const gains = Math.min(Math.max(0, opts.qualifiedGains || 0), amtTaxableIncome);
  if (gains > 0) {
    const ordinaryPart = amtTaxableIncome - gains;
    tentativeMinTax = Math.min(tentativeMinTax, tax2628(ordinaryPart) + calcLTCGTax(gains, ordinaryPart, filingStatus, year));
  }

  return {
    amtLiability:    Math.round(Math.max(0, tentativeMinTax - regularTax)),
    tentativeMinTax: Math.round(tentativeMinTax),
  };
}

// calcQBIDeduction — §199A Qualified Business Income Deduction
// Supports three tiers:
//   1. Below threshold: 20% of QBI (no restriction)
//   2. In phase-out range: linearly reduced 20% → 0
//   3. Above ceiling for SSTBs: $0 (fully eliminated)
//   4. Above ceiling for non-SSTBs: 50% of W-2 wages OR 25% W-2 + 2.5% UBIA
//
// Specified Service Trade or Business (SSTB): health, law, accounting, actuarial,
// performing arts, consulting, athletics, financial services, investing.
// CPAs and RIAs are BOTH SSTBs — their QBI deduction phases out completely.
//
// isSSBT   {boolean} — true for CPAs, lawyers, doctors, consultants, etc.
// w2Wages  {number}  — W-2 wages paid by the business (for non-SSTB limitation)
// ubiaProp {number}  — unadjusted basis of qualified property (typically 0 for service firms)
function _calcQBICore(
  businessIncome,
  taxableIncomeBeforeQBI,
  filingStatus,
  year       = DEFAULT_YEAR,
  isSSBT     = false,
  w2Wages    = 0,
  ubiaProp   = 0,
) {
  if (businessIncome <= 0) return 0;
  const fk  = filingKey(filingStatus);
  const qbi = QBI_THRESHOLDS[year] || QBI_THRESHOLDS[2026];   // unknown year: the latest table (it fell back to 2025 while brackets fell back to 2026)
  const threshold  = fk === 'mfj' ? qbi.mfj             : qbi.other;
  const phaseRange = fk === 'mfj' ? qbi.phaseRange.mfj  : qbi.phaseRange.other;
  const ceiling    = threshold + phaseRange;  // above this: SSTB gets $0, non-SSTB gets limited deduction
  const maxQBI     = businessIncome * 0.20;

  // Below threshold: straightforward 20% of QBI
  if (taxableIncomeBeforeQBI <= threshold) {
    return Math.round(Math.min(maxQBI, taxableIncomeBeforeQBI * 0.20));
  }

  const phaseoutFraction = Math.min(1, (taxableIncomeBeforeQBI - threshold) / phaseRange);

  // Above ceiling
  if (taxableIncomeBeforeQBI >= ceiling) {
    // SSTBs: deduction fully eliminated above ceiling
    if (isSSBT) return 0;
    // Non-SSTBs: limited to greater of (50% W-2 wages) or (25% W-2 + 2.5% UBIA)
    const w2Limit   = w2Wages * 0.50;
    const ubiaLimit = w2Wages * 0.25 + ubiaProp * 0.025;
    const limitation = Math.max(w2Limit, ubiaLimit);
    return Math.round(Math.min(maxQBI, limitation));
  }

  // In phase-out range
  if (isSSBT) {
    // SSTB: entire deduction phases out proportionally
    return Math.round(Math.max(0, maxQBI * (1 - phaseoutFraction)));
  }

  // Non-SSTB in phase-out range: blend between unrestricted and W-2/UBIA limitation
  const unrestricted = maxQBI;
  const w2Limit      = w2Wages * 0.50;
  const ubiaLimit    = w2Wages * 0.25 + ubiaProp * 0.025;
  const limitation   = Math.max(w2Limit, ubiaLimit);
  const limitedAmt   = Math.min(maxQBI, limitation);
  const blended      = unrestricted + (limitedAmt - unrestricted) * phaseoutFraction;
  return Math.round(Math.max(0, blended));
}

/** IRC §199A. The deduction can never exceed 20% of (taxable income before QBI MINUS net capital gain, incl. qualified dividends) — a limit that was missing, so any investor with
 *  business income got too large a deduction. `netCapitalGain` is optional (default 0 = old behaviour). */
export function calcQBIDeduction(businessIncome, taxableIncomeBeforeQBI, filingStatus, year = DEFAULT_YEAR, isSSBT = false, w2Wages = 0, ubiaProp = 0, netCapitalGain = 0) {
  const core = _calcQBICore(businessIncome, taxableIncomeBeforeQBI, filingStatus, year, isSSBT, w2Wages, ubiaProp);
  return Math.min(core, Math.round(0.20 * Math.max(0, taxableIncomeBeforeQBI - Math.max(0, netCapitalGain))));
}

export function calcChildTaxCredit(children, magi, filingStatus, year = DEFAULT_YEAR) {
  if (children <= 0) return 0;
  const { ctcPerChild } = getBracketsForYear(year);
  const ctcAmount = ctcPerChild || 2000;
  const phaseoutStart = filingKey(filingStatus) === 'mfj' ? 400000 : 200000;
  const excessIncome  = Math.max(0, magi - phaseoutStart);
  const reductionUnits = Math.ceil(excessIncome / 1000);   // IRC §24(b)(1): $50 for each $1,000 (or fraction thereof) over the threshold (this was 2,500 — it removed only 40% of the phase-out)
  return Math.max(0, children * ctcAmount - reductionUnits * 50);
}

/**
 * Full Social Security taxability using the IRS provisional income method.
 * Returns the taxable portion of SS benefits.
 *
 * Provisional income = AGI (ex-SS) + tax-exempt interest + 50% of SS benefits
 * - Below base amount:  0% included
 * - Between base and threshold: up to 50% included
 * - Above threshold: up to 85% included
 */
export function calcTaxableSocialSecurity(ssBenefits, agiExcludingSS, taxExemptInterest, filingStatus) {
  if (ssBenefits <= 0) return 0;
  const fk = filingKey(filingStatus);
  const isMFJ = fk === 'mfj';

  const provisionalIncome = agiExcludingSS + taxExemptInterest + ssBenefits * 0.5;
  const base      = isMFJ ? 32000 : 25000;
  const threshold = isMFJ ? 44000 : 34000;

  if (provisionalIncome <= base) return 0;

  if (provisionalIncome <= threshold) {
    return Math.min(ssBenefits * 0.50, (provisionalIncome - base) * 0.50);
  }

  // Above threshold: 85 cents of every dollar above threshold is taxable,
  // plus 50% of the income between base and threshold amounts
  const midTierAmount = (threshold - base) * 0.50;
  const aboveThreshold = (provisionalIncome - threshold) * 0.85;
  return Math.min(ssBenefits * 0.85, midTierAmount + aboveThreshold);
}

export function calcIRMAA(magiTwoYearsAgo, filingStatus, year = DEFAULT_YEAR) {
  const table = year >= 2026 ? IRMAA_2026 : IRMAA_2025;
  const fk    = filingKey(filingStatus) === 'mfj' ? 'mfj' : 'single';
  const tiers = table[fk];
  const tier  = tiers.find(t => magiTwoYearsAgo <= t.maxMAGI) || tiers[tiers.length - 1];
  return {
    partBSurcharge: tier.partB,
    partDSurcharge: tier.partD,
    annualSurcharge: Math.round((tier.partB + tier.partD) * 12),
    twoYearLookbackMAGI: magiTwoYearsAgo,
  };
}

/** Uniform Lifetime Table RMD. SECURE 2.0: RMDs start at 73 (born 1951-1959) or 75 (born 1960 or later); 72 for those born 1950 or earlier. Without `birthYear` it assumes 73. */
export function calcRMD(accountBalance, age, birthYear) {
  const startAge = birthYear == null ? 73 : birthYear >= 1960 ? 75 : birthYear >= 1951 ? 73 : 72;
  if (age < startAge || accountBalance <= 0) return 0;
  const factor = ULT[Math.min(age, 120)] || ULT[120];
  return Math.round(accountBalance / factor);
}

export function getStandardDeduction(filingStatus, year = DEFAULT_YEAR, opts = {}) {
  const { standardDeduction, agedBlindAddition } = getBracketsForYear(year);
  const fk   = filingKey(filingStatus);
  let base   = standardDeduction[fk] || standardDeduction.single;
  const add  = agedBlindAddition ? (agedBlindAddition[fk] || agedBlindAddition.single) : 0;
  if (opts.aged)             base += add;
  if (opts.blind)            base += add;
  if (opts.spouseAgedOrBlind && fk === 'mfj') base += add;
  return base;
}

// ── OBBBA below-the-line DEDUCTIONS (2025–2028) ────────────────────────────────────────────────────────────────────────────────────────────────
// These are deductions, NOT exclusions from income: they do not reduce AGI (so AGI-based phase-outs and the Social Security / NIIT / SALT calculations are unaffected), they are
// available whether or not the taxpayer itemizes, they are capped, and they are reduced as MAGI rises. (An earlier version subtracted the full amount from income with no cap or
// phase-out: $60,000 of overtime added no tax at all.) Tips and overtime are not available to married individuals filing separately.
const _obbbaYear = y => y >= 2025 && y <= 2028;
const _phaseoutUnits = (magi, start) => Math.ceil(Math.max(0, magi - start) / 1000);          // "for each $1,000 (or fraction thereof)"
/** IRC §224: qualified tips — max $25,000 per return; reduced by $100 per $1,000 of MAGI over $150,000 ($300,000 joint). */
export function calcTipsDeduction(qualifiedTips, magi, filingStatus, year = DEFAULT_YEAR) {
  const fk = filingKey(filingStatus);
  if (!_obbbaYear(year) || fk === 'mfs' || !(qualifiedTips > 0)) return 0;
  return Math.max(0, Math.min(qualifiedTips, 25000) - 100 * _phaseoutUnits(magi, fk === 'mfj' ? 300000 : 150000));
}
/** IRC §225: qualified overtime compensation (the premium "half" of time-and-a-half) — max $12,500 ($25,000 joint); same phase-out as tips. */
export function calcOvertimeDeduction(qualifiedOvertime, magi, filingStatus, year = DEFAULT_YEAR) {
  const fk = filingKey(filingStatus);
  if (!_obbbaYear(year) || fk === 'mfs' || !(qualifiedOvertime > 0)) return 0;
  return Math.max(0, Math.min(qualifiedOvertime, fk === 'mfj' ? 25000 : 12500) - 100 * _phaseoutUnits(magi, fk === 'mfj' ? 300000 : 150000));
}
/** IRC §163(h)(4): interest on a qualifying new-vehicle loan — max $10,000; reduced by $200 per $1,000 of MAGI over $100,000 ($200,000 joint). Allowed without itemizing. */
export function calcAutoLoanDeduction(vehicleLoanInterest, magi, filingStatus, year = DEFAULT_YEAR) {
  const fk = filingKey(filingStatus);
  if (!_obbbaYear(year) || !(vehicleLoanInterest > 0)) return 0;
  return Math.max(0, Math.min(vehicleLoanInterest, 10000) - 200 * _phaseoutUnits(magi, fk === 'mfj' ? 200000 : 100000));
}

/**
 * OBBBA Senior Deduction: additional $6,000 for taxpayers age 65+
 * Phases out at $75k MAGI (single) / $150k MAGI (MFJ)
 * Available 2025–2028 only.
 */
export function calcSeniorDeduction(magi, filingStatus, year = DEFAULT_YEAR, aged = false, qualifiers = 1) {
  // OBBBA §70103 (2025–2028): $6,000 per qualifying individual age 65+, reduced by 6% of
  // MAGI above $75,000 ($150,000 joint). Fully phased out at $175,000 / $250,000.
  // Each spouse's deduction is reduced by the full 6% of the excess; callers pass the
  // number of qualifying individuals (1 or 2).
  const { seniorDeduction, seniorDeductionPhaseout } = getBracketsForYear(year);
  if (!seniorDeduction || !aged || year < 2025 || year > 2028) return 0;
  if (filingKey(filingStatus) === 'mfs') return 0;     // a married individual must file jointly to claim it
  const fk    = filingKey(filingStatus);
  const start = fk === 'mfj' ? seniorDeductionPhaseout?.mfj : seniorDeductionPhaseout?.single;
  if (!start) return 0;
  const perPerson = Math.max(0, seniorDeduction - 0.06 * Math.max(0, magi - start));
  return Math.round(perPerson * Math.max(1, qualifiers));
}

/**
 * SALT deduction: OBBBA raised cap to $40,000 (2025-2029) with phase-down above $500k MAGI.
 * Phase-down: cap reduces by $0.30 for each $1 of MAGI above $500k.
 */
export function calcSALTDeduction(stateLocalTaxesPaid, magi, year = DEFAULT_YEAR, filingStatus = 'Single') {
  const t = getBracketsForYear(year);
  const half = filingKey(filingStatus) === 'mfs' ? 0.5 : 1;          // married filing separately: half the cap, half the threshold, half the floor
  const cap = (t.saltCap || 10000) * half;
  const saltPhaseoutStart = t.saltPhaseoutStart ? t.saltPhaseoutStart * half : 0;
  if (!saltPhaseoutStart || magi <= saltPhaseoutStart) {
    return Math.min(stateLocalTaxesPaid, cap);
  }
  const reduction = Math.min(cap, (magi - saltPhaseoutStart) * 0.30);
  const effectiveCap = Math.max(10000 * half, cap - reduction); // never goes below the old TCJA $10k cap ($5k MFS)
  return Math.min(stateLocalTaxesPaid, effectiveCap);
}

/**
 * Quarterly estimated tax safe harbor calculation.
 * Returns the four quarterly payment amounts to avoid underpayment penalty.
 *
 * Safe harbor: pay 100% of prior year tax (110% if prior year AGI > $150k)
 * OR 90% of current year liability — whichever is smaller.
 *
 * @param {number} priorYearTax    — total federal tax from prior return
 * @param {number} priorYearAGI    — AGI from prior return
 * @param {number} currentYearTax  — estimated current year total tax
 * @param {number} withholdingYTD  — W-2/1099 withholding expected this year
 */
export function calcEstimatedTaxPayments(priorYearTax, priorYearAGI, currentYearTax, withholdingYTD = 0) {
  const safeHarborRate  = priorYearAGI > 150000 ? 1.10 : 1.00;
  const safeHarborTotal = priorYearTax * safeHarborRate;
  const ninetyPct       = currentYearTax * 0.90;
  const requiredTotal   = Math.min(safeHarborTotal, ninetyPct);
  const remainingAfterW2 = Math.max(0, requiredTotal - withholdingYTD);
  const quarterlyAmount  = Math.round(remainingAfterW2 / 4);
  return {
    requiredAnnualPayment: Math.round(requiredTotal),
    safeHarborAmount:      Math.round(safeHarborTotal),
    ninetyPercentAmount:   Math.round(ninetyPct),
    remainingAfterWithholding: Math.round(remainingAfterW2),
    q1: quarterlyAmount,
    q2: quarterlyAmount,
    q3: quarterlyAmount,
    q4: Math.round(remainingAfterW2) - quarterlyAmount * 3, // true-up for rounding
  };
}

export function getMarginalRate(taxableIncome, filingStatus, year = DEFAULT_YEAR) {
  const { ordinary } = getBracketsForYear(year);
  const brackets = ordinary[filingKey(filingStatus)] || ordinary.single;
  const bracket  = brackets.find(([lim]) => taxableIncome <= lim);
  return bracket ? bracket[1] : .37;
}

export function getBracketHeadroom(taxableIncome, filingStatus, year = DEFAULT_YEAR) {
  const { ordinary } = getBracketsForYear(year);
  const brackets = ordinary[filingKey(filingStatus)] || ordinary.single;
  const bracket  = brackets.find(([lim]) => taxableIncome <= lim);
  return bracket ? Math.max(0, bracket[0] - taxableIncome) : 0;
}

/**
 * Roth conversion optimizer.
 * Given current taxable income, returns:
 *   - headroom until next bracket
 *   - federal tax cost of converting various amounts
 *   - whether conversion triggers IRMAA tier
 *   - whether conversion triggers NIIT
 *
 * @param {number} currentTaxableIncome
 * @param {number} currentMagi
 * @param {string} filingStatus
 * @param {number} [year]
 */
export function analyzeRothConversion(currentTaxableIncome, currentMagi, filingStatus, year = DEFAULT_YEAR) {
  const headroom    = getBracketHeadroom(currentTaxableIncome, filingStatus, year);
  const marginalRate = getMarginalRate(currentTaxableIncome, filingStatus, year);

  // Model three conversion amounts: fill bracket, half bracket, 2x bracket
  const scenarios = [
    { label: `Fill ${Math.round(marginalRate * 100)}% bracket`,   amount: headroom },
    { label: 'Partial — $25k',     amount: 25000 },
    { label: 'Partial — $50k',     amount: 50000 },
    { label: 'Partial — $100k',    amount: 100000 },
  ].filter(s => s.amount > 0 && Number.isFinite(s.amount)).map(s => {   // top bracket: the headroom is unbounded (Infinity), which used to produce a NaN scenario
    const newTaxableIncome = currentTaxableIncome + s.amount;
    const newMagi          = currentMagi + s.amount;
    const baseTax  = calcOrdinaryTax(currentTaxableIncome, filingStatus, year);
    const newTax   = calcOrdinaryTax(newTaxableIncome, filingStatus, year);
    const taxCost  = Math.round(newTax - baseTax);
    const effRate  = s.amount > 0 ? parseFloat((taxCost / s.amount * 100).toFixed(1)) : 0;
    const crossesBracket = getMarginalRate(newTaxableIncome, filingStatus, year) > marginalRate;

    return {
      ...s,
      taxCost,
      effectiveConversionRate: effRate,
      crossesBracket,
      newMarginalRate: getMarginalRate(newTaxableIncome, filingStatus, year),
      niitTriggered: newMagi > (NIIT_THRESHOLDS[filingKey(filingStatus)] || 200000),
    };
  });

  return {
    currentMarginalRate: marginalRate,
    bracketHeadroom: headroom,
    scenarios,
  };
}

// ─── MASTER ENTRY POINT ───────────────────────────────────────────────────────

/**
 * calcFullFederalTax — single entry point for the projection UI.
 *
 * @param {object} inputs
 * @param {number}  inputs.wages
 * @param {number}  inputs.businessIncome       — net Schedule C / partnership
 * @param {number}  inputs.ordinaryDividends
 * @param {number}  inputs.qualifiedDividends    — subset of ordinaryDividends
 * @param {number}  inputs.interestIncome
 * @param {number}  inputs.taxExemptInterest     — for SS provisional income calc
 * @param {number}  inputs.ltcg                 — long-term capital gains
 * @param {number}  inputs.stcg                 — short-term capital gains (ordinary)
 * @param {number}  inputs.rentalIncome
 * @param {number}  inputs.unrecaptured1250Gain  — §1250 depreciation recapture
 * @param {number}  inputs.socialSecurity        — gross SS benefits received
 * @param {number}  inputs.otherIncome
 * @param {number}  inputs.rmdIncome             — from calcRMD, if from traditional IRA
 * @param {number}  inputs.tipIncome             — OBBBA exclusion if applicable
 * @param {number}  inputs.overtimeIncome        — OBBBA exclusion if applicable
 * @param {string}  inputs.filingStatus
 * @param {number}  inputs.itemizedDeductions    — before SALT; pass 0 for standard deduction
 * @param {number}  inputs.stateLocalTaxesPaid   — actual SALT paid (engine applies cap)
 * @param {number}  inputs.vehicleLoanInterest   — for OBBBA auto loan deduction
 * @param {number}  inputs.children
 * @param {number}  inputs.isoSpread             — AMT preference item
 * @param {number}  inputs.capitalLossCarryforward — from prior year(s)
 * @param {number}  inputs.nolCarryforward       — net operating loss from prior year(s)
 * @param {number}  inputs.magiTwoYearsAgo       — for IRMAA (Medicare clients)
 * @param {boolean} inputs.onMedicare
 * @param {boolean} inputs.aged                  — taxpayer age 65+
 * @param {boolean} inputs.blind
 * @param {boolean} inputs.spouseAgedOrBlind
 * @param {number}  [year]
 */

// ─── ENTITY-LEVEL CALCULATORS (NEW — from Red Five 2026 Model) ─────────────────

// ── Form 1041: Estate & Trust ─────────────────────────────────────────────────
// Income-tax brackets for estates and trusts, 2025 (Rev. Proc. 2024-40). These were labelled 2026. No 2026 table is held: other years are flagged as estimates.
const TRUST_BRACKETS_2025 = [[3150,.10],[11450,.24],[15650,.35],[Infinity,.37]];
// Capital-gain / qualified-dividend thresholds for estates and trusts, 2025: 0% to $3,250; 15% to $15,900; 20% above. (The old table reused the ordinary bracket tops 3,150 / 15,650.)
const TRUST_LTCG_2025 = [[3250,0],[15900,.15],[Infinity,.20]];

export function calc1041Tax(inputs = {}) {
  const {
    interestIncome       = 0,
    ordinaryDividends    = 0,
    qualifiedDividends   = 0,
    businessIncome       = 0,  // K-1 pass-through
    rentalIncome         = 0,
    stcg                 = 0,
    ltcg                 = 0,
    capitalLossCarryforward = 0,
    otherIncome          = 0,
    fiduciaryFees        = 0,
    attorneyFees         = 0,
    charityContributions = 0,  // IRC §642(c)
    interestExpense      = 0,
    taxPrepFees          = 0,
    otherDeductions      = 0,
    exemption            = 600,  // Estate=$600 | Simple Trust=$300 | Complex=$100
    distributionDeduction = 0,   // Lesser of DNI or actual distributions
    estimatedPayments    = 0,
    entityType           = 'Estate',  // 'Estate' | 'Trust'
  } = inputs;

  const netLTCG = Math.max(0, ltcg - Math.max(0, capitalLossCarryforward));
  const totalIncome = interestIncome + ordinaryDividends + businessIncome
    + rentalIncome + stcg + netLTCG + otherIncome;

  const totalDeductions = fiduciaryFees + attorneyFees + charityContributions
    + interestExpense + taxPrepFees + otherDeductions
    + exemption + distributionDeduction;

  const taxableIncome = Math.max(0, totalIncome - totalDeductions);

  // Ordinary income tax on trust/estate brackets
  const qualDivAndLTCG = Math.min(Math.max(0, qualifiedDividends + netLTCG), taxableIncome);
  const ordinaryTaxable = Math.max(0, taxableIncome - qualDivAndLTCG);
  let ordinaryTax = calcBracketTax(ordinaryTaxable, TRUST_BRACKETS_2025);
  // gains stack on top of ordinary income when finding their 0/15/20% band
  let ltcgTax     = calcBracketTax(ordinaryTaxable + qualDivAndLTCG, TRUST_LTCG_2025) - calcBracketTax(ordinaryTaxable, TRUST_LTCG_2025);

  // NIIT on a trust/estate (IRC §1411(a)(2)): 3.8% of the LESSER of its net investment income or its AGI above the point where the top bracket begins ($15,650 for 2025) — not the $3,150 top of the 10% bracket.
  const nii = interestIncome + ordinaryDividends + netLTCG + rentalIncome;
  const niitThreshold = TRUST_BRACKETS_2025[TRUST_BRACKETS_2025.length - 2][0];
  const niit = Math.max(0, Math.min(nii, taxableIncome + exemption - niitThreshold)) * 0.038;

  const grossTax = ordinaryTax + ltcgTax + niit;
  const netTax   = Math.max(0, grossTax);
  const balanceDue = netTax - estimatedPayments;

  return {
    parametersYear: 2025, parametersEstimated: (inputs.year ?? DEFAULT_YEAR) !== 2025,   // trust tables held for 2025 only
    totalIncome, totalDeductions, taxableIncome,
    ordinaryTax:  Math.round(ordinaryTax),
    ltcgTax:      Math.round(ltcgTax),
    niit:         Math.round(niit),
    grossTax:     Math.round(grossTax),
    netTax:       Math.round(netTax),
    estimatedPayments,
    balanceDue:   Math.round(balanceDue),
    effectiveRateOnIncome:   totalIncome  > 0 ? parseFloat((netTax / totalIncome  * 100).toFixed(2)) : 0,
    effectiveRateOnTaxable:  taxableIncome > 0 ? parseFloat((netTax / taxableIncome * 100).toFixed(2)) : 0,
    marginalRate: 0.37,  // Trust/estate reaches 37% very quickly
  };
}

// ── Form 1065: Partnership K-1 Allocation ────────────────────────────────────
export function calc1065Results(inputs = {}) {
  const {
    grossReceipts        = 0,
    costOfGoodsSold      = 0,
    interestIncome       = 0,
    dividendIncome       = 0,
    rentalRealEstate     = 0,
    stcg                 = 0,
    ltcg                 = 0,
    section1231          = 0,
    otherIncome          = 0,
    guaranteedPayments   = 0,
    salariesWages        = 0,
    repairs              = 0,
    badDebts             = 0,
    rentExpense          = 0,
    taxesLicenses        = 0,
    interestExpense      = 0,
    depreciation         = 0,
    depletion            = 0,
    employeeBenefits     = 0,
    otherDeductions      = 0,
    section179           = 0,     // Separately stated
    charityContributions = 0,     // Separately stated
    cashDistributions    = 0,
    numberOfPartners     = 1,
  } = inputs;

  const grossProfit = grossReceipts - Math.abs(costOfGoodsSold); // COGS entered as negative
  const totalExpenses = guaranteedPayments + salariesWages + repairs + badDebts
    + rentExpense + taxesLicenses + interestExpense + depreciation
    + depletion + employeeBenefits + otherDeductions;

  const ordinaryBusinessIncome = grossProfit - totalExpenses;

  // Separately stated Sch K items
  const separately = {
    interestIncome, dividendIncome, rentalRealEstate,
    stcg, ltcg, section1231, section179: -section179, charityContributions: -charityContributions,
  };

  const qbiBase = ordinaryBusinessIncome + rentalRealEstate;
  const totalK1  = ordinaryBusinessIncome + interestIncome + dividendIncome
    + rentalRealEstate + stcg + ltcg - section179 - charityContributions;

  const perPartnerOrdinary = numberOfPartners > 0 ? ordinaryBusinessIncome / numberOfPartners : 0;
  const perPartnerDistribution = numberOfPartners > 0 ? cashDistributions / numberOfPartners : 0;

  return {
    grossReceipts, costOfGoodsSold, grossProfit,
    totalExpenses, ordinaryBusinessIncome,
    separately, qbiBase, totalK1,
    seEarnings: ordinaryBusinessIncome,  // General partners: full amount is SE income
    numberOfPartners,
    perPartner: {
      ordinaryIncome:   Math.round(perPartnerOrdinary),
      seEarnings:       Math.round(perPartnerOrdinary),
      cashDistribution: Math.round(perPartnerDistribution),
    },
    entityTax: 'N/A (pass-through)',
    note: 'All income flows through to partners via K-1. No entity-level federal income tax.',
  };
}

// ── Form 1120: C-Corporation ─────────────────────────────────────────────────
export function calc1120Tax(inputs = {}) {
  const {
    grossReceipts        = 0,
    costOfGoodsSold      = 0,
    interestIncome       = 0,
    dividendIncome       = 0,
    dividendsReceivedPct = 0.50,  // DRD: 50%/65%/100% by ownership
    rentalIncome         = 0,
    capitalGain          = 0,     // C-corps: no preferential rate
    otherIncome          = 0,
    officerComp          = 0,
    salariesWages        = 0,
    repairs              = 0,
    badDebts             = 0,
    rentExpense          = 0,
    taxesLicenses        = 0,
    interestExpense      = 0,
    depreciation         = 0,
    advertising          = 0,
    employeeBenefits     = 0,
    charityContributions = 0,
    otherDeductions      = 0,
    generalBusinessCredits = 0,
    foreignTaxCredit     = 0,
    estimatedPayments    = 0,
    plannedDividend      = 0,     // Distribution to shareholders
  } = inputs;

  const grossProfit = grossReceipts - Math.abs(costOfGoodsSold);
  const drdDeduction = dividendIncome * dividendsReceivedPct;
  const grossIncome  = grossProfit + interestIncome + dividendIncome
    + rentalIncome + capitalGain + otherIncome;

  const totalDeductionsPreCharity = officerComp + salariesWages + repairs + badDebts
    + rentExpense + taxesLicenses + interestExpense + depreciation
    + advertising + employeeBenefits + otherDeductions;

  const incomeBeforeCharity = grossIncome - totalDeductionsPreCharity;
  const charityLimit = Math.max(0, incomeBeforeCharity * 0.10);  // Capped at 10% of income
  const charityDed   = Math.min(charityContributions, charityLimit);

  const taxableIncome = Math.max(0, incomeBeforeCharity - charityDed - drdDeduction);

  const corporateTax = taxableIncome * 0.21;  // Flat 21% TCJA rate
  const credits = generalBusinessCredits + foreignTaxCredit;
  const netTax  = Math.max(0, corporateTax - credits);
  const balanceDue = netTax - estimatedPayments;

  // Double-taxation analysis
  const shareholderTaxOnDividend = plannedDividend * 0.20;  // Est. 20% QDI rate
  const combinedTax = netTax + shareholderTaxOnDividend;

  return {
    grossIncome, grossProfit, taxableIncome,
    corporateTax:  Math.round(corporateTax),
    credits:       Math.round(credits),
    netTax:        Math.round(netTax),
    estimatedPayments,
    balanceDue:    Math.round(balanceDue),
    plannedDividend,
    shareholderTaxOnDividend: Math.round(shareholderTaxOnDividend),
    combinedTax:   Math.round(combinedTax),
    effectiveRate: taxableIncome > 0 ? 0.21 : 0,
    combinedRate:  taxableIncome > 0 ? parseFloat((combinedTax / taxableIncome).toFixed(4)) : 0,
    statutoryRate: 0.21,
  };
}

// ── Form 1120-S: S-Corporation K-1 Allocation ────────────────────────────────
export function calc1120SResults(inputs = {}) {
  // Identical structure to 1065 except: no SE tax on K-1 income;
  // officer comp (W-2) is the only wages subject to payroll tax.
  const {
    grossReceipts        = 0,
    costOfGoodsSold      = 0,
    interestIncome       = 0,
    dividendIncome       = 0,
    rentalRealEstate     = 0,
    stcg                 = 0,
    ltcg                 = 0,
    section1231          = 0,
    otherIncome          = 0,
    officerComp          = 0,   // W-2 to shareholder-employees — subject to payroll tax
    salariesWages        = 0,
    repairs              = 0,
    badDebts             = 0,
    rentExpense          = 0,
    taxesLicenses        = 0,
    interestExpense      = 0,
    depreciation         = 0,
    depletion            = 0,
    employeeBenefits     = 0,
    otherDeductions      = 0,
    section179           = 0,
    charityContributions = 0,
    cashDistributions    = 0,
    numberOfShareholders = 1,
  } = inputs;

  const grossProfit = grossReceipts - Math.abs(costOfGoodsSold);
  const totalExpenses = officerComp + salariesWages + repairs + badDebts
    + rentExpense + taxesLicenses + interestExpense + depreciation
    + depletion + employeeBenefits + otherDeductions;

  const ordinaryBusinessIncome = grossProfit - totalExpenses;
  const qbiBase = ordinaryBusinessIncome + rentalRealEstate;
  const totalK1 = ordinaryBusinessIncome + interestIncome + dividendIncome
    + rentalRealEstate + stcg + ltcg - section179 - charityContributions;

  const perShareholderOrdinary = numberOfShareholders > 0
    ? ordinaryBusinessIncome / numberOfShareholders : 0;
  const perShareholderOfficerW2 = numberOfShareholders > 0
    ? officerComp / numberOfShareholders : 0;
  const perShareholderDist = numberOfShareholders > 0
    ? cashDistributions / numberOfShareholders : 0;

  return {
    grossReceipts, costOfGoodsSold, grossProfit,
    totalExpenses, ordinaryBusinessIncome,
    qbiBase, totalK1,
    numberOfShareholders,
    perShareholder: {
      ordinaryIncome:   Math.round(perShareholderOrdinary),
      officerW2:        Math.round(perShareholderOfficerW2),
      cashDistribution: Math.round(perShareholderDist),
    },
    entityTax: 'N/A (pass-through)',
    note: 'S-Corps pay no entity-level federal income tax. Income flows via K-1 to shareholders. Reasonable officer W-2 compensation required.',
  };
}

// ─── ENHANCED 1040 HELPERS (from Red Five model) ──────────────────────────────

// Student loan interest — phases out $75K-$90K single / $155K-$185K MFJ (2026 est.)
// §221: $2,500 max; phased out over a MAGI range indexed yearly; not available to married individuals filing separately. 2026 figures: verify against Rev. Proc. 2025-32.
const _SLI = { 2023: { single: [75000, 90000], mfj: [155000, 185000] }, 2024: { single: [80000, 95000], mfj: [165000, 195000] },
               2025: { single: [85000, 100000], mfj: [170000, 200000] }, 2026: { single: [85000, 100000], mfj: [175000, 205000] } };
export function calcStudentLoanInterestDeduction(interest, magi, filingStatus, year = DEFAULT_YEAR) {
  const max = 2500;
  const fk  = filingKey(filingStatus);
  if (fk === 'mfs' || !(interest > 0)) return 0;
  const [low, high] = _SLI[Math.min(2026, Math.max(2023, year))][fk === 'mfj' ? 'mfj' : 'single'];
  if (magi >= high) return 0;
  if (magi <= low)  return Math.min(interest, max);
  const phasePct = (magi - low) / (high - low);
  return Math.round(Math.min(interest, max) * (1 - phasePct));
}

// Medical expense deduction — 7.5% AGI floor
export function calcMedicalDeduction(totalMedical, agi) {
  return Math.max(0, totalMedical - agi * 0.075);
}

// Charitable contribution deduction — cash limited to 60% AGI; non-cash 30%
export function calcCharityDeduction(cash, nonCash, agi) {
  const cashDed    = Math.min(cash, agi * 0.60);
  const nonCashDed = Math.min(nonCash, agi * 0.30);
  return cashDed + nonCashDed;
}

// Mortgage interest — capped at $750K acquisition debt
export function calcMortgageInterestDeduction(interest, loanBalance) {
  if (!loanBalance || loanBalance <= 750000) return interest;
  return interest * (750000 / loanBalance);
}

// Child & Dependent Care Credit
// 20%-35% of up to $3,000 (1 child) or $6,000 (2+) of qualified expenses
export function calcChildCareCredit(expenses, numChildren, agi) {
  if (numChildren === 0 || expenses === 0) return 0;
  const maxExpenses = numChildren === 1 ? 3000 : 6000;
  const eligible = Math.min(expenses, maxExpenses);
  // Credit rate: 35% at AGI ≤$15K, phases to 20% at AGI >$43K
  let rate = 0.35;
  if (agi > 15000) {
    rate = Math.max(0.20, 0.35 - Math.ceil((agi - 15000) / 2000) * 0.01);
  }
  return Math.round(eligible * rate);
}

// Education Credits — American Opportunity (up to $2,500) & Lifetime Learning ($2,000)
// Simplified: American Opportunity (first 4 years) = 100% first $2K + 25% next $2K
export function calcEducationCredit(expenses, isAmericanOpportunity = true, magi = 0, filingStatus = 'Single') {
  const fk = filingKey(filingStatus);
  if (isAmericanOpportunity) {
    // Phase-out: $80K-$90K single / $160K-$180K MFJ
    const [lo, hi] = fk === 'mfj' ? [160000, 180000] : [80000, 90000];
    if (magi >= hi) return 0;
    const creditFull = Math.min(expenses, 2000) + Math.min(Math.max(0, expenses - 2000), 2000) * 0.25;
    if (magi <= lo) return Math.round(creditFull);
    const phasePct = (magi - lo) / (hi - lo);
    return Math.round(creditFull * (1 - phasePct));
  } else {
    // Lifetime Learning: 20% of up to $10K
    const creditFull = Math.min(expenses, 10000) * 0.20;
    const [lo, hi] = fk === 'mfj' ? [160000, 180000] : [80000, 90000];
    if (magi >= hi) return 0;
    if (magi <= lo) return Math.round(creditFull);
    const phasePct = (magi - lo) / (hi - lo);
    return Math.round(creditFull * (1 - phasePct));
  }
}

// Saver's Credit (Retirement Savings Contributions Credit) — Form 8880
// §25B: 50% / 20% / 10% of up to $2,000 per person ($4,000 joint). AGI limits are indexed yearly (these were the 2023 figures, labelled "2026 est."). 2026: verify against IRS Notice 2025-67.
const _SAVERS = {
  2024: { single: [[23000, 0.50], [25000, 0.20], [38250, 0.10]], hoh: [[34500, 0.50], [37500, 0.20], [57375, 0.10]], mfj: [[46000, 0.50], [50000, 0.20], [76500, 0.10]] },
  2025: { single: [[23750, 0.50], [25500, 0.20], [39500, 0.10]], hoh: [[35625, 0.50], [38250, 0.20], [59250, 0.10]], mfj: [[47500, 0.50], [51000, 0.20], [79000, 0.10]] },
  2026: { single: [[24250, 0.50], [26250, 0.20], [40250, 0.10]], hoh: [[36375, 0.50], [39375, 0.20], [60375, 0.10]], mfj: [[48500, 0.50], [52500, 0.20], [80500, 0.10]] },
};
export function calcSaversCredit(contributions, agi, filingStatus, year = DEFAULT_YEAR) {
  const fk = filingKey(filingStatus);
  const t  = _SAVERS[Math.min(2026, Math.max(2024, year))];
  const table = fk === 'mfj' ? t.mfj : fk === 'hoh' ? t.hoh : t.single;
  const rate  = table.find(([lim]) => agi <= lim)?.[1] ?? 0;
  return Math.round(Math.min(contributions, fk === 'mfj' ? 4000 : 2000) * rate);
}

// Energy Credits: IRC 25C (home efficiency $1,200 max) + 25D (solar, no limit for now)
// EV Credit: IRC 30D ($7,500 — subject to income limits)
export function calcEvCredit(claimedAmount, magi, filingStatus, year = DEFAULT_YEAR) {
  if (year >= 2026) return 0;   // IRC §30D ended for vehicles acquired after Sept 30, 2025 (OBBBA §70502)
  const fk = filingKey(filingStatus);
  // Income limit: $150K single / $300K MFJ for new EVs
  const limit = fk === 'mfj' ? 300000 : 150000;
  if (magi > limit) return 0;
  return Math.min(claimedAmount, 7500);
}

// IRA Deduction — Traditional IRA, subject to AGI phase-outs if covered by workplace plan
// §219: contribution limit and the workplace-plan phase-out ranges are indexed yearly (these were 2025 figures labelled "2026 est."). Married filing separately: $0-$10,000. 2026: verify against IRS Notice 2025-67.
const _IRA = { 2024: { limit: 7000, single: [77000, 87000], mfj: [123000, 143000] }, 2025: { limit: 7000, single: [79000, 89000], mfj: [126000, 146000] },
               2026: { limit: 7500, single: [81000, 91000], mfj: [129000, 149000] } };
export function calcIRADeduction(contribution, magi, filingStatus, coveredByPlan = true, year = DEFAULT_YEAR) {
  const t = _IRA[Math.min(2026, Math.max(2024, year))];
  const eligible = Math.min(contribution, t.limit);       // age-50 catch-up is not modelled
  if (!coveredByPlan) return eligible;  // No phase-out if not covered by workplace plan
  const fk = filingKey(filingStatus);
  const [lo, hi] = fk === 'mfj' ? t.mfj : fk === 'mfs' ? [0, 10000] : t.single;
  if (magi >= hi) return 0;
  if (magi <= lo) return eligible;
  const phasePct = (magi - lo) / (hi - lo);
  return Math.round(eligible * (1 - phasePct));
}



// ─── calcFullFederalTax SUB-FUNCTIONS ─────────────────────────────────────────
// These are internal helpers extracted for testability and clarity.
// Each maps cleanly to a step in the IRS 1040 computation sequence.

/** Step 1-4: Compute gross income from all sources */
/**
 * §469(i) passive activity loss — rental real estate, active participation.
 * Up to $25,000 of rental loss is allowed against non-passive income; the
 * allowance is reduced by 50% of MAGI above $100,000 (gone at $150,000).
 * Married filing separately: $0 (assumes the spouses lived together all year;
 * the $12,500 lived-apart allowance is not modeled). Thresholds are not
 * inflation-indexed. Suspended losses carry forward (not persisted across
 * years — see roadmap). Returns positive dollar amounts.
 * NOTE: assumes active participation; real-estate-professional status and
 * material-participation exceptions are not modeled.
 */
/**
 * IRC §1211/§1212 and Schedule D: net short-term against short-term, long-term against long-term, then net the two. `shortCarry` / `longCarry` are prior-year loss carryovers (positive
 * numbers). Returns the ordinary (short-term) gain, the preferential (long-term) gain, the capital-loss DEDUCTION allowed against other income (max $3,000; $1,500 married filing
 * separately) and the character of the loss carried forward (short-term losses are used first). This replaces a version that let short-term losses reduce income without limit, floored
 * a long-term loss at -$3,000 and then never deducted it, and never netted a long-term loss against a short-term gain.
 */
export function calcCapitalGainNetting({ shortTerm = 0, longTerm = 0, shortCarry = 0, longCarry = 0, filingStatus = 'Single' } = {}) {
  const limit = filingKey(filingStatus) === 'mfs' ? 1500 : 3000;
  const sh = shortTerm - Math.max(0, shortCarry), lo = longTerm - Math.max(0, longCarry);
  let ordinaryGain = 0, preferentialGain = 0, lossDeduction = 0, carryforwardST = 0, carryforwardLT = 0;
  if (sh >= 0 && lo >= 0) { ordinaryGain = sh; preferentialGain = lo; }
  else if (sh < 0 && lo > 0) {                       // a short-term loss offsets the long-term gain
    const net = lo + sh;
    if (net >= 0) preferentialGain = net; else { lossDeduction = Math.min(-net, limit); carryforwardST = -net - lossDeduction; }
  } else if (sh > 0 && lo < 0) {                     // a long-term loss offsets the short-term gain
    const net = sh + lo;
    if (net >= 0) ordinaryGain = net; else { lossDeduction = Math.min(-net, limit); carryforwardLT = -net - lossDeduction; }
  } else {                                           // net losses in both (or one and zero)
    const sl = Math.max(0, -sh), ll = Math.max(0, -lo);
    lossDeduction = Math.min(sl + ll, limit);
    const usedST = Math.min(sl, lossDeduction);      // the deduction uses the short-term loss first
    carryforwardST = sl - usedST; carryforwardLT = ll - (lossDeduction - usedST);
  }
  return { totalShort: shortTerm, totalLong: longTerm, netShort: sh, netLong: lo, ordinaryGain, preferentialGain, lossDeduction, carryforwardST, carryforwardLT };
}

/**
 * IRC §469(i) special allowance for rental real estate with ACTIVE PARTICIPATION: up to $25,000, reduced by 50% of MAGI over $100,000. Married filing separately: $12,500 reduced over
 * $50,000 if the spouses lived apart all year, otherwise $0. No active participation → no allowance. `magi` must be Form 8582 MAGI (see _calcGrossIncome).
 */
export function calcPassiveActivityLoss(rentalLoss, magi, filingStatus, { activeParticipation = true, mfsLivedApart = false } = {}) {
  const loss = Math.abs(Math.min(0, rentalLoss || 0));
  if (loss === 0) return { allowedLoss: 0, suspendedLoss: 0 };
  const mfs = filingKey(filingStatus) === 'mfs';
  const base = !activeParticipation ? 0 : mfs ? (mfsLivedApart ? 12500 : 0) : 25000;
  const start = mfs ? 50000 : 100000;
  const allowance = Math.max(0, base - 0.5 * Math.max(0, (magi || 0) - start));
  const allowedLoss = Math.min(loss, allowance);
  return { allowedLoss, suspendedLoss: loss - allowedLoss };
}

function _calcGrossIncome({ wages, spouseWages, businessIncome, partnershipKIncome,
  farmIncome, ordinaryDividends, qualifiedDividends, interestIncome, stcg, ltcg,
  cryptoStcg, cryptoLtcg, section1231Gain, capitalLossCarryforward, capitalLossCarryforwardST = 0, rentalIncome,
  socialSecurity, otherIncome, rmdIncome, pensionDistributions, gamblingWinnings,
  alimonyReceived, taxExemptInterest, seDeduction, filingStatus,
  rentalActiveParticipation = true, mfsLivedApart = false, palAdjustments = 0 }, yr) {
  const totalWages = wages + spouseWages;
  // Schedule D. `capitalLossCarryforward` is the long-term carryover (its original meaning); `capitalLossCarryforwardST` is new.
  const cg = calcCapitalGainNetting({ shortTerm: stcg + cryptoStcg, longTerm: ltcg + cryptoLtcg + Math.max(0, section1231Gain),
    shortCarry: capitalLossCarryforwardST, longCarry: capitalLossCarryforward, filingStatus });
  const ordinary1231Loss = Math.min(0, section1231Gain);          // a net §1231 loss is an ORDINARY loss
  const netSTCG = cg.ordinaryGain, netLTCG = cg.preferentialGain;  // both are now >= 0; a net loss is `capitalLossDeduction`
  const carryforwardRemaining = cg.carryforwardST + cg.carryforwardLT;
  const common = totalWages + (ordinaryDividends - qualifiedDividends) + interestIncome + netSTCG - cg.lossDeduction + ordinary1231Loss
    + otherIncome + rmdIncome + pensionDistributions + businessIncome + partnershipKIncome + farmIncome + gamblingWinnings + alimonyReceived;
  // Form 8582 MAGI for the rental-loss allowance: AGI figured WITHOUT the passive loss and WITHOUT taxable Social Security (the old proxy included Social Security and ignored the
  // above-the-line deductions the form allows). IRA and student-loan deductions are added back by the form, so they are not subtracted here.
  const palMagi = common + Math.max(0, rentalIncome) + netLTCG + qualifiedDividends - seDeduction - palAdjustments;
  const rentalPAL = rentalIncome < 0
    ? calcPassiveActivityLoss(rentalIncome, palMagi, filingStatus, { activeParticipation: rentalActiveParticipation, mfsLivedApart })
    : { allowedLoss: 0, suspendedLoss: 0 };
  const effectiveRentalIncome = rentalIncome < 0 ? -rentalPAL.allowedLoss : rentalIncome;
  const agiExcludingSS = common + effectiveRentalIncome + netLTCG + qualifiedDividends - seDeduction;
  const taxableSS = calcTaxableSocialSecurity(socialSecurity, agiExcludingSS, taxExemptInterest, filingStatus);
  // Qualified tips and overtime are NOT added here: they are already part of wages / business income. They only drive the deduction (see _calcDeductions).
  const ordinaryIncome = common + effectiveRentalIncome + taxableSS;
  const grossIncome = ordinaryIncome + netLTCG + qualifiedDividends;
  return { totalWages, totalLTCG: cg.totalLong, totalSTCG: cg.totalShort, netLTCG, netSTCG, capitalLossDeduction: cg.lossDeduction,
    carryforwardST: cg.carryforwardST, carryforwardLT: cg.carryforwardLT, carryforwardRemaining, ordinary1231Loss,
    rentalPAL, effectiveRentalIncome, palMagi, taxableSS, ordinaryIncome, grossIncome };
}

/** Step 6: Above-the-line deductions → AGI */
function _calcAGI(grossIncome, seDeduction, inputs, yr) {
  const { studentLoanInterest = 0, educatorExpenses = 0, hsaContribution = 0, iraDeduction = 0, seHealthInsurance = 0, alimonyPaid = 0, otherAdjustments = 0, nolCarryforward = 0, filingStatus, coveredByWorkplacePlan } = inputs;
  const preAdj = Math.max(0, grossIncome - seDeduction);
  const studentLoanDed = calcStudentLoanInterestDeduction(studentLoanInterest, preAdj, filingStatus, yr.year);
  const educatorDed    = Math.min(educatorExpenses || 0, 300);
  const hsaDed         = hsaContribution || 0;
  const iraDed         = calcIRADeduction(iraDeduction || 0, preAdj, filingStatus, coveredByWorkplacePlan ?? true, yr.year);
  const seHealthDed    = seHealthInsurance || 0;
  const alimonyDed     = alimonyPaid || 0;
  const totalATL = seDeduction + studentLoanDed + educatorDed + hsaDed + iraDed
    + seHealthDed + alimonyDed + (otherAdjustments || 0)
    + (nolCarryforward || 0);
  const agi = Math.max(0, grossIncome - totalATL);
  return { agi, magi: agi, totalATL, studentLoanDed, educatorDed, hsaDed, iraDed, seHealthDed, alimonyDed };
}

/** Step 7: Deductions → taxable income */
function _calcDeductions(agi, inputs, yr, netCapitalGain = 0, qualifiedIncomeCap = Infinity, qbiReductions = 0) {
  const { filingStatus, aged, blind, spouseAgedOrBlind, taxpayerAge = 0, spouseAge = 0,
    itemizedDeductions = 0, saltIncomeTaxesPaid = 0, propertyTaxesPaid = 0,
    mortgageInterestPrimary = 0, mortgageInterestSecond = 0, cashCharity = 0,
    nonCashCharity = 0, medicalExpenses = 0, gamblingLosses = 0, gamblingWinnings = 0,
    investmentInterest = 0, casualtyLosses = 0, vehicleLoanInterest = 0,
    businessIncome = 0, partnershipKIncome = 0, rentalIncome = 0, farmIncome = 0,
    stateLocalTaxesPaid = 0 } = inputs;
  const agedFlag       = aged || taxpayerAge >= 65;
  const spouseFlag     = spouseAgedOrBlind || spouseAge >= 65;
  const standardDed    = getStandardDeduction(filingStatus, yr.year, { aged: agedFlag, blind, spouseAgedOrBlind: spouseFlag });
  const hasComponents  = saltIncomeTaxesPaid > 0 || mortgageInterestPrimary > 0
    || cashCharity > 0 || medicalExpenses > 0 || propertyTaxesPaid > 0;
  let computedItemized = itemizedDeductions;
  if (hasComponents) {
    const saltTotal = saltIncomeTaxesPaid + propertyTaxesPaid;
    computedItemized = Math.min(saltTotal, yr.saltCap || 10000)
      + mortgageInterestPrimary + mortgageInterestSecond
      + calcMedicalDeduction(medicalExpenses, agi)
      + calcCharityDeduction(cashCharity, nonCashCharity, agi)
      + Math.min(gamblingLosses, gamblingWinnings)
      + investmentInterest + casualtyLosses;
  }
  const saltDed        = calcSALTDeduction(stateLocalTaxesPaid || (saltIncomeTaxesPaid + propertyTaxesPaid), agi, yr.year, filingStatus);
  const autoLoanDed    = calcAutoLoanDeduction(vehicleLoanInterest, agi, filingStatus, yr.year);   // below the line: available WITHOUT itemizing (it used to count only inside the itemized comparison)
  const totalItemized  = hasComponents ? computedItemized : Math.max(itemizedDeductions, saltDed);
  const actualDed      = Math.max(standardDed, totalItemized);
  // Qualifying individuals for the senior deduction: taxpayer 65+, plus spouse 65+ on a joint return.
  // (spouseAgedOrBlind is ambiguous — a blind spouse does not qualify — so only an explicit age counts.)
  const seniorCount    = (agedFlag ? 1 : 0) + (filingKey(filingStatus) === 'mfj' && spouseAge >= 65 ? 1 : 0);
  const seniorDed      = calcSeniorDeduction(agi, filingStatus, yr.year, seniorCount > 0, seniorCount);
  // The qualified amounts are ALREADY inside wages / business income (W-2 box 1, 1099); they only drive the deduction, and cannot exceed the income that contains them.
  const tipsDed        = calcTipsDeduction(Math.min(inputs.tipIncome || 0, qualifiedIncomeCap), agi, filingStatus, yr.year);
  const overtimeDed    = calcOvertimeDeduction(Math.min(inputs.overtimeIncome || 0, qualifiedIncomeCap), agi, filingStatus, yr.year);
  // QBI is net of the deductible half of SE tax and the SE health-insurance deduction (Treas. Reg. §1.199A-3(b)(1)(vi)); retirement-plan contributions are not modelled.
  const seBased        = Math.max(0, businessIncome + partnershipKIncome + farmIncome);
  const qbiBasis       = businessIncome + partnershipKIncome + rentalIncome + farmIncome - Math.min(qbiReductions, seBased);
  const taxableBeforeQBI = Math.max(0, agi - actualDed - seniorDed - tipsDed - overtimeDed - autoLoanDed);
  const qbiThreshold   = (QBI_THRESHOLDS[yr.year] || QBI_THRESHOLDS[2026])[filingKey(filingStatus) === 'mfj' ? 'mfj' : 'other'];
  // isSSBT: pass from inputs; w2WagesPaid: wages paid by owner to employees (not owner's own W-2)
  const qbiDed         = calcQBIDeduction(
    qbiBasis,
    taxableBeforeQBI,     // taxable income BEFORE the QBI deduction: every other deduction comes off first
    filingStatus,
    yr.year,
    inputs.isSSBT        || false,
    inputs.w2WagesPaid   || 0,
    inputs.qualPropBasis || 0,
    netCapitalGain,
  );
  const totalDeductions = actualDed + seniorDed + tipsDed + overtimeDed + autoLoanDed + qbiDed;
  const taxableIncome  = Math.max(0, agi - totalDeductions);
  return { standardDed, totalItemized, actualDed, seniorDed, tipsDed, overtimeDed, saltDed, autoLoanDed,
    qbiDed, totalDeductions, taxableIncome, useItemized: totalItemized > standardDed,
    taxableBeforeQBI, qbiAboveThreshold: taxableBeforeQBI > qbiThreshold };
}

/** Steps 8-9: Income tax + surtaxes */
function _calcTaxes(taxableIncome, netLTCG, qualifiedDividends, netSTCG,
  interestIncome, ordinaryDividends, rentalIncome, totalWages, totalSEIncome,
  agi, filingStatus, seTax, isoSpread, year, amtAddBack = 0) {
  const ltcgAndQD       = Math.max(0, Math.min(Math.max(0, netLTCG) + qualifiedDividends, taxableIncome));
  const ordinaryTaxable = Math.max(0, taxableIncome - ltcgAndQD);
  const ordinaryTax     = calcOrdinaryTax(ordinaryTaxable, filingStatus, year);
  const ltcgTax         = calcLTCGTax(ltcgAndQD, ordinaryTaxable, filingStatus, year);
  const netII           = interestIncome + ordinaryDividends + Math.max(0, netLTCG) + netSTCG + rentalIncome;
  const niit            = calcNIIT(netII, agi, filingStatus);
  const addlMedicare    = calcAdditionalMedicareTax(totalWages, totalSEIncome, agi, filingStatus);
  const { amtLiability, tentativeMinTax: amtTentative } = calcAMT(taxableIncome, ordinaryTax + ltcgTax, filingStatus, year, { iso: isoSpread, addBack: amtAddBack, qualifiedGains: ltcgAndQD });
  const yr              = getBracketsForYear(year);
  const fk              = filingKey(filingStatus);
  const ltcgMarginalRate = ltcgAndQD > 0
    ? (yr.ltcg?.[fk]?.find(([lim]) => ordinaryTaxable <= lim)?.[1] ?? 0.20) : 0;
  return { ltcgAndQD, ordinaryTaxable, ordinaryTax: Math.round(ordinaryTax),
    ltcgTax: Math.round(ltcgTax), niit, addlMedicare, amtLiability,
    netInvestmentIncome: Math.round(netII), ltcgMarginalRate, amtTentative };
}

/** Step 10: Credits */
// Additional child tax credit: refundable, limited per child and to 15% of earned income over $2,500 (the "3+ children" alternative is not modelled). $1,700 for 2024–2026.
const ACTC_MAX_PER_CHILD = { 2024: 1700, 2025: 1700, 2026: 1700 };

/**
 * Credits in Form 1040 order. Nonrefundable credits (Schedule 3 and the child tax credit) can only reduce INCOME tax — regular tax, capital-gain tax and AMT — never self-employment
 * tax, NIIT or Additional Medicare tax; the other credits are taken first, then the child tax credit is limited to what remains (Schedule 8812 Credit Limit Worksheet). The unused part
 * of the child credit is refundable up to the ACTC limits, and the refundable American Opportunity portion is added to payments. (A single "total credits" subtracted from total tax
 * let credits wipe out SE tax and never produced a refundable amount.)
 */
export function applyCredits({ incomeTax = 0, nonrefundableOther = 0, ctc = 0, aotcRefundable = 0, earnedIncome = 0, children = 0, year = DEFAULT_YEAR } = {}) {
  const tax = Math.max(0, incomeTax), other = Math.max(0, nonrefundableOther), child = Math.max(0, ctc);
  const otherApplied = Math.min(tax, other);
  const ctcApplied = Math.min(tax - otherApplied, child);
  const ctcUnused = child - ctcApplied;
  const perChild = ACTC_MAX_PER_CHILD[year] ?? ACTC_MAX_PER_CHILD[2026];
  const actc = Math.round(Math.min(ctcUnused, perChild * Math.max(0, children), 0.15 * Math.max(0, earnedIncome - 2500)));
  const refundable = actc + Math.max(0, aotcRefundable);
  return { otherApplied, ctcApplied, nonrefundableApplied: otherApplied + ctcApplied, nonrefundableUnused: (other - otherApplied) + (ctcUnused - actc),
    additionalChildTaxCredit: actc, aotcRefundable: Math.max(0, aotcRefundable), refundableTotal: refundable };
}

function _calcCredits(agi, inputs, year) {
  const { children = 0, numDependents = 0, dependentCareExpenses = 0,
    educationExpenses = 0, isAmericanOpportunity = true, energyCredits = 0,
    evCredit: evCreditInput = 0, foreignTaxCredit = 0, otherCredits = 0,
    filingStatus } = inputs;
  const ctc          = calcChildTaxCredit(children, agi, filingStatus, year);
  const childCareCred= calcChildCareCredit(dependentCareExpenses, children || numDependents, agi);
  const educationCred= calcEducationCredit(educationExpenses, isAmericanOpportunity, agi, filingStatus);
  const evCred       = calcEvCredit(evCreditInput, agi, filingStatus, year);
  const energyAllowed = year >= 2026 ? 0 : energyCredits;   // §25C / §25D ended for property placed in service / expenditures after Dec 31, 2025 (OBBBA)
  const aotcRefundable = isAmericanOpportunity ? Math.round(educationCred * 0.4) : 0;   // 40% of the American Opportunity credit is refundable (assumes the student qualifies)
  const nonrefundableOther = childCareCred + (educationCred - aotcRefundable) + energyAllowed + evCred + foreignTaxCredit + otherCredits;   // "other credits" are treated as nonrefundable
  const creditsAvailable = ctc + childCareCred + educationCred + energyAllowed + evCred + foreignTaxCredit + otherCredits;
  return { ctc, childCareCred, educationCred, aotcRefundable, evCred, energyCredits: energyAllowed, foreignTaxCredit, otherCredits,
    nonrefundableOther, creditsAvailable: Math.round(creditsAvailable) };
}

// ─── ENHANCED calcFullFederalTax (v4.0) ──────────────────────────────────────
// All original inputs preserved + new inputs from Red Five model.
// Backward-compatible: all new params default to 0/false/undefined.

/**
 * What this result can and cannot be trusted for. `validated` is false when the return touches an area the engine only approximates; each reason says which and why, so the screen can
 * show it. This is not a disclaimer: it is computed from the return itself.
 */
function _scope({ inputs, year, supported, taxes, ded, gross, credits, qualifiedCap }) {
  const reasons = []; const warn = (code, text) => reasons.push({ code, level: 'warn', text }); const info = (code, text) => reasons.push({ code, level: 'info', text });
  if (!supported) warn('scenario_year', `Tax year ${year} has no official tables: this is a planning scenario (latest dollar figures held, scheduled provisions removed), not a computation.`);
  const regular = taxes.ordinaryTax + taxes.ltcgTax;
  if (taxes.amtLiability > 0 || (inputs.isoSpread || 0) > 0 || (taxes.amtTentative > 0 && taxes.amtTentative >= 0.8 * regular))
    warn('amt', 'The alternative minimum tax is simplified: Form 6251 adjustments, preferences and credits beyond the standard-deduction/SALT add-back and ISO spreads are not modelled. Treat the AMT figure as preliminary.');
  if (ded.qbiDed > 0 && (ded.qbiAboveThreshold || inputs.isSSBT || (inputs.w2WagesPaid || 0) > 0 || (inputs.qualPropBasis || 0) > 0))
    warn('qbi', 'The QBI deduction above the income threshold, for a specified service business, or with wage/property limits is simplified (no aggregation; retirement contributions do not reduce QBI). Reconcile to Form 8995-A.');
  else if (ded.qbiDed > 0) info('qbi_basic', 'QBI assumes one business and is not reduced by self-employed retirement contributions.');
  if ((inputs.rentalIncome || 0) < 0)
    (gross.palMagi > 100000 ? warn : info)('rental_loss', 'The rental-loss allowance assumes active participation as entered; suspended-loss carryovers from earlier years, real-estate-professional status and multiple activities are not modelled.');
  if ((inputs.tipIncome || 0) > qualifiedCap || (inputs.overtimeIncome || 0) > qualifiedCap)
    warn('qualified_exceeds_income', 'Qualified tips/overtime exceed the wages and business income entered: they were capped. They must already be part of income.');
  if ((inputs.tipIncome || 0) > 0 || (inputs.overtimeIncome || 0) > 0 || (ded.seniorDed || 0) > 0 || (ded.autoLoanDed || 0) > 0)
    info('obbba_eligibility', 'The tips, overtime, senior and auto-loan deductions assume the eligibility rules (occupation, reporting, SSN, qualifying vehicle) are met.');
  if (credits.creditsAvailable > 0 || (inputs.children || 0) > 0)
    info('credits', 'Credits follow Form 1040 order. The additional child tax credit uses the 15% method only; the American Opportunity refundable part assumes the student qualifies; "other credits" are treated as nonrefundable.');
  if (year >= 2026 && ded.useItemized) warn('itemized_2026', 'The 2026 itemized-deduction changes (0.5%-of-AGI floor on charitable gifts; 35% cap on the benefit for the top bracket) are not modelled.');
  if (year >= 2026 && (inputs.dependentCareExpenses || 0) > 0) warn('dependent_care_2026', 'The 2026 enhancement of the dependent-care credit is not modelled.');
  return { validated: !reasons.some(r => r.level === 'warn'), reasons };
}

export function calcFullFederalTax(inputs, year = inputs?.year ?? DEFAULT_YEAR, options = {}) {   // `year` inside the inputs is honoured; unsupported years need { scenario: true }
  const supported = SUPPORTED_TAX_YEARS.includes(year);
  if (!supported && !options.scenario) throw new TaxYearNotSupportedError(year);
  const prevQuiet = _quietWarn; _quietWarn = !!options.scenario;
  try { return _calcFullFederalTax(inputs, year, supported); } finally { _quietWarn = prevQuiet; }
}

function _calcFullFederalTax(inputs, year, supported) {
  const {
    wages = 0, spouseWages = 0, businessIncome = 0, partnershipKIncome = 0,
    farmIncome = 0, ordinaryDividends = 0, qualifiedDividends = 0,
    interestIncome = 0, taxExemptInterest = 0, ltcg = 0, stcg = 0,
    cryptoStcg = 0, cryptoLtcg = 0, section1231Gain = 0, capitalLossCarryforward = 0,
    rentalIncome = 0, unrecaptured1250Gain = 0, socialSecurity = 0,
    otherIncome = 0, rmdIncome = 0, tipIncome = 0, overtimeIncome = 0,
    pensionDistributions = 0, gamblingWinnings = 0, alimonyReceived = 0,
    filingStatus = 'Single', isoSpread = 0, nolCarryforward = 0,
    magiTwoYearsAgo = 0, onMedicare = false, aged = false,
    federalWithholding = 0, estimatedPayments = 0, priorYearOverpayment = 0,
    taxpayerAge = 0, children = 0,
    capitalLossCarryforwardST = 0, rentalActiveParticipation = true, mfsLivedApart = false,
    seHealthInsurance = 0, hsaContribution = 0, educatorExpenses = 0, alimonyPaid = 0, otherAdjustments = 0,
    // remaining inputs passed through to sub-functions via `inputs` spread
  } = inputs;

  const yr  = getBracketsForYear(year);
  const fk  = filingKey(filingStatus);

  // Step 1: SE Tax
  const totalSEIncome      = Math.max(0, businessIncome + partnershipKIncome + farmIncome);
  const { seTax, seDeduction } = calcSETax(totalSEIncome, year);

  // Step 2-4: Gross income (wages, dividends, SS, cap gains, etc.)
  // above-the-line items that reduce Form 8582 MAGI (IRA and student-loan deductions are added back by the form)
  const palAdjustments = seHealthInsurance + hsaContribution + Math.min(educatorExpenses, 300) + alimonyPaid + otherAdjustments;
  const gross = _calcGrossIncome({ wages, spouseWages, businessIncome, partnershipKIncome,
    farmIncome, ordinaryDividends, qualifiedDividends, interestIncome, stcg, ltcg,
    cryptoStcg, cryptoLtcg, section1231Gain, capitalLossCarryforward, rentalIncome,
    socialSecurity, otherIncome, rmdIncome, pensionDistributions, gamblingWinnings,
    alimonyReceived, taxExemptInterest, seDeduction, filingStatus,
    capitalLossCarryforwardST, rentalActiveParticipation, mfsLivedApart, palAdjustments }, yr);

  // Step 6: AGI
  const adj = _calcAGI(gross.grossIncome, seDeduction, inputs, yr);

  // Step 7: Deductions → taxable income
  const qualifiedCap = gross.totalWages + Math.max(0, businessIncome + partnershipKIncome + farmIncome);   // tips/overtime must sit inside income already reported
  const ded = _calcDeductions(adj.agi, inputs, yr, Math.max(0, gross.netLTCG) + qualifiedDividends, qualifiedCap, seDeduction + seHealthInsurance);

  // Steps 8-9: Income tax + surtaxes
  const taxes = _calcTaxes(
    ded.taxableIncome, gross.netLTCG, qualifiedDividends, gross.netSTCG - gross.capitalLossDeduction,
    interestIncome, ordinaryDividends, gross.effectiveRentalIncome, gross.totalWages, totalSEIncome,
    adj.agi, filingStatus, seTax, isoSpread, year, ded.useItemized ? ded.saltDed : ded.standardDed
  );

  // Step 10: Credits
  const credits = _calcCredits(adj.agi, inputs, year);

  // Steps 11-13 in FORM 1040 ORDER: income tax -> nonrefundable credits (limited to income tax) -> add the other taxes (SE, NIIT, Additional Medicare) -> payments and refundable credits.
  const incomeTaxBeforeCredits = taxes.ordinaryTax + taxes.ltcgTax + calcDepreciationRecaptureTax(unrecaptured1250Gain) + taxes.amtLiability;
  const otherTaxes = seTax + taxes.niit + taxes.addlMedicare;
  const earnedIncome = gross.totalWages + Math.max(0, totalSEIncome - seDeduction);           // for the additional child tax credit
  const seq = applyCredits({ incomeTax: incomeTaxBeforeCredits, nonrefundableOther: credits.nonrefundableOther, ctc: credits.ctc,
    aotcRefundable: credits.aotcRefundable, earnedIncome, children, year });
  const taxBeforeCredits = incomeTaxBeforeCredits + otherTaxes;
  const totalTax    = Math.max(0, Math.round(taxBeforeCredits - seq.nonrefundableApplied));
  const totalPayments = federalWithholding + estimatedPayments + priorYearOverpayment + seq.refundableTotal;   // Form 1040 line 33 includes refundable credits
  const balanceDue  = totalTax - totalPayments;

  // Step 13: IRMAA (optional)
  const irmaa = onMedicare ? calcIRMAA(magiTwoYearsAgo || adj.magi, filingStatus, year) : null;

  // Derived metrics
  const effectiveRate    = adj.agi > 0 ? parseFloat((totalTax / adj.agi * 100).toFixed(1)) : 0;
  const effectiveOnGross = gross.grossIncome > 0 ? parseFloat((totalTax / gross.grossIncome * 100).toFixed(1)) : 0;
  const marginalRate     = getMarginalRate(ded.taxableIncome, filingStatus, year);
  const bracketHeadroom  = getBracketHeadroom(ded.taxableIncome, filingStatus, year);

  return {
    filingStatus, year,
    // Income
    totalWages: gross.totalWages, ordinaryIncome: gross.ordinaryIncome,
    ltcgAndQD: taxes.ltcgAndQD, taxableSS: gross.taxableSS, grossIncome: gross.grossIncome,
    tipsDeduction: ded.tipsDed, overtimeDeduction: ded.overtimeDed,
    parametersEstimated: !BRACKETS_BY_YEAR[year],   // no official tables for this year: a scenario (latest dollar figures held)
    lawAssumptions: getLawAssumptions(year),
    scope: _scope({ inputs, year, supported, taxes, ded, gross, credits, qualifiedCap }),
    partnershipKIncome, farmIncome, cryptoStcg, cryptoLtcg,
    netLTCG: gross.netLTCG, netSTCG: gross.netSTCG, capitalLossDeduction: gross.capitalLossDeduction,
    carryforwardST: gross.carryforwardST, carryforwardLT: gross.carryforwardLT,
    carryforwardRemaining: gross.carryforwardRemaining,
    rentalPALAllowed: gross.rentalPAL?.allowedLoss || 0, rentalPALMagi: Math.round(gross.palMagi),
    rentalPALSuspended: gross.rentalPAL?.suspendedLoss || 0,  // §469 suspended rental loss carry-forward
    // AGI
    agi: adj.agi, magi: adj.magi, totalAboveTheLine: adj.totalATL,
    seDeduction, studentLoanDed: adj.studentLoanDed, educatorDed: adj.educatorDed,
    hsaDed: adj.hsaDed, iraDed: adj.iraDed, seHealthDed: adj.seHealthDed,
    // Deductions
    standardDeduction: ded.standardDed, saltDeduction: ded.saltDed,
    seniorDeduction: ded.seniorDed, autoLoanDeduction: ded.autoLoanDed,
    qbiDeduction: ded.qbiDed, totalItemized: ded.totalItemized,
    totalDeductions: ded.totalDeductions, actualDeduction: ded.actualDed,
    useItemized: ded.useItemized, taxableIncome: ded.taxableIncome,
    // Tax components
    ordinaryTax: taxes.ordinaryTax, ltcgTax: taxes.ltcgTax,
    deprRecaptureTax: Math.round(calcDepreciationRecaptureTax(unrecaptured1250Gain)),
    seTax, niit: taxes.niit, additionalMedicare: taxes.addlMedicare,
    amtLiability: taxes.amtLiability,
    taxBeforeCredits: Math.round(taxBeforeCredits),
    incomeTaxBeforeCredits: Math.round(incomeTaxBeforeCredits), otherTaxes: Math.round(otherTaxes),
    nonrefundableCreditsApplied: Math.round(seq.nonrefundableApplied), nonrefundableCreditsUnused: Math.round(seq.nonrefundableUnused),
    incomeTaxAfterCredits: Math.round(incomeTaxBeforeCredits - seq.nonrefundableApplied),
    netInvestmentIncome: taxes.netInvestmentIncome,
    // Credits
    ...credits,
    additionalChildTaxCredit: seq.additionalChildTaxCredit, aotcRefundable: seq.aotcRefundable, refundableCredits: seq.refundableTotal,
    totalCredits: Math.round(seq.nonrefundableApplied + seq.refundableTotal),   // credits that actually reduced tax or were paid out (`creditsAvailable` is before the limits)
    // Final
    totalFederalTax: totalTax, totalPayments: Math.round(totalPayments),
    balanceDue: Math.round(balanceDue), isRefund: balanceDue < 0,
    estQ1Payment: Math.round(totalTax * 0.25),
    // Rates
    effectiveRate, effectiveOnGross, marginalRate,
    ltcgMarginalRate: taxes.ltcgMarginalRate, bracketHeadroom,
    irmaa,
    // Planning flags
    flags: {
      amtTriggered:           taxes.amtLiability > 0,
      subjectToNIIT:          taxes.niit > 0,
      qbiApplies:             ded.qbiDed > 0,
      seniorDeductionApplies: (ded.seniorDed || 0) > 0,
      saltCapHit:             (inputs.stateLocalTaxesPaid || (inputs.saltIncomeTaxesPaid || 0) + (inputs.propertyTaxesPaid || 0)) > (yr.saltCap || 10000),
      irmaaRisk:              onMedicare && adj.magi > (fk === 'mfj' ? 212000 : 106000),
      nearBracketBoundary:    bracketHeadroom < 10000 && bracketHeadroom > 0,
      capitalLossCarryover:   gross.carryforwardRemaining > 0,
      nolApplied:             (inputs.nolCarryforward || 0) > 0,
      tipsOrOvertimeDeduction: ((ded.tipsDed || 0) + (ded.overtimeDed || 0)) > 0,
    estimatedParameters: !BRACKETS_BY_YEAR[year],
      useItemized:            ded.useItemized,
      highDebt:               balanceDue > 0 && balanceDue > totalPayments * 0.1,
      rentalLossSuspended:    (gross.rentalPAL?.suspendedLoss || 0) > 0,  // §469 passive activity
    },
  };
}

// ─── MULTI-SCENARIO ENGINE ─────────────────────────────────────────────────────
// Runs up to 3 scenarios side-by-side, exactly as in the spreadsheet.
export function calcScenarios(scenarioInputs = [], year = DEFAULT_YEAR, options = {}) {
  return scenarioInputs.map((inputs, i) => ({
    scenarioLabel: inputs.scenarioLabel || `Scenario ${String.fromCharCode(65 + i)}`,
    ...calcFullFederalTax(inputs, year, options),
    inputs,
  }));
}


// ─── EXPORTS ──────────────────────────────────────────────────────────────────
export {
  BRACKETS_BY_YEAR, NIIT_THRESHOLDS, IRMAA_2025, IRMAA_2026, ULT,
  calcOrdinaryTax as calcFederalTax,
  // Entity calculators
  // Enhanced 1040 helpers
  // Multi-scenario
};
