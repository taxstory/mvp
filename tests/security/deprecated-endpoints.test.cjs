const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const guard = path.join(root, 'scripts/check-deprecated-endpoints.cjs');
const runGuard = dir => spawnSync(process.execPath, [guard, dir], { encoding: 'utf8' });

function sandbox(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taxstory-guard-'));
  fs.mkdirSync(path.join(dir, 'netlify/functions'), { recursive: true });
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), '// legacy'); }
  return dir;
}

test('the release source has no deprecated function anywhere (recursive)', () => {
  const r = runGuard(root);
  assert.equal(r.status, 0, r.stderr);
});

for (const [name, files] of [
  ['top-level legacy endpoint',             ['netlify/functions/parse-return.js']],
  ['legacy endpoint in a nested tree (TS-001)', ['netlify/functions/netlify/functions/parse-return.js']],
  ['legacy endpoint anywhere else',         ['src/src/generate-audio.js']],
  ['nested functions directory, no legacy', ['netlify/functions/netlify/functions/save-return.js']],
]) {
  test(`guard rejects: ${name}`, () => {
    const dir = sandbox(files);
    try {
      const r = runGuard(dir);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /SECURITY RELEASE BLOCKER/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test('guard passes a clean tree', () => {
  const dir = sandbox(['netlify/functions/save-return.js']);
  try { assert.equal(runGuard(dir).status, 0); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
