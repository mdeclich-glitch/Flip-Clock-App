/* Pubblica un aggiornamento: alza la versione, rigenera manifest.json, fa commit e push.
   Uso:  npm run release                 (versione +0.0.1)
         npm run release -- minor        (versione +0.1.0)
         npm run release -- patch "Testo del commit" */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'inherit' });
const gitOut = (...args) => execFileSync('git', args, { cwd: root }).toString();
const fail = (m) => { console.error('\n' + m + '\n'); process.exit(1); };

try { gitOut('--version'); } catch (e) { fail('Git non trovato. Installalo da git-scm.com, poi riapri il terminale.'); }
try { gitOut('rev-parse', '--is-inside-work-tree'); } catch (e) { fail('Questa cartella non è una repo Git.'); }

const status = gitOut('status', '--porcelain');
if (!status.trim()) { console.log('Nessuna modifica da pubblicare.'); process.exit(0); }
const shellChanged = /^.. "?main\.js"?$/m.test(status);

const kinds = ['major', 'minor', 'patch'];
let kind = 'patch', msg = '';
const [a, b] = process.argv.slice(2);
if (kinds.includes(a)) { kind = a; msg = b || ''; } else if (a) { msg = a; }

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const v = String(pkg.version).split('.').map(n => parseInt(n, 10) || 0);
while (v.length < 3) v.push(0);
if (kind === 'major') { v[0]++; v[1] = 0; v[2] = 0; }
else if (kind === 'minor') { v[1]++; v[2] = 0; }
else v[2]++;
pkg.version = v.join('.');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Versione ' + pkg.version);

execFileSync(process.execPath, [path.join(__dirname, 'make-manifest.js')], { cwd: root, stdio: 'inherit' });

git('add', '-A');
git('commit', '-m', 'v' + pkg.version + (msg ? ': ' + msg : ''));
git('push');

console.log('\nPubblicato la versione ' + pkg.version + '. L\'app la scarica da sola entro pochi minuti.');
if (shellChanged) console.log('ATTENZIONE: hai modificato main.js. Alza SHELL_API in main.js e rifai anche "npm run dist": l\'aggiornamento automatico non basta.');
