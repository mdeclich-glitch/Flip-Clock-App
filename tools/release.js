/* Pubblica un aggiornamento: incrementa la versione, rigenera manifest.json, fa commit e push.
   Uso: node tools/release.js [patch|minor|major] [messaggio] */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Cartella principale del progetto (sale di un livello da tools/)
const root = path.join(__dirname, '..');

const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'inherit' });
const gitOut = (...args) => execFileSync('git', args, { cwd: root }).toString();
const fail = (msg) => { console.error('\n❌ Errore: ' + msg + '\n'); process.exit(1); };

// Verifiche ambiente Git
try { gitOut('--version'); } catch (e) { fail('Git non è installato o non è presente nel PATH di sistema.'); }
try { gitOut('rev-parse', '--is-inside-work-tree'); } catch (e) { fail('La cartella corrente non è un repository Git.'); }

const status = gitOut('status', '--porcelain');
if (!status.trim()) {
  console.log('Nessuna modifica da pubblicare.');
  process.exit(0);
}

const shellChanged = /^.. "?main\.js"?$/m.test(status);

// Gestione argomenti
const kinds = ['major', 'minor', 'patch'];
let kind = 'patch';
let msg = '';

const args = process.argv.slice(2);
if (kinds.includes(args[0])) {
  kind = args[0];
  msg = args[1] || '';
} else if (args[0]) {
  msg = args[0];
}

// Aggiornamento versione in package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const versionParts = String(pkg.version).split('.').map(n => parseInt(n, 10) || 0);

while (versionParts.length < 3) versionParts.push(0);

if (kind === 'major') {
  versionParts[0]++;
  versionParts[1] = 0;
  versionParts[2] = 0;
} else if (kind === 'minor') {
  versionParts[1]++;
  versionParts[2] = 0;
} else {
  versionParts[2]++;
}

pkg.version = versionParts.join('.');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`\n🚀 Nuova versione: ${pkg.version}`);

// Esecuzione di make-manifest.js
const makeManifestScript = path.join(__dirname, 'make-manifest.js');
execFileSync(process.execPath, [makeManifestScript], { cwd: root, stdio: 'inherit' });

// Commit e Push su Git
git('add', '-A');
git('commit', '-m', `v${pkg.version}${msg ? ': ' + msg : ''}`);
git('push');

console.log(`\n✅ Pubblicata la versione ${pkg.version}. L'applicazione scaricherà le modifiche in background.`);

if (shellChanged) {
  console.log('\n⚠️ ATTENZIONE: È stato modificato main.js.');
  console.log('Assicurati di aver incrementato SHELL_API in main.js e di compilare nuovamente il salvaschermo con "npm run build:scr".');
}