const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');

const isDev = !app.isPackaged;
let mainWindow = null;
const startupLog = path.join(__dirname, '..', 'electron-startup.log');

// CodeBuddy 端口管理
const CODEBUDDY_PORT = 63918;
let codebuddyProc = null;
let codebuddyPortPromise = null;
let codebuddyPort = null;

function logStartup(message) {
  try {
    fs.appendFileSync(startupLog, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

logStartup('main.cjs loaded');

// ====== CodeBuddy 生命周期管理 ======

function healthCheck(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForCodeBuddy(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await healthCheck(port);
    if (ok) {
      logStartup(`CodeBuddy ready on port ${port}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startCodeBuddy(port) {
  logStartup(`Starting codebuddy --serve --port ${port}...`);

  // 先检查是否已有 CodeBuddy 在这个端口上运行
  const alreadyRunning = await healthCheck(port);
  if (alreadyRunning) {
    logStartup(`CodeBuddy already running on port ${port}`);
    return port;
  }

  // 启动新的 CodeBuddy 实例
  return new Promise((resolve, reject) => {
    const proc = spawn('codebuddy', ['--serve', '--port', String(port)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    codebuddyProc = proc;

    proc.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logStartup(`codebuddy stdout: ${text}`);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logStartup(`codebuddy stderr: ${text}`);
    });

    proc.on('error', (err) => {
      logStartup(`codebuddy spawn error: ${err.message}`);
      codebuddyProc = null;
      reject(err);
    });

    proc.on('exit', (code, signal) => {
      logStartup(`codebuddy exited code=${code} signal=${signal}`);
      codebuddyProc = null;
      codebuddyPort = null;
    });

    // 轮询等待就绪
    waitForCodeBuddy(port).then((ready) => {
      if (ready) {
        logStartup(`CodeBuddy started on port ${port}`);
        resolve(port);
      } else {
        logStartup('CodeBuddy start timeout');
        // 即使超时也返回端口（可能稍后就绪）
        resolve(port);
      }
    });
  });
}

// IPC: 渲染进程获取端口
ipcMain.handle('codebuddy:getPort', async () => {
  if (codebuddyPort) return codebuddyPort;
  if (codebuddyPortPromise) return codebuddyPortPromise;

  codebuddyPortPromise = startCodeBuddy(CODEBUDDY_PORT).then((port) => {
    codebuddyPort = port;
    return port;
  });

  return codebuddyPortPromise;
});

function getRendererEntry() {
  if (isDev) return 'http://localhost:5173';
  const prodIndex = path.join(__dirname, '..', 'out', 'dist', 'index.html');
  return `file://${prodIndex.replace(/\\/g, '/')}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForRenderer(url, attempts = 30) {
  if (!isDev) return true;
  for (let i = 0; i < attempts; i += 1) {
    const ok = await probeUrl(url);
    logStartup(`probe ${i + 1}/${attempts} ${url} => ${ok}`);
    if (ok) return true;
    await wait(500);
  }
  return false;
}

async function createWindow() {
  logStartup('createWindow called');
  let entry = getRendererEntry();
  const ready = await waitForRenderer(entry, 40);
  logStartup(`renderer ready=${ready} entry=${entry}`);

  // 如果 Vite dev server 不可达，回退到生产构建
  if (!ready && isDev) {
    const prodIndex = path.join(__dirname, '..', 'out', 'dist', 'index.html');
    const prodEntry = `file://${prodIndex.replace(/\\/g, '/')}`;
    if (fs.existsSync(prodIndex)) {
      logStartup(`dev server unreachable, falling back to ${prodEntry}`);
      entry = prodEntry;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'CodeBuddy GUI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: true,
    },
  });

  mainWindow.loadURL(entry).catch((error) => {
    logStartup(`loadURL failed: ${error?.message || error}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.on('did-fail-load', (_event, code, desc, validatedURL) => {
      logStartup(`did-fail-load code=${code} desc=${desc} url=${validatedURL}`);
      setTimeout(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const ok = await waitForRenderer(entry, 10);
          logStartup(`retry after fail ready=${ok}`);
          // 如果 Vite 仍然不可达，回退到生产构建
          if (!ok) {
            const prodIndex = path.join(__dirname, '..', 'out', 'dist', 'index.html');
            const prodEntry = `file://${prodIndex.replace(/\\/g, '/')}`;
            if (fs.existsSync(prodIndex)) {
              logStartup(`fallback to prod: ${prodEntry}`);
              mainWindow.loadURL(prodEntry).catch(() => {});
              return;
            }
          }
          mainWindow.loadURL(entry).catch(() => {});
        }
      }, 1200);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      logStartup('did-finish-load');
    });
  }
}

ipcMain.handle('app:ping', async () => 'pong');
ipcMain.handle('git:run', async (_event, args = []) => {
  return await new Promise((resolve) => {
    const cwd = 'C:/Ai/ChisaCode';
    const proc = spawn('git', args, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output: stdout.trim() });
      else resolve({ ok: false, error: stderr.trim() || stdout.trim() || `git exited ${code}` });
    });
  });
});
ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('window:reload', () => { if (mainWindow) mainWindow.webContents.reload(); });
ipcMain.on('window:openDevTools', () => { if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' }); });

app.whenReady().then(async () => {
  // 后台启动 CodeBuddy（不阻塞窗口创建）
  // 存入 codebuddyPortPromise 避免 IPC handler 重复启动
  codebuddyPortPromise = startCodeBuddy(CODEBUDDY_PORT).then((port) => {
    codebuddyPort = port;
    logStartup(`CodeBuddy port ready: ${port}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('codebuddy:portReady', port);
    }
    return port;
  }).catch((err) => {
    logStartup(`CodeBuddy start failed: ${err.message}`);
    codebuddyPortPromise = null;
    throw err;
  });

  // 立即创建窗口（渲染进程会等待端口就绪）
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
