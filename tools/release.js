/* Uso: npm run release -- "messaggio" [patch|minor|major]   (default: patch) */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const msg = process.argv[2] || 'aggiornamento';
const kind = process.argv[3] || 'patch';
const pj = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));

const v = pkg.version.split('.').map(Number);
if (kind === 'major') { v[0]++; v[1] = 0; v[2] = 0; }
else if (kind === 'minor') { v[1]++; v[2] = 0; }
else v[2]++;
pkg.version = v.join('.');
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');

const run = c => execSync(c, { cwd: root, stdio: 'inherit' });
run('node tools/make-manifest.js');
run('git add -A');
run('git commit -m "v' + pkg.version + ': ' + msg.replace(/"/g, "'") + '"');
run('git push');
console.log('Pubblicata la v' + pkg.version);