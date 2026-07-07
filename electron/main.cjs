const { app, BrowserWindow, ipcMain, shell, net, safeStorage, dialog, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const express = require('express');

const isDev = !app.isPackaged;

// 生产构建本地 HTTP 服务器端口（动态分配）
let prodServerPort = null;


let mainWindow = null;
const startupLog = path.join(__dirname, '..', 'electron-startup.log');

// CodeBuddy 后端端口由 CLI --port 默认 auto-assign 随机分配，从 stdout 解析
let codebuddyProc = null;
let codebuddyPortPromise = null;
let codebuddyPort = null;
let codebuddyPassword = null;
const PASSWORD_FILE = path.join(app.getPath('userData'), 'codebuddy-password.txt');

function canEncryptPassword() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

function readSavedPassword() {
  try {
    if (!fs.existsSync(PASSWORD_FILE)) return null;
    const saved = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
    if (!saved) return null;
    if (saved.startsWith('enc:')) {
      const encrypted = Buffer.from(saved.slice(4), 'base64');
      return safeStorage.decryptString(encrypted);
    }
    if (canEncryptPassword()) savePassword(saved);
    return saved;
  } catch (error) {
    logStartup(`Saved password read failed: ${error.message}`);
    return null;
  }
}

function savePassword(password) {
  if (!password || !canEncryptPassword()) return;
  try {
    const value = `enc:${safeStorage.encryptString(password).toString('base64')}`;
    fs.writeFileSync(PASSWORD_FILE, value, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    logStartup(`Password save failed: ${error.message}`);
  }
}

function redactSecrets(text) {
  return String(text || '')
    .replace(/(Password\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/([?&]password=)[^\s&]+/gi, '$1[redacted]');
}

codebuddyPassword = readSavedPassword();

function logStartup(message) {
  try {
    fs.appendFileSync(startupLog, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

logStartup('main.cjs loaded');

// ====== CodeBuddy 生命周期管理 ======

async function authenticateCodeBuddy(port, password) {
  logStartup(`Authenticating with CodeBuddy on port ${port}...`);
  try {
    const authUrl = `http://127.0.0.1:${port}/?password=${encodeURIComponent(password)}`;
    // 用主进程 net.fetch 访问认证 URL，cookie 写入默认 session
    await net.fetch(authUrl, { headers: { 'X-CodeBuddy-Request': '1' } });
    logStartup('CodeBuddy auth successful');
    return true;
  } catch (e) {
    logStartup(`CodeBuddy auth failed: ${e.message}`);
    return false;
  }
}

async function startCodeBuddy() {
  // 复用：若已有本应用 spawn 的后端进程仍活着且端口已解析，直接返回
  if (codebuddyProc && !codebuddyProc.killed && codebuddyPort && codebuddyPassword) {
    logStartup(`CodeBuddy already running on port ${codebuddyPort} (reuse)`);
    return codebuddyPort;
  }

  logStartup('Starting codebuddy --serve (random port)...');

  return new Promise((resolve, reject) => {
    // shell:true 让 Windows cmd.exe 解析 npm 全局 shim 文件（codebuddy 是 node 脚本 + .cmd wrapper）
    // 否则 spawn 直接找 'codebuddy' executable 会 ENOENT（Electron 主进程不继承 Git Bash PATH）
    const proc = spawn('codebuddy', ['--serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    codebuddyProc = proc;
    let resolved = false;
    const finish = (err, port) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(port);
    };
    // 总超时 30s，避免 stdout 不吐端口时永久挂起
    const timer = setTimeout(() => {
      logStartup('CodeBuddy start timeout (no port parsed from stdout)');
      finish(new Error('CodeBuddy start timeout: port not announced in stdout'));
    }, 30000);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) logStartup(`codebuddy stdout: ${redactSecrets(text)}`);
      // 解析端口（CLI 输出形如 "http://127.0.0.1:52066"）
      if (!codebuddyPort) {
        const portMatch = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (portMatch) {
          codebuddyPort = Number(portMatch[1]);
          logStartup(`Parsed CodeBuddy port from stdout: ${codebuddyPort}`);
        }
      }
      // 解析密码（匹配 "Password    xxx" 行 或 ?password=xxx URL）
      if (!codebuddyPassword) {
        const pwMatch = text.match(/Password\s+([\w-]+)/);
        if (pwMatch) {
          codebuddyPassword = pwMatch[1];
          logStartup('Parsed CodeBuddy password from stdout');
          savePassword(codebuddyPassword);
        } else {
          const urlMatch = text.match(/\?password=([\w-]+)/);
          if (urlMatch) {
            codebuddyPassword = urlMatch[1];
            logStartup('Parsed CodeBuddy password from URL');
            savePassword(codebuddyPassword);
          }
        }
      }
      // 端口和密码都拿到即完成（认证稍后异步做，不阻塞 resolve）
      if (codebuddyPort && codebuddyPassword) {
        authenticateCodeBuddy(codebuddyPort, codebuddyPassword).catch(e =>
          logStartup(`Auth failed: ${e.message}`)
        );
        finish(null, codebuddyPort);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logStartup(`codebuddy stderr: ${redactSecrets(text)}`);
    });

    proc.on('error', (err) => {
      logStartup(`codebuddy spawn error: ${err.message}`);
      codebuddyProc = null;
      finish(err);
    });

    proc.on('exit', (code, signal) => {
      logStartup(`codebuddy exited code=${code} signal=${signal}`);
      codebuddyProc = null;
      codebuddyPort = null;
      finish(new Error(`CodeBuddy exited before announcing port (code=${code})`));
    });
  });
}

// IPC: 渲染进程获取端口和密码
function ensureCodeBuddyPortPromise() {
  if (codebuddyPortPromise) return codebuddyPortPromise;
  codebuddyPortPromise = startCodeBuddy().then((port) => {
    codebuddyPort = port;
    logStartup(`CodeBuddy port ready: ${port}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('codebuddy:portReady', port);
    }
    return { port, password: codebuddyPassword };
  }).catch((err) => {
    logStartup(`CodeBuddy start failed: ${err.message}`);
    codebuddyPortPromise = null;
    throw err;
  });
  return codebuddyPortPromise;
}

ipcMain.handle('codebuddy:getPort', async () => {
  if (codebuddyPort && codebuddyPassword) return { port: codebuddyPort, password: codebuddyPassword };
  return ensureCodeBuddyPortPromise();
});

function getRendererEntry() {
  if (isDev) return 'http://localhost:5173';
  return `http://127.0.0.1:${prodServerPort}/index.html`;
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

  // 如果 Vite dev server 不可达，回退到本地 HTTP 生产构建
  if (!ready && isDev) {
    const prodIndex = path.join(__dirname, '..', 'out', 'dist', 'index.html');
    if (fs.existsSync(prodIndex)) {
      entry = `http://127.0.0.1:${prodServerPort}/index.html`;
      logStartup(`dev server unreachable, falling back to ${entry}`);
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

  // 捕获渲染进程控制台全级别输出（dev 模式详记，生产只记 WARN+）
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (isDev || level >= 2) {
      const tag = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : level === 1 ? 'INFO' : 'LOG';
      const src = sourceId ? ` @${sourceId.split('/').slice(-2).join('/')}:${line}` : '';
      logStartup(`renderer [${tag}]${src}: ${message}`);
    }
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
            if (fs.existsSync(prodIndex)) {
              const prodUrl = `http://127.0.0.1:${prodServerPort}/index.html`;
              logStartup(`fallback to prod: ${prodUrl}`);
              mainWindow.loadURL(prodUrl).catch(() => {});
              return;
            }
          }
          mainWindow.loadURL(entry).catch(() => {});
        }
      }, 1200);
    });
  }
}

const GIT_ALLOWED_COMMANDS = new Set([
  'add', 'branch', 'checkout', 'commit', 'diff', 'fetch', 'init', 'log', 'pull', 'push', 'remote', 'reset', 'stash', 'status',
]);

function normalizeGitRequest(payload) {
  const request = Array.isArray(payload) ? { args: payload } : (payload || {});
  const args = Array.isArray(request.args) ? request.args.map(String) : [];
  const cwd = typeof request.cwd === 'string' && request.cwd.trim() ? request.cwd.trim() : process.cwd();
  return { args, cwd };
}

function validateGitArgs(args) {
  if (!args.length) return 'empty git command';
  const command = args[0] === '-C' ? args[2] : args[0];
  if (!command || command.startsWith('-') || !GIT_ALLOWED_COMMANDS.has(command)) {
    return `git subcommand is not allowed: ${command || '<empty>'}`;
  }
  return null;
}

const CODEBUDDY_REQUEST_TIMEOUT_MS = 30000;

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return {
    signal: controller.signal,
    cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

ipcMain.handle('app:ping', async () => 'pong');
ipcMain.handle('git:run', async (_event, payload = {}) => {
  const { args, cwd } = normalizeGitRequest(payload);
  const validationError = validateGitArgs(args);
  if (validationError) return { ok: false, error: validationError };

  return await new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (error) => resolve({ ok: false, error: error.message }));
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output: stdout.trim() });
      else resolve({ ok: false, error: stderr.trim() || stdout.trim() || `git exited ${code}` });
    });
  });
});

ipcMain.handle('codebuddy:request', async (_event, request = {}) => {
  // timeoutMs 由前端透传：session/prompt 等 SSE �请求传 120000，普通 REST 30s
  const timeoutMs = Number.isFinite(Number(request.timeoutMs)) ? Number(request.timeoutMs) : CODEBUDDY_REQUEST_TIMEOUT_MS;
  const timeout = createTimeoutSignal(timeoutMs);
  try {
    const method = request.method || 'GET';
    const url = String(request.url || '');
    if (!/^https?:\/\/127\.0\.0\.1:\d+\//.test(url) && !/^https?:\/\/localhost:\d+\//.test(url)) {
      return { ok: false, status: 400, statusText: 'Bad Request', body: 'Only localhost CodeBuddy requests are allowed' };
    }
    const response = await net.fetch(url, {
      method,
      headers: request.headers || {},
      body: request.body,
      signal: timeout.signal,
    });
    // SSE 流式：net.fetch 的 AbortSignal 对流读取不一定生效，这里改成主动读流 + 超 timeout 强切
    const isSse = (response.headers.get('content-type') || '').includes('text/event-stream');
    let body = '';
    if (isSse && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const tMax = Date.now() + timeoutMs;
      while (true) {
        if (Date.now() > tMax) { try { reader.cancel(); } catch(_) {} break; }
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } else {
      body = await response.text();
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError' || /aborted/i.test(error.message || '');
    return {
      ok: false,
      status: isTimeout ? 408 : 0,
      statusText: isTimeout ? 'Request Timeout' : error.message,
      body: isTimeout ? `CodeBuddy request timed out after ${timeoutMs}ms` : error.message,
    };
  } finally {
    timeout.cleanup();
  }
});
ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('window:reload', () => { if (mainWindow) mainWindow.webContents.reload(); });

// 工作区选择：弹原生目录选择对话框，返回所选绝对路径或 null（用户取消）
ipcMain.handle('workspace:choose', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择工作区目录',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});
ipcMain.on('window:openDevTools', () => { if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' }); });

app.whenReady().then(async () => {
  // 注入 Content-Security-Policy：覆盖 dev/prod 双路，消除 Electron 安全告警
  // - 'wasm-unsafe-eval' 足 monaco-editor wasm，不开 'unsafe-eval'（Electron 告警源）
  // - connect-src 放本地随机端口 + ws，供后端 / SSE / PTY WebSocket
  // - style-src 'unsafe-inline' 足 React 内联样式；Google Fonts 域名放开
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: Object.assign({}, details.responseHeaders, {
        'Content-Security-Policy': [CSP],
      }),
    });
  });

  // 启动本地 HTTP 服务器，从 out/dist 目录服务生产构建
  const distPath = path.join(__dirname, '..', 'out', 'dist');
  const staticApp = express();
  staticApp.use(express.static(distPath, {
    etag: true,
    maxAge: isDev ? 0 : '1h',
    setHeaders(res, filePath) {
      if (/\.[a-f0-9]{8,}\./i.test(path.basename(filePath))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', isDev ? 'no-store' : 'public, max-age=3600');
      }
    },
  }));
  const staticServer = await new Promise((resolve) => {
    const s = staticApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  prodServerPort = staticServer.address().port;
  logStartup(`Static server on http://127.0.0.1:${prodServerPort}`);

  ensureCodeBuddyPortPromise();

  // 立即创建窗口（渲染进程会等待端口就绪）
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
