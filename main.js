const { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const pkg = require('./package.json');
const { autoUpdater } = require('electron-updater');

/* Versione dell'"involucro" (questo file). Aumentala SOLO se cambi main.js in modo che
   i vecchi index.html/mini.html/screensaver.html non funzionino più: in quel caso serve rifare npm run dist. */
const SHELL_API = 8; // 8: finestra UniMiB (nuovo canale IPC open-uni, solo domini *.unimib.it)
                     // 7: eccezione schermo intero per Spotify/Pear (nuovo canale IPC music-pass)
                     // 6: mini ridimensionabile + click-through fisso (nuovi canali IPC mini-resize, mini-hot, mini-near)

/* Modalità di avvio: app normale, screensaver (/s o --screensaver) oppure anteprima (/p) */
const argv = process.argv.map(s => s.toLowerCase());
const MODE = (argv.includes('--screensaver') || argv.includes('/s')) ? 'saver'
           : argv.some(x => x.startsWith('/p')) ? 'preview'
           : 'app';                       // /c e nessun argomento aprono l'app


let mainWindow;
let isForceClosing = false;
let miniWindow = null; // mini orologio sempre in primo piano
let locked = false; // vero quando lo schermo intero protetto è attivo
let musicPass = false; // vero mentre l'orologio lascia passare Spotify/Pear davanti a sé
let musicPassTimer = null;
const MUSIC_FALLBACK_MS = 3 * 60 * 1000; // piano B: se il controllo della finestra attiva non parte, l'orologio torna davanti dopo questo tempo
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

    if ((m.shellApi || 1) > SHELL_API) { checkShellUpdate(); return; } // serve un nuovo involucro: lo scarica electron-updater

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

/* ---------- Aggiornamento automatico dell'involucro (main.js, Electron, dipendenze) ----------
   Usa le Release di GitHub: scarica il nuovo installer in background e lo installa
   alla chiusura dell'app, oppure subito quando premi il pulsante di aggiornamento. */
let shellUpdate = false;     // vero quando un nuovo installer è stato scaricato
let shellChecking = false;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-downloaded', (info) => {
  shellUpdate = true;
  notifyUpdate({ version: info.version, needsInstall: false });
});
autoUpdater.on('error', (e) => console.warn('Aggiornamento app non riuscito:', e && e.message));
async function checkShellUpdate() {
  if (!app.isPackaged || shellUpdate || shellChecking) return;
  shellChecking = true;
  try { await autoUpdater.checkForUpdates(); }
  catch (e) { console.warn('Controllo aggiornamento app non riuscito:', e && e.message); }
  finally { shellChecking = false; }
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
    endMusicPass();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
    mainWindow.focus();
  };
  // Se riapri l'app dalla barra delle applicazioni, il mini orologio si chiude
  mainWindow.on('restore', () => { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); });
  mainWindow.on('closed', () => {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
    closeSaverWindows();
    if (uniWindow && !uniWindow.isDestroyed()) uniWindow.close();
  });
  // Tornando sull'orologio (Alt+Tab, barra delle applicazioni...) il blocco davanti a tutto si ripristina
  mainWindow.on('focus', () => { if (musicPass) endMusicPass(); });
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

  const s0 = readSettings();
  const w = Math.min(MINI_MAX_W, Math.max(MINI_MIN_W, Math.round(Number(s0.miniW) || 280)));
  const h = Math.round(w / MINI_ASPECT);
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
  miniWindow.setIgnoreMouseEvents(true, { forward: true }); // click-through fisso: i clic attraversano il mini
  miniNearTimer = setInterval(pollMiniNear, 100);
  miniWindow.on('closed', () => {
    miniWindow = null; miniNear = false; clearInterval(miniNearTimer);
  });
  mainWindow.minimize();
}

/* ---------- Mini: ridimensionamento e click-through ---------- */
const MINI_ASPECT = 280 / 128, MINI_MIN_W = 140, MINI_MAX_W = 900;
let miniNear = false, miniNearTimer = null;
/* Con il click-through il mouse "attraversa" la finestra, quindi la sua posizione si legge da qui:
   il mini si schiarisce (trasparenza) solo mentre il cursore gli passa sopra */
function pollMiniNear() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const p = screen.getCursorScreenPoint(), b = miniWindow.getBounds();
  const near = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  if (near !== miniNear) { miniNear = near; miniWindow.webContents.send('mini-near', near); }
}
/* Il mini è sempre click-through: torna cliccabile solo mentre il mouse è sull'angolo dei comandi */
ipcMain.on('mini-hot', (e, hot) => {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.setIgnoreMouseEvents(!hot, { forward: true });
});
/* Sposta il mini (trascinamento dalla maniglia): la pagina manda lo spostamento dal punto di partenza */
let miniOrigin = null;
ipcMain.on('mini-move', (e, m) => {
  if (!miniWindow || miniWindow.isDestroyed() || !m) return;
  if (m.start) { miniOrigin = miniWindow.getBounds(); return; }
  if (!miniOrigin) return;
  const o = miniOrigin;
  let x = o.x + (Number(m.dx) || 0), y = o.y + (Number(m.dy) || 0);
  const wa = screen.getDisplayMatching({ x, y, width: o.width, height: o.height }).workArea;
  x = Math.max(wa.x - o.width + 40, Math.min(x, wa.x + wa.width - 40));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - 40));
  miniWindow.setBounds({ x, y, width: o.width, height: o.height }); // stessa misura: evita derive con lo scaling di Windows
});
/* Ridimensiona mantenendo le proporzioni e senza uscire dall'area di lavoro */
ipcMain.on('mini-resize', (e, req) => {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const w = Math.round(Math.min(MINI_MAX_W, Math.max(MINI_MIN_W, Number(req) || 0)));
  if (!w) return;
  const h = Math.round(w / MINI_ASPECT);
  const b = miniWindow.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  miniWindow.setBounds({
    x: Math.max(wa.x, Math.min(b.x, wa.x + wa.width - w)),
    y: Math.max(wa.y, Math.min(b.y, wa.y + wa.height - h)),
    width: w, height: h
  });
});

function closeMini() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore(); mainWindow.show(); mainWindow.focus();
  }
}

/* ---------- Screensaver: una finestra nera per monitor, l'orologio solo sul principale ---------- */
let saverWins = []; // finestre dello screensaver aperte dall'app (in modalità /s restano vuote)
function startScreensaver(embedded) {
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
      query: { blank: d.id === primary ? '0' : '1', h24: s.h24 === false ? '0' : '1', case: s.flipCase || 'dark', embedded: embedded ? '1' : '0' }
    });
    w.once('ready-to-show', () => {
      w.show();
      if (embedded && d.id === primary) w.focus(); // serve il focus perché i tasti chiudano lo screensaver
    });
    if (embedded) {
      saverWins.push(w);
      w.on('closed', () => { saverWins = saverWins.filter(x => x !== w); });
    }
  });
}
function closeSaverWindows() {
  const ws = saverWins; saverWins = [];
  ws.forEach(w => { if (!w.isDestroyed()) w.close(); });
}
/* Chiusura: in modalità /s (screensaver di Windows) chiude tutto; avviato dall'app torna all'orologio */
ipcMain.on('close-screensaver', () => {
  if (MODE === 'saver') { app.quit(); return; }
  closeSaverWindows();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('saver-closed');
    if (locked) mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus();
  }
});
/* Inattività nell'app: l'orologio chiede lo screensaver. Risposte: true = avviato, 'skip' = non ora (riprova),
   false = non disponibile (l'orologio ripiega sullo schermo nero).
   Parte solo se l'orologio è in primo piano e in uso: con altre app davanti (musica, e-learning, mini orologio...)
   uno screensaver sopra a tutto darebbe fastidio. */
ipcMain.handle('start-saver', () => {
  if (MODE !== 'app') return false;
  if (saverWins.length) return true;
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused()) return 'skip';
  if (musicPass || (miniWindow && !miniWindow.isDestroyed()) || (uniWindow && !uniWindow.isDestroyed())) return 'skip';
  startScreensaver(true);
  return true;
});

ipcMain.on('open-mini', (e, t) => openMini(t));
ipcMain.on('mini-close', closeMini);
ipcMain.on('force-quit', () => {
  isForceClosing = true;
  app.quit();
});

/* ---------- Eccezione per i siti dell'università (*.unimib.it) ----------
   Un'altra app non può sapere quale sito è aperto in un browser, quindi i siti dell'ateneo (e-learning...)
   si aprono in una finestra dedicata dell'app, che può navigare SOLO su unimib.it e sui suoi sottodomini.
   Con lo schermo intero protetto la finestra sta davanti all'orologio; chiudendola si torna all'orologio.
   Il login resta salvato (sessione "persist:unimib"). Se l'accesso passa da un altro dominio
   (es. un provider di identità esterno), aggiungilo a UNI_EXTRA_HOSTS. */
const UNI_HOME = 'https://elearning.unimib.it/';
const UNI_EXTRA_HOSTS = [];
let uniWindow = null;
function isUniUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return false;
    const h = x.hostname.toLowerCase();
    return h === 'unimib.it' || h.endsWith('.unimib.it') || UNI_EXTRA_HOSTS.some(d => h === d || h.endsWith('.' + d));
  } catch (e) { return false; }
}
function raiseUni() {
  if (!uniWindow || uniWindow.isDestroyed()) return;
  if (uniWindow.isMinimized()) uniWindow.restore();
  uniWindow.show();
  if (locked) { uniWindow.setAlwaysOnTop(true, 'screen-saver'); uniWindow.moveTop(); }
  uniWindow.focus();
}
function openUni() {
  if (uniWindow && !uniWindow.isDestroyed()) { raiseUni(); return; }
  const w = new BrowserWindow({
    width: 1280, height: 860, autoHideMenuBar: false, title: 'UniMiB',
    webPreferences: { partition: 'persist:unimib', nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  uniWindow = w;
  const wc = w.webContents;
  // link che si aprono in una nuova scheda: restano nella stessa finestra se sono dell'ateneo, altrimenti niente
  wc.setWindowOpenHandler(({ url }) => { if (isUniUrl(url)) wc.loadURL(url); return { action: 'deny' }; });
  const guard = (event, url) => { if (!isUniUrl(url)) event.preventDefault(); };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  // Niente barra del browser: indietro / avanti / ricarica con tastiera e tasti laterali del mouse
  const hist = wc.navigationHistory;
  const goBack = () => { if (hist ? hist.canGoBack() : wc.canGoBack()) { hist ? hist.goBack() : wc.goBack(); } };
  const goFwd = () => { if (hist ? hist.canGoForward() : wc.canGoForward()) { hist ? hist.goForward() : wc.goForward(); } };
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    if ((input.alt && k === 'ArrowLeft') || k === 'BrowserBack') { event.preventDefault(); goBack(); }
    else if ((input.alt && k === 'ArrowRight') || k === 'BrowserForward') { event.preventDefault(); goFwd(); }
    else if (k === 'F5' || (input.control && (k === 'r' || k === 'R'))) { event.preventDefault(); wc.reload(); }
    else if (input.alt && k === 'Home') { event.preventDefault(); wc.loadURL(UNI_HOME); }
  });
  w.on('app-command', (e, cmd) => {              // tasti laterali del mouse (Windows)
    if (cmd === 'browser-backward') goBack();
    else if (cmd === 'browser-forward') goFwd();
  });
  // Barra con pulsanti sempre visibile in cima alla finestra (ogni voce è un pulsante)
  w.setMenu(Menu.buildFromTemplate([
    { label: '\u2190 Indietro', click: goBack },
    { label: 'Avanti \u2192', click: goFwd },
    { label: '\u27F3 Ricarica', click: () => wc.reload() },
    { label: '\u2302 Home e-learning', click: () => wc.loadURL(UNI_HOME) }
  ]));
  w.setMenuBarVisibility(true);
  w.on('closed', () => {
    uniWindow = null;
    if (locked && mainWindow && !mainWindow.isDestroyed()) { mainWindow.setAlwaysOnTop(true, 'screen-saver'); mainWindow.focus(); }
  });
  w.loadURL(UNI_HOME);
  if (locked) raiseUni();
}
ipcMain.on('open-uni', () => { if (mainWindow && !mainWindow.isDestroyed()) openUni(); });

/* ---------- Eccezione per Spotify / Pear Desktop ----------
   A schermo intero l'orologio sta davanti a tutto. Cliccando il player di Spotify o Pear, l'orologio
   smette di stare "sempre in primo piano" (resta comunque a schermo intero) e la musica gli passa davanti.
   Mentre l'eccezione è attiva un piccolo processo PowerShell legge quale app è in primo piano:
   se per circa 1,5 secondi non è né Spotify né Pear né l'orologio, il blocco riprende subito.
   Il blocco riprende anche quando:
   - l'orologio riprende il focus (Alt+Tab, clic sulla barra delle applicazioni...),
   - scatta una sveglia/timer, o l'orologio viene minimizzato/nascosto,
   - il controllo non riesce a partire: in quel caso, dopo MUSIC_FALLBACK_MS (piano B). */
const exeName = (p) => path.basename(String(p)).replace(/\.exe$/i, '').toLowerCase();
function musicProcNames() {
  const names = new Set(['spotify', 'youtube music', 'pear desktop', 'pear', exeName(process.execPath)]);
  try { pearCandidates().forEach(p => names.add(exeName(p))); } catch (e) {}
  return names;
}
/* PowerShell: ogni 0,5 s scrive il nome del processo della finestra in primo piano */
const FG_SCRIPT = [
  'Add-Type @"',
  'using System; using System.Runtime.InteropServices;',
  'public class FG {',
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '}',
  '"@',
  'while ($true) {',
  '  $n = ""',
  '  try { $p = [uint32]0; [void][FG]::GetWindowThreadProcessId([FG]::GetForegroundWindow(), [ref]$p); $n = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch {}',
  '  [Console]::Out.WriteLine($n); [Console]::Out.Flush()',
  '  Start-Sleep -Milliseconds 500',
  '}'
].join('\n');

let fgProc = null, fgBad = 0, fgGotData = false, fgCheckTimer = null;

function stopFgWatcher() {
  clearTimeout(fgCheckTimer); fgCheckTimer = null;
  if (fgProc) { const p = fgProc; fgProc = null; try { p.kill(); } catch (e) {} }
}
function resetMusicPass() { // azzera lo stato senza toccare la finestra
  musicPass = false;
  clearTimeout(musicPassTimer); musicPassTimer = null;
  stopFgWatcher();
}
function endMusicPass() {
  const was = musicPass;
  resetMusicPass();
  if (was && locked && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
}
function relockFromMusic() { // l'orologio torna davanti
  endMusicPass();
  if (locked && mainWindow && !mainWindow.isDestroyed()) { mainWindow.moveTop(); mainWindow.focus(); }
}
function startMusicFallback() {
  clearTimeout(musicPassTimer);
  musicPassTimer = setTimeout(() => { if (musicPass) relockFromMusic(); }, MUSIC_FALLBACK_MS);
}
function startFgWatcher() {
  if (fgProc) return;
  if (process.platform !== 'win32') { startMusicFallback(); return; }
  clearTimeout(musicPassTimer); musicPassTimer = null;
  fgBad = 0; fgGotData = false;
  const allowed = musicProcNames();
  let buf = '';
  try {
    const b64 = Buffer.from(FG_SCRIPT, 'utf16le').toString('base64');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    fgProc = p;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      fgGotData = true;
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const name = buf.slice(0, i).trim().toLowerCase();
        buf = buf.slice(i + 1);
        if (!musicPass || fgProc !== p) return;
        if (!name) continue;                        // nessuna finestra attiva (transizione): si ignora
        if (allowed.has(name)) { fgBad = 0; continue; }
        if (++fgBad >= 3) { relockFromMusic(); return; } // ~1,5 s su un'altra app (non scatta con un Alt+Tab veloce)
      }
    });
    const gone = () => { if (fgProc === p) { fgProc = null; if (musicPass) startMusicFallback(); } };
    p.on('error', gone);
    p.on('exit', gone);
    // se dopo 10 s non è arrivato nulla, il controllo non funziona: piano B
    fgCheckTimer = setTimeout(() => {
      if (fgProc === p && !fgGotData) { stopFgWatcher(); if (musicPass) startMusicFallback(); }
    }, 10000);
  } catch (e) { fgProc = null; startMusicFallback(); }
}

ipcMain.on('music-pass', () => {
  if (!locked || !mainWindow || mainWindow.isDestroyed()) return;
  musicPass = true;
  fgBad = 0;
  mainWindow.setAlwaysOnTop(false);
  startFgWatcher();
});

ipcMain.on('set-fullscreen', (event, makeFullscreen) => {
  resetMusicPass();
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
  resetMusicPass(); // una sveglia ha sempre la precedenza
  closeSaverWindows();
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
ipcMain.on('restart-app', () => {
  if (shellUpdate) {
    isForceClosing = true;                  // senza questo l'overlay di chiusura bloccherebbe l'installazione
    autoUpdater.quitAndInstall(false, true); // installa e riavvia
  } else {
    app.relaunch(); app.exit(0);
  }
});

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
  setTimeout(checkShellUpdate, 15000);
  setInterval(checkShellUpdate, 6 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', stopFgWatcher);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
