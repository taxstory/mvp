// Replays every calibration fixture (tests/parser/fixtures/*.json, made with the /calibrate page or scripts/calibrate-returns.mjs).
// Reviewed fixtures must read exactly; fields listed in `missed` are reported as TODO (known gaps) instead of failing the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseForm1040 } from '../../src/utils/form1040Parser.js';

const dir = new URL('./fixtures/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json'));
if (!files.length) test('no calibration fixtures yet', { todo: 'add fixtures from real client copies (see docs/SAMPLE_RETURNS.md)' }, () => {});
for (const f of files) {
  const fx = JSON.parse(readFileSync(new URL(f, dir)));
  const parsed = parseForm1040(fx.rows).figures;
  for (const [k, v] of Object.entries(fx.expected || {})) {
    const todo = !fx.reviewed ? 'fixture not reviewed yet' : (fx.missed || []).includes(k) ? 'reader does not find this field yet' : false;
    test(`${f} (${fx.vendorName || fx.vendor || 'unknown'} ${fx.taxYear || ''}): ${k}`, { todo }, () => assert.equal(parsed[k], v));
  }
}
