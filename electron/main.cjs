const { app, BrowserWindow, ipcMain, shell, net, dialog, session, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { createProductStateStore } = require('./product-state.cjs');
const { createCodeBuddyRuntimeManager } = require('./codebuddy-runtime-manager.cjs');

const isDev = !app.isPackaged;

// 生产构建本地 HTTP 服务器端口（动态分配）
let prodServerPort = null;
let staticServer = null; // express 静态服务器引用：before-quit 时显式 close 避免端口残留

let mainWindow = null;
let tray = null;
let pendingWindowShow = false;
let windowCreationPromise = null;
// startup.log 放 userData：打包后 __dirname 在 asar 内（只读虚拟路径），相对路径写失败被静默吞
const startupLog = path.join(app.getPath('userData'), 'electron-startup.log');

// 窗口状态持久化文件（P0-3）
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const productStateStore = createProductStateStore(app.getPath('userData'), logStartup);

function readWindowState() {
  try {
    if (!fs.existsSync(WINDOW_STATE_FILE)) return null;
    const s = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf8'));
    // 简单合法性校验：宽高正数、屏幕内可见
    if (typeof s.width !== 'number' || typeof s.height !== 'number' || s.width < 100 || s.height < 100) return null;
    return s;
  } catch (_) { return null; }
}

function writeWindowState(state) {
  try { fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state)); } catch (_) { /* 写失败不阻塞 */ }
}

// 真退出标志：tray 点"退出"或 Cmd/Q 时为 true，window-all-closed 看到 true 才 quit
// 普通 X 关窗口不设它，window-all-closed 改 hide 不 quit
let reallyQuitting = false;

function redactSecrets(text) {
  return String(text || '')
    // 后端 stdout 形态："Password    xxx" / "Password: xxx" / "Password:xxx"（大写开头，留冒号）
    .replace(/(Password\s*:\s*)[^\s,}]+/g, '$1[redacted]')
    .replace(/(Password\s+)[^\s,}]+/g, '$1[redacted]')
    // JSON 形态："password":"xxx" / 'password':'xxx'（保留值的引号对）
    .replace(/(["']password["']\s*:\s*)(["'])[^"']+\2/g, '$1$2[redacted]$2')
    // URL query 形态：?password=xxx / &password=xxx
    .replace(/([?&]password=)[^\s&]+/gi, '$1[redacted]');
}

function logStartup(message) {
  try {
    // 日志轮转：超 1MB 截断保留尾 200KB，避免长期启动累积占满磁盘 + 测试全文读越来越慢
    try {
      const stats = fs.statSync(startupLog);
      if (stats.size > 1024 * 1024) {
        const tail = fs.readFileSync(startupLog);
        fs.writeFileSync(startupLog, tail.slice(-200 * 1024));
      }
    } catch (_) { /* 文件不存在或读失败不阻塞写入 */ }
    fs.appendFileSync(startupLog, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

logStartup('main.cjs loaded');

const runtimeManager = createCodeBuddyRuntimeManager({
  net,
  logger: (message) => logStartup(redactSecrets(message)),
  onStatus: (runtime) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('runtime:status', runtime);
    }
  },
});

ipcMain.handle('runtime:ensure', (_event, request = {}) => runtimeManager.ensure(request.projectId, request.cwd));
ipcMain.handle('runtime:list', () => runtimeManager.list());
ipcMain.handle('runtime:stop', (_event, projectId) => runtimeManager.stop(projectId));
ipcMain.handle('runtime:restart', (_event, request = {}) => runtimeManager.restart(request.projectId, request.cwd));
ipcMain.handle('app:getInfo', () => ({
  name: app.getName(),
  version: app.getVersion(),
  packaged: app.isPackaged,
  userDataPath: app.getPath('userData'),
}));

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

  // 恢复上次窗口状态（P0-3）：bounds + isMaximized，最小化不存
  const savedBounds = readWindowState();
  const winOpts = {
    width: savedBounds?.width || 1440,
    height: savedBounds?.height || 920,
    minWidth: 1200,
    minHeight: 760,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'CodeBuddy GUI',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: true,
    },
  };
  if (savedBounds?.x != null && savedBounds?.y != null) {
    winOpts.x = savedBounds.x;
    winOpts.y = savedBounds.y;
  }
  mainWindow = new BrowserWindow(winOpts);
  if (savedBounds?.isMaximized) {
    mainWindow.maximize();
  }

  // 窗口状态持久化（P0-3）：关闭/最大化/移动/缩放时存，最小化不存
  const saveWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) return; // 最小化不存
    const isMax = mainWindow.isMaximized();
    const b = isMax ? (lastNormalBounds || mainWindow.getNormalBounds()) : mainWindow.getBounds();
    if (!isMax) lastNormalBounds = b;
    writeWindowState({ ...b, isMaximized: isMax });
  };
  let lastNormalBounds = null;
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', () => { lastNormalBounds = mainWindow.getNormalBounds(); saveWindowState(); });
  mainWindow.on('unmaximize', saveWindowState);
  mainWindow.on('close', (event) => {
    saveWindowState();
    if (!reallyQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(entry).catch((error) => {
    logStartup(`loadURL failed: ${error?.message || error}`);
    // 生产模式无 did-fail-load 兜底，失败时给用户可见提示而非黑屏静默
    if (!isDev && mainWindow && !mainWindow.isDestroyed()) {
      try {
        dialog.showErrorBox(
          'CodeBuddy GUI 加载失败',
          `无法加载应用界面：\n\n${error?.message || error}\n\n启动日志已写入 userData/electron-startup.log，重启应用前建议反馈给开发者。`,
        );
      } catch (_) {}
    }
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

function showOrCreateMainWindow() {
  if (!app.isReady() || (!isDev && !prodServerPort)) {
    pendingWindowShow = true;
    return null;
  }
  pendingWindowShow = false;
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (!windowCreationPromise) {
      windowCreationPromise = createWindow()
        .catch((error) => {
          logStartup(`Window creation failed: ${error?.stack || error}`);
          try {
            dialog.showErrorBox('CodeBuddy GUI 启动失败', error?.message || String(error));
          } catch (_) {}
        })
        .finally(() => { windowCreationPromise = null; });
    }
    return windowCreationPromise;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

const GIT_ALLOWED_COMMANDS = new Set([
  'add', 'branch', 'checkout', 'clean', 'commit', 'diff', 'fetch', 'init', 'log', 'pull', 'push', 'remote', 'reset', 'restore', 'rev-parse', 'stash', 'status',
]);

// 二级子命令白名单：只校验出现在主命令后第一位置的子动词（非选项，即不以 - 开头）
// 缺省为 ['*'] 表示不约束（如 add/status/diff 等本身不再细分）
// checkout 特殊：既能切分支又能 checkout 文件，分支名是任意字符串无法白名单，故只约束选项
const GIT_ALLOWED_SUBCOMMANDS = {
  branch: new Set(['--show-current', '--format=%(refname:short)']), // 只放 UI 在用的两条
  checkout: new Set(['-b']), // -b 新建切换；其余选项拦截，裸 checkout 切分支名不约束
  stash: new Set(['pop', 'list']), // 显式放 pop/list；不带子动词 = stash push（UI 不用但安全）
  remote: new Set(['get-url']),
  reset: new Set(['HEAD']), // reset HEAD -- path / reset HEAD -- . 是 UI 唯一形态
};

// git 选项黑名单：拦截可执行外部命令 / 改变传输行为的危险选项
// 参考 git-receive-pack / git-upload-pack 可被恶意 server 触发执行任意 hook
const GIT_BLOCKED_OPTIONS = new Set([
  '--upload-pack',    // fetch/pull 可指定 upload-pack，传 shell 命令被远端执行
  '--receive-pack',   // push 同理
  '--config', '-c',   // 任意 config override，可覆盖 core.hooksPath / user 等
  '--exec',           // git exec-path
  '--shallow-exclude',// 改 shallow 边界，虽不直接 exec 但可放大攻击面
  '--local-config',   // alias 链
]);

const GIT_PATH_OPTIONS = new Set(['--']); // '之后' 一律当 path，不再当选项解析

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
  const cmdIndex = args[0] === '-C' ? 2 : 0;

  // 二级子命令约束：主命令后第一项若是子动词或受限选项必须在白名单
  // '--' 是路径段分隔符，遇之跳入路径豁免（如 checkout -- file 不算二级子命令）
  // checkout 特例：只校验选项式（-b 等），非选项分支名/文件名不约束（任意字符串无法白名单）
  const allowedSubs = GIT_ALLOWED_SUBCOMMANDS[command];
  const next = args[cmdIndex + 1];
  if (allowedSubs && next && next !== '--') {
    const isOption = next.startsWith('-');
    const skipSubverb = command === 'checkout' && !isOption; // checkout 分支名/文件名豁免
    if (!isOption && !skipSubverb) {
      if (!allowedSubs.has(next)) return `git ${command} subcommand is not allowed: ${next}`;
    } else if (isOption && next.startsWith('--')) {
      const branchFmtOk = command === 'branch' && next.startsWith('--format=');
      if (!branchFmtOk && !allowedSubs.has(next)) return `git ${command} option is not allowed: ${next}`;
    }
  }

  // 选项黑名单 + '--' 后路径段豁免
  let inPath = false;
  for (let i = cmdIndex + 1; i < args.length; i++) {
    const a = args[i];
    if (inPath) continue;
    if (GIT_PATH_OPTIONS.has(a)) { inPath = true; continue; }
    const key = a.split('=')[0];
    if (GIT_BLOCKED_OPTIONS.has(key)) {
      return `git option is blocked for security: ${key}`;
    }
  }
  return null;
}

const CODEBUDDY_REQUEST_TIMEOUT_MS = 30000;
const codebuddyStreams = new Map();

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
      if (code === 0) resolve({ ok: true, output: stdout });
      else resolve({ ok: false, error: stderr.trim() || stdout.trim() || `git exited ${code}` });
    });
  });
});

function parseSseMessagesFromBuffer(buffer) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() || '';
  const messages = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    const eventType = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6).trim();
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data) continue;
    try {
      const message = JSON.parse(data);
      messages.push(
        eventType && eventType !== 'message' && message && typeof message === 'object' && !message.type
          ? { ...message, type: eventType }
          : message,
      );
    } catch (error) {
      logStartup(`codebuddy stream JSON parse failed: ${error.message}`);
    }
  }
  return { messages, rest };
}

ipcMain.handle('codebuddy:openStream', async (event, request = {}) => {
  const streamId = String(request.streamId || '');
  const url = String(request.url || '');
  if (!streamId) return { ok: false, error: 'missing streamId' };
  if (!/^https?:\/\/127\.0\.0\.1:\d+\//.test(url) && !/^https?:\/\/localhost:\d+\//.test(url)) {
    return { ok: false, error: 'Only localhost CodeBuddy streams are allowed' };
  }

  const controller = new AbortController();
  codebuddyStreams.set(streamId, controller);
  try {
    const response = await net.fetch(url, {
      method: 'GET',
      headers: request.headers || {},
      signal: controller.signal,
    });
    if (!response.ok) {
      codebuddyStreams.delete(streamId);
      event.sender.send('codebuddy:streamError', { streamId, error: `ACP stream failed: ${response.status}` });
      return { ok: false, status: response.status };
    }
    const reader = response.body?.getReader?.();
    if (!reader) {
      codebuddyStreams.delete(streamId);
      event.sender.send('codebuddy:streamError', { streamId, error: 'ACP stream body unavailable' });
      return { ok: false, error: 'stream body unavailable' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const sender = event.sender;
    (async () => {
      const emitMessages = (messages) => {
        for (const message of messages) {
          if (!sender.isDestroyed()) sender.send('codebuddy:streamMessage', { streamId, message });
        }
      };
      try {
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.trim()) {
              const parsed = parseSseMessagesFromBuffer(`${buffer}\n\n`);
              buffer = parsed.rest;
              emitMessages(parsed.messages);
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseMessagesFromBuffer(buffer);
          buffer = parsed.rest;
          emitMessages(parsed.messages);
        }
      } catch (error) {
        if (!controller.signal.aborted && !sender.isDestroyed()) {
          sender.send('codebuddy:streamError', { streamId, error: error.message });
        }
      } finally {
        try { reader.releaseLock?.(); } catch (_) {}
        codebuddyStreams.delete(streamId);
        if (!controller.signal.aborted && !sender.isDestroyed()) {
          sender.send('codebuddy:streamError', { streamId, error: 'ACP stream closed' });
        }
      }
    })();
    return { ok: true };
  } catch (error) {
    codebuddyStreams.delete(streamId);
    event.sender.send('codebuddy:streamError', { streamId, error: error.message });
    return { ok: false, error: error.message };
  }
});

ipcMain.on('codebuddy:closeStream', (_event, streamId) => {
  const controller = codebuddyStreams.get(String(streamId || ''));
  if (controller) {
    controller.abort();
    codebuddyStreams.delete(String(streamId || ''));
  }
});

ipcMain.handle('codebuddy:request', async (_event, request = {}) => {
  // timeoutMs 由前端透传：session/prompt 等 SSE 长请求使用 120000ms，普通 REST 使用 30000ms。
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
    let truncated = false; // SSE 超时截断标记：前端据此识别"流中断"而非"流自然结束"
    if (isSse && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const tMax = Date.now() + timeoutMs;
      let rpcId = null;
      let inspectionBuffer = '';
      try {
        if (method === 'POST' && /\/api\/v1\/acp$/.test(url) && request.body) {
          rpcId = JSON.parse(request.body)?.id ?? null;
        }
      } catch (_) {}
      while (true) {
        if (Date.now() > tMax) { truncated = true; try { reader.cancel(); } catch(_) {} break; }
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        body += chunk;
        if (rpcId != null) {
          inspectionBuffer += chunk;
          const parsed = parseSseMessagesFromBuffer(inspectionBuffer);
          inspectionBuffer = parsed.rest;
          if (parsed.messages.some((message) => String(message?.id) === String(rpcId))) {
            try { await reader.cancel(); } catch (_) {}
            break;
          }
        }
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
      truncated, // SSE 流被 timeout 截断时为 true；前端 parseEventStreamMessages 据此判中断
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
ipcMain.handle('attachment:choose', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: '选择要发送的文件或图片',
  });
  if (result.canceled) return [];
  const imageTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const textExtensions = new Set([
    '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml',
    '.yml', '.yaml', '.toml', '.ini', '.py', '.java', '.c', '.h', '.cpp', '.hpp',
    '.go', '.rs', '.sh', '.ps1', '.sql', '.csv', '.log', '.env',
  ]);
  const attachments = [];
  for (const filePath of result.filePaths) {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const base = { name: path.basename(filePath), path: filePath, size: stat.size };
    if (imageTypes[ext]) {
      if (stat.size > 20 * 1024 * 1024) throw new Error(`${base.name} 超过 20MB 图片限制`);
      attachments.push({ ...base, kind: 'image', mimeType: imageTypes[ext], data: fs.readFileSync(filePath).toString('base64') });
      continue;
    }
    if (!textExtensions.has(ext) && stat.size > 2 * 1024 * 1024) {
      attachments.push({ ...base, kind: 'unsupported', error: '该二进制文件无法作为文本发送' });
      continue;
    }
    if (stat.size > 5 * 1024 * 1024) throw new Error(`${base.name} 超过 5MB 文本文件限制`);
    attachments.push({ ...base, kind: 'text', mimeType: 'text/plain', text: fs.readFileSync(filePath, 'utf8') });
  }
  return attachments;
});
ipcMain.handle('productState:load', () => productStateStore.load());
ipcMain.handle('productState:save', (_event, state) => productStateStore.save(state));
ipcMain.on('window:openDevTools', () => { if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' }); });

// 未捕获异常处理（P0-4）：写 crash log 到 userData，dialog 提示用户
function writeCrashLog(type, err) {
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    const ts = new Date().toISOString();
    const stack = err?.stack || String(err);
    fs.appendFileSync(logPath, `\n[${ts}] ${type}: ${stack}\n`);
  } catch (_) { /* 写失败不阻塞 */ }
}
process.on('uncaughtException', (err) => {
  writeCrashLog('uncaughtException', err);
  try {
    dialog.showErrorBox('CodeBuddy GUI 发生异常', `程序遇到未捕获异常:\n\n${err?.message || err}\n\n崩溃日志已写入 userData/crash.log，重启应用前建议反馈给开发者。`);
  } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  writeCrashLog('unhandledRejection', reason);
});

// 单实例锁（P0-2）：避免多开实例 spawn 多个 codebuddy --serve 抢端口/资源
const gotLock = app.requestSingleInstanceLock();
logStartup(`single instance lock acquired=${gotLock}`);
if (!gotLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    // 二次启动可能发生在首个实例仍初始化静态服务器时，统一延迟到就绪后显示。
    showOrCreateMainWindow();
  });
}

app.whenReady().then(async () => {
  // 注入 Content-Security-Policy：覆盖 dev/prod 双路，消除 Electron 安全告警
  // - 'wasm-unsafe-eval' 足 monaco-editor wasm，不开 'unsafe-eval'（Electron 告警源）
  // - connect-src：渲染层 REST/SSE 请求全部经 IPC（window.electronAPI.requestCodeBuddy → 主进程
  //   net.fetch，不受 CSP 约束），故不再放 http://127.0.0.1:* 通配，收紧本机横向越权面
  // - 仅保留 ws://127.0.0.1:* 供 PTY WebSocket（pty.js 渲染层直连，端口随 --serve 随机分配）
  // - style-src 'unsafe-inline' 足 React 内联样式；Google Fonts 域名放开
  const CSP = [
    "default-src 'self'",
    // dev: Vite HMR client + @vitejs/plugin-react preamble 需 inline script；生产构建无 inline，更严
    `script-src ${isDev ? "'self' 'wasm-unsafe-eval' 'unsafe-inline'" : "'self' 'wasm-unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws://127.0.0.1:*",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  logStartup(`CSP injected: ${isDev ? 'dev(unsafe-inline)' : 'prod(strict)'} script-src`);
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
  const staticServerInstance = await new Promise((resolve) => {
    const s = staticApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  staticServer = staticServerInstance;
  prodServerPort = staticServer.address().port;
  logStartup(`Static server on http://127.0.0.1:${prodServerPort}`);

  // 静态服务器就绪后再创建窗口；CodeBuddy 运行时由渲染进程按当前项目惰性启动。
  showOrCreateMainWindow();

  // Tray 图标：关窗口不退出，最小化到系统托盘，用户从托盘菜单退出才真 quit
  try {
    const trayIconPath = path.join(__dirname, '..', 'build', 'icon.png');
    tray = new Tray(trayIconPath);
    tray.setToolTip('CodeBuddy GUI');
    tray.on('click', showOrCreateMainWindow);
    const menu = Menu.buildFromTemplate([
      { label: '显示窗口', click: showOrCreateMainWindow },
      { type: 'separator' },
      { label: '退出', click: () => { reallyQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    logStartup('Tray icon created');
  } catch (err) {
    logStartup(`Tray creation failed: ${err.message}`);
  }

  // cookie 跨 session 校验：主进程 net.fetch 认证后写 default session cookie，
  // 渲染进程 fetch 也走 default session —— 理论上共享。加日志给后续诊断真证据。
  // 真发 session/prompt 时若认证失效，渲染进程 store.bootstrap 会自己 fetch 认证兜底
});

// 真退出前树杀 codebuddy 子进程：shell:true spawn 出来的 node.exe 不会随 Electron 退
// 不树杀会变孤儿进程占 stdout + 占端口，下次启动端口冲突（实测残留过 PID 42940/18192）
app.on('before-quit', () => {
  reallyQuitting = true;
  // 显式关闭 express 静态服务器：OS 虽会随进程退出回收端口，但显式 close 避免单实例锁失败场景的端口短暂残留
  if (staticServer) {
    try { staticServer.close(); } catch (_) {}
    staticServer = null;
  }
  for (const controller of codebuddyStreams.values()) {
    try { controller.abort(); } catch (_) {}
  }
  codebuddyStreams.clear();
  runtimeManager.stopAll().catch((error) => logStartup(`Runtime shutdown failed: ${error.message}`));
  if (tray) { try { tray.destroy(); } catch (_) {} tray = null; }
});

// 关窗口不退出 = 最小化到托盘；只有 reallyQuitting（托盘退出 / Cmd+Q）才真 quit
// 注意：tray 退出菜单调的是 app.quit()，会触发 before-quit → will-quit → quit 全链，
// window-all-closed 在 quit 链里只是被动确认——reallyQuitting 已被 before-quit 设 true，
// 非 darwin 走 app.quit() 是幂等（quit 已发起），darwin 不再 quit 留给 activate 兜底
app.on('window-all-closed', () => {
  if (!reallyQuitting && tray) return;
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  showOrCreateMainWindow();
});
