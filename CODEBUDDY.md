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

测试与冒烟脚本（均通过真实 CodeBuddy 后端驱动，无需 mock）：
- 单元测试（vitest 3.x，jsdom 环境）：`tests/unit/` 下 `git-validate.test.js` / `parse-sse.test.js` / `routes.test.js` / `timeline.test.js` / `acp-stream.test.js`，运行 `npm run test`。跑单文件/单用例：
  ```bash
  npx vitest run tests/unit/git-validate.test.js   # 单文件
  npx vitest run -t "validateGitArgs"               # 按用例名过滤
  npx vitest                                       # watch 模式（等同 npm run test:watch）
  ```
  > vitest 4.x 在 Node 24 下 `describe()` 即崩，本项目锁 `^3.2.7`，勿升级。
- 端到端 / 打包冒烟（npm 脚本快捷方式）：
  - `npm run test:e2e` —— `vite build` + `e2e-launch.cjs`（启动/端口/IPC 通路）+ `e2e-renderer.cjs`（CDP 实机渲染：Sidebar DOM、新对话重置 sessionId、发消息出 timeline、CSP 注入、AI 回复）。
  - `npm run test:packaged` —— `build:dir` 产出 `dist/win-unpacked/` + `e2e-packaged.cjs`（isPackaged=true 分支：CSP 严模式无 'unsafe-inline'、生产路径不探 Vite）。
  - `npm run test:release` —— **发布前全量门禁**：单测 → e2e → packaged，对应发布序列步骤 4-9。
  - `prepublishOnly` —— npm publish 时自动跑 `npm run test`（单测门禁；本项目当前 `electron-builder --publish never` 不走 npm 发布，故 `test:release` 是实际发布前手动 gate）。
- 静态检查：`npm run lint`（eslint，可加 `:fix` 自动修）、`npm run format`（prettier）。
- 打包调试：`npm run build:dir` —— 仅出 unpacked 目录、不打 NSIS 安装包，用于本地验证打包产物。

> 历史遗留的 root 级 `Test-All.bat` / `RUN-TEST.ps1` / `mock-server.cjs` / `start-with-mock.cjs` 等脚本已于 2026-07-09 清理（E1）删除，请勿引用；离线调试现统一走 `scripts/test/e2e-launch.cjs`。

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
- **鉴权流程**：`store.bootstrap()` 在建立 ACP 连接前先 `checkAuth()` 决定 `authViewState` ∈ `loading|login|authenticated`；为 `login` 时 `App.jsx` 渲染 `LoginView`（密码登录，密码经系统 keyring 加密持久化），登录成功由 `store.login(password)` 置 `authenticated` 并重触发 bootstrap。
- **主题**：`App.jsx` 根据 `settings.theme`（`dark`/`light`/`system`）设置 `document.documentElement.dataset.theme`；`index.html` 默认带 `class="dark"` 作兜底，Tailwind `darkMode: 'class'`。

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
| `codebuddy:openStream` (invoke) + `codebuddy:streamMessage`/`streamError` | 渲染↔主 | ACP GET SSE 通知流桥：主进程 `net.fetch(GET /api/v1/acp)` 流式读 SSE，逐条转发给渲染层 `AcpClient.handleIncomingRpc` |
| `codebuddy:closeStream` | 渲染→主 | 关闭指定 ACP SSE 通知流（disconnect/reconnect/app quit 时清理） |
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
- **ACP**（`AcpClient`）：先 `POST /api/v1/acp/connect` 拿 `connectionId` + `sessionToken`，随后建立后台 `GET /api/v1/acp` `text/event-stream` 通知流（真实 Web UI 同款 `readSseStream` 模式），`session/update`、`agent_message_chunk`、`tool_call` 等主要从此长连接推送并经 `handleIncomingRpc` 派发。普通 JSON-RPC 仍用 `POST /api/v1/acp`，按 `id` 匹配请求结果；POST 响应若携带 SSE 多消息也会解析。所有请求带 `X-CodeBuddy-Request: 1` 头。
- **REST**：`fetchJson`（`src/lib/acp.js`）直连 `/api/v1/info|settings|sessions|workers|plugins|metrics|stats/...|scheduled-tasks|traces|pty|files/download` 等。`src/lib/ops.js` 封装了 stats、scheduled-tasks、traces、worker-logs、channels、daemon、keybindings、marketplaces、settings write-back 等 30+ 端点。
- **PTY**：`src/lib/pty.js` 的 `PtySocket` 走 `ws://127.0.0.1:<动态端口>/api/v1/pty/{sessionId}`（由 `getApiBase().replace(/^http/, 'ws')` 派生，基址随 acp.js 动态端口），消息 JSON 化为 `{type:'input'|'resize', ...}`。PTY session 先通过 REST `POST /api/v1/pty` 创建，再建 WebSocket。
- **FS**：`src/lib/fs.js` 封装 list/search-content/mkdir/move/remove/write/read/upload/watcher（create/poll/remove）/download，共 12 个操作。
- **Git**：`src/lib/git.js` 封装 commit/log/stash/fetch/push/pull/branch/diff/status 等 25 个操作，通过 `window.electronAPI.runGit(args)` → IPC `git:run` → 主进程 `spawn('git', args, { cwd })`。**cwd 由 `git.js` 的 `getWorkspaceCwd()` 动态读 `useStore.getState().workspacePath`**，跟工作区切换联动；主进程 `normalizeGitRequest` 兜底 `process.cwd()`。切工作区后下一次 git 调用立即生效，无需重启。
- **工作区（cwd）机制**：后端 `info.cwd` 是**进程级单值**（CLI spawn 时定死，不可运行时改），但 ACP `session/new` / `session/load` 的 `params.cwd` **是会话级**——决定该会话 agent 工具调用的实际工作目录，一次性注入。因此**切工作区 = 用新 cwd 起新会话**（`store.setWorkspace(path)` → `acp.initializeSession(null, path)`），不动后端进程；旧会话仍活在旧 cwd。`workspacePath` 持久化于 localStorage，Sidebar 工作区卡片有"切换"按钮 → `chooseWorkspace` IPC → 主进程 `dialog.showOpenDialog` 弹原生目录选择框。

### 组件命名约定
- `src/components/` 当前主线全部为 **`Replica*.jsx`**（`App.jsx` 的 `MainContent` 只引用这一套），旧壳层组件（阶段 4 已删除，见下「遗留组件」）不再存在。新增视图请遵循 `Replica<Name>View.jsx` 命名，并在三处注册：`App.jsx` 的 `MainContent`（switch）、`src/lib/routes.js` 的 `ROUTES`、`src/lib/codebuddy-schema.js` 的 `NAV_GROUPS`（决定侧边栏分组与顺序）。
- **当前视图清单（18 个视图 + Sidebar，共 19 个 `Replica*.jsx` 文件）**：
  - Primary：`ReplicaChatView`(chat)、`ReplicaInstancesView`(instances)、`ReplicaRemoteControlView`(remote-control)
  - 工作区：`ReplicaTasksView`(tasks)、`ReplicaTerminalView`(terminal)、`ReplicaCanvasView`(canvas)、`ReplicaWorkspaceView`(editor)、`ReplicaChangesView`(changes)、`ReplicaPluginsView`(plugins)
  - 可观测：`ReplicaStatsView`(stats)、`ReplicaTracesView`(traces)、`ReplicaMonitorView`(monitor)、`ReplicaMetricsView`(metrics)、`ReplicaLogsView`(logs)、`ReplicaWorkersView`(workers)
  - 配置：`ReplicaSettingsView`(settings)、`ReplicaKeybindingsView`(keybindings)、`ReplicaDocsView`(docs)
  - **注意**：`editor` 路由复用 `ReplicaWorkspaceView`（文件树/编辑器视图），无独立 `ReplicaEditorView`；`StatusBar` 与 `LoginView` 是 `App.jsx` 内的内联组件（非独立文件）。
- 设计 tokens 全部在 `src/index.css` `:root` 用 CSS 变量定义（`--color-bg-*`、`--color-text-*`、`--color-border-*`、`--color-accent-*` 等），组件应使用 `var(--color-...)` 而非硬编码色值，以保持与真实 Web UI 一致。
- `src/index.css` 还预定义了可复用的 CSS 组件类：`.card`, `.glass`, `.input-field`, `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.tag-*`, `.dot-*`, `.overlay`, `.tooltip`, `.divider`, `.modal-content`, `.status-badge`, `.progress-bar`, `.tab-group/.tab`, `.toggle-switch`, `.skeleton`；以及动画类：`fadeIn`, `slideInLeft`, `slideInRight`, `scaleIn`, `pulse`, `spin`, `typing`, `shimmer`。

### 遗留组件（已删除）

以下 15 个旧壳层文件已于阶段 4 完成时删除（2026-07-04），不再存在于仓库中：
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

**怎么用**：复刻某视图前，先在 `webui-css.css` 里 grep 该视图的关键 class（如 `.chat-session`、`.settings-view`），在 `*.yaml` 快照里看 ARIA 树结构与控件层级，`webui-js.js` 里 grep 关键 selector 看交互逻辑。

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

历史审查与修复（2026-07-04 与 2026-07-09 两批，P0/P1/P2 与 S/E/B/R 系列）均已闭环，详见 `git log`（如 `git log --grep="P0"` / `--grep="S1"`）；本文件不再罗列已结束的修复历史。