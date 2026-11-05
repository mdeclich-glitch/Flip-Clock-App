const { app, BrowserWindow, dialog, ipcMain, screen, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pkg = require('./package.json');

/* Versione dell'"involucro" (questo file). Aumentala SOLO se cambi main.js in modo che
   i vecchi index.html/mini.html/screensaver.html non funzionino più: in quel caso serve rifare npm run dist. */
const SHELL_API = 5;

/* Modalità di avvio: app normale, screensaver (/s o --screensaver) oppure anteprima (/p) */
const argv = process.argv.map(s => s.toLowerCase());
const MODE = (argv.includes('--screensaver') || argv.includes('/s')) ? 'saver'
           : argv.some(x => x.startsWith('/p')) ? 'preview'
           : 'app';                       // /c e nessun argomento aprono l'app


let mainWindow;
let isForceClosing = false;
let miniWindow = null; // mini orologio sempre in primo piano
let locked = false; // vero quando lo schermo intero protetto è attivo
let lastMiniState = []; // timer e pomodoro correnti, pubblicati dalla finestra principale
let miniTarget = { mode: 'clock' }; // cosa mostra il mini: { mode: 'clock' } oppure { mode: 'timer', id }
let updateReady = null; // { version, needsInstall } quando c'è un aggiornamento pronto

/* ---------- Aggiornamento automatico dei file dell'interfaccia ----------
   index.html, mini.html e screensaver.html vengono scaricati da pkg.liveUpdate.baseUrl e salvati in
   userData/live. Al prossimo avvio l'app li usa al posto di quelli inclusi nell'installer,
   senza bisogno di npm run dist. */
const LIVE_FILES = ['index.html', 'mini.html', 'screensaver.html'];
const liveDir = () => path.join(app.getPath('userData'), 'live');

function cmpVer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
function liveManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(liveDir(), 'manifest.json'), 'utf8')); }
  catch (e) { return null; }
}
/* Hash calcolato dopo aver uniformato i fine riga, così Git su Windows (CRLF) non lo altera */
function hashOf(buf) {
  return crypto.createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
}
function pagePath(name) {
  if (app.isPackaged) {
    const m = liveManifest();
    if (m && cmpVer(m.version, app.getVersion()) > 0 && (m.shellApi || 1) <= SHELL_API) {
      const p = path.join(liveDir(), name);
      if (fs.existsSync(p)) return p;
    }
  }
  return path.join(__dirname, name);
}
function notifyUpdate(u) {
  updateReady = u;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-ready', u);
}
async function checkLiveUpdate() {
  if (!app.isPackaged) return; // in sviluppo (npm start) si usano sempre i file locali
  const base = (pkg.liveUpdate && pkg.liveUpdate.baseUrl) || '';
  if (!/^https:\/\//.test(base) || /TUO_UTENTE/.test(base)) return;
  try {
    const bust = '?t=' + Date.now();
    const r = await net.fetch(base + 'manifest.json' + bust, { cache: 'no-store' });
    if (!r.ok) return;
    const m = await r.json();
    if (!m || typeof m.version !== 'string') return;

    let have = app.getVersion();
    const cur = liveManifest();
    if (cur && cmpVer(cur.version, have) > 0) have = cur.version;
    if (cmpVer(m.version, have) <= 0) return;

    if ((m.shellApi || 1) > SHELL_API) { notifyUpdate({ version: m.version, needsInstall: true }); return; }

    const tmp = liveDir() + '.tmp';
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    for (const name of LIVE_FILES) {
      const fr = await net.fetch(base + name + bust, { cache: 'no-store' });
      if (!fr.ok) throw new Error(name + ' HTTP ' + fr.status);
      const buf = Buffer.from(await fr.arrayBuffer());
      const want = m.files && m.files[name];
      if (want && hashOf(buf) !== want) throw new Error('hash non corrispondente: ' + name);
      if (buf.length < 500 || !/<html/i.test(buf.toString('utf8', 0, 2000))) throw new Error('file non valido: ' + name);
      fs.writeFileSync(path.join(tmp, name), buf);
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ version: m.version, shellApi: m.shellApi || 1 }));
    fs.rmSync(liveDir(), { recursive: true, force: true });
    fs.renameSync(tmp, liveDir());
    notifyUpdate({ version: m.version, needsInstall: false });
  } catch (e) {
    console.warn('Aggiornamento non riuscito:', e.message);
  }
}

/* ---------- Impostazioni condivise tra app e screensaver (es. formato 12/24 ore) ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { return {}; }
}
ipcMain.on('set-pref', (e, p) => {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(Object.assign(readSettings(), p))); } catch (err) {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false, // timer e allarme precisi anche a finestra ridotta
      autoplayPolicy: 'no-user-gesture-required' // le sveglie possono suonare senza un clic precedente
    }
  });

  mainWindow.loadFile(pagePath('index.html'));

  // Intercetta il reindirizzamento OAuth di Spotify
  const handleRedirect = (url) => {
    if (url.startsWith('https://127.0.0.1/')) {
      const queryParams = url.split('?')[1] || '';
      mainWindow.loadFile(pagePath('index.html'), { search: queryParams });
      return true;
    }
    return false;
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (handleRedirect(url)) event.preventDefault();
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (handleRedirect(url)) event.preventDefault();
  });

  // Schermo intero protetto: se la finestra viene minimizzata (gesture a 4 dita,
  // Win+D, Win+M...) la riporta subito davanti.
  const keepFront = () => {
    if (!locked || !mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
    mainWindow.focus();
  };
  // Se riapri l'app dalla barra delle applicazioni, il mini orologio si chiude
  mainWindow.on('restore', () => { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); });
  mainWindow.on('closed', () => { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); });
  mainWindow.on('minimize', () => setTimeout(keepFront, 50));
  mainWindow.on('hide', () => setTimeout(keepFront, 50));
  // Facoltativo (più rigido, blocca anche Alt+Tab): decommenta la riga sotto
  // mainWindow.on('blur', () => setTimeout(keepFront, 300));

  // Intercetta il tentativo di chiusura della finestra (incluso Alt+F4 e la "X")
  mainWindow.on('close', (e) => {
    if (!isForceClosing) {
      e.preventDefault();
      // Invia un messaggio alla finestra per mostrare l'overlay di blocco
      mainWindow.webContents.send('show-quit-overlay');
    }
  });
}

function openMini(target) {
  miniTarget = target && target.mode === 'timer' && target.id ? { mode: 'timer', id: String(target.id) } : { mode: 'clock' };
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('mini-target', miniTarget); // c'è già un mini: cambia solo ciò che mostra
    miniWindow.show();
    if (mainWindow && !mainWindow.isMinimized()) mainWindow.minimize();
    return;
  }
  // il blocco dello schermo intero non vale in modalità mini
  locked = false;
  mainWindow.setKiosk(false);
  mainWindow.setAlwaysOnTop(false);

  const w = 280, h = 128;
  const wa = screen.getPrimaryDisplay().workArea;
  miniWindow = new BrowserWindow({
    width: w, height: h,
    x: wa.x + wa.width - w - 20, y: wa.y + wa.height - h - 20,
    frame: false, transparent: true, hasShadow: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
  });
  // livello più alto: resta sopra anche alle altre app a schermo intero (non ai giochi in esclusiva)
  miniWindow.setAlwaysOnTop(true, 'screen-saver');
  try { miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
  miniWindow.loadFile(pagePath('mini.html'));
  miniWindow.on('closed', () => { miniWindow = null; });
  mainWindow.minimize();
}

function closeMini() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore(); mainWindow.show(); mainWindow.focus();
  }
}

/* ---------- Screensaver: una finestra nera per monitor, l'orologio solo sul principale ---------- */
function startScreensaver() {
  const primary = screen.getPrimaryDisplay().id;
  const s = readSettings();
  screen.getAllDisplays().forEach(d => {
    const w = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, show: false, backgroundColor: '#000', skipTaskbar: true, fullscreen: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(pagePath('screensaver.html'), {
      query: { blank: d.id === primary ? '0' : '1', h24: s.h24 === false ? '0' : '1' }
    });
    w.once('ready-to-show', () => w.show());
  });
}
ipcMain.on('close-screensaver', () => app.quit());

ipcMain.on('open-mini', (e, t) => openMini(t));
ipcMain.on('mini-close', closeMini);
ipcMain.on('force-quit', () => {
  isForceClosing = true;
  app.quit();
});

ipcMain.on('set-fullscreen', (event, makeFullscreen) => {
  locked = !!makeFullscreen;
  mainWindow.setKiosk(locked);
  mainWindow.setAlwaysOnTop(locked, 'screen-saver');
});

/* Mini orologio: UNA sola finestra mini, che mostra l'orologio oppure un timer/pomodoro a scelta.
   La finestra principale pubblica lo stato dei timer, il mini disegna quello scelto e rimanda i comandi. */
ipcMain.on('mini-state', (e, st) => {
  lastMiniState = Array.isArray(st) ? st : [];
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('mini-state', lastMiniState);
});
ipcMain.handle('mini-get-state', () => lastMiniState);
ipcMain.handle('mini-get-target', () => miniTarget);
ipcMain.on('mini-cmd', (e, c) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('timer-cmd', c);
});

/* Timer o sveglia in corso: porta l'orologio davanti (chiudendo il mini, se aperto) */
ipcMain.on('ring-alert', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.focus();
  if (!locked) mainWindow.setAlwaysOnTop(false);
  mainWindow.flashFrame(true);
  mainWindow.once('focus', () => { if (!mainWindow.isDestroyed()) mainWindow.flashFrame(false); });
});

/* Percorsi tipici di Pear Desktop (YouTube Music): prima quello salvato, poi quelli standard */
function pearCandidates() {
  const local = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  return [
    readSettings().pearPath,
    path.join(local, 'Programs', 'youtube-music', 'YouTube Music.exe'),
    path.join(pf, 'YouTube Music', 'YouTube Music.exe'),
  ].filter(Boolean);
}

/* Avvia Pear Desktop (se è già aperto Windows lo porta davanti) */
ipcMain.handle('launch-pear', async () => {
  let exe = pearCandidates().find(p => fs.existsSync(p));
  if (!exe) {
    // Non trovato: chiede all'utente dove si trova e ricorda la scelta
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleziona l\'eseguibile di Pear Desktop (YouTube Music)',
      properties: ['openFile'],
      filters: [{ name: 'Applicazioni', extensions: ['exe'] }]
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'not-found' };
    exe = r.filePaths[0];
    try {
      fs.writeFileSync(settingsFile(), JSON.stringify(Object.assign(readSettings(), { pearPath: exe })));
    } catch (e) {}
  }
  const err = await shell.openPath(exe);
  return { ok: !err, error: err };
});

ipcMain.handle('update-status', () => updateReady);
ipcMain.on('restart-app', () => { app.relaunch(); app.exit(0); });

/* Istanza singola solo in modalità app: lo screensaver deve poter partire anche con l'app aperta */
const gotLock = MODE !== 'app' || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!gotLock) return;
  if (MODE === 'preview') { app.quit(); return; }
  if (MODE === 'saver') { startScreensaver(); return; }

  createWindow();
  setTimeout(checkLiveUpdate, 8000);
  setInterval(checkLiveUpdate, 6 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
