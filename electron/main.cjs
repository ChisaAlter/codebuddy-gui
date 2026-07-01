const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const store = new Store();

let mainWindow = null, tray = null, codebuddyProcess = null;
const PORT = 7890;

function startCodeBuddy() {
  if (codebuddyProcess) return;
  try {
    codebuddyProcess = spawn('codebuddy', ['--serve', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
    codebuddyProcess.stdout.on('data', d => console.log('[cb]', d.toString().trim()));
    codebuddyProcess.stderr.on('data', d => console.error('[cb:err]', d.toString().trim()));
  } catch (e) { console.error('Failed to start codebuddy:', e); }
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 600, frame: false, backgroundColor: '#1a1a2e', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  mainWindow.loadURL('http://localhost:8080');
  mainWindow.on('close', e => { if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); } });
  mainWindow.on('closed', () => mainWindow = null);
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'public', 'vite.svg'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow && mainWindow.show() },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

app.whenReady().then(() => { startCodeBuddy(); createWindow(); createTray(); globalShortcut.register('CmdOrCtrl+Shift+C', () => mainWindow && (mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show())); });
app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit', () => { if (codebuddyProcess) codebuddyProcess.kill(); globalShortcut.unregisterAll(); });
ipcMain.handle('get-store', (_, k) => store.get(k));
ipcMain.handle('set-store', (_, k, v) => store.set(k, v));
