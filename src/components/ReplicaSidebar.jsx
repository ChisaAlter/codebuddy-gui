import React from 'react';
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
      <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  'remote-control': (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" /><path d="M8 2v2" />
    </svg>
  ),
  tasks: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h3M2 8h8M2 12h6M13 5l2 2-3.5 3.5" />
    </svg>
  ),
  archived: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="3" rx="1" /><path d="M3 6v7h10V6M6 9h4" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3l4 3-4 3M8 9h6" />
    </svg>
  ),
  canvas: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="14" height="14" rx="2" /><path d="M1 5h14M1 9h14" />
    </svg>
  ),
  editor: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 1l4 4-8 8H3v-4l8-8z" />
    </svg>
  ),
  changes: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  ),
  plugins: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
    </svg>
  ),
  mcp: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="8" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="12" cy="12" r="2" /><path d="M6 8h2.5M9.5 7l1.2-1.6M9.5 9l1.2 1.6" />
    </svg>
  ),
  sandboxes: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7L8 1.5z" /><path d="M2.5 4.5L8 7.5l5.5-3M8 7.5v7" />
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
      <rect x="1" y="2" width="14" height="10" rx="2" /><path d="M5 15h6M8 12v3" />
    </svg>
  ),
  logs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 3h10m-10 3h6" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2.5" /><path d="M8 1v2m0 10v2M1 8h2m10 0h2m-3.66-4.66l1.42-1.42m-9.52 9.52l1.42-1.42m9.52 0l1.42 1.42m-9.52-9.52l1.42 1.42" />
    </svg>
  ),
  keybindings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="6" height="6" rx="1" /><path d="M9.5 5h3M9.5 9h3M9.5 7h5" />
    </svg>
  ),
  docs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 1h10l2 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2zm2 3h6M5 8h6M5 11h3" />
    </svg>
  ),
  workers: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="8" cy="11" r="2" /><path d="M2 8v6h4V8m4 0v6h4V8" />
    </svg>
  ),
  metrics: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 14V6h3v8H1zm4.5 0V1h3v13h-3zm4.5 0V4h3v10h-3z" />
    </svg>
  ),
};

export default function ReplicaSidebar() {
  const {
    route, setRoute, sidebarCollapsed,
    info, connectionState, newSession, newSessionBusy, newSessionProjectId, newSessionError, changesCount,
    projectNavigationBusy, projectNavigationTargetId, projectNavigationError,
    projectsById, projectOrder, activeProjectId, activeThreadId, fileDirty, selectedFile,
    threadsById, threadOrderByProject, activateProject, activateThread, renameThread, deleteThread, renameProject, removeProject,
    setProjectSidebarExpanded, setThreadPinned, archiveThread,
  } = useStore(useShallow((state) => ({
    route: state.route,
    setRoute: state.setRoute,
    sidebarCollapsed: state.sidebarCollapsed,
    info: state.info,
    connectionState: state.connectionState,
    newSession: state.newSession,
    newSessionBusy: state.newSessionBusy,
    newSessionProjectId: state.newSessionProjectId,
    newSessionError: state.newSessionError,
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
  })));
  const [projectMenuOpenId, setProjectMenuOpenId] = React.useState(null);
  const [projectMenuPosition, setProjectMenuPosition] = React.useState({ x: 0, y: 0 });
  const [projectDialog, setProjectDialog] = React.useState(null);
  const [projectName, setProjectName] = React.useState('');
  const [projectActionBusy, setProjectActionBusy] = React.useState(false);
  const [projectActionError, setProjectActionError] = React.useState('');
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
      const ok = mode === 'rename'
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

  // 点击外部关菜单
  React.useEffect(() => {
    if (projectMenuOpenId === null) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-project-menu]')) setProjectMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [projectMenuOpenId]);

  const activateSidebarThread = async (threadId) => {
    setRoute('chat');
    return activateThread(threadId);
  };

  const createProjectThread = async (projectId) => {
    setRoute('chat');
    const state = useStore.getState();
    if (state.activeProjectId !== projectId) return activateProject(projectId);
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

  return (
    <aside
      role="navigation" aria-label="Main navigation"
      className="sidebar-nav flex h-full shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] transition-all duration-200"
      style={{ width: sidebarCollapsed ? 60 : 'clamp(220px, 21vw, 252px)' }}
    >
      {/* Brand */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] px-3">
        <img src={appIconUrl} alt="" className="h-7 w-7 rounded-md" />
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-accent-brand)' }}>CodeBuddy GUI</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <button
              className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-wait disabled:opacity-60"
              disabled={newSessionBusy || projectNavigationBusy}
              onClick={async () => {
                if (newSessionBusy || projectNavigationBusy) return;
                setRoute('chat');
                await newSession();
              }}
            >
              {newSessionBusy || projectNavigationBusy ? (
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-text-muted)] border-t-transparent" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v12M2 8h12" /></svg>
              )}
              {projectNavigationBusy ? '切换中...' : newSessionBusy ? '正在创建...' : '新对话'}
            </button>
            {newSessionError && newSessionProjectId === activeProjectId ? (
              <div className="mt-1 px-1 text-[10px] text-[var(--color-accent-red)]">{newSessionError}</div>
            ) : null}
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="mb-2 px-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">项目</div>
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                disabled={projectNavigationBusy}
                onClick={() => {
                  if (!projectNavigationBusy) useStore.getState().chooseWorkspace();
                }}
                title="添加项目"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v12M2 8h12" /></svg>
              </button>
            </div>
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
                if (projectNavigationBusy || projectActionBusy) return;
                setProjectMenuPosition({ x: event.clientX, y: event.clientY });
                setProjectMenuOpenId(projectMenuOpenId === project.id ? null : project.id);
              }}
            />
            {projectMenuOpenId && projectsById[projectMenuOpenId] ? (
              <div
                data-project-menu
                className="fixed z-50 w-32 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
                style={{ left: projectMenuPosition.x, top: projectMenuPosition.y }}
              >
                <button className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]" onClick={() => openProjectDialog('rename', projectsById[projectMenuOpenId])}>重命名</button>
                <button className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-accent-red)] hover:bg-[var(--color-bg-hover)]" onClick={() => openProjectDialog('remove', projectsById[projectMenuOpenId])}>移除项目</button>
              </div>
            ) : null}
            {projectNavigationError ? (
              <div className="mt-1 px-1 text-[10px] text-[var(--color-accent-red)]">{projectNavigationError}</div>
            ) : null}
          </div>
        )}

        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-1">
            {!sidebarCollapsed && (
              <div className="sidebar-section-title text-[var(--color-text-muted)]">
                {group.title}
              </div>
            )}
            <div className="px-1.5 space-y-0.5">
              {group.items.map((item) => {
                const isActive = route === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setRoute(item.id)}
                    className={`sidebar-nav-link group w-full ${isActive ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'}`}
                    style={isActive ? {background:'rgba(59,130,246,0.12)'} : undefined}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${!isActive ? 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]' : ''}`} style={isActive ? {color:'var(--color-accent-blue)'} : undefined}>
                      {ITEM_ICONS[item.id] || (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2" /></svg>
                      )}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="truncate text-left">{item.label}</span>
                    )}
                    {!sidebarCollapsed && item.id === 'changes' && changesCount > 0 && (
                      <span className="ml-auto rounded-full px-1.5 py-0 text-[10px] text-white font-medium" style={{background:'var(--color-accent-blue)'}}>{changesCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

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
                <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]" htmlFor="project-name-input">项目名称</label>
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
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={projectActionBusy} onClick={closeProjectDialog}>取消</button>
              <button
                className={projectDialog.mode === 'rename' ? 'btn-primary px-3 py-1.5 text-xs' : 'rounded-md px-3 py-1.5 text-xs font-medium text-white'}
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

      {/* User section at bottom */}
      <div className="shrink-0 border-t border-[var(--color-border-default)] p-2">
        <div className="sidebar-user-section" style={sidebarCollapsed ? { justifyContent: 'center', padding: '0.5rem' } : {}}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{background:'var(--color-accent-blue)'}}>
            {(info?.userName || 'U')[0].toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">{info?.userName || '用户'}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{info?.version || 'v?'}</div>
              </div>
              {connectionState === 'connected' ? (
                <div className="h-2 w-2 rounded-full" style={{background:'var(--color-accent-green)'}} title="已连接" />
              ) : connectionState === 'error' ? (
                <div className="h-2 w-2 rounded-full" style={{background:'var(--color-accent-red)'}} title="连接错误" />
              ) : (
                <div className="h-2 w-2 rounded-full" style={{background:'var(--color-accent-yellow)'}} title="连接中..." />
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
