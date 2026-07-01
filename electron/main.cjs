const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const store = new Store();
const { existsSync } = require('fs');

let mainWindow = null, tray = null, codebuddyProcess = null;
const PORT = store.get('codebuddyPort', 7890);

// ── Find codebuddy executable ──
function findCodeBuddy() {
  // Check common locations
  const candidates = [
    'codebuddy',
    'codebuddy.cmd',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'codebuddy', 'codebuddy.cmd'),
    path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', '.bin', 'codebuddy.cmd'),
    path.join('C:', 'Program Files', 'WorkBuddy', 'resources', 'app.asar.unpacked', 'cli', 'bin', 'codebuddy'),
  ];
  
  for (const cmd of candidates) {
    if (!cmd) continue;
    try {
      if (existsSync(cmd)) return cmd;
    } catch(e) {}
  }
  
  // Try where/whereis
  try {
    const { execSync } = require('child_process');
    const result = execSync('where codebuddy 2>nul || echo notfound', { encoding: 'utf8' }).trim();
    if (result && result !== 'notfound') return result.split('\n')[0].trim();
  } catch(e) {}
  
  return null;
}

// ── Start CodeBuddy backend ──
function startCodeBuddy() {
  if (codebuddyProcess) return;
  
  const execPath = findCodeBuddy();
  
  if (!execPath) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'CodeBuddy Not Found',
      message: 'Could not find codebuddy executable. Please make sure it is installed and in your PATH.',
      buttons: ['OK']
    }).catch(() => {});
    return;
  }
  
  try {
    codebuddyProcess = spawn(execPath, ['--serve', '--port', String(PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true
    });
    codebuddyProcess.stdout.on('data', d => console.log('[cb]', d.toString().trim()));
    codebuddyProcess.stderr.on('data', d => console.error('[cb:err]', d.toString().trim()));
    codebuddyProcess.on('exit', code => {
      console.log(`[codebuddy] exited with code ${code}`);
      codebuddyProcess = null;
    });
    codebuddyProcess.on('error', err => {
      console.error('[codebuddy] process error:', err.message);
      codebuddyProcess = null;
    });
  } catch (e) {
    console.error('Failed to start codebuddy:', e);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Startup Error',
      message: `Failed to start CodeBuddy: ${e.message}`,
      buttons: ['OK']
    }).catch(() => {});
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 600, frame: false, backgroundColor: '#121214', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
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
