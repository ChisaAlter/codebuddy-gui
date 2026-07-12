import React, { lazy, Suspense, useEffect } from 'react';
import { useStore } from './store';
import ReplicaSidebar from './components/ReplicaSidebar';
import ReplicaChatView from './components/ReplicaChatView';
import appIconUrl from '../build/icon.svg';

const ReplicaSettingsView = lazy(() => import('./components/ReplicaSettingsView'));
const ReplicaTerminalView = lazy(() => import('./components/ReplicaTerminalView'));
const ReplicaWorkspaceView = lazy(() => import('./components/ReplicaWorkspaceView'));
const ReplicaChangesView = lazy(() => import('./components/ReplicaChangesView'));
const ReplicaWorkersView = lazy(() => import('./components/ReplicaWorkersView'));
const ReplicaMetricsView = lazy(() => import('./components/ReplicaMetricsView'));
const ReplicaPluginsView = lazy(() => import('./components/ReplicaPluginsView'));
const ReplicaStatsView = lazy(() => import('./components/ReplicaStatsView'));
const ReplicaTracesView = lazy(() => import('./components/ReplicaTracesView'));
const ReplicaTasksView = lazy(() => import('./components/ReplicaTasksView'));
const ReplicaLogsView = lazy(() => import('./components/ReplicaLogsView'));
const ReplicaRemoteControlView = lazy(() => import('./components/ReplicaRemoteControlView'));
const ReplicaInstancesView = lazy(() => import('./components/ReplicaInstancesView'));
const ReplicaMonitorView = lazy(() => import('./components/ReplicaMonitorView'));

function WindowControls({ height = 'h-12' }) {
  return (
    <div className={`titlebar-no-drag ml-1 flex ${height} items-stretch border-l border-[var(--color-border-default)]`}>
      <button
        type="button"
        className="flex w-11 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        onClick={() => window.electronAPI?.windowMinimize?.()}
        title="最小化"
        aria-label="最小化窗口"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 8.5h8" /></svg>
      </button>
      <button
        type="button"
        className="flex w-11 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        onClick={() => window.electronAPI?.windowMaximize?.()}
        title="最大化或还原"
        aria-label="最大化或还原窗口"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2.25" y="2.25" width="7.5" height="7.5" /></svg>
      </button>
      <button
        type="button"
        className="flex w-11 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[#c42b1c] hover:text-white"
        onClick={() => window.electronAPI?.windowClose?.()}
        title="关闭到托盘"
        aria-label="关闭窗口到系统托盘"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
      </button>
    </div>
  );
}

function LoginView() {
  const authSubmitting = useStore((s) => s.authSubmitting);
  const authError = useStore((s) => s.authError);
  const login = useStore((s) => s.login);
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    await login(password);
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <div className="titlebar-drag absolute inset-x-0 top-0 flex h-10 justify-end border-b border-[var(--color-border-default)]">
        <WindowControls height="h-10" />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-2">
          <img src={appIconUrl} alt="CodeBuddy GUI" className="h-9 w-9 rounded-lg" />
          <div>
            <div className="text-base font-semibold" style={{ color: 'var(--color-accent-brand)' }}>CodeBuddy GUI</div>
            <div className="text-xs text-[var(--color-text-muted)]">需要登录以继续</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-[var(--color-text-muted)]">服务密码</span>
            <div className="relative mt-1">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authSubmitting}
                autoFocus
                placeholder="请输入 CodeBuddy 服务密码"
                className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-brand)] focus:outline-none"
                aria-label="服务密码"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                tabIndex={-1}
                aria-label={show ? '隐藏密码' : '显示密码'}
              >
                {show ? '隐藏' : '显示'}
              </button>
            </div>
          </label>
          {authError ? (
            <div className="rounded-md border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 px-3 py-2 text-xs text-[var(--color-accent-red)]" role="alert">
              {authError === 'login.error.incorrect' ? '密码不正确' : authError === 'app.connectFailed' ? '无法连接到服务，请稍后重试' : authError}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={authSubmitting || !password.trim()}
            className="btn-primary w-full justify-center rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-accent-brand)' }}
          >
            {authSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                登录中...
              </span>
            ) : '登录'}
          </button>
        </form>
        <div className="mt-4 text-center text-[10px] text-[var(--color-text-muted)]">
          密码仅用于本次登录，应用不会保存
        </div>
      </div>
    </div>
  );
}

const ROUTE_TITLES = {
  chat: '对话',
  instances: '实例',
  'remote-control': '远程控制',
  tasks: '任务',
  terminal: '终端',
  editor: '编辑器',
  changes: '变更',
  plugins: '插件',
  stats: '统计',
  traces: '链路',
  monitor: '监控',
  logs: '日志',
  settings: '设置',
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
  const activeProjectId = useStore((s) => s.activeProjectId);

  return (
    <div className="titlebar-drag flex h-12 shrink-0 items-center gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)] pl-4 text-xs flex-shrink-0" role="banner" aria-label="Status bar">
      <button
        className="titlebar-no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
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
      <div className="titlebar-no-drag flex items-center gap-2">
        <span
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
          title={apiBase || '未连接'}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            connectionState === 'connected' ? 'bg-[var(--color-accent-green)]' :
            connectionState === 'error' ? 'bg-[var(--color-accent-red)]' : 'bg-[var(--color-accent-yellow)]'
          }`} />
          {!activeProjectId ? '未选择项目' : connectionState === 'connected' ? '已连接' : connectionState === 'error' ? '连接失败' : connectionState === 'disconnected' ? '未连接' : '连接中...'}
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
        <WindowControls />
      </div>
    </div>
  );
}

function MainContent() {
  const route = useStore((s) => s.route);
  const productStateLoaded = useStore((s) => s.productStateLoaded);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const chooseWorkspace = useStore((s) => s.chooseWorkspace);

  if (!productStateLoaded) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-sm text-[var(--color-text-muted)]">正在恢复项目...</div>
      </div>
    );
  }

  if (!activeProjectId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--color-bg-primary)] px-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">打开一个代码项目</div>
          <div className="mb-5 text-sm leading-6 text-[var(--color-text-secondary)]">
            选择本地文件夹后，CodeBuddy 会为它保存独立的对话、草稿和工作区状态。
          </div>
          <button className="btn-primary px-4 py-2 text-sm" onClick={chooseWorkspace}>
            打开文件夹
          </button>
        </div>
      </div>
    );
  }

  let content;
  switch (route) {
    case 'chat': content = <ReplicaChatView />; break;
    case 'instances': content = <ReplicaInstancesView />; break;
    case 'remote-control': content = <ReplicaRemoteControlView />; break;
    case 'terminal': content = <ReplicaTerminalView />; break;
    case 'settings': content = <ReplicaSettingsView />; break;
    case 'editor': content = <ReplicaWorkspaceView />; break;
    case 'changes': content = <ReplicaChangesView />; break;
    case 'workers': content = <ReplicaWorkersView />; break;
    case 'metrics': content = <ReplicaMetricsView />; break;
    case 'plugins': content = <ReplicaPluginsView />; break;
    case 'tasks': content = <ReplicaTasksView />; break;
    case 'stats': content = <ReplicaStatsView />; break;
    case 'traces': content = <ReplicaTracesView />; break;
    case 'monitor': content = <ReplicaMonitorView />; break;
    case 'logs': content = <ReplicaLogsView />; break;
    default: content = (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--color-bg-primary)]">
          <button className="btn-primary px-4 py-2 text-sm" onClick={() => useStore.getState().setRoute('chat')}>返回对话</button>
        </div>
      );
  }
  return (
    <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-muted)]">正在加载页面...</div>}>
      {content}
    </Suspense>
  );
}

function GlobalErrorNotice() {
  const error = useStore((state) => state.error);
  const clearError = useStore((state) => state.clearError);
  if (!error) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex max-w-[440px] items-start gap-3 rounded-md border border-[rgba(239,68,68,0.45)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-accent-red)] shadow-xl" role="alert">
      <span className="whitespace-pre-wrap break-words">{String(error)}</span>
      <button className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={clearError} aria-label="关闭错误提示">关闭</button>
    </div>
  );
}

export default function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const settingsTheme = useStore((s) => s.settings?.theme);
  const authViewState = useStore((s) => s.authViewState);

  useEffect(() => {
    bootstrap().catch((error) => console.error(error));
  }, [bootstrap]);

  useEffect(() => {
    const flushProductState = () => {
      useStore.getState().flushProductStateSync?.();
    };
    window.addEventListener('beforeunload', flushProductState);
    return () => window.removeEventListener('beforeunload', flushProductState);
  }, []);

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
      {authViewState === 'login' ? <LoginView /> : (
        <>
          <ReplicaSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <StatusBar />
            <MainContent />
          </div>
          <GlobalErrorNotice />
        </>
      )}
    </div>
  );
}
