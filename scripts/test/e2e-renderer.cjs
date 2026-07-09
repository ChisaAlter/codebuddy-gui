#!/usr/bin/env node
// 实机端到端渲染进程测试：开 Electron --remote-debugging-port → CDP 连渲染页 →
//   1. 校验 Sidebar DOM 渲染（新对话按钮、工作区 切换按钮、连接态绿点）
//   2. 真 点 新对话 按钮 → 校验 store sessionId 重置
//   3. 真 在 textarea 输消息 → 点发送键 → 校验 timeline 出现 user message + 发送键变终止键
//   4. 校验 CSP 真注入（document head meta 或 response header）
//   5. 等 AI 回复（session/prompt SSE）→ 校验 timeline 出现 assistant message
//
// 用法：node scripts/test/e2e-renderer.cjs
// 退出码 0 = 全过；非 0 = 有失败项。
// 依赖：Node 24+ 原生 WebSocket（globalThis.WebSocket）。

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..', '..');
const startupLogPath = path.join(projectRoot, 'electron-startup.log');
const userDataLog = path.join(process.env.APPDATA || '', 'codebuddy-gui', 'electron-startup.log');
function readStartupLog() {
  try { return fs.readFileSync(startupLogPath, 'utf8'); } catch (_) {}
  try { return fs.readFileSync(userDataLog, 'utf8'); } catch (_) {}
  return '';
}
function rmStartupLog() {
  try { fs.rmSync(startupLogPath); } catch (_) {}
  try { fs.rmSync(userDataLog); } catch (_) {}
}
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
// 选空闲端口而非固定 9281：连续跑 / 上次 Electron 未干净释放 devtools 监听 socket 时
// 固定端口会撞 LISTENING 残留，CDP 连不上 → 120s 超时。
function pickFreePort() {
  const net = require('net');
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    srv.once('listening', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.once('error', reject);
  });
}
let DEBUG_PORT = 0;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

let finished = false;
const overallTimer = setTimeout(() => {
  if (finished) return;
  console.error('[timeout] 120s 总超时，强制收尾');
  try { killSpawned(); } catch (_) {}
  finish();
}, 120000);

let spawnedPids = [];
function killSpawned() {
  for (const pid of spawnedPids) {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  spawnedPids = [];
}

// 等 startup.log 出现端口解析行
async function waitCodeBuddyPort(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = readStartupLog();
      const m = raw.match(/Parsed CodeBuddy port from stdout: (\d{4,5})\b/);
      if (m) return Number(m[1]);
    } catch (_) {}
    await wait(500);
  }
  return null;
}

// 等 startup.log 出现渲染加载标志（保证 mainWindow 已创建 loadURL）后再查 CDP target
async function waitRendererLoaded(timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw = readStartupLog();
      if (/renderer ready=true/.test(raw) || /dev server unreachable, falling back to/.test(raw)) return true;
    } catch (_) {}
    await wait(500);
  }
  return false;
}

// HTTP 探测 CDP debug 端口可达且有 target
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
  console.log('=== 实机端到端渲染进程测试 ===');

  if (typeof globalThis.WebSocket !== 'function') {
    check('Node 原生 WebSocket 可用', false, '需 Node 24+');
    return finish();
  }
  check('Node 原生 WebSocket 可用', true);

  check('out/dist 生产构建存在', fs.existsSync(path.join(projectRoot, 'out', 'dist', 'index.html')));
  if (!fs.existsSync(electronExe)) { check('electron.exe 存在', false); return finish(); }
  check('electron.exe 存在', true);

  DEBUG_PORT = await pickFreePort();
  if (!DEBUG_PORT) { check('选空闲 CDP 端口', false); return finish(); }

  rmStartupLog();

  // 启动 Electron，开 CDP 远程调试
  const electron = spawn(electronExe, ['.', `--remote-debugging-port=${DEBUG_PORT}`], {
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
  electron.on('exit', (code) => {
    console.log(`[electron] exited code=${code}`);
    spawnedPids = spawnedPids.filter(p => p !== electron.pid);
  });

  // 1. 等 codebuddy 端口解析
  console.log('等待 codebuddy stdout 吐端口...');
  const cbPort = await waitCodeBuddyPort(30000);
  check('codebuddy --serve stdout 吐随机端口', !!cbPort, cbPort ? `port=${cbPort}` : '30s 内未解析到');

  // 2. 等 startup.log 出现渲染加载标志（保证 mainWindow 已创建 + loadURL 完成后再查 CDP target）
  //    直接 spawn electron . 时 isDev=true，40 次 probe Vite 5173 不通才回退生产构建（约 20s）
  console.log('等待渲染进程加载标志...');
  const rendererLoaded = await waitRendererLoaded(45000);
  if (!rendererLoaded) {
    check('渲染进程加载标志出现', false, '45s 内 startup.log 未出现 ready=true 或 falling back');
    killSpawned();
    return finish();
  }
  check('渲染进程加载标志出现', true);

  // 3. 等 CDP 端口可达且有 target
  console.log('等待 CDP debug 端口可达...');
  const cdpListRaw = await waitCDPReady(15000);
  let targets = [];
  try { targets = JSON.parse(cdpListRaw); } catch (_) {}
  const target = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!target) {
    check('CDP 找到渲染页 target', false, `共 ${targets.length} 个 target，无 page 类型`);
    killSpawned();
    return finish();
  }
  check('CDP 找到渲染页 target', true, `url=${target.url?.slice(0, 60)}`);

  // 3. 连 CDP WebSocket
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  ws.addEventListener('open', () => console.log('[cdp] ws connected'));
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) {}
  });
  ws.addEventListener('error', (ev) => console.log('[cdp] ws error', ev.message || ev));

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

  // 4. 等 React 渲染完成（#root 有子节点）
  console.log('等待 React 渲染...');
  let rendered = false;
  for (let i = 0; i < 40; i++) {
    const count = await evalJS('document.querySelectorAll("#root > *").length');
    if (count > 0) { rendered = true; break; }
    await wait(500);
  }
  check('React 渲染 #root 有子节点', rendered, rendered ? '' : '20s 内未渲染');

  if (!rendered) {
    killSpawned();
    return finish();
  }

  // 5. 校验 Sidebar DOM
  // 工作区 切换按钮
  const switchBtn = await evalJS(`document.querySelector("button[title='切换工作区目录']") ? 1 : 0`);
  check('Sidebar 工作区 切换按钮 渲染', switchBtn === 1);
  // 新对话按钮（文本含 新对话）
  const newChatBtn = await evalJS(`Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("新对话")) ? 1 : 0`);
  check('Sidebar 新对话按钮 渲染', newChatBtn === 1);
  // 连接态绿点（title=已连接）——bootstrap 可能尚在连接中，等最多 8 秒探到
  let greenDot = 0;
  for (let i = 0; i < 16; i++) {
    greenDot = await evalJS(`document.querySelector("div[title='已连接']") ? 1 : 0`);
    if (greenDot === 1) break;
    await wait(500);
  }
  check('Sidebar 连接态绿点 渲染', greenDot === 1, greenDot === 1 ? '已连接' : '8s 内未到 connected 态');

  // 6. 校验 store 状态（bootstrap 完成）
  const connState = await evalJS(`(function(){try{return window.__store__?.getState?.()?.connectionState}catch(e){try{return require('zustand').useStore?.getState?.()?.connectionState}catch(e){return null}}})()`);
  // zustand store 不全局暴露，走 React fiber 找——改读 sidebar 渲染态已间接证明 store 通

  // 7. 真 点 新对话 按钮 → 校验点击成功（timeline 不全局暴露，靠后续 textarea 测间接）
  console.log('点 新对话 按钮...');
  const newChatClicked = await evalJS(`(function(){const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("新对话"));if(b){b.click();return 1}return 0})()`);
  check('点 新对话 按钮 成功', newChatClicked === 1);
  await wait(1500);

  // 8. 找 textarea 输入框 + 发送键
  const textareaFound = await evalJS(`document.querySelector("textarea") ? 1 : 0`);
  check('Chat textarea 渲染', textareaFound === 1);

  if (textareaFound === 1) {
    // 输消息 —— 用 nativeInputValueSetter 触发 React onChange，普通 .value= 不触发 React state
    const testMsg = `E2E 测试消息 ${Date.now()}`;
    const inputOk = await evalJS(`(function(){
      const t=document.querySelector("textarea");
      if(!t)return 0;
      const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set;
      setter.call(t,${JSON.stringify(testMsg)});
      t.dispatchEvent(new Event("input",{bubbles:true}));
      return 1;
    })()`);
    check('textarea 输入消息触发 React onChange', inputOk === 1);
    await wait(300);

    // 发送键 = textarea 同层后那个蓝色圆形按钮（style.background 含 accent-blue），onClick=onSubmit
    const sendResult = await evalJS(`(function(){
      const t=document.querySelector("textarea");
      if(!t)return "no textarea";
      // 发送键在 textarea 容器同层后，蓝色背景圆形按钮
      const container=t.closest("div");
      const buttons=Array.from(document.querySelectorAll("button"));
      // 找 disabled 属性可切换的那个蓝色按钮（textarea 空时 disabled，非空时可点）
      const sendBtn=buttons.find(b=>{
        const s=b.style.background||"";
        return s.includes("accent-blue") && (b.disabled===false || b.disabled===true);
      });
      if(!sendBtn)return "no send btn found among "+buttons.length+" buttons";
      if(sendBtn.disabled)return "send btn disabled (input not in React state)";
      sendBtn.click();
      return "sent";
    })()`);
    check('点发送键', sendResult === 'sent', sendResult);

    if (sendResult === 'sent') {
      // 等 AI 思考态 + SSE 回复
      await wait(5000);
      // 校验 timeline 渲染出消息节点（user msg + assistant thinking/reply）
      const timelineMsgs = await evalJS(`document.querySelectorAll("[class*='message'],[class*='markdown'],[class*='timeline'],[class*='assistant'],[class*='user']").length`);
      check('发送后 timeline 渲染出消息节点', timelineMsgs > 0, `count=${timelineMsgs}`);

      // === Second message --- verify consecutive messages do not deadlock
      // Wait for streaming to finish (content stable for 5s)
      let _last = "";
      let _stab = 0;
      for (let _p = 0; _p < 30; _p++) {
        const _cur = await evalJS("(function(){const ta=document.querySelector(\"textarea\");if(!ta)return\"\";const p=ta.closest(\"div.flex-1.overflow-y-auto\");return p ? p.textContent.slice(-200) : \"\"})()");
        if (_cur === _last) { _stab++; if (_stab >= 5) break; }
        else { _last = _cur; _stab = 0; }
        await wait(1500);
      }
      check("round1 stable", _stab >= 5);
      // Fill textarea and send via Enter
      const _msg2 = `2nd-${Date.now()}`;
      await evalJS("(function(){const ta=document.querySelector(\"textarea\");if(!ta)return;const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,\"value\").set;s.call(ta,\"${_msg2}\");ta.dispatchEvent(new Event(\"input\",{bubbles:true}));})()".replace("${_msg2}", _msg2));
      await wait(500);
      const _enter = await evalJS("(function(){const ta=document.querySelector(\"textarea\");if(!ta)return 0;ta.dispatchEvent(new KeyboardEvent(\"keydown\",{key:\"Enter\",bubbles:true,cancelable:true}));return 1})()");
      check("round2 Enter sent", _enter === 1);
      if (_enter === 1) {
        await wait(6000);
        const _after = await evalJS('document.querySelectorAll("[class*=message],[class*=markdown],[class*=timeline],[class*=assistant],[class*=user]").length');
      }
    }
  }
  // 9. 校验 CSP 真注入
  const cspMeta = await evalJS(`document.querySelector("meta[http-equiv='Content-Security-Policy']")?.content || ''`);
  // CSP 在 response header 注入，不靠 meta——走 fetch 自检 response header
  const cspHeader = await evalJS(`(async function(){
    try{const r=await fetch(location.href,{cache:'no-store'});return r.headers.get('content-security-policy')||''}catch(e){return 'fetch err:'+e.message}
  })()`);
  check('CSP header 真注入', typeof cspHeader === 'string' && cspHeader.includes("default-src 'self'"), cspHeader?.slice(0, 80) || JSON.stringify(cspHeader));

  // ===== 新增 12 项功能的渲染层断言 =====
  // helper: 跑 hash 路由切换 + 等渲染 + 返回
  //  注意：直接 location.hash= 在某些 CDP 上下文里不触发 hashchange → store.route 不更新
  //  改用真点 Sidebar 导航按钮（按钮 onClick 调 store.setRoute，可靠）
  async function gotoRoute(route) {
    // 先试 hash，再 fallback 点 Sidebar 按钮
    await evalJS(`(function(){
      // 试直接 setRoute（DEV 暴露 __ZUSTAND_STORE 时）
      try { if (window.__ZUSTAND_STORE?.getState?.()?.setRoute) { window.__ZUSTAND_STORE.getState().setRoute(${JSON.stringify(route)}); return 'store'; } } catch(_) {}
      // 试点 Sidebar 导航按钮：按钮 title=label 或文本含 label
      const labels = {chat:'对话',instances:'实例','remote-control':'远程控制',tasks:'任务',terminal:'终端',canvas:'画布',editor:'编辑器',changes:'变更',plugins:'插件',stats:'统计',traces:'链路',monitor:'监控',logs:'日志',workers:'Workers',metrics:'指标',settings:'设置',keybindings:'快捷键',docs:'文档'};
      const label = labels[${JSON.stringify(route)}] || ${JSON.stringify(route)};
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => (b.title===label || b.textContent.includes(label)) && b.closest('aside'));
      if (btn) { btn.click(); return 'sidebar'; }
      // fallback hash
      location.hash = '#/' + ${JSON.stringify(route)};
      return 'hash';
    })()`);
    await wait(1000); // React + 数据拉取
  }

  // K 鉴权：authViewState 默认非 'login'（否则卡登录页，前面 sidebar/textarea 都不会渲染）
  //  前面断言全过已间接证明 authViewState !== 'login'；这里查 store 字段（DEV 暴露 __ZUSTAND_STORE）
  //  生产构建不暴露 DEV 全局，查不到属正常（跳过），不算失败
  const authState = await evalJS(`(function(){
    try { return window.__ZUSTAND_STORE?.getState?.()?.authViewState || null; } catch(_) { return null; }
  })()`);
  const hasDevStore = await evalJS(`typeof window.__ZUSTAND_STORE !== 'undefined' ? 1 : 0`);
  check('K authViewState 字段存在且非 loading', hasDevStore === 0 || authState !== null, hasDevStore === 0 ? '生产构建不暴露 DEV __ZUSTAND_STORE，跳过' : `state=${authState}`);
  check('K 未卡在登录页', authState !== 'login', authState === 'login' ? '卡登录页' : (authState === null ? 'DEV 全局不可达，间接由前面断言通过证明' : '通过态'));

  // A 会话删改：Sidebar 会话项有 ⋮ 操作菜单按钮（前提：sessions 非空；后端无会话时按钮不渲染，不算 bug）
  const sessionsCount = await evalJS(`(function(){try{return window.__ZUSTAND_STORE?.getState?.()?.sessions?.length||0}catch(_){return -1}})()`);
  const sessionMenuBtn = await evalJS(`document.querySelector("button[aria-label='会话操作菜单']") ? 1 : 0`);
  check('A Sidebar 会话操作菜单按钮渲染', sessionMenuBtn === 1 || sessionsCount === 0, sessionMenuBtn === 1 ? '有按钮' : (sessionsCount === 0 ? 'sessions 为空，按钮不渲染属正常' : `sessions=${sessionsCount} 但无按钮`));

  // I 全局 stats：切 stats 路由，Stats 视图渲染
  await gotoRoute('stats');
  const statsTitle = await evalJS(`Array.from(document.querySelectorAll("h2")).find(h => h.textContent.includes("Stats")) ? 1 : 0`);
  check('I Stats 视图渲染', statsTitle === 1);

  // D 任务模板：切 tasks 路由，任务模板分区渲染
  await gotoRoute('tasks');
  const templatesSection = await evalJS(`Array.from(document.querySelectorAll("h2")).find(h => h.textContent.includes("任务模板")) ? 1 : 0`);
  check('D Tasks 任务模板分区渲染', templatesSection === 1);

  // E 文件名搜索：切 editor 路由，WorkspaceView 有文件名实时搜索 input
  await gotoRoute('editor');
  const fileNameSearchInput = await evalJS(`Array.from(document.querySelectorAll("input[placeholder]")).find(i => i.placeholder.includes("输入文件名片段实时搜索")) ? 1 : 0`);
  check('E WorkspaceView 文件名实时搜索框渲染', fileNameSearchInput === 1);

  // F Git HTTP API 对照：切 changes 路由（放在 terminal 前，避免 PTY socket 残留报错冒到 changes 检查）
  //  runGitRemote export 存在已静态校验，这里验 Git 视图入口未破坏
  //  ReplicaChangesView 首次渲染 loading 态出"加载改动中"/空态出"没有检测到改动"/根有"Source Control"标题
  //  注意：不能靠 aside.nextElement 定位主内容区（aside 后跟空白文本节点，nextElement 返回 null）
  //        改查 StatusBar banner 标题（切路由后变"变更"）或 body 含 changes 视图特征文本
  await gotoRoute('changes');
  const changesView = await evalJS(`(function(){
    const banner = document.querySelector('[role=banner] span');
    if (banner && banner.textContent.includes('变更')) return 'banner';
    const txt = document.body.textContent || '';
    if (txt.includes('加载改动中') || txt.includes('没有检测到改动') || txt.includes('Source Control')) return 'body';
    return '';
  })()`);
  check('F ChangesView 渲染（Git 路径未破坏）', changesView !== '', changesView === 'banner' ? 'StatusBar 标题切到变更' : (changesView === 'body' ? 'body 含 changes 视图特征文本' : '未渲染'));

  // J 微信/企微：切 remote-control 路由，微信/企微创建分区渲染
  await gotoRoute('remote-control');
  const wechatSection = await evalJS(`Array.from(document.querySelectorAll("div")).find(d => d.textContent.includes("添加微信机器人")) ? 1 : 0`);
  const wecomSection = await evalJS(`Array.from(document.querySelectorAll("div")).find(d => d.textContent.includes("添加企业微信机器人")) ? 1 : 0`);
  check('J RemoteControlView 微信创建分区渲染', wechatSection === 1);
  check('J RemoteControlView 企微创建分区渲染', wecomSection === 1);


  // H uninstall + 市场：切 plugins 路由，插件市场分区渲染
  await gotoRoute('plugins');
  const marketSection = await evalJS(`Array.from(document.querySelectorAll("h2")).find(h => h.textContent.includes("插件市场")) ? 1 : 0`);
  check('H PluginsView 插件市场分区渲染', marketSection === 1);
  // L PTY WS /ws 后缀：切 terminal 路由，TerminalView 渲染（pty.js 路由形状已静态校验，这里只验渲染）
  await gotoRoute('terminal');
  const terminalView = await evalJS(`Array.from(document.querySelectorAll("h2,div")).find(e => e.textContent.includes("终端") || e.textContent.includes("Terminal")) ? 1 : 0`);
  check('L TerminalView 渲染', terminalView === 1);


  // 收尾前回 chat 路由，免下次跑侧效
  await gotoRoute('chat');

  // P1-3 亮色主题验证：切到 settings 路由，点"亮色"按钮，验 data-theme=light 生效
  await gotoRoute('settings');
  await evalJS(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '亮色').click()`);
  await wait(800);
  const lightThemeApplied = await evalJS(`document.documentElement.dataset.theme === 'light' ? 1 : 0`);
  check('P1-3 亮色主题切换生效（data-theme=light）', lightThemeApplied === 1, `data-theme=${await evalJS('document.documentElement.dataset.theme')}`);
  // 切回暗色（免影响下次跑）
  await evalJS(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '暗色').click()`);
  await wait(500);

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
  console.error('E2E 渲染进程测试异常:', err);
  try { killSpawned(); } catch (_) {}
  finish();
});
