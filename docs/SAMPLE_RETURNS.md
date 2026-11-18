# Sample returns for calibrating the PDF reader

## Found publicly (fictional taxpayers, test SSNs — safe to use)
**Drake Tax practice returns** — each has a scenario PDF and a *solution* PDF that is Drake's actual printed output of the completed return.
- 2025 forms: `https://www.drakesoftware.com/sharedassets/education/practice/solution1.pdf` (HOH, W-2, child tax credit, dependent care). Same pattern for `solution2.pdf` … `solution8.pdf` (Practice Return 4: W-2, interest/dividends, American Opportunity credit).
- Older years (2019 forms): `https://support.drakesoftware.com/PDF/practice/Solution1.pdf` … (useful for prior-year layouts).
- Ground truth for Practice Return 1 (2025): wages 115,500 · AGI 115,500 · standard deduction 23,625 · taxable income 91,875 · tax 13,388 · line 19 credit 2,200 · Schedule 3 credit 600 · total tax 10,588 · withholding 17,500 · refund 6,912.

## Not publicly available
Lacerte, ProConnect, ProSeries, UltraTax CS and CCH Axcess publish no sample return PDFs (Lacerte ships demo returns inside the program only). These need real, redacted client copies from users of each package. UltraTax can print a *client copy with field masking* (SSNs masked) — ask for that.

## Identifying the software from the PDF
The vendor code printed at the foot of each IRS form identifies the package: **EEA** Drake · **BAA** Lacerte/ProSeries · **DAA** UltraTax CS · **LHA** CCH Axcess · **JSA** GoSystem. Record it with each calibration sample.

## Test plan
1. For each sample: run the reader, compare every field to the printed return, record misses by vendor.
2. Add each sample's text rows (no names/SSNs) as a fixture under `tests/parser/` with its expected figures.
3. Release gate: every fixture reads correctly before a parser change ships.

## Calibration tools (built)
- **In the app: `/calibrate`** (signed in; not in the menu). Drop client-copy PDFs; they are read in the browser only. For each file: software detected from the vendor code, every figure read with the caption row it came from, the reconciliation checks, a right/wrong toggle with a correction box, and "add a missed field". **Download fixture** saves only the matched caption rows (SSNs, EINs, emails, phones stripped) and the confirmed amounts.
- **On your machine:** `npm run calibrate -- path/to/*.pdf` does the same in batch and writes unreviewed fixtures to `tests/parser/fixtures/`.
- **CI:** `tests/parser/fixtures.test.mjs` replays every reviewed fixture on each push; fields marked `missed` show as TODO until the reader learns them.
