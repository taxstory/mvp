// Replays every calibration fixture (tests/parser/fixtures/*.json, made with the /calibrate page or scripts/calibrate-returns.mjs).
// Reviewed fixtures must read exactly; fields listed in `missed` are reported as TODO (known gaps) instead of failing the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { parseForm1040 } from '../../src/utils/form1040Parser.js';

const dir = new URL('./fixtures/', import.meta.url);
// TS-003: a missing or empty fixtures directory is a clear FAILURE (not an uncaught ENOENT, and not a silent pass).
const present = existsSync(dir);
const files = present ? readdirSync(dir).filter(f => f.endsWith('.json')) : [];
test('calibration fixtures are present', () => {
  assert.ok(present, 'tests/parser/fixtures/ is missing — restore it from the release package (it must be committed, not uploaded through the browser)');
  assert.ok(files.length > 0, 'tests/parser/fixtures/ has no fixtures');
});
for (const f of files) {
  const fx = JSON.parse(readFileSync(new URL(f, dir)));
  const parsed = parseForm1040(fx.rows).figures;
  for (const [k, v] of Object.entries(fx.expected || {})) {
    const todo = !fx.reviewed ? 'fixture not reviewed yet' : (fx.missed || []).includes(k) ? 'reader does not find this field yet' : false;
    test(`${f} (${fx.vendorName || fx.vendor || 'unknown'} ${fx.taxYear || ''}): ${k}`, { todo }, () => assert.equal(parsed[k], v));
  }
}
