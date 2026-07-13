# CodeBuddy GUI

CodeBuddy GUI 是 CodeBuddy CLI 的本地 Electron 桌面客户端，面向多项目、多对话并行编码工作流。界面和产品状态由本地应用管理，每个项目使用独立的 CodeBuddy 运行时和工作目录。

## 主要功能

- 持久化管理多个本地项目，重启后恢复活动项目、对话、草稿和界面状态；连续输入草稿时会合并冗余写盘，切换和退出仍保存最终快照。
- 同一项目内创建多个对话，并让不同项目和对话并行工作。
- 支持通过选择、剪贴板粘贴或直接拖放添加文本文件和图片附件；具体输入能力以当前 CodeBuddy 运行时声明为准。
- 内置文件树和 Monaco 编辑器，支持创建、重命名、删除、编辑和保存文件，并保护未保存修改。
- 内置项目级终端，多面板输出和布局随项目持久化。
- 提供 Git 状态、diff、暂存、提交、拉取、推送和分支操作。
- 提供真实的任务、插件、实例、Workers、统计、链路、指标、日志和运行监控页面。
- 对不受当前 CodeBuddy 版本支持的操作显示明确的不可用或错误状态，不模拟成功。
- 提供原生窗口拖动、最小化、最大化和关闭到系统托盘；再次启动应用会唤回已有窗口。
- 窗口隐藏或未聚焦时，可通过桌面通知获知后台任务完成或失败，并点击回到对应对话；完全退出前会保存最终项目状态，保存失败则取消退出并保留应用现场。
- 设置页可手动检查 GitHub Releases 中的 GUI 新版本，并打开本项目的发布页下载安装包。

## 开发运行

先确保本机可以直接运行 `codebuddy`，然后在两个终端中启动前端和 Electron：

```bash
npm install
npm run dev
```

```bash
npm run dev:electron
```

开发页面默认位于 `http://localhost:5173`。Electron 会启动或复用项目对应的 `codebuddy --serve` 进程，并从 CLI 输出中获取实际端口。

## 构建

```bash
npm run build
```

构建会生成：

- 前端产物：`out/dist/`
- Windows 安装包：`dist/CodeBuddy GUI Setup <version>.exe`

安装器支持选择安装目录，并会创建桌面和开始菜单快捷方式。安装新版本时可直接覆盖原有版本；项目、对话和界面状态保存在用户数据目录中，卸载应用默认不会删除这些数据。

仅生成未打包目录可使用：

```bash
npm run build:dir
```

## 本地发布准备

不依赖 CI 的 Windows 发布材料可在本机统一生成：

```powershell
npm run release:prepare
```

该命令会运行生产构建，检查 Windows 代码签名，并在 `dist/` 中生成连字符资产名、`latest.yml`、`SHA256SUMS.txt` 和 Release 说明。正式发布默认要求受信任的非自签名证书；可通过 `CODEBUDDY_SIGNER_SUBJECT` 进一步约束发布者名称。仅预览版可显式允许未签名安装包：

```powershell
npm run release:prepare -- -AllowUnsigned
```

## 数据与运行时

- 项目、对话、终端输出和恢复信息保存在 Electron `userData` 下的产品状态文件中；Windows 默认目录为 `%APPDATA%\\codebuddy-gui`。实际路径可在应用的“设置 → 系统信息 → 用户数据目录”中查看和复制。
- 每个项目拥有独立的 CodeBuddy 进程、端口、认证信息和工作目录。
- 渲染进程通过受限 preload API 与 Electron 主进程通信；CodeBuddy REST/SSE 请求由主进程代理。
- Electron 内的终端输出使用 SSE，输入和尺寸调整使用 HTTP；非 Electron 环境保留 WebSocket 回退。
- 启动日志和崩溃日志分别写入 `electron-startup.log` 与 `crash.log`。应用保留最近一次有效的 `product-state.json.bak`；主状态文件损坏时会隔离为带时间戳的 `product-state.invalid-*.json` 并自动恢复备份，主文件和备份都不可用时才以空状态启动。
- 设置页可导出已脱敏的 JSON 诊断报告；主进程异常、渲染错误边界和渲染进程异常退出都会进入轮转后的 `crash.log`，报告不包含对话、草稿、项目文件或完整项目路径。

开发架构和维护说明见 [`CODEBUDDY.md`](./CODEBUDDY.md)。

当前版本的用户可见变更见 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)。
