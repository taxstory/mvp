const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const blocked = ['parse-return.js', 'generate-audio.js'];
const found = blocked.filter(name => fs.existsSync(path.join(root, 'netlify/functions', name)));
if (found.length) {
  console.error(`SECURITY RELEASE BLOCKER: deprecated Netlify functions present: ${found.join(', ')}`);
  process.exit(1);
}
console.log('PASS: vulnerable legacy Netlify endpoints are absent');
