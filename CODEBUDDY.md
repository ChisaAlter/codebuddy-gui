# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## 项目定位

在 Electron 桌面端内**本地 1:1 复刻 CodeBuddy Web UI**，不是套壳加载远程页面。所有 UI、布局、状态、交互、协议都由本地前端实现，以真实 CodeBuddy Web UI 为唯一对照标准。详见 `REPLICA-PLAN.md`。

## 常用命令

开发（需要两个终端）：
```bash
npm run dev          # 终端 1：Vite 开发服务器，监听 http://127.0.0.1:5173
npm run dev:electron # 终端 2：启动 Electron，加载本地 Vite 页面
```

构建（产出 Windows NSIS 安装包）：
```bash
npm run build        # vite build -> out/dist/，electron-builder -> dist/CodeBuddy GUI Setup 0.1.0.exe
```

测试与冒烟脚本（仓库根目录下的多套脚本互为等价入口，按需选用）：
- `Test-All.bat` / `RUN-TEST.ps1` —— 一键启动并跑通主流程
- `Full-Test.ps1` / `Test-Full-Sequence.ps1` / `RUN-ALL.cjs` —— 完整序列测试
- `test-app.cjs` / `test-launch.cjs` —— 单步启动验证
- `test_all.py` —— Python 入口的等价测试

脱离真实后端独立调试前端时，可使用 mock 服务（**历史遗留，已被 `scripts/test/e2e-launch.cjs` 取代，仅作离线对照参考**）：
```bash
node mock-server.cjs     # 独立 mock API（端口 7890）
node start-with-mock.cjs # 以 mock 数据驱动 Electron 启动
```
mock-server.cjs 模拟了 `/api/v1/health`, `/sessions`, `/workers`, `/daemon/status`, `/metrics`, `/plugins`, `/scheduled-tasks`, `/traces` 等端点，CORS 已开启。`start-with-mock.cjs` 加载 `localhost:8080`，不走 Vite 开发流程。两者均未入版本控制（`.gitignore` 标废弃），保留在工作目录仅供对照源 bundle 离线比对协议形态，新贡献者应优先使用 `scripts/test/e2e-launch.cjs`。

## 架构概览

### 双技术栈分工
- **前端（ESM）**：React 18 + Vite 5 + Zustand + Tailwind + Monaco/xterm，源码在 `src/`，`package.json` 中 `"type": "module"`。
- **Electron 主进程（CJS）**：`electron/main.cjs` + `electron/preload.cjs`，使用 `.cjs` 后缀以避开 ESM 限制。

### 渲染入口与加载策略
- `index.html` → `src/main.jsx` → `src/App.jsx`
- `electron/main.cjs` 中 `getRendererEntry()` 决定加载目标：开发模式 `http://localhost:5173`（会先用 `waitForRenderer` 探活，失败自动重试），生产模式 `file://.../out/dist/index.html`。
- BrowserWindow 使用 `frame:false`（无边框自定义标题栏）、`contextIsolation:true`、`nodeIntegration:false`、`webSecurity:true`、`devTools:true`。窗口控制按钮通过 `preload.cjs` 暴露的 `window.electronAPI` 走 IPC。窗口默认 1440x920，最小 1200x760。
- `did-fail-load` 事件在 dev 模式下自动等待并重试 `loadURL`（`waitForRenderer` 最多 40 次，每 500ms 探测）。
- 外部链接（new-window）被拦截并通过 `shell.openExternal(url)` 在系统浏览器打开。

### IPC 通道清单

`preload.cjs` 通过 `contextBridge.exposeInMainWorld` 暴露 `window.electronAPI`：

| 通道 | 方向 | 用途 |
|------|------|------|
| `git:run` (invoke) | 渲染→主 | 执行 git 命令，`spawn('git', args, { cwd })`，二级子命令 + 选项黑名单校验见 `validateGitArgs` |
| `window:minimize` | 渲染→主 | 最小化 |
| `window:maximize` | 渲染→主 | 最大化/还原 |
| `window:close` | 渲染→主 | 关闭 |
| `window:reload` | 渲染→主 | 重载 |
| `window:openDevTools` | 渲染→主 | 打开 DevTools |
| `codebuddy:getPort` (invoke) | 渲染→主 | 获取主进程 spawn 的 CodeBuddy 后端端口+密码，`store.bootstrap()` 据此 `setApiBase` 动态覆盖 acp.js 的初始兜底值 |
| `codebuddy:request` (invoke) | 渲染→主 | 请求代理通道：渲染层 `acp.js` 的 `requestCodeBuddy()` 会优先经此把请求转发到主进程发出，绕过渲染层 CORS/证书限制 |
| `workspace:choose` (invoke) | 渲染→主 | 弹原生目录选择框（`dialog.showOpenDialog`），返回所选绝对路径或 null（用户取消） |

- 启动日志写入 `electron-startup.log`，排查黑屏/加载失败先看这个文件。

### 路由
- Hash 路由，定义在 `src/lib/routes.js`（`ROUTES` 数组 + `parseHashRoute`/`setHashRoute`）。`App.jsx` 的 `MainContent` 根据 `route` switch 到对应视图组件。
- 导航分组在 `src/lib/codebuddy-schema.js` 的 `NAV_GROUPS`（Primary/工作区/可观测/配置），`ReplicaSidebar.jsx` 据此渲染。

### 状态管理（单一 Zustand store）
- 全局唯一 store 在 `src/store.js`，包含会话、模型/模式、timeline、终端面板、文件、watcher、workers/plugins/metrics/stats/traces/tasks 等所有状态。
- `bootstrap()` 在 `App.jsx` `useEffect` 中调用一次：建立 ACP 连接 → 初始化会话 → 并行刷新 info/settings/sessions/workers/plugins/metrics/stats/tasks/traces。
- ACP 事件 → `handleSessionUpdate` / `appendTimelineEvent` → 经 `src/lib/timeline.js` 的 `reduceAcpEvent` 归并到 timeline。timeline 是消息/thinking/tool_call/interruption/question 等事件的统一渲染数据源，支持按 `messageId`/`toolCallId` 合并流式块。
- `reduceAcpEvent` 处理的完整事件类型：
  - **流式内容**：`agent_message_chunk`（assistant 消息追加）、`agent_thought_chunk`（thinking 块追加）、`user_message_chunk`
  - **工具调用**：`tool_call`、`tool_call_update`（按 toolCallId 合并，携带 rawInput/rawOutput/locations）
  - **交互**：`interruption_request`（权限请求）、`question_request`、`question_answered`
  - **系统状态**：`config_option_update`、`session_info_update`、`available_commands_update`、`usage_update`、`status_change`、`model_update`、`mode_update`、`current_mode_update`、`initialized`
  - **目标/任务**：`goal-progress`、`goal-status`、`taskCreated`、`taskStatus`
  - **其他**：`artifact`、`checkpoint`、`promptSuggestion`、`teamUpdate`
- TimelineEntry 字段：`id, type, role, content, streaming, createdAt, messageId, toolCallId, status, title, kind, rawInput, rawOutput, locations`
- 不要在组件里另建独立状态管理；新增全局状态应扩展 `useStore`。

### 与真实 CodeBuddy 后端的协议
- 后端基址由 Electron 主进程 spawn `codebuddy --serve`（不传 `--port`，CLI 默认 `auto-assign` 随机端口）后，从 stdout 解析 `http://127.0.0.1:(\d+)` 拿真实端口，经 `codebuddy:getPort` IPC 给前端 `store.bootstrap()` 调 `setApiBase()` 动态设置。`src/lib/acp.js` 的 `_apiBase = 'http://127.0.0.1:63918'` 仅是 IPC 不可达时的兜底。注意区分两个端口：**50943 = 真实 CodeBuddy Web UI 对照源端口**（不再作为正式运行路径），**本项目后端端口每次启动随机分配**。
- **ACP**（`AcpClient`）：先 `POST /api/v1/acp/connect` 拿 `connectionId` + `sessionToken`，再 `POST /api/v1/acp` 发 JSON-RPC 请求，响应可能是 SSE 多消息流，按 `id` 匹配请求结果，其余消息经 `handleIncomingRpc` 派发为事件。所有请求带 `X-CodeBuddy-Request: 1` 头。
- **REST**：`fetchJson`（`src/lib/acp.js`）直连 `/api/v1/info|settings|sessions|workers|plugins|metrics|stats/...|scheduled-tasks|traces|pty|files/download` 等。`src/lib/ops.js` 封装了 stats、scheduled-tasks、traces、worker-logs、channels、daemon、keybindings、marketplaces、settings write-back 等 30+ 端点。
- **PTY**：`src/lib/pty.js` 的 `PtySocket` 走 `ws://127.0.0.1:<动态端口>/api/v1/pty/{sessionId}`（由 `getApiBase().replace(/^http/, 'ws')` 派生，基址随 acp.js 动态端口），消息 JSON 化为 `{type:'input'|'resize', ...}`。PTY session 先通过 REST `POST /api/v1/pty` 创建，再建 WebSocket。
- **FS**：`src/lib/fs.js` 封装 list/search-content/mkdir/move/remove/write/read/upload/watcher（create/poll/remove）/download，共 12 个操作。
- **Git**：`src/lib/git.js` 封装 commit/log/stash/fetch/push/pull/branch/diff/status 等 25 个操作，通过 `window.electronAPI.runGit(args)` → IPC `git:run` → 主进程 `spawn('git', args, { cwd })`。**cwd 由 `git.js` 的 `getWorkspaceCwd()` 动态读 `useStore.getState().workspacePath`**，跟工作区切换联动；主进程 `normalizeGitRequest` 兜底 `process.cwd()`。切工作区后下一次 git 调用立即生效，无需重启。
- **工作区（cwd）机制**：后端 `info.cwd` 是**进程级单值**（CLI spawn 时定死，不可运行时改），但 ACP `session/new` / `session/load` 的 `params.cwd` **是会话级**——决定该会话 agent 工具调用的实际工作目录，一次性注入。因此**切工作区 = 用新 cwd 起新会话**（`store.setWorkspace(path)` → `acp.initializeSession(null, path)`），不动后端进程；旧会话仍活在旧 cwd。`workspacePath` 持久化于 localStorage，Sidebar 工作区卡片有"切换"按钮 → `chooseWorkspace` IPC → 主进程 `dialog.showOpenDialog` 弹原生目录选择框。

### 组件命名约定
- `src/components/` 下有两套并存：
  - 旧壳层组件（`ChatView.jsx`、`Sidebar.jsx` 等）——历史产物，已被弃用。
  - **`Replica*.jsx`**——当前 1:1 复刻主线，`App.jsx` 只引用这一套。新增视图请遵循 `Replica<Name>View.jsx` 命名并在 `App.jsx` 的 `MainContent` 与 `codebuddy-schema.js` 的 `NAV_GROUPS` 中注册。
- `index.html` 上默认 `class="dark"`；设计 tokens 全部在 `src/index.css` `:root` 用 CSS 变量定义（`--color-bg-*`、`--color-text-*`、`--color-border-*`、`--color-accent-*` 等），组件应使用 `var(--color-...)` 而非硬编码色值，以保持与真实 Web UI 一致。
- `src/index.css` 还预定义了可复用的 CSS 组件类：`.card`, `.glass`, `.input-field`, `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.tag-*`, `.dot-*`, `.overlay`, `.tooltip`, `.divider`, `.modal-content`, `.status-badge`, `.progress-bar`, `.tab-group/.tab`, `.toggle-switch`, `.skeleton`；以及动画类：`fadeIn`, `slideInLeft`, `slideInRight`, `scaleIn`, `pulse`, `spin`, `typing`, `shimmer`。

### 遗留组件（已删除）

以下 15 个文件已于阶段 4 完成时删除（2026-07-04），不再存在于仓库中：
`Sidebar.jsx`, `ChatView.jsx`, `TerminalView.jsx`, `SettingsView.jsx`, `WorkersView.jsx`, `MetricsView.jsx`, `TracesView.jsx`, `LogsView.jsx`, `TasksView.jsx`, `PluginsView.jsx`, `FilesView.jsx`, `DocsView.jsx`, `TitleBar.jsx`, `StatusBar.jsx`, `ToastContainer.jsx`

### 终端面板
- 多 pane 模型在 store 的 `terminalPanes`/`activePaneId`，`splitPane`/`closePane`/`bindPtyToPane`/`appendPaneOutput` 等管理生命周期；PTY 会话经 `createPty` 创建后由 `PtySocket` 承载输入/resize。

## 已知硬编码 / 限制

| 位置 | 值 | 说明 |
|------|-----|------|
| `src/lib/acp.js` | `_apiBase = 'http://127.0.0.1:63918'` | 后端基址兜底值，仅当 Electron 主进程 IPC 不可达时使用；正常运行时被 `store.bootstrap()` 经 `getCodeBuddyPort` IPC 拿主进程从 stdout 解析出的随机端口动态覆盖 |
| `src/lib/git.js` `getWorkspaceCwd()` | 动态读 `useStore.getState().workspacePath`，兜底 `'.'` | Git cwd 跟随当前工作区，切工作区后下一次 git 调用立即生效 |
| `vite.config.js` | `base: './'` | **关键**：相对路径使 Electron `file://` 协议正确加载资源 |
| `tailwind.config.js` | `darkMode: 'class'` | 暗色模式由 `<html class="dark">` 控制 |

## 对照参考文件

根目录下有几个大文件用于对照真实 CodeBuddy Web UI：
- `webui-css.css`（181KB）：真实 Web UI 提取的完整 CSS
- `webui-js.js`（1.97MB）：真实 Web UI 提取的 JS bundle
- `settings.yaml`（10KB）：真实 Web UI 设置页 ARIA 可访问性树快照
- `chat-session.yaml`（27KB）：真实 Web UI 聊天页 ARIA 可访问性树快照

## 关键约束

- **禁止再把 `loadURL(50943)` 作为正式实现路径**（仅用于对照）。
- 新增/修改视图必须以真实 CodeBuddy Web UI 的布局、样式、空状态/错误态/loading 态为唯一标准。
- 修改协议层（`src/lib/*.js`）前先确认 `store.js` 中对应 action 的归并逻辑，避免破坏 timeline 流式合并。
- `package.json` 的 `build.files` 只打包 `out/**`、`electron/**`、`package.json`，构建前确保 `out/dist` 由 `vite build` 生成。

## 项目进度（REPLICA-PLAN.md）

| 阶段 | 状态 | 完成日期 |
|------|------|---------|
| 阶段 1：恢复本地前端主路径 | ✅ 完成 | — |
| 阶段 2：建立真实架构骨架 | ✅ 完成 | — |
| 阶段 3：接真实协议 | ✅ 完成 | 2026-07-04 |
| 阶段 4：逐视图 1:1 复刻 | ✅ 完成 | 2026-07-04 |
| 阶段 5：对照审查 | ✅ 完成 | 2026-07-04 |

全部 5 个阶段已完成。协议层 30+ 端点、34 函数；视图层 19 组件全覆盖 Loading/Empty/Error 三态；样式消除 28+ 硬编码色值，CSS 变量对齐真实 UI。

## 已知待修复问题 (2026-07-04 审查)

| 优先级 | 问题 | 状态 |
|--------|------|------|
| P0 | PTY 重连后 onclose 不触发自动重连 (pty.js) | 已修复 |
| P0 | 端口 fallback 从 63917 修正为 63918 (acp.js) | 已修复 |
| P0 | ACP 重连计数器初始值偏移 (acp.js) | 已修复 |
| P1 | 5 个组件缺 Loading 骨架屏 (Workers/Plugins/Tasks/Logs/Monitor) | 已修复 |
| P1 | store.js 未使用导入清理 (fsRead/fsUpload) | 已修复 |
| P1 | PTY socket 关闭时不清理全局引用 (store.js) | 已修复 |
| P1 | SSE 解析错误静默吞掉 (acp.js) | 已修复 |
| P2 | Electron 31 → 34 升级 + express 4.19→4.21 安全补丁 | 已修复 |
| P2 | .gitignore 添加对照文件和测试脚本 | 已修复 |

### 2026-07-09 全面审查批

| 优先级 | 项 | 状态 |
|--------|------|------|
| 高 | S1 密码持久化明文不回读使用 + UI 文案校准为真实行为 (main.cjs / App.jsx) | 已修复 |
| 高 | S2 git 白名单扩展到二级子命令 + 拦截危险选项 (--upload-pack/--config/-c/--receive-pack) (main.cjs) | 已修复 |
| 高 | E1 物理清理废弃遗留文件 (根目录 yaml/bat/log、废弃 scripts、playwright-cli) | 已修复 |
| 中 | S3 CSP connect-src 收窄到 'self' + ws，渲染层 REST 经 IPC 不受 CSP 约束 (main.cjs) | 已修复 |
| 中 | E2 协议层纯函数单测覆盖：parseEventStreamMessages / validateGitArgs / normalizeGitRequest / parseHashRoute (tests/unit/) | 已修复 |
| 中 | B4 authLogin 无 token 时不把密码当 Bearer 落 sessionStorage (acp.js) | 已修复 |
| 中 | E8 vitest environment 从 node 改 jsdom，补 jsdom devDep (vitest.config.js) | 已修复 |
| 低 | E6 tailwind.config.js 清理未使用的 dark/accent 扩展配色 | 已修复 |
| 低 | E7 引入 ESLint + Prettier 基线配置（不强整改存量） | 已修复 |
| 低 | B5 loadURL 生产模式失败给用户提示而非黑屏静默 (main.cjs) | 已修复 |
| 低 | B6 SSE 超时截断在返回体打标记让前端能识别中断 (main.cjs) | 已修复 |
| 低 | R1 应用退出显式 close express 静态服务器 (main.cjs) | 已修复 |
| 低 | R2 reallyQuitting + window-all-closed 逻辑注释修正 (main.cjs) | 已修复 |
| 低 | R3 codebuddy shell:true spawn 孤儿进程兜底按名树杀 (main.cjs) | 已修复 |
| 低 | S4 redactSecrets 正则补齐 Password:/password:"xxx"/JSON 形态 (main.cjs) | 已修复 |
| 低 | E3 CODEBUDDY.md 删 app:ping 表行 + mock-server 矛盾表述校准（本表所在批次） | 已修复 |