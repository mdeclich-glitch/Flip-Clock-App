const { app, BrowserWindow, dialog, ipcMain, screen, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pkg = require('./package.json');

const SHELL_API = 4;
const PEAR_EXE = 'C:\\Users\\matte\\AppData\\Local\\Programs\\youtube-music\\YouTube Music.exe';

let mainWindow;
let miniWindow = null;
let locked = false;
let lastMiniState = [];
let miniTarget = { mode: 'clock' };
let updateReady = null;

// Gestione argomenti per riconoscere la modalità Screensaver da Windows (/s, /p, /c)
const args = process.argv.slice(1);
const isSaverMode = args.some(arg => arg.toLowerCase().startsWith('/s')) || 
                    process.execPath.toLowerCase().endsWith('.scr');
const isPreviewMode = args.some(arg => arg.toLowerCase().startsWith('/p'));
const isConfigMode = args.some(arg => arg.toLowerCase().startsWith('/c'));

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

function createWindow() {
  if (isConfigMode) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Flip Clock Screensaver',
      message: 'Flip Clock Screensaver non richiede configurazioni aggiuntive.'
    });
    app.quit();
    return;
  }

  const winOptions = {
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  };

  if (isSaverMode || isPreviewMode) {
    winOptions.fullscreen = true;
    winOptions.frame = false;
    winOptions.alwaysOnTop = true;
    winOptions.skipTaskbar = true;
  }

  mainWindow = new BrowserWindow(winOptions);
  
  if (isSaverMode || isPreviewMode) {
    mainWindow.loadFile(pagePath('screensaver.html'));
  } else {
    mainWindow.loadFile(pagePath('index.html'));
  }

  if (isSaverMode) {
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');

    let initialMousePos = screen.getCursorScreenPoint();
    
    const mouseCheckInterval = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const currentPos = screen.getCursorScreenPoint();
      const distance = Math.hypot(currentPos.x - initialMousePos.x, currentPos.y - initialMousePos.y);
      if (distance > 10) {
        clearInterval(mouseCheckInterval);
        app.quit();
      }
    }, 100);

    mainWindow.webContents.on('before-input-event', () => {
      app.quit();
    });
  }

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

  const keepFront = () => {
    if (!locked || !mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.on('restore', () => { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); });
  mainWindow.on('closed', () => { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); });
  mainWindow.on('minimize', () => setTimeout(keepFront, 50));
  mainWindow.on('hide', () => setTimeout(keepFront, 50));

  mainWindow.on('close', (e) => {
    if (isSaverMode) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Annulla', 'Chiudi comunque'],
      title: 'Conferma uscita',
      message: 'Sei sicuro di voler chiudere l\'applicazione?'
    });
    if (choice === 0) {
      e.preventDefault();
    }
  });
}

function openMini(target) {
  if (isSaverMode) return;
  miniTarget = target && target.mode === 'timer' && target.id ? { mode: 'timer', id: String(target.id) } : { mode: 'clock' };
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('mini-target', miniTarget);
    miniWindow.show();
    if (mainWindow && !mainWindow.isMinimized()) mainWindow.minimize();
    return;
  }
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

ipcMain.on('open-mini', (e, t) => openMini(t));
ipcMain.on('mini-close', closeMini);

ipcMain.on('set-fullscreen', (event, makeFullscreen) => {
  locked = !!makeFullscreen;
  mainWindow.setKiosk(locked);
  mainWindow.setAlwaysOnTop(locked, 'screen-saver');
});

ipcMain.on('mini-state', (e, st) => {
  lastMiniState = Array.isArray(st) ? st : [];
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('mini-state', lastMiniState);
});

ipcMain.handle('mini-get-state', () => lastMiniState);
ipcMain.handle('mini-get-target', () => miniTarget);

ipcMain.on('mini-cmd', (e, c) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('timer-cmd', c);
});

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

ipcMain.handle('launch-pear', async () => {
  if (!fs.existsSync(PEAR_EXE)) return { ok: false, error: 'not-found' };
  const err = await shell.openPath(PEAR_EXE);
  return { ok: !err, error: err };
});

ipcMain.handle('update-status', () => updateReady);
ipcMain.on('restart-app', () => { app.relaunch(); app.exit(0); });

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});