#!/usr/bin/env python3
"""Independent expected results for the tax-engine tests (TS-002).

Written separately from src/utils/taxEngine.js: brackets and standard deductions are typed from the IRS revenue procedures
(Rev. Proc. 2023-34 for 2024, Rev. Proc. 2025-32 / OBBBA for 2025-2026), and tax under $100,000 uses the IRS Tax Table rule
(tax on the midpoint of the $50 band, rounded). Only simple cases are computed here — W-2 wages, standard deduction,
student-loan interest and the child tax credit — so every step can be checked by hand. Everything else comes from tax software
(see TaxStory-Engine-Validation.xlsx) and is added to expected.json as it is completed.

Run: python3 tests/engine/independent_expected.py > tests/engine/expected.independent.json
"""
import json, math

BRACKETS = {   # upper bounds of the 10/12/22/24/32/35% brackets
    2024: {'single': [11600, 47150, 100525, 191950, 243725, 609350], 'mfj': [23200, 94300, 201050, 383900, 487450, 731200],
           'hoh': [16550, 63100, 100500, 191950, 243700, 609350], 'mfs': [11600, 47150, 100525, 191950, 243725, 365600]},
    2025: {'single': [11925, 48475, 103350, 197300, 250525, 626350], 'mfj': [23850, 96950, 206700, 394600, 501050, 751600],
           'hoh': [17000, 64850, 103350, 197300, 250500, 626350], 'mfs': [11925, 48475, 103350, 197300, 250525, 375800]},
    2026: {'single': [12400, 50400, 105700, 201775, 256225, 640600], 'mfj': [24800, 100800, 211400, 403550, 512450, 768700],
           'hoh': [17700, 67450, 105700, 201750, 256200, 640600], 'mfs': [12400, 50400, 105700, 201775, 256225, 384350]},
}
RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
STD = {2024: {'single': 14600, 'mfj': 29200, 'hoh': 21900, 'mfs': 14600},
       2025: {'single': 15750, 'mfj': 31500, 'hoh': 23625, 'mfs': 15750},
       2026: {'single': 16100, 'mfj': 32200, 'hoh': 24150, 'mfs': 16100}}
CTC = {2024: 2000, 2025: 2200, 2026: 2200}

def bracket_tax(x, year, fs):
    tax, lo = 0.0, 0
    for hi, r in zip(BRACKETS[year][fs] + [math.inf], RATES):
        if x > lo: tax += (min(x, hi) - lo) * r
        lo = hi
    return tax

def tax_table(x, year, fs):
    if x >= 100000: return round(bracket_tax(x, year, fs))
    mid = (x // 50) * 50 + 25 if x >= 3000 else (x // 25) * 25 + 12.5
    return math.floor(bracket_tax(mid, year, fs) + 0.5)        # IRS rounds .50 up

def case(year, fs, wages, children=0, student_loan=0):
    agi = wages - min(student_loan, 2500)      # student-loan phase-out not reached in these cases (checked by hand)
    taxable = max(0, agi - STD[year][fs])
    tax = tax_table(taxable, year, fs)
    ctc = min(tax, children * CTC[year])       # phase-out ($200k/$400k) not reached; refundable part not needed (tax > credit)
    return {'agi': agi, 'taxableIncome': taxable, 'ordinaryTax': tax, 'totalFederalTax': tax - ctc}

CASES = {
    'A01': case(2024, 'single', 45000, student_loan=2500),
    'B01': case(2025, 'single', 52000),
    'B02': case(2025, 'mfj', 165000, children=2),
    'B03': case(2025, 'hoh', 62000, children=1),
    'B04': case(2025, 'mfs', 120000),
    'C03': case(2026, 'hoh', 75000, children=2),
}
if __name__ == '__main__':
    print(json.dumps(CASES, indent=1))
