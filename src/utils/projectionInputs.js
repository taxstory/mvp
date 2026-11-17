// Builds the next-year projection's engine inputs from a SAVED return, and lists every assumption made.
//
// Why this exists: the projection used to pass only wages, business income, capital gains, "other" income and tips/overtime to the engine.
// Interest, dividends, IRA and pension distributions, Social Security, adjustments, itemized deductions, ages and children were dropped,
// and PDF imports defaulted to Single because the field names differ. A retired couple projected close to $0 of tax; a family lost its
// child credit. This maps EVERYTHING a saved return holds (PDF import or manual entry) and says out loud what had to be assumed.
import { getBracketsForYear } from './taxEngine.js';

const fkOf = s => /jointly|surviving/i.test(s || '') ? 'mfj' : /separately/i.test(s || '') ? 'mfs' : /head/i.test(s || '') ? 'hoh' : 'single';
const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function buildProjectionInputs(raw = {}, priorYear) {
  const assumptions = [];
  const isManual = 'federal_tax' in raw || 'business_income' in raw || 'filing_status' in raw;
  const filingStatus = raw.filing_status || raw.filingStatus || 'Single';
  if (!raw.filing_status && !raw.filingStatus) assumptions.push('Filing status was not on the saved return; Single is assumed.');
  const fk = fkOf(filingStatus);

  if (isManual) {
    const inputs = {
      filingStatus,
      wages: n(raw.wages), spouseWages: n(raw.spouse_wages), businessIncome: n(raw.business_income), partnershipKIncome: n(raw.partnership_k),
      isSSBT: !!raw.is_sstb, w2WagesPaid: n(raw.w2_wages_paid), qualPropBasis: n(raw.qual_prop_basis),
      interestIncome: n(raw.interest), ordinaryDividends: n(raw.ordinary_dividends), qualifiedDividends: n(raw.qualified_dividends),
      ltcg: n(raw.ltcg) + (raw.ltcg == null && raw.stcg == null ? n(raw.capital_gains) : 0), stcg: n(raw.stcg),
      rentalIncome: n(raw.rental_income), pensionDistributions: n(raw.pensions), socialSecurity: n(raw.social_security),
      otherIncome: n(raw.other_income), tipIncome: n(raw.tip_income), overtimeIncome: n(raw.overtime_income),
      seHealthInsurance: n(raw.se_health_insurance), children: n(raw.children), otherDependents: n(raw.other_dependents), aged: !!raw.aged,
      ...(raw.eic_children != null ? { eicChildren: n(raw.eic_children) } : {}),
      capitalLossCarryforwardST: n(raw.cap_loss_carry_st), capitalLossCarryforward: n(raw.cap_loss_carry_lt),   // the unused loss carried in from the saved year
      saltIncomeTaxesPaid: n(raw.salt_income), propertyTaxesPaid: n(raw.property_tax), mortgageInterestPrimary: n(raw.mortgage),
      cashCharity: n(raw.charity), medicalExpenses: n(raw.medical),
      itemizedDeductions: raw.deduction_type === 'itemized' && !(raw.salt_income || raw.property_tax || raw.mortgage || raw.charity || raw.medical) ? n(raw.itemized_amount) : 0,
    };
    if (raw.spouse_wages == null && raw.interest == null && raw.social_security == null && raw.children == null)
      assumptions.push('This return was saved before all entry fields were kept: interest, dividends, pensions, Social Security, children and itemized details are not available, so the projection may understate or overstate tax. Re-enter it to fix.');
    return { inputs, assumptions, withholding: n(raw.withholding), estimatedPayments: n(raw.estimated_payments) };
  }

  // ── PDF import: Form 1040 page figures only ──
  const yr  = getBracketsForYear(priorYear || 2025);
  const std = yr.standardDeduction?.[fk] || 0, add = yr.agedBlindAddition?.[fk] || 0;
  const line12 = n(raw.standardDeduction);
  const scheduleC = n(raw.scheduleC_netProfit), scheduleE = n(raw.scheduleE_netIncome);
  const inputs = {
    filingStatus,
    wages: n(raw.wages),
    interestIncome: n(raw.taxableInterest),
    ordinaryDividends: n(raw.ordinaryDividends), qualifiedDividends: n(raw.qualifiedDividends),
    rmdIncome: n(raw.taxableIRA),
    pensionDistributions: n(raw.taxablePensions),
    socialSecurity: n(raw.socialSecurityBenefits) || n(raw.taxableSocialSecurity),
    ltcg: raw.netLTCG != null || raw.netSTCG != null ? n(raw.netLTCG) : n(raw.capitalGainLoss),
    stcg: n(raw.netSTCG),
    businessIncome: scheduleC,
    rentalIncome: scheduleE,
    otherIncome: n(raw.otherIncome) - scheduleC - scheduleE,      // line 8 already includes Schedule C and E
    otherAdjustments: n(raw.adjustmentsToIncome),
    children: 0,
  };
  if (!raw.socialSecurityBenefits && raw.taxableSocialSecurity) assumptions.push('Only the taxable part of Social Security was found; it is used as the gross benefit, which overstates next year\'s taxable amount.');
  {
    const limit = /separately/i.test(filingStatus) ? 1500 : 3000;
    if (n(raw.capitalGainLoss) === -limit) assumptions.push(`Line 7 shows the maximum $${limit.toLocaleString('en-US')} capital loss deduction, so an unused loss probably carries into next year. Its amount is not on Form 1040 — enter it in "Capital loss carryover" below.`);
  }
  if (raw.capitalGainLoss && raw.netLTCG == null && raw.netSTCG == null) assumptions.push('Schedule D was not in the PDF, so the line 7 capital gain or loss is treated as long-term.');
  if (n(raw.otherIncome) && !scheduleC && !scheduleE) assumptions.push('Schedule 1 was not in the PDF, so line 8 income is treated as ordinary income. If it includes self-employment income, self-employment tax and the QBI deduction are not projected — import the full client copy (with Schedule 1) or use manual entry.');
  if (scheduleC) assumptions.push('Schedule C income is projected as a sole proprietorship that is not a specified service business, with no W-2 wages or property for the QBI limit — adjust in manual entry if that is wrong.');
  if (n(raw.otherCredits)) assumptions.push(`Other credits of $${n(raw.otherCredits).toLocaleString('en-US')} (Schedule 3 — e.g. dependent care, education, energy) are not projected; next year's tax may be overstated by up to that amount.`);
  if (n(raw.adjustmentsToIncome)) assumptions.push('Adjustments to income (line 10) are carried forward at the same amount.');
  // Children: from the child tax credit actually claimed (line 19) when it divides evenly by the per-child amount; otherwise the dependent count.
  const perChild = (priorYear || 2025) >= 2025 ? 2200 : 2000, ctc = n(raw.childTaxCredit);
  // Line 19 = $perChild per child under 17 + $500 per other dependent: find the split (most children first).
  let split = null;
  if (ctc > 0) for (let a = Math.floor(ctc / perChild); a >= 0 && !split; a--) { const rem = ctc - a * perChild; if (rem % 500 === 0) split = [a, rem / 500]; }
  if (split) {
    [inputs.children, inputs.otherDependents] = split;
    assumptions.push(`From the $${ctc.toLocaleString('en-US')} line 19 credit: ${split[0]} child${split[0] === 1 ? '' : 'ren'} under 17${split[1] ? ` and ${split[1]} other dependent${split[1] === 1 ? '' : 's'}` : ''}; each child is assumed still under 17 next year, and EIC children are assumed to be the same.`);
  } else if (n(raw.numberOfDependents)) {
    inputs.children = n(raw.numberOfDependents);
    assumptions.push(`All ${inputs.children} dependent${inputs.children > 1 ? 's are' : ' is'} assumed to qualify for the child tax credit (under 17 next year)${ctc ? '; the credit claimed was limited or included other-dependent credit, so check this' : ''}.`);
  }

  // Line 12: standard deduction (possibly with the age-65/blind additions) or itemized?
  if (line12 > 0 && std > 0) {
    const extra = Math.round((line12 - std) / (add || 1));
    if (line12 === std) { /* standard, under 65 */ }
    else if (add && line12 === std + extra * add && extra >= 1 && extra <= (fk === 'mfj' ? 4 : 2)) {
      inputs.taxpayerAge = 65; if (fk === 'mfj' && extra >= 2) inputs.spouseAge = 65;
      assumptions.push(`The standard deduction includes ${extra} age-65-or-blind addition${extra > 1 ? 's' : ''}; ${extra > 1 && fk === 'mfj' ? 'both spouses are' : 'the taxpayer is'} treated as 65+ (senior deduction applied).`);
    } else if (line12 > std) {
      inputs.itemizedDeductions = line12;
      assumptions.push('Itemized deductions are carried forward at the same total; the 2026 charitable floor and SALT rules cannot be applied to a total.');
    }
  }
  if (n(raw.additionalDeductions) && !inputs.taxpayerAge) assumptions.push('Schedule 1-A deductions (tips, overtime, car-loan interest, seniors) were claimed but their detail is not on Form 1040, so they are not projected.');
  return { inputs, assumptions, withholding: n(raw.federalWithheld), estimatedPayments: n(raw.estimatedTaxPayments) };
}
