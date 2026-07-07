# CodeBuddy GUI

目标：在 Electron 桌面端内本地 1:1 复刻 CodeBuddy Web UI，而不是套壳加载真实网页。

当前状态：
- Electron 已恢复为加载本地前端
- 开发模式：`http://127.0.0.1:5173`
- 生产模式：加载 `out/dist/index.html`
- 真实 CodeBuddy Web UI（端口 50943）仅作为布局、样式和协议对照源，不再作为正式运行路径。本项目后端端口每次启动由 CLI 随机分配，前端经 IPC 动态获取

开发：
1. 终端 1：`npm run dev`
2. 终端 2：`npm run dev:electron`

构建：
- `npm run build`

安装包产物：
- `dist\\CodeBuddy GUI Setup 0.1.0.exe`

说明：
- 当前仓库仍在从壳层向真实 1:1 本地复刻重构中
- 以真实 CodeBuddy Web UI 的布局、样式、交互、状态和协议为唯一标准
