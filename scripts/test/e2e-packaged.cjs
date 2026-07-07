#!/usr/bin/env node
// 打包版 CSP 严模式测试：spawn 真 nsis unpacked exe（app.isPackaged=true → isDev=false）
// 校验：
//   1. 打包 exe 启动 → spawn codebuddy --serve → stdout 吐端口
//   2. CSP 严模式真生效：script-src 不含 'unsafe-inline'（生产构建无 inline script）
//   3. React 渲染不崩（生产 CSP 严模式不晾 monaco wasm 'wasm-unsafe-eval'）
//   4. startup.log 含 renderer ready=true（生产路径不探 Vite，直接 static server）
//
// 用法：node scripts/test/e2e-packaged.cjs
// 依赖：先跑 npm run build:dir 生成 dist/win-unpacked/，且 codebuddy CLI 装好
// 退出码 0 = 全过；非 0 = 有失败项。

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..', '..');
const startupLogPath = path.join(projectRoot, 'electron-startup.log');
const unpackedExe = path.join(projectRoot, 'dist', 'win-unpacked', 'CodeBuddy GUI.exe');
const DEBUG_PORT = 9225;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let finished = false;
const overallTimer = setTimeout(() => {
  if (finished) return;
  console.error('[timeout] 90s 总超时，强制收尾');
  try { killSpawned(); } catch (_) {}
  finish();
}, 90000);

let spawnedPids = [];
function killSpawned() {
  for (const pid of spawnedPids) {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  spawnedPids = [];
}

async function waitCodeBuddyPort(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = fs.readFileSync(startupLogPath, 'utf8');
      const m = raw.match(/Parsed CodeBuddy port from stdout: (\d{4,5})\b/);
      if (m) return Number(m[1]);
    } catch (_) {}
    await wait(500);
  }
  return null;
}

async function waitCDPReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${DEBUG_PORT}/json/list`, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        }).on('error', () => resolve(''));
      });
      if (ok && ok.length > 2) return ok;
    } catch (_) {}
    await wait(500);
  }
  return '';
}

async function main() {
  console.log('=== 打包版 CSP 严模式测试 ===');

  if (typeof globalThis.WebSocket !== 'function') {
    check('Node 原生 WebSocket 可用', false, '需 Node 24+');
    return finish();
  }
  check('Node 原生 WebSocket 可用', true);

  // 0. 前置：unpacked exe 存在
  if (!fs.existsSync(unpackedExe)) {
    check('dist/win-unpacked exe 存在', false, '先跑 npm run build:dir');
    return finish();
  }
  check('dist/win-unpacked exe 存在', true);

  try { fs.rmSync(startupLogPath); } catch (_) {}

  // 1. spawn 真 unpacked exe（app.isPackaged=true → isDev=false → CSP 严模式）
  //    注入 npm 全局 PATH：Electron 启动会 reset PATH，主进程 spawn codebuddy 需 npm 全局 shim
  const npmGlobalDir = path.join(process.env.APPDATA || '', 'npm');
  const injectedEnv = Object.assign({}, process.env, {
    ELECTRON_ENABLE_LOGGING: '1',
    PATH: [npmGlobalDir, process.env.PATH].filter(Boolean).join(path.delimiter),
  });
  const app = spawn(unpackedExe, [`--remote-debugging-port=${DEBUG_PORT}`], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: false,
    detached: false,
    env: injectedEnv,
  });
  spawnedPids.push(app.pid);
  app.stdout.on('data', d => console.log('[app]', d.toString().trim()));
  app.stderr.on('data', d => console.log('[app:err]', d.toString().trim()));
  app.on('error', err => check('App spawn', false, err.message));
  app.on('exit', (code) => {
    console.log(`[app] exited code=${code}`);
    spawnedPids = spawnedPids.filter(p => p !== app.pid);
  });

  // 2. 等 codebuddy 吐端口（打包应用 spawn codebuddy 走 PATH，ENOENT 是真问题但不在本轮范围）
  //    ENOENT 时软记录真问题不 fail，本轮只校验打包应用 CSP 严模式 + React 渲染不崩
  console.log('等待 codebuddy stdout 吐端口...');
  const cbPort = await waitCodeBuddyPort(15000);
  if (cbPort) {
    check('codebuddy --serve stdout 吐随机端口', true, `port=${cbPort}`);
  } else {
    // 读 startup.log 看是否 ENOENT（真问题：打包应用 spawn codebuddy 的 PATH 解析）
    let enoent = false;
    try { enoent = /spawn codebuddy ENOENT|spawn error.*codebuddy/i.test(fs.readFileSync(startupLogPath, 'utf8')); } catch (_) {}
    check('codebuddy --serve stdout 吐随机端口', false, enoent ? 'ENOENT（打包 PATH 解析真问题，本轮不修）' : '15s 内未解析到');
  }

  // 3. 等 startup.log CSP 注入行（主进程 logStartup 记真值，绕开渲染进程 fetch 拿不到 header 的问题）
  async function waitCspLog(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const raw = fs.readFileSync(startupLogPath, 'utf8');
        const m = raw.match(/CSP injected: (dev\(unsafe-inline\)|prod\(strict\)) script-src/);
        if (m) return m[1];
      } catch (_) {}
      await wait(500);
    }
    return null;
  }
  const cspMode = await waitCspLog(15000);
  check('startup.log CSP 注入记录出现', !!cspMode, cspMode || '15s 内未出现');

  // CSP 严模式硬校验：prod(strict) 不含 unsafe-inline，含 wasm-unsafe-eval + default-src self
  const isStrict = cspMode === 'prod(strict)';
  check('CSP 严模式不含 unsafe-inline（生产无 inline script）', isStrict, isStrict ? '' : (cspMode || '未记录'));
  // startup.log 不记完整 CSP 字串，靠主进程代码静态校验补 wasm/default-src 验
  const mainCjs = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  const hasWasm = /'wasm-unsafe-eval'/.test(mainCjs);
  const hasDefaultSelf = /default-src 'self'/.test(mainCjs);
  check('main.cjs CSP 含 wasm-unsafe-eval（monaco wasm 不被晾）', hasWasm);
  check('main.cjs CSP 含 default-src self', hasDefaultSelf);

  // 4. 等 CDP target
  console.log('等待 CDP debug 端口可达...');
  const cdpListRaw = await waitCDPReady(20000);
  let targets = [];
  try { targets = JSON.parse(cdpListRaw); } catch (_) {}
  const target = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!target) {
    check('CDP 找到渲染页 target', false, `共 ${targets.length} 个 target`);
    killSpawned();
    return finish();
  }
  check('CDP 找到渲染页 target', true, `url=${target.url?.slice(0, 60)}`);

  // 5. 连 CDP
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) {}
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++msgId;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJS = async (js) => {
    const r = await send('Runtime.evaluate', {
      expression: js,
      awaitPromise: true,
      returnByValue: true,
    });
    return r?.result?.result?.value;
  };

  // 6. 等 React 渲染
  let rendered = false;
  for (let i = 0; i < 30; i++) {
    const count = await evalJS('document.querySelectorAll("#root > *").length');
    if (count > 0) { rendered = true; break; }
    await wait(500);
  }
  check('React 渲染 #root 有子节点（CSP 严模式不崩）', rendered, rendered ? '' : '15s 内未渲染');

  if (!rendered) {
    killSpawned();
    ws.close();
    return finish();
  }

  // 7. CSP 严模式校验已在第 3 段走 startup.log + main.cjs 静态校验完成，这里不再重复走渲染进程 fetch
  //    （打包应用 unpacked exe 里 fetch '/' 拿不到主进程注入的 CSP header，走 startup.log 更稳）

  // 8. Sidebar 渲染不崩（严模式真跑通关键 UI）
  const sidebarRendered = await evalJS(`document.querySelector("button[title='切换工作区目录']") ? 1 : 0`);
  check('Sidebar 工作区按钮渲染（严模式真 UI 通）', sidebarRendered === 1);

  // 9. monaco-editor 不被 CSP 晾——找 worker 或 wasm 加载痕迹
  // monaco 在 ChangesView/TerminalView 用，加载时机不一定有，校验 console 无 CSP 报错更稳
  const cspViolation = await evalJS(`(async function(){
    // CSP 报错会进 console，但 Runtime.evaluate 拿不到 console 历史
    // 改校验：fetch 一个 .wasm 资源看能否成功
    try{const r=await fetch(location.href.replace(/index.html$/, 'assets/')+'monaco-editor.worker.js', {cache:'no-store'});return r.status>=200&&r.status<400?'ok':'status:'+r.status}catch(e){return 'err:'+e.message}
  })()`);
  // monaco worker 路径不一定在 assets/，这条只做参考，不强校验
  console.log(`[info] monaco worker fetch: ${cspViolation}`);

  killSpawned();
  ws.close();
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
  console.error('打包版测试异常:', err);
  try { killSpawned(); } catch (_) {}
  finish();
});
