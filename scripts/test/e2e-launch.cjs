#!/usr/bin/env node
// 端到端启动测试：覆盖三件被打断的事 ——
//   1. Electron 启动 → spawn codebuddy --serve → stdout 吐随机端口
//   2. 渲染进程加载（startup.log 含 Static server + createWindow + 回退生产标志）
//   3. IPC 通路校验：preload 暴露 ↔ main handler 字符串一致性 ↔ store 调用链
//
// 不依赖 ws/undici/playwright；不弹真 dialog（避免 headless 卡住）。
// 用法：node scripts/test/e2e-launch.cjs
// 退出码 0 = 全过；非 0 = 有失败项。

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..', '..');
const startupLogPath = path.join(projectRoot, 'electron-startup.log');
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// 总超时兜底：90s 后强制 finish，避免任一 wait 卡死整轮
let finished = false;
const overallTimer = setTimeout(() => {
  if (finished) return;
  console.error('[timeout] 90s 总超时，强制收尾');
  try { killSpawnedProcesses(); } catch (_) {}
  finish();
}, 90000);

// 等 startup.log 里出现 main.cjs 写的完整端口行（30s 内）
// 只认 "Parsed CodeBuddy port from stdout: <数字>" —— 这条是 main.cjs 解析完整后再 append 的，
// 不会读到半行；避开直接扫 stdout URL 的截断风险
async function waitCodeBuddyPort(timeoutMs = 30000) {
  const start = Date.now();
  let buf = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = fs.readFileSync(startupLogPath, 'utf8');
      buf = raw;
      const m = raw.match(/Parsed CodeBuddy port from stdout: (\d{4,5})\b/);
      if (m) return Number(m[1]);
    } catch (_) {}
    await wait(500);
  }
  console.log('[debug] startup.log tail:\n' + buf.slice(-800));
  return null;
}

// HTTP GET 探测后端端口是否真能响应（收紧：< 400 且 body 非空）
function probeHttp(port) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (v) => { if (!resolved) { resolved = true; resolve(v); } };
    const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 2000 }, (res) => {
      let len = 0;
      res.on('data', c => { len += c.length; });
      res.on('end', () => done(res.statusCode >= 200 && res.statusCode < 400 && len > 0));
      res.resume();
    });
    req.on('error', () => done(false));
    req.on('timeout', () => { req.destroy(); done(false); });
  });
}

// spawned PIDs 粒射式清理 —— 只杀自己 spawn 出来的，不误杀用户其他 Electron 实例
let spawnedPids = [];
function killSpawnedProcesses() {
  for (const pid of spawnedPids) {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  spawnedPids = [];
}

async function main() {
  console.log('=== E2E 启动测试 ===');

  // 0. 前置
  check('out/dist 生产构建存在', fs.existsSync(path.join(projectRoot, 'out', 'dist', 'index.html')));
  if (!fs.existsSync(electronExe)) {
    check('electron.exe 存在', false, electronExe);
    return finish();
  }
  check('electron.exe 存在', true);

  // 清掉旧 startup.log 避免误读上次端口
  try { fs.rmSync(startupLogPath); } catch (_) {}

  // 1. 启动 Electron —— isDev = !app.isPackaged，不看 env；直接 spawn 永远走 dev 探测路径
  //    40 次 probe Vite 5173 不通才回退生产构建（约 20s）。不传 NODE_ENV（没用且误导）。
  const electron = spawn(electronExe, ['.'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: false,
    detached: false,
    env: Object.assign({}, process.env, { ELECTRON_ENABLE_LOGGING: '1' }),
  });
  spawnedPids.push(electron.pid);
  electron.stdout.on('data', d => console.log('[electron]', d.toString().trim()));
  electron.stderr.on('data', d => console.log('[electron:err]', d.toString().trim()));
  electron.on('error', err => check('Electron spawn', false, err.message));
  electron.on('exit', (code, signal) => {
    console.log(`[electron] exited code=${code} signal=${signal}`);
    spawnedPids = spawnedPids.filter(p => p !== electron.pid);
  });

  // 等 codebuddy stdout 吐端口
  console.log('等待 codebuddy stdout 吐端口...');
  const cbPort = await waitCodeBuddyPort(30000);
  check('codebuddy --serve stdout 吐随机端口', !!cbPort, cbPort ? `port=${cbPort}` : '30s 内未解析到');

  if (cbPort) {
    await wait(2000);
    const reachable = await probeHttp(cbPort);
    check('后端端口 HTTP 可响应', reachable, reachable ? 'GET / ok' : '探不通');
  }

  // 等渲染进程加载完成（回退生产 "dev server unreachable" 或 ready=true），35s 内
  async function waitRendererLoaded(timeoutMs = 35000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const raw = fs.readFileSync(startupLogPath, 'utf8');
        if (/renderer ready=true/.test(raw) || /dev server unreachable, falling back to/.test(raw)) return true;
      } catch (_) {}
      await wait(500);
    }
    return false;
  }
  const rendererLoaded = await waitRendererLoaded(35000);

  // 2. startup.log 含渲染进程加载完成标志
  try {
    const log = fs.readFileSync(startupLogPath, 'utf8');
    check('startup.log 含 Static server', /Static server on http:\/\/127\.0\.0\.1:\d+/.test(log), '');
    check('startup.log 含 createWindow', /createWindow called/.test(log), '');
    const fellBack = /dev server unreachable, falling back to http:\/\/127\.0\.0\.1:\d+\/index\.html/.test(log);
    const readyTrue = /renderer ready=true/.test(log);
    check('startup.log renderer 加载完成（回退生产或 ready=true）', rendererLoaded && (fellBack || readyTrue), rendererLoaded ? (fellBack ? '走回退路径' : (readyTrue ? 'ready=true' : '标志未出现')) : '35s 内未出现');
  } catch (err) {
    check('startup.log 可读', false, err.message);
  }

  killSpawnedProcesses();

  // 3. IPC 通路校验 —— preload 暴露 ↔ main handler 字符串一致性 ↔ store/sidebar 调用链
  const preload = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  const store = fs.readFileSync(path.join(projectRoot, 'src', 'store.js'), 'utf8');
  const sidebar = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'ReplicaSidebar.jsx'), 'utf8');

  // 3a. workspace:choose 全链路
  check('preload 暴露 chooseWorkspace IPC', /chooseWorkspace:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('workspace:choose'\)/.test(preload), '');
  check('main 注册 workspace:choose handler', /ipcMain\.handle\('workspace:choose'/.test(main), '');
  const handlerSlice = main.substring(main.indexOf('workspace:choose'));
  check('main handler 返回 filePaths[0] 或 null', /result\.filePaths\[0\]/.test(handlerSlice) && /return null/.test(handlerSlice), '');
  check('store chooseWorkspace action 调 IPC', /async chooseWorkspace\(\)/.test(store) && /window\.electronAPI\?\.chooseWorkspace/.test(store), '');
  check('store setWorkspace 起新 cwd 会话 + 持久化', /async setWorkspace\(path\)/.test(store) && /localStorage\.setItem\('codebuddy-gui-workspace'/.test(store), '');
  check('Sidebar 渲染 切换 按钮 onClick chooseWorkspace', /onClick=\{\(\)\s*=>\s*useStore\.getState\(\)\.chooseWorkspace\(\)\}/.test(sidebar), '');

  // 3b. app:ping IPC —— preload 写 `app:ping`、main 注册 `app:ping`、字符串必须精确一致
  check('preload 暴露 ping IPC → app:ping', /ping:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:ping'\)/.test(preload), '');
  check('main 注册 app:ping handler', /ipcMain\.handle\('app:ping'\s*,\s*async\s*\(\)\s*=>\s*'pong'\)/.test(main), '');

  // 3c. preload 暴露的所有 invoke channel 必须在 main 有对应 handle（一致性硬校验）
  const channelsInPreload = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'\)/g)].map(m => m[1]);
  const channelsInMain = [...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m => m[1]);
  const missingHandlers = channelsInPreload.filter(c => !channelsInMain.includes(c));
  check('preload 所有 invoke channel 在 main 有对应 handle', missingHandlers.length === 0, missingHandlers.length ? `缺: ${missingHandlers.join(', ')}` : `${channelsInPreload.length} 个 channel 全对齐`);

  // 4. 端口绑定架构校验：spawn 不传 --port（CLI auto-assign 随机）
  // 校验"传了 --serve 且数组里没有 --port"——数组形如 ['--serve'] 或 ['--serve', 其他非 --port]
  const spawnOk = /spawn\('codebuddy'\s*,\s*\[([^\]]*)\]/.test(main);
  let spawnArgs = '';
  if (spawnOk) {
    const m = main.match(/spawn\('codebuddy'\s*,\s*\[([^\]]*)\]/);
    spawnArgs = m[1];
  }
  const hasServe = spawnArgs.includes("'--serve'");
  const hasPortFlag = /\['--port'|\['--port",|'--port'\s*,\s*'[^']+'/;
  const noPortFlag = !hasPortFlag.test(spawnArgs);
  check('main spawn codebuddy 传 --serve 不传 --port（CLI auto-assign）', spawnOk && hasServe && noPortFlag, `args=[${spawnArgs}]`);
  check('main 从 stdout 解析 http://127.0.0.1:<port>', /http:\/\/127\.0\.0\.1:(\d+)/.test(main), '');
  check('main 注册 codebuddy:getPort IPC', /ipcMain\.handle\('codebuddy:getPort'/.test(main), '');
  check('store bootstrap 调 getCodeBuddyPort + setApiBase', /window\.electronAPI\?\.getCodeBuddyPort/.test(store) && /setApiBase\(base\)/.test(store), '');

  // 5. 会话多开架构校验（三件事之一，之前漏测）
  check('store 有 sessions[] 字段', /sessions:\s*\[\]/.test(store), '');
  check('store changeSession(sessionId) action', /async changeSession\(sessionId\)/.test(store), '');
  check('store newSession() action', /async newSession\(\)/.test(store), '');
  check('store refreshSessions() 拉会话列表', /async refreshSessions\(\)/.test(store), '');

  finish();
}

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(overallTimer);
  console.log('\n=== 汇总 ===');
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log(`通过 ${pass} / ${results.length}，失败 ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E 测试异常:', err);
  try { killSpawnedProcesses(); } catch (_) {}
  finish();
});
