import React from 'react';
import { useStore } from '../store';
import { NAV_GROUPS } from '../lib/codebuddy-schema';

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
    info, currentModel, currentMode, models, modes,
    connectionState, newSession, setModel, setMode, changesCount,
    workspacePath, projectsById, projectOrder, activeProjectId, activeThreadId,
    threadsById, threadOrderByProject, activateProject, activateThread, renameThread, deleteThread, renameProject, removeProject,
  } = useStore();
  const projectThreads = (threadOrderByProject[activeProjectId] || [])
    .map((id) => threadsById[id])
    .filter(Boolean);
  const threadStatusLabel = (status) => ({
    connecting: '连接中',
    running: '运行中',
    waiting: '等待输入',
    error: '出错',
    cancelled: '已取消',
  }[status] || '');

  // 会话项菜单态：renameingId=正在内联重命名的会话 id；pendingDelete=待确认删除的会话对象
  const [renamingId, setRenamingId] = React.useState(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState(null);
  const [menuOpenId, setMenuOpenId] = React.useState(null);
  const [projectMenuOpenId, setProjectMenuOpenId] = React.useState(null);

  const startRename = (thread) => {
    setRenamingId(thread.id);
    setRenameValue(thread.title || '新对话');
    setMenuOpenId(null);
  };

  const submitRename = async (id) => {
    const ok = await renameThread(id, renameValue);
    if (ok) setRenamingId(null);
    else setRenameValue(''); // 失败保留 renaming 态让用户改
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setPendingDelete(null);
    await deleteThread(pendingDelete.id);
  };

  const handleRenameProject = async (project) => {
    setProjectMenuOpenId(null);
    const name = window.prompt('项目名称', project.name || '');
    if (name?.trim()) await renameProject(project.id, name);
  };

  const handleRemoveProject = async (project) => {
    setProjectMenuOpenId(null);
    if (!window.confirm(`从 CodeBuddy GUI 移除“${project.name}”吗？磁盘中的项目文件不会被删除。`)) return;
    await removeProject(project.id);
  };

  // 点击外部关菜单
  React.useEffect(() => {
    if (menuOpenId === null && projectMenuOpenId === null) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-session-menu]') && !e.target.closest?.('[data-project-menu]')) {
        setMenuOpenId(null);
        setProjectMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpenId, projectMenuOpenId]);

  return (
    <aside
      role="navigation" aria-label="Main navigation"
      className="sidebar-nav flex h-full shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] transition-all duration-200"
      style={{ width: sidebarCollapsed ? 60 : 252 }}
    >
      {/* Brand */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-xs font-bold"
             style={{ background: 'linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-purple))' }}>
          CB
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-accent-brand)' }}>CodeBuddy</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <button
              className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              onClick={() => { setRoute('chat'); newSession(); }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v12M2 8h12" /></svg>
              新对话
            </button>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="mb-2 px-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">项目</div>
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                onClick={() => useStore.getState().chooseWorkspace()}
                title="添加项目"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v12M2 8h12" /></svg>
              </button>
            </div>
            <div className="space-y-0.5">
              {projectOrder.length === 0 ? (
                <div className="py-1 text-xs text-[var(--color-text-muted)]">尚未打开项目</div>
              ) : projectOrder.map((projectId) => {
                const project = projectsById[projectId];
                if (!project) return null;
                const selected = projectId === activeProjectId;
                const projectMenuOpen = projectMenuOpenId === projectId;
                return (
                  <div key={projectId} className="relative flex items-center">
                    <button
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${selected ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
                      onClick={() => activateProject(projectId)}
                      title={project.workspacePath}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 4h5l1.2 1.5h6.8v7.5h-13V4z" /></svg>
                      <span className="truncate">{project.name}</span>
                      <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${project.runtimeStatus === 'running' ? 'bg-[var(--color-accent-green)]' : project.runtimeStatus === 'error' ? 'bg-[var(--color-accent-red)]' : project.runtimeStatus === 'starting' ? 'bg-[var(--color-accent-yellow)]' : 'bg-[var(--color-text-muted)]'}`} title={project.runtimeError || project.runtimeStatus || 'idle'} />
                    </button>
                    <button
                      className="ml-0.5 flex h-6 w-5 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                      onClick={() => setProjectMenuOpenId(projectMenuOpen ? null : projectId)}
                      title="项目操作"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" /></svg>
                    </button>
                    {projectMenuOpen ? (
                      <div data-project-menu className="absolute right-0 top-7 z-40 w-32 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] py-1 shadow-lg">
                        <button className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]" onClick={() => handleRenameProject(project)}>重命名</button>
                        <button className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-accent-red)] hover:bg-[var(--color-bg-hover)]" onClick={() => handleRemoveProject(project)}>移除项目</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
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

      {/* Workspace & Session Info (collapsed only if sidebar expanded) */}
      {!sidebarCollapsed && (
        <div className="shrink-0 border-t border-[var(--color-border-default)] p-3 space-y-2">
          <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-2.5 text-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">工作区</div>
              <button
                className="btn-ghost px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                title="切换工作区目录"
                onClick={() => useStore.getState().chooseWorkspace()}
              >
                切换
              </button>
            </div>
            <div className="truncate text-[var(--color-text-secondary)]" title={workspacePath || info?.cwd || ''}>
              {workspacePath || '未选择项目'}
            </div>
            <div className="text-[var(--color-text-muted)] mt-0.5">{info?.os || '-'} | {info?.version || '-'}</div>
          </div>

          {/* Model & Mode selectors */}
          <div className="space-y-1.5">
            {connectionState !== 'connected' && models.length === 0 && modes.length === 0 ? (
              <>
                <div className="skeleton animate-pulse h-7 w-4/5 rounded" style={{background:'var(--color-bg-hover)'}} />
                <div className="skeleton animate-pulse h-7 w-3/5 rounded" style={{background:'var(--color-bg-hover)'}} />
              </>
            ) : (
              <>
                <select
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                  value={currentModel || ''}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">选择模型</option>
                  {models.map((m, i) => (
                    <option key={m.id || i} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <select
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                  value={currentMode || ''}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="">选择模式</option>
                  {modes.map((m, i) => (
                    <option key={m.id || i} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Session history */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">会话历史</div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {connectionState === 'connecting' && projectThreads.length === 0 ? (
                <>
                  <div className="skeleton animate-pulse h-6 w-full rounded" style={{background:'var(--color-bg-hover)'}} />
                  <div className="skeleton animate-pulse h-6 w-4/5 rounded mt-1" style={{background:'var(--color-bg-hover)'}} />
                  <div className="skeleton animate-pulse h-6 w-3/5 rounded mt-1" style={{background:'var(--color-bg-hover)'}} />
                </>
              ) : projectThreads.length === 0 ? (
                <div className="px-2 py-1 text-xs text-[var(--color-text-muted)]">暂无历史会话</div>
              ) : (
                projectThreads.slice(0, 20).map((thread) => {
                  const threadId = thread.id;
                  const isRenaming = renamingId === threadId;
                  const isMenuOpen = menuOpenId === threadId;
                  return (
                    <div key={threadId} className={`relative flex items-center rounded-md transition-colors hover:bg-[var(--color-bg-hover)] ${threadId === activeThreadId ? 'bg-[var(--color-bg-hover)]' : ''}`}>
                      {isRenaming ? (
                        <div className="flex w-full items-center gap-1 px-2 py-1">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); submitRename(threadId); }
                              else if (e.key === 'Escape') { setRenamingId(null); }
                            }}
                            onBlur={() => { if (renamingId === threadId) submitRename(threadId); }}
                            className="w-full rounded border border-[var(--color-accent-brand)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
                            aria-label="会话新名称"
                          />
                          <button
                            onClick={() => submitRename(threadId)}
                            className="text-xs text-[var(--color-accent-green)] hover:text-[var(--color-text-primary)]"
                            title="确认"
                          >✓</button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                            title="取消"
                          >×</button>
                        </div>
                      ) : (
                        <>
                          <button
                            className="block flex-1 min-w-0 rounded-md px-2 py-1 text-left transition-colors"
                            onClick={() => activateThread(threadId)}
                            title={thread.sessionId || thread.title}
                          >
                            <div className="flex items-center gap-1.5">
                              <div className="truncate text-xs text-[var(--color-text-primary)]">{thread.title || '新对话'}</div>
                              {thread.unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent-blue)]" title="未读更新" /> : null}
                            </div>
                            {thread.status && thread.status !== 'idle' && (
                              <div className={`text-[10px] ${thread.status === 'error' ? 'text-[var(--color-accent-red)]' : thread.status === 'running' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-text-muted)]'}`}>
                                {threadStatusLabel(thread.status)}
                              </div>
                            )}
                          </button>
                          <button
                            onClick={() => setMenuOpenId(isMenuOpen ? null : threadId)}
                            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                            title="会话操作"
                            aria-label="会话操作菜单"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" /></svg>
                          </button>
                          {isMenuOpen && (
                            <div
                              data-session-menu
                              className="absolute right-0 top-7 z-30 w-28 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => startRename(thread)}
                                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                              >
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 1l4 4-8 8H3v-4l8-8z" /></svg>
                                重命名
                              </button>
                              <button
                                onClick={() => { setMenuOpenId(null); setPendingDelete(thread); }}
                                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--color-accent-red)] hover:bg-[var(--color-bg-hover)]"
                              >
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M5 4V2h6v2M4 4v9h8V4" /></svg>
                                删除
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除会话确认弹窗 */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="删除会话确认">
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl w-80">
            <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">删除会话？</div>
            <div className="mb-4 text-xs text-[var(--color-text-secondary)]">
              将永久删除会话「{pendingDelete.title || pendingDelete.id}」及其全部消息，不可恢复。
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="btn-ghost rounded-md px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >取消</button>
              <button
                onClick={confirmDelete}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ background: 'var(--color-accent-red)' }}
              >删除</button>
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
