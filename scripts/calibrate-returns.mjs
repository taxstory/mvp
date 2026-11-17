#!/usr/bin/env node
// Batch calibration on YOUR machine: node scripts/calibrate-returns.mjs path/to/*.pdf
// Reads each client-copy PDF with the same code the app uses, prints what was found, and writes an UNREVIEWED fixture
// (tests/parser/fixtures/<name>.json) holding only the matched caption rows (identifiers stripped) and the amounts read.
// Open each fixture, correct any wrong amount in "expected", list fields the reader missed in "missed", then set "reviewed": true.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractRows } from '../src/utils/pdfExtract.js';
import { parseForm1040, FIELD_LABELS } from '../src/utils/form1040Parser.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: node scripts/calibrate-returns.mjs file1.pdf [file2.pdf …]'); process.exit(1); }
const out = new URL('../tests/parser/fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const file of files) {
  try {
    const rows = await extractRows(new Uint8Array(readFileSync(file)), pdfjs);
    const r = parseForm1040(rows, { evidence: true });
    console.log(`\n${basename(file)} — ${r.vendor.name} · ${r.taxYear ?? 'year ?'} · ${r.filingStatus ?? 'status ?'} · quality ${r.quality}`);
    for (const k of Object.keys(r.figures).filter(k => k in FIELD_LABELS)) console.log(`  ${FIELD_LABELS[k].padEnd(44)} ${String(r.figures[k]).padStart(12)}`);
    for (const c of r.checks.filter(c => c.status === 'warn')) console.log(`  ⚠ ${c.label}: ${c.detail}`);
    const expected = Object.fromEntries(Object.keys(r.figures).filter(k => k in FIELD_LABELS).map(k => [k, r.figures[k]]));
    const name = `fixture-${(r.vendor.code || 'unknown').toLowerCase()}-${r.taxYear || 'year'}-${basename(file).replace(/\W+/g, '_').slice(0, 40)}.json`;
    writeFileSync(new URL(name, out), JSON.stringify({ vendor: r.vendor.code, vendorName: r.vendor.name, taxYear: r.taxYear, reviewed: false,
      rows: [...new Set(Object.values(r.evidence))], expected, missed: [] }, null, 2));
    console.log(`  → tests/parser/fixtures/${name} (review it, then set "reviewed": true)`);
  } catch (e) { console.error(`${basename(file)}: ${e.message}`); }
}
