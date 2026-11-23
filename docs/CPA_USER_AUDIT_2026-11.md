# CPA-user audit — Tax Projections and Video (November 2026)

Perspective: a CPA importing a client's return, reviewing next year's projection, and sending the client a walkthrough.

## Fixed in this pass
1. **The next-year projection ignored most of the return.** Only wages, business income, capital gains, "other" income and tips/overtime reached the engine. Interest, dividends, IRA and pension distributions, Social Security, adjustments, itemized deductions, ages and children were dropped, and PDF imports defaulted to **Single**. Example: a retired MFJ couple with $125K of income projected **$0** of tax (prior year $8,900); it now projects about $7,900. New `utils/projectionInputs.js` maps every saved figure and lists each assumption on screen.
2. **Manual entry threw away most of what the CPA typed.** Spouse wages, interest, dividends, pensions, Social Security, children, ages, itemized detail, estimated payments and the SSTB/W-2/UBIA inputs were not saved — only the computed totals. All inputs are now saved (server allow-list extended), so the projection and the narration see the whole return. Returns saved earlier show a warning to re-enter.
3. **Projection flags came from the prior year.** The "planning flags" under the projection were the stored prior-year flags. They now come from the projection.
4. **IRMAA note used stale hand-typed brackets** and ignored the two-year lookback. It now uses the engine's verified CMS tables and says which year's premiums are affected.
5. **Safe harbor used 110% of prior-year tax for everyone.** 110% applies only above $150,000 AGI ($75,000 MFS); otherwise 100%. No shortfall is shown under the $1,000 threshold. The panel's visibility also depended on whatever was typed in the unrelated "new projection" form.
6. **Saved scenario comparisons appeared as blank returns** in the Tax Projections list and the dashboard count.
7. **Narration said "Your standard or itemized deduction was…".** It now says "You took the standard deduction of…" or "Your itemized deductions came to…" (inferred from the filing status and amount for imports; recorded for manual entry). The slide label is now "Deduction (Line 12)".
8. **Manual-entry walkthroughs skipped interest, dividends and pensions**, so the line items did not add up to the narrated total income; and Social Security would have been narrated from the gross benefit. Now narrated, with the taxable Social Security amount.

## Follow-up (done)
- **Schedules now read when included in the PDF:** Schedule 1 lines 3 and 5 (business, rental/pass-through), Schedule 2 line 4 (SE tax), Schedule D lines 7 and 15 (short/long-term), plus Form 1040 line 19 (dependent credits) and line 20 (Schedule 3 credits). The projection uses them (real ST/LT split, Schedule C as business income, children inferred from the credit claimed).
- **"Adjust next year" panel** on the projection: wage, business, investment and retirement income changes (%), next-year capital gains, children under 17. Live, not saved.
- **Narration:** dependent credits and other credits are now narrated, and last year's refund or balance due for the same client is mentioned when that return is in TaxStory (verified figures, no approval prompt).
- **Parser fixture test** (`tests/parser/`) in CI, seeded with the Drake 2025 layout; add real samples as they arrive (see `SAMPLE_RETURNS.md`).
- **Audio credits:** confirmed from the code — every new voiceover charges a credit; the request key only prevents a double-click from charging twice. A "free re-generation within 24 hours" rule would have to go in the `start_audio_job` database function.

## Status of the open items (checked against the code, 23 Nov 2026)

| Item | Status |
|---|---|
| Projection held everything flat | **Done.** "Adjust next year" panel on the projection (income changes, capital gains, children) |
| Walkthrough didn't mention credits or the change vs last year | **Done.** Dependent and other credits are narrated; last year's refund or balance due is mentioned when that return is in TaxStory |
| Only Form 1040 pages were read | **Partly done.** Summary lines from Schedules 1, 2 and D are read when the PDF includes them (business and rental income, SE tax, short/long-term gains). Line-level Schedule C, E and SE detail is not read; if Schedule 1 is missing, the screen says SE tax and QBI are not projected |
| PDF reader untested on real tax-software output | **Still open.** One synthetic Drake 2025 layout is in the parser tests; Lacerte, ProConnect, CCH and UltraTax have not been seen. Needs 3–5 redacted returns from each (`SAMPLE_RETURNS.md`) |
| Engine verified against independent results | **Still open.** 7 of 35 test returns verified; 28 pending independently computed figures |
| Re-generating audio after an edit | **Decision needed.** Confirmed: every voiceover charges a credit. A free re-generation window would go in the `start_audio_job` database function |
| One video at a time, rendered in the browser | **Still open.** Fine for a pilot; "generate all" and server-side rendering are tax-season needs |
