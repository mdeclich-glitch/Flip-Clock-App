/* Pubblica una nuova versione in un solo comando.
   Uso:  npm run ship -- "messaggio" [patch|minor|major]      (default: patch)
   Sequenza: versione -> manifest -> commit locale + tag -> push del SOLO tag (GitHub vuole un tag valido per
   creare la Release) -> installer su GitHub Release (con nuovi tentativi) -> push del ramo.
   Il push del ramo (cioè del manifest visibile alle app) avviene SOLO se la Release ha installer, latest.yml e blockmap. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const msg = process.argv[2] || 'aggiornamento';
const kind = ['patch', 'minor', 'major'].includes(process.argv[3]) ? process.argv[3] : 'patch';
const MAX_TRIES = 4;

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) { console.error('Manca GH_TOKEN (o GITHUB_TOKEN): impostalo prima di pubblicare.'); process.exit(1); }

const run = c => execSync(c, { cwd: root, stdio: 'inherit' });
const readPkg = () => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Controlla via API che la Release v<versione> contenga installer, latest.yml e blockmap */
async function assetsOk(pkg) {
  const pub = (pkg.build.publish || [])[0] || {};
  const url = 'https://api.github.com/repos/' + pub.owner + '/' + pub.repo + '/releases/tags/v' + pkg.version;
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'ship-script', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return false;
    const names = ((await r.json()).assets || []).map(a => a.name);
    const has = re => names.some(n => re.test(n));
    console.log('Asset sulla Release: ' + (names.join(', ') || '(nessuno)'));
    return has(/\.exe$/) && has(/\.exe\.blockmap$/) && names.includes('latest.yml');
  } catch (e) { console.warn('Verifica asset non riuscita: ' + e.message); return false; }
}

(async () => {
  run('npm version ' + kind + ' --no-git-tag-version');
  run('node tools/make-manifest.js');
  const pkg = readPkg();
  const tag = 'v' + pkg.version;

  /* Commit locale e tag pubblicato PRIMA della Release: così il tag esiste su GitHub, ma il ramo (e il manifest) no */
  run('git add -A');
  run('git commit -m "' + tag + ': ' + msg.replace(/"/g, "'") + '"');
  try { run('git tag ' + tag); } catch (e) { console.warn('Tag ' + tag + ' già presente in locale, lo riuso.'); }
  run('git push origin ' + tag);

  let ok = false;
  for (let i = 1; i <= MAX_TRIES && !ok; i++) {
    console.log('\n--- Pubblicazione v' + pkg.version + ', tentativo ' + i + '/' + MAX_TRIES + ' ---');
    /* dal secondo tentativo riusa la build già pronta: niente ricompilazione */
    const prepackaged = i > 1 && fs.existsSync(path.join(root, 'dist', 'win-unpacked'));
    try { run('npx electron-builder --win ' + (prepackaged ? '--prepackaged dist/win-unpacked ' : '') + '--publish always'); }
    catch (e) { console.warn('electron-builder ha dato errore (ritento se mancano file).'); }
    ok = await assetsOk(pkg);
    if (!ok && i < MAX_TRIES) await sleep(5000);
  }
  if (!ok) { console.error('\nRelease incompleta dopo ' + MAX_TRIES + ' tentativi: NON faccio il push del ramo (il tag ' + tag + ' è già su GitHub). Controlla e rilancia.'); process.exit(1); }

  run('git push'); /* ora il manifest diventa visibile alle app */
  console.log('\nPubblicata la ' + tag);
})();
