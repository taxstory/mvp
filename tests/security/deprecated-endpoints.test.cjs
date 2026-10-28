const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
test('legacy endpoints are absent in release source', () => {
  for (const file of ['parse-return.js', 'generate-audio.js']) {
    assert.equal(fs.existsSync(path.join(root, 'netlify/functions', file)), false, file);
  }
});
test('release guard rejects reintroduced legacy endpoint', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'taxstory-guard-'));
  try {
    fs.mkdirSync(path.join(temp, 'scripts'));
    fs.mkdirSync(path.join(temp, 'netlify/functions'), {recursive:true});
    fs.copyFileSync(path.join(root,'scripts/check-deprecated-endpoints.cjs'),path.join(temp,'scripts/check-deprecated-endpoints.cjs'));
    fs.writeFileSync(path.join(temp,'netlify/functions/parse-return.js'),'// legacy');
    const result = spawnSync(process.execPath,[path.join(temp,'scripts/check-deprecated-endpoints.cjs')],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/SECURITY RELEASE BLOCKER/);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
