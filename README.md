# CodeBuddy GUI

桌面版 CodeBuddy Code — Electron + React 18 + Tailwind CSS

## 功能

- **Chat** — SSE 流式对话 + Markdown 渲染
- **Terminal** — xterm.js 分屏终端
- **Workers** — Worker/Daemon 进程管理
- **Logs** — 4 种日志类型切换
- **Tasks** — 定时任务管理
- **Plugins** — 插件安装/卸载
- **Files** — 文件浏览器
- **Traces** — 链路追踪
- **Metrics** — 系统监控
- **API Docs** — Swagger UI 内嵌
- **Settings** — 主题/语言/模型/权限

## 启动

```bash
# 启动 CodeBuddy 后端服务
codebuddy --serve --port 7890

# 启动前端开发服务器
npx vite --port 8080

# 启动 Electron
npx electron .
```

## 打包

```bash
npm run build
```

## 技术栈

- Electron 31
- React 18 + Vite 5
- Zustand 状态管理
- Tailwind CSS
- xterm.js

## 许可证

MIT
