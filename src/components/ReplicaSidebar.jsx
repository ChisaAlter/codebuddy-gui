import React from 'react';
import { Bot } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import ProjectSessionTree from './ProjectSessionTree';
import { useStore } from '../store';
import { NAV_GROUPS } from '../lib/codebuddy-schema';
import appIconUrl from '../../build/icon.png';

const ITEM_ICONS = {
  chat: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1C4.13 1 1 3.13 1 6.5c0 1.58.64 3 1.75 4.03L2 14l3.62-1.53c.76.2 1.55.3 2.38.3 3.87 0 7-2.13 7-5.5S11.87 1 8 1z" />
    </svg>
  ),
  instances: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  'remote-control': (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v2" />
    </svg>
  ),
  tasks: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h3M2 8h8M2 12h6M13 5l2 2-3.5 3.5" />
    </svg>
  ),
  archived: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6v7h10V6M6 9h4" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3l4 3-4 3M8 9h6" />
    </svg>
  ),
  canvas: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="14" height="14" rx="2" />
      <path d="M1 5h14M1 9h14" />
    </svg>
  ),
  editor: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 1l4 4-8 8H3v-4l8-8z" />
    </svg>
  ),
  changes: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  ),
  plugins: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
    </svg>
  ),
  mcp: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="8" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 8h2.5M9.5 7l1.2-1.6M9.5 9l1.2 1.6" />
    </svg>
  ),
  sandboxes: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7L8 1.5z" />
      <path d="M2.5 4.5L8 7.5l5.5-3M8 7.5v7" />
    </svg>
  ),
  stats: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 14V6h3v8H2zm4.5 0V1h3v13h-3zm4.5 0V4h3v10h-3z" />
    </svg>
  ),
  traces: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8h14M8 1v14M3 3l10 10M13 3L3 13" />
    </svg>
  ),
  monitor: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="14" height="10" rx="2" />
      <path d="M5 15h6M8 12v3" />
    </svg>
  ),
  logs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 3h10m-10 3h6" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2m0 10v2M1 8h2m10 0h2m-3.66-4.66l1.42-1.42m-9.52 9.52l1.42-1.42m9.52 0l1.42 1.42m-9.52-9.52l1.42 1.42" />
    </svg>
  ),
  models: <Bot size={16} strokeWidth={1.5} />,
  keybindings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="6" height="6" rx="1" />
      <path d="M9.5 5h3M9.5 9h3M9.5 7h5" />
    </svg>
  ),
  docs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 1h10l2 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2zm2 3h6M5 8h6M5 11h3" />
    </svg>
  ),
  workers: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M2 8v6h4V8m4 0v6h4V8" />
    </svg>
  ),
  metrics: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 14V6h3v8H1zm4.5 0V1h3v13h-3zm4.5 0V4h3v10h-3z" />
    </svg>
  ),
};

export function replicaSidebarWidthStyle(collapsed) {
  const width = collapsed ? 60 : 'clamp(220px, 21vw, 252px)';
  return { width, minWidth: width, maxWidth: width };
}

export function replicaSidebarGroupInitiallyExpanded(groupId) {
  return groupId === 'primary';
}

export function replicaSidebarMainGroups() {
  return NAV_GROUPS.filter((group) => group.id !== 'preferences');
}

export function replicaSidebarFooterItems() {
  // Models live under Settings → 模型选择; keep footer free of the old 模型 entry.
  return (NAV_GROUPS.find((group) => group.id === 'preferences')?.items || []).filter(
    (item) => item.id !== 'models',
  );
}

export default function ReplicaSidebar() {
  const {
    route,
    setRoute,
    sidebarCollapsed,
    info,
    connectionState,
    newSession,
    newSessionBusy,
    changesCount,
    projectNavigationBusy,
    projectNavigationTargetId,
    projectNavigationError,
    projectsById,
    projectOrder,
    activeProjectId,
    activeThreadId,
    fileDirty,
    selectedFile,
    threadsById,
    threadOrderByProject,
    activateProject,
    activateThread,
    renameThread,
    deleteThread,
    renameProject,
    removeProject,
    setProjectSidebarExpanded,
    setThreadPinned,
    archiveThread,
  } = useStore(
    useShallow((state) => ({
      route: state.route,
      setRoute: state.setRoute,
      sidebarCollapsed: state.sidebarCollapsed,
      info: state.info,
      connectionState: state.connectionState,
      newSession: state.newSession,
      newSessionBusy: state.newSessionBusy,
      changesCount: state.changesCount,
      projectNavigationBusy: state.projectNavigationBusy,
      projectNavigationTargetId: state.projectNavigationTargetId,
      projectNavigationError: state.projectNavigationError,
      projectsById: state.projectsById,
      projectOrder: state.projectOrder,
      activeProjectId: state.activeProjectId,
      activeThreadId: state.activeThreadId,
      fileDirty: state.fileDirty,
      selectedFile: state.selectedFile,
      threadsById: state.threadsById,
      threadOrderByProject: state.threadOrderByProject,
      activateProject: state.activateProject,
      activateThread: state.activateThread,
      renameThread: state.renameThread,
      deleteThread: state.deleteThread,
      renameProject: state.renameProject,
      removeProject: state.removeProject,
      setProjectSidebarExpanded: state.setProjectSidebarExpanded,
      setThreadPinned: state.setThreadPinned,
      archiveThread: state.archiveThread,
    })),
  );
  const [projectMenuOpenId, setProjectMenuOpenId] = React.useState(null);
  const [projectMenuPosition, setProjectMenuPosition] = React.useState({ x: 0, y: 0 });
  const [projectDialog, setProjectDialog] = React.useState(null);
  const [projectName, setProjectName] = React.useState('');
  const [projectActionBusy, setProjectActionBusy] = React.useState(false);
  const [projectActionError, setProjectActionError] = React.useState('');
  const [expandedNavGroups, setExpandedNavGroups] = React.useState(() =>
    Object.fromEntries(
      replicaSidebarMainGroups().map((group) => [group.id, replicaSidebarGroupInitiallyExpanded(group.id)]),
    ),
  );
  const scopeGenerationRef = React.useRef(0);
  const projectActionInFlightRef = React.useRef(null);

  const openProjectDialog = (mode, project) => {
    if (projectNavigationBusy || projectActionInFlightRef.current) return;
    setProjectMenuOpenId(null);
    setProjectDialog({ mode, project });
    setProjectName(project.name || '');
    setProjectActionError('');
  };

  const closeProjectDialog = () => {
    if (projectActionInFlightRef.current) return;
    setProjectDialog(null);
    setProjectActionError('');
  };

  const submitProjectDialog = async () => {
    if (!projectDialog || projectActionInFlightRef.current) return;
    const generation = scopeGenerationRef.current;
    const dialog = projectDialog;
    const { mode, project } = dialog;
    if (mode === 'rename' && !projectName.trim()) {
      setProjectActionError('项目名称不能为空');
      return;
    }
    const operation = {};
    projectActionInFlightRef.current = operation;
    setProjectActionBusy(true);
    setProjectActionError('');
    try {
      const ok =
        mode === 'rename'
          ? await renameProject(project.id, projectName.trim())
          : await removeProject(project.id, { skipDirtyCheck: true });
      if (generation !== scopeGenerationRef.current) return;
      if (!ok) {
        setProjectActionError(mode === 'rename' ? '重命名失败，请重试' : '移除失败，请重试');
        return;
      }
      setProjectDialog(null);
    } catch (error) {
      if (generation === scopeGenerationRef.current) {
        setProjectActionError(error.message || (mode === 'rename' ? '重命名失败' : '移除失败'));
      }
    } finally {
      if (projectActionInFlightRef.current === operation) {
        projectActionInFlightRef.current = null;
        if (generation === scopeGenerationRef.current) setProjectActionBusy(false);
      }
    }
  };

  React.useEffect(() => {
    scopeGenerationRef.current += 1;
    projectActionInFlightRef.current = null;
    setProjectMenuOpenId(null);
    setProjectDialog(null);
    setProjectActionBusy(false);
    setProjectActionError('');
  }, [activeProjectId, activeThreadId]);

  // 点击外部关菜单：捕获阶段 pointerdown，避免挡住会话行激活
  React.useEffect(() => {
    if (projectMenuOpenId === null) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-project-menu]')) setProjectMenuOpenId(null);
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [projectMenuOpenId]);

  const activateSidebarThread = async (threadId) => {
    setRoute('chat');
    try {
      return await activateThread(threadId);
    } catch (error) {
      // 防御：激活失败时不抛到 React 事件，避免侧栏点击表现为“无反应”
      console.error('[sidebar] activateThread failed', threadId, error);
      return false;
    }
  };

  const createProjectThread = async (projectId) => {
    setRoute('chat');
    const state = useStore.getState();
    // 新建会话前先确保项目在侧栏中展开，便于立刻看到新会话
    const project = state.projectsById[projectId];
    if (project?.preferences?.sidebarExpanded === false) {
      await setProjectSidebarExpanded(projectId, true);
    }
    const nextState = useStore.getState();
    // 跨项目点 "+"：必须在目标项目下新建空白会话，而不是只 activate 到对方第一个会话
    if (nextState.activeProjectId !== projectId) {
      return activateProject(projectId, { preferNewThread: true });
    }
    return newSession();
  };

  const renameSidebarThread = async (threadId, title) => {
    const state = useStore.getState();
    const thread = state.threadsById[threadId];
    if (thread?.projectId !== state.activeProjectId) {
      const activated = await activateSidebarThread(threadId);
      if (!activated) return false;
    }
    return renameThread(threadId, title);
  };

  const deleteSidebarThread = async (threadId) => {
    return deleteThread(threadId);
  };

  const renderNavItem = (item) => {
    const isActive = route === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setRoute(item.id)}
        className={`sidebar-nav-link group w-full ${isActive ? 'active bg-[var(--color-accent-primary-dim)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'}`}
        title={sidebarCollapsed ? item.label : undefined}
      >
        <span
          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center ${!isActive ? 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]' : ''}`}
          style={isActive ? { color: 'var(--color-accent-blue)' } : undefined}
        >
          {ITEM_ICONS[item.id] || (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="8" r="2" />
            </svg>
          )}
        </span>
        {!sidebarCollapsed ? <span className="truncate text-left">{item.label}</span> : null}
        {!sidebarCollapsed && item.id === 'changes' && changesCount > 0 ? (
          <span
            className="ml-auto rounded-full px-1.5 py-0 text-[10px] font-medium text-white"
            style={{ background: 'var(--color-accent-blue)' }}
          >
            {changesCount}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className="sidebar-nav flex h-full shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]"
      style={replicaSidebarWidthStyle(sidebarCollapsed)}
    >
      {/* Brand */}
      <div className="titlebar-drag flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border-muted)] px-3">
        <img src={appIconUrl} alt="" className="h-7 w-7 rounded-md shadow-sm" />
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-accent-brand)' }}>
            CodeBuddy GUI
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2.5">
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <button
              className="flex min-h-9 w-full items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-wait disabled:opacity-60"
              disabled={newSessionBusy || projectNavigationBusy}
              onClick={async () => {
                if (newSessionBusy || projectNavigationBusy) return;
                setRoute('chat');
                // 始终弹目录选择；若仍选当前工作区则在该项目下新建会话
                const state = useStore.getState();
                const prevPath = state.projectsById[state.activeProjectId]?.workspacePath?.toLowerCase() || '';
                const result = await state.chooseWorkspace();
                if (!result) return;
                const next = useStore.getState();
                const nextPath = next.projectsById[next.activeProjectId]?.workspacePath?.toLowerCase() || '';
                if (prevPath && nextPath === prevPath) {
                  await next.newSession();
                }
              }}
            >
              {newSessionBusy || projectNavigationBusy ? (
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-text-muted)] border-t-transparent" />
              ) : null}
              {projectNavigationBusy ? '切换中...' : newSessionBusy ? '正在创建...' : '新对话'}
            </button>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="mb-2 px-3">
            <ProjectSessionTree
              projectsById={projectsById}
              projectOrder={projectOrder}
              threadsById={threadsById}
              threadOrderByProject={threadOrderByProject}
              activeProjectId={activeProjectId}
              activeThreadId={activeThreadId}
              projectNavigationBusy={projectNavigationBusy || projectActionBusy}
              projectNavigationTargetId={projectNavigationTargetId}
              onToggleProject={setProjectSidebarExpanded}
              onActivateThread={activateSidebarThread}
              onPinThread={setThreadPinned}
              onArchiveThread={archiveThread}
              onRenameThread={renameSidebarThread}
              onDeleteThread={deleteSidebarThread}
              onCreateProjectThread={createProjectThread}
              onOpenProjectMenu={(event, project) => {
                setProjectMenuPosition({ x: event.clientX, y: event.clientY });
                setProjectMenuOpenId(project.id);
              }}
            />
            {projectNavigationError ? (
              <div className="mt-1 px-1 text-[10px] text-[var(--color-accent-red)]">{projectNavigationError}</div>
            ) : null}
          </div>
        )}

        {replicaSidebarMainGroups().map((group) => {
          const groupExpanded = sidebarCollapsed || expandedNavGroups[group.id];
          return (
            <div key={group.id} className="mb-1">
              {!sidebarCollapsed && (
                <button
                  type="button"
                  className="sidebar-section-title flex w-full items-center justify-between text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  aria-expanded={Boolean(groupExpanded)}
                  aria-label={`${groupExpanded ? '折叠' : '展开'}${group.title}`}
                  onClick={() => setExpandedNavGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                >
                  <span>{group.title}</span>
                  <svg
                    className={`h-3 w-3 transition-transform ${groupExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </button>
              )}
              {groupExpanded ? <div className="space-y-0.5 px-1.5">{group.items.map(renderNavItem)}</div> : null}
            </div>
          );
        })}
      </div>

      {!sidebarCollapsed && projectMenuOpenId && projectsById[projectMenuOpenId] ? (
        <div
          data-project-menu
          className="fixed z-50 w-32 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ left: projectMenuPosition.x, top: projectMenuPosition.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => openProjectDialog('rename', projectsById[projectMenuOpenId])}
          >
            重命名
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-accent-red)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => openProjectDialog('remove', projectsById[projectMenuOpenId])}
          >
            移除项目
          </button>
        </div>
      ) : null}

      {/* 项目管理弹窗 */}
      {projectDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={projectDialog.mode === 'rename' ? '重命名项目' : '移除项目确认'}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeProjectDialog();
          }}
        >
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              {projectDialog.mode === 'rename' ? '重命名项目' : '从应用中移除项目？'}
            </div>
            {projectDialog.mode === 'rename' ? (
              <div className="mt-4">
                <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]" htmlFor="project-name-input">
                  项目名称
                </label>
                <input
                  id="project-name-input"
                  autoFocus
                  className="input-field w-full"
                  value={projectName}
                  disabled={projectActionBusy}
                  onChange={(event) => {
                    setProjectName(event.target.value);
                    setProjectActionError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitProjectDialog();
                    else if (event.key === 'Escape') closeProjectDialog();
                  }}
                />
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                <p>“{projectDialog.project.name}”将从 CodeBuddy GUI 的项目列表中移除，项目文件不会从磁盘删除。</p>
                {projectDialog.project.id === activeProjectId && fileDirty ? (
                  <p className="rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[var(--color-accent-red)]">
                    {selectedFile ? `“${selectedFile}”` : '当前文件'}有未保存修改，继续移除会丢失这些修改。
                  </p>
                ) : null}
              </div>
            )}
            {projectActionError ? (
              <div className="mt-3 text-xs text-[var(--color-accent-red)]">{projectActionError}</div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                disabled={projectActionBusy}
                onClick={closeProjectDialog}
              >
                取消
              </button>
              <button
                className={
                  projectDialog.mode === 'rename'
                    ? 'btn-primary px-3 py-1.5 text-xs'
                    : 'rounded-md px-3 py-1.5 text-xs font-medium text-white'
                }
                style={projectDialog.mode === 'remove' ? { background: 'var(--color-accent-red)' } : undefined}
                disabled={projectActionBusy || (projectDialog.mode === 'rename' && !projectName.trim())}
                onClick={submitProjectDialog}
              >
                {projectActionBusy ? '处理中...' : projectDialog.mode === 'rename' ? '保存' : '移除项目'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 p-1.5">
        <div className="space-y-0.5">{replicaSidebarFooterItems().map(renderNavItem)}</div>
        {!sidebarCollapsed ? (
          <div className="mt-1 flex items-center gap-2 border-t border-[var(--color-border-muted)] px-2.5 pt-2 text-[10px] text-[var(--color-text-muted)]">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${connectionState === 'connected' ? 'bg-[var(--color-accent-green)]' : connectionState === 'error' ? 'bg-[var(--color-accent-red)]' : 'bg-[var(--color-accent-yellow)]'}`}
            />
            <span className="truncate">
              CodeBuddy CLI {info?.version ? `v${String(info.version).replace(/^v/i, '')}` : '版本未知'}
            </span>
          </div>
        ) : (
          <div
            className="flex h-7 items-center justify-center"
            title={`CodeBuddy CLI ${info?.version ? `v${String(info.version).replace(/^v/i, '')}` : '版本未知'}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${connectionState === 'connected' ? 'bg-[var(--color-accent-green)]' : connectionState === 'error' ? 'bg-[var(--color-accent-red)]' : 'bg-[var(--color-accent-yellow)]'}`}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
