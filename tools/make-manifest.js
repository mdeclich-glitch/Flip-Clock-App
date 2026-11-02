/* Genera manifest.json con versione e impronte (SHA-256) dei file dell'interfaccia.
   Uso:  1) aumenta "version" in package.json   2) npm run manifest   3) git commit + push */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const shellApi = parseInt(((fs.readFileSync(path.join(root, 'main.js'), 'utf8').match(/const SHELL_API = (\d+)/)) || [])[1], 10) || 1;

const files = {};
for (const name of ['index.html', 'mini.html']) {
  const text = fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
  files[name] = crypto.createHash('sha256').update(text).digest('hex');
}

fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: pkg.version, shellApi, files }, null, 2) + '\n');
console.log('manifest.json scritto: versione ' + pkg.version + ', shellApi ' + shellApi);
