/* Genera manifest.json con versione e impronte (SHA-256) dei file dell'interfaccia.
   Uso: node tools/make-manifest.js */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cartella principale del progetto (sale di un livello da tools/)
const root = path.join(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Estrae la versione SHELL_API da main.js
const mainJsContent = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const shellApiMatch = mainJsContent.match(/const SHELL_API = (\d+)/);
const shellApi = shellApiMatch ? parseInt(shellApiMatch[1], 10) : 1;

// File HTML da includere nel manifest per l'aggiornamento automatico
const targetFiles = ['index.html', 'mini.html', 'screensaver.html'];
const files = {};

for (const name of ['index.html', 'mini.html', 'screensaver.html']) {
  const filePath = path.join(root, name);
  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    files[name] = crypto.createHash('sha256').update(text).digest('hex');
  }
}

const manifestPath = path.join(root, 'manifest.json');
const manifestData = {
  version: pkg.version,
  shellApi: shellApi,
  files: files
};

const shellHash = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(root, 'main.js'), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

fs.writeFileSync(manifestPath, JSON.stringify({ version: pkg.version, shellApi, shellHash, files }, null, 2) + '\n');
console.log(`✓ manifest.json generato con successo: versione ${pkg.version}, shellApi ${shellApi}`);

