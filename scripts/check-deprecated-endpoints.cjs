#!/usr/bin/env node
// Release guard (TS-001). Fails the build if any deprecated, security-sensitive function file exists ANYWHERE in the repository
// (not only at netlify/functions/<name>), or if a second functions tree is nested inside the functions directory.
// Usage: node scripts/check-deprecated-endpoints.cjs [repoRoot]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const BLOCKED = new Set(['parse-return.js', 'generate-audio.js']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.netlify']);

const blockedHits = [], nestedTrees = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      // Any functions tree below the real one (e.g. netlify/functions/netlify/functions) is a stray copy from a bad upload.
      if (rel.startsWith('netlify/functions/') && /(^|\/)functions$/.test(rel)) nestedTrees.push(rel);
      walk(full);
    } else if (BLOCKED.has(entry.name)) {
      blockedHits.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  }
}
walk(root);

const problems = [
  ...blockedHits.map(p => `deprecated function file present: ${p}`),
  ...nestedTrees.map(p => `nested copy of the functions directory: ${p}`),
];
if (problems.length) {
  console.error(`SECURITY RELEASE BLOCKER:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('PASS: no deprecated function files and no nested functions directories anywhere in the repository');
