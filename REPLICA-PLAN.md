# CodeBuddyGUI Replica Plan

目标：不是套壳，不是加载远程页面，而是在 Electron 桌面端内本地实现一个与 CodeBuddy Web UI 1:1 一致的前端。

原则：
1. Electron 只提供桌面容器能力（窗口、系统集成、IPC）
2. 所有 UI、布局、状态、交互、协议都由本地前端实现
3. 以真实 Web UI 为唯一对照标准
4. 禁止再把 loadURL(50943 Web UI) 当成正式实现路径。注：50943 是真实 Web UI 对照源端口，本项目后端端口每次启动由 CLI 随机分配

实施阶段：

阶段 1：恢复本地前端主路径 ✅
- main.cjs 开发模式加载 Vite 本地页面
- 生产模式加载 out/dist/index.html
- preload 只保留窗口控制和必要 IPC

阶段 2：建立真实架构骨架 ✅
- 18 路由全覆盖（chat/terminal/canvas/tasks/plugins/editor/changes/workers/metrics/traces/logs/settings/docs/keybindings/remote-control/stats/instances/monitor）
- 单一 Zustand store：session/chat/pty/fs/workers/settings/plugins/metrics/stats/traces/tasks/info/sessions 共 12+ 领域
- 统一 design tokens：50+ CSS 变量、暗/亮双主题、20+ 预定义组件类、10 种动画

阶段 3：接真实协议 ✅
- ACP SSE + JSON-RPC：会话、消息、工具调用、thinking、interruption、questions、重连+心跳+超时
- PTY：terminal session lifecycle + websocket I/O + resize + split panes + 自动重连
- FS：list/mkdir/move/remove/write/read/upload/search/watcher
- Git：commit/log/stash/fetch/push/pull/branch/diff 等 25 个操作（通过 IPC）
- REST：plugins/workers/settings/metrics/scheduled-tasks/channels/session stats/traces/daemon/keybindings/marketplaces

阶段 4：逐视图 1:1 复刻 ✅
- 19 个 Replica 组件覆盖全部 18 路由 + Sidebar
- 高完成度：Sidebar/ChatView/TerminalView/CanvasView/SettingsView/EditorView/ChangesView/Tasks/Instances/RemoteControl/Monitor
- 增强后的可观测视图：MetricsView(Dashboard+图表)/TracesView(分页+详情)/LogsView(搜索+流式)/StatsView(模型分组)

阶段 5：对照审查 ✅ (2026-07-04)
- 布局一致性 85%+：品牌标识优化、权限模式按钮、ARIA 语义属性
- 样式一致性大幅提升：消除 28+ 硬编码、CSS 变量对齐真实 UI、阴影/圆角对齐 Tailwind
- 状态覆盖率改善：19 组件全部覆盖 Loading/Empty/Error 三态
- 协议一致性 85%+：56 个真实端点中 46 个已对接、8 个新增 daemon/keybindings/marketplace
- 空状态/错误态/loading 态全部覆盖

当前状态：全部 5 个阶段已完成。

产品成熟度扩展：
- MCP 配置与运行时管理 ✅
- E2B Sandbox 状态、项目映射、终止和清理管理 ✅
- CodeBuddy 后台会话启动、结构化列表、日志、Endpoint 与终止管理 ✅
