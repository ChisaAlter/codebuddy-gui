import React, { useEffect } from 'react';
import { useStore } from './store';
import ReplicaSidebar from './components/ReplicaSidebar';
import ReplicaSettingsView from './components/ReplicaSettingsView';
import ReplicaChatView from './components/ReplicaChatView';
import ReplicaTerminalView from './components/ReplicaTerminalView';
import ReplicaWorkspaceView from './components/ReplicaWorkspaceView';
import ReplicaChangesView from './components/ReplicaChangesView';
import ReplicaWorkersView from './components/ReplicaWorkersView';
import ReplicaMetricsView from './components/ReplicaMetricsView';
import ReplicaPluginsView from './components/ReplicaPluginsView';
import ReplicaStatsView from './components/ReplicaStatsView';
import ReplicaTracesView from './components/ReplicaTracesView';
import ReplicaTasksView from './components/ReplicaTasksView';
import ReplicaLogsView from './components/ReplicaLogsView';
import ReplicaRemoteControlView from './components/ReplicaRemoteControlView';
import ReplicaInstancesView from './components/ReplicaInstancesView';
import ReplicaMonitorView from './components/ReplicaMonitorView';
import ReplicaKeybindingsView from './components/ReplicaKeybindingsView';
import ReplicaDocsView from './components/ReplicaDocsView';
import ReplicaCanvasView from './components/ReplicaCanvasView';

const ROUTE_TITLES = {
  chat: '对话',
  instances: '实例',
  'remote-control': '远程控制',
  tasks: '任务',
  terminal: '终端',
  canvas: '画布',
  editor: '编辑器',
  changes: '变更',
  plugins: '插件',
  stats: '统计',
  traces: '链路',
  monitor: '监控',
  logs: '日志',
  settings: '设置',
  keybindings: '快捷键',
  docs: '文档',
  workers: 'Workers',
  metrics: '指标',
};

function StatusBar() {
  const route = useStore((s) => s.route);
  const sessionTitle = useStore((s) => s.sessionTitle);
  const currentModel = useStore((s) => s.currentModel);
  const currentModelName = useStore((s) => s.models.find(m => m.id === s.currentModel || m.modelId === s.currentModel)?.name || s.currentModel || '');
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);
  const connectionState = useStore((s) => s.connectionState);
  const apiBase = useStore((s) => s.apiBase);

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-4 text-xs flex-shrink-0" role="banner" aria-label="Status bar">
      <button
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 2h4v12H2V2zm8 0h4v12h-4V2z" />
        </svg>
      </button>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="truncate text-[var(--color-text-secondary)]">
          {ROUTE_TITLES[route] || route}
        </span>
        {sessionTitle ? (
          <>
            <span className="text-[var(--color-text-muted)]">/</span>
            <span className="truncate text-[var(--color-text-primary)] font-medium">{sessionTitle}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
          title={apiBase || '未连接'}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            connectionState === 'connected' ? 'bg-[var(--color-accent-green)]' :
            connectionState === 'error' ? 'bg-[var(--color-accent-red)]' : 'bg-[var(--color-accent-yellow)]'
          }`} />
          {connectionState === 'connected' ? '已连接' : connectionState === 'error' ? '连接失败' : '连接中...'}
        </span>
        {currentModel ? (
          <span className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-[var(--color-text-secondary)] max-w-[180px] truncate">
            {currentModelName}
          </span>
        ) : null}
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
          onClick={() => {
            const store = useStore.getState();
            store.setRoute('chat');
            store.newSession();
          }}
          title="New chat"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2v12M2 8h12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MainContent() {
  const route = useStore((s) => s.route);

  switch (route) {
    case 'chat': return <ReplicaChatView />;
    case 'instances': return <ReplicaInstancesView />;
    case 'remote-control': return <ReplicaRemoteControlView />;
    case 'terminal': return <ReplicaTerminalView />;
    case 'settings': return <ReplicaSettingsView />;
    case 'editor': return <ReplicaWorkspaceView />;
    case 'changes': return <ReplicaChangesView />;
    case 'workers': return <ReplicaWorkersView />;
    case 'metrics': return <ReplicaMetricsView />;
    case 'plugins': return <ReplicaPluginsView />;
    case 'canvas': return <ReplicaCanvasView />;
    case 'tasks': return <ReplicaTasksView />;
    case 'stats': return <ReplicaStatsView />;
    case 'traces': return <ReplicaTracesView />;
    case 'monitor': return <ReplicaMonitorView />;
    case 'logs': return <ReplicaLogsView />;
    case 'docs': return <ReplicaDocsView />;
    case 'keybindings': return <ReplicaKeybindingsView />;
    default:
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--color-bg-primary)]">
          <div className="text-sm text-[var(--color-text-muted)]">{route}: 正在向真实 Web UI 对齐</div>
        </div>
      );
  }
}

export default function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const settingsTheme = useStore((s) => s.settings?.theme);

  useEffect(() => {
    bootstrap().catch((error) => console.error(error));
  }, [bootstrap]);

  // 主题切换：根据 settings.theme 设置 data-theme 属性
  useEffect(() => {
    const theme = settingsTheme || 'dark';
    if (theme === 'system') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.dataset.theme = prefersLight ? 'light' : 'dark';
      const handler = (e) => {
        document.documentElement.dataset.theme = e.matches ? 'light' : 'dark';
      };
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    document.documentElement.dataset.theme = theme;
  }, [settingsTheme]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        useStore.getState().setSidebarCollapsed(!useStore.getState().sidebarCollapsed);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <ReplicaSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar />
        <MainContent />
      </div>
    </div>
  );
}
