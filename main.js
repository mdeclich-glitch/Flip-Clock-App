const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

// Gestione argomenti di riga di comando per Windows Screensaver
const args = process.argv;
const isScreensaver = args.some(arg => arg.toLowerCase().startsWith('/s'));
const isPreview = args.some(arg => arg.toLowerCase().startsWith('/p'));
const isConfigure = args.some(arg => arg.toLowerCase().startsWith('/c'));

function createWindow() {
  // Se l'utente apre le impostazioni dello screensaver (/c)
  if (isConfigure) {
    app.quit();
    return;
  }

  // Se è in modalità Anteprima (/p), possiamo chiudere o mostrare in finestra ridotta
  if (isPreview) {
    // La maggior parte dei moduli screensaver portatili in Electron 
    // preferisce uscire subito per evitare il blocco del pannello di controllo
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: isScreensaver, // Schermo intero solo se avviato come /s
    frame: !isScreensaver,
    alwaysOnTop: isScreensaver,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const fileToLoad = isScreensaver ? 'screensaver.html' : 'index.html';
  mainWindow.loadFile(path.join(__dirname, fileToLoad));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Listener per la chiusura richiesta dall'interfaccia (es. movimento mouse nello screensaver)
ipcMain.on('close-screensaver', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});