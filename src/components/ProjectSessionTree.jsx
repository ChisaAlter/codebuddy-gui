import React from 'react';
import ActionConfirmDialog from './ActionConfirmDialog';
import { projectSidebarExpanded, visibleProjectThreads } from '../lib/session-sidebar';

const SESSION_PREVIEW_LIMIT = 8;

function FolderIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.5 4h5l1.2 1.5h6.8v7.5h-13V4z" />
    </svg>
  );
}

function PinIcon({ filled = false }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
      <path d="M5 2h6l-1 4 2 2v1H9v5l-1 1-1-1V9H4V8l2-2-1-4z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6v7h10V6M6 9h4" />
    </svg>
  );
}

export function ProjectSessionTree({
  projectsById,
  projectOrder,
  threadsById,
  threadOrderByProject,
  activeProjectId,
  activeThreadId,
  projectNavigationBusy,
  projectNavigationTargetId,
  onToggleProject,
  onActivateThread,
  onPinThread,
  onArchiveThread,
  onRenameThread,
  onDeleteThread,
  onCreateProjectThread,
  onOpenProjectMenu,
}) {
  const [contextMenu, setContextMenu] = React.useState(null);
  const [renamingId, setRenamingId] = React.useState(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [renameError, setRenameError] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [expandedSessionProjects, setExpandedSessionProjects] = React.useState({});

  React.useEffect(() => {
    if (!contextMenu) return undefined;
    const close = (event) => {
      if (!event.target.closest?.('[data-thread-context-menu]')) setContextMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  React.useEffect(() => {
    setContextMenu(null);
    setActionError('');
  }, [activeProjectId, activeThreadId]);

  const startRename = (thread) => {
    setContextMenu(null);
    setRenamingId(thread.id);
    setRenameValue(thread.title || '新对话');
    setRenameError('');
  };

  const submitRename = async (threadId) => {
    const title = renameValue.trim();
    if (!title) {
      setRenameError('会话名称不能为空');
      return;
    }
    setRenameBusy(true);
    setRenameError('');
    try {
      const renamed = await onRenameThread(threadId, title);
      if (renamed) setRenamingId(null);
      else setRenameError('重命名会话失败');
    } catch (error) {
      setRenameError(error?.message || '重命名会话失败');
    } finally {
      setRenameBusy(false);
    }
  };

  const runRowAction = async (action) => {
    setActionError('');
    try {
      const ok = await action();
      if (!ok) setActionError('会话操作失败，请重试');
    } catch (error) {
      setActionError(error?.message || '会话操作失败，请重试');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const deleted = await onDeleteThread(pendingDelete.id);
      if (deleted) setPendingDelete(null);
      else setDeleteError('删除会话失败，请重试');
    } catch (error) {
      setDeleteError(error?.message || '删除会话失败，请重试');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-1" data-project-session-tree>
      {projectOrder.length === 0 ? (
        <div className="px-2 py-1 text-xs text-[var(--color-text-muted)]">尚未打开项目</div>
      ) : projectOrder.map((projectId) => {
        const project = projectsById[projectId];
        if (!project) return null;
        const expanded = projectSidebarExpanded(project);
        const projectThreads = visibleProjectThreads(projectId, threadOrderByProject, threadsById);
        const sessionsExpanded = Boolean(expandedSessionProjects[projectId]);
        const displayedThreads = sessionsExpanded
          ? projectThreads
          : projectThreads.slice(0, SESSION_PREVIEW_LIMIT);
        const isActiveProject = projectId === activeProjectId;
        const activeThreadBelongsToProject = threadsById[activeThreadId]?.projectId === projectId;
        const showActiveProjectHighlight = isActiveProject && !activeThreadBelongsToProject;
        const mutating = projectNavigationBusy && String(projectNavigationTargetId || '').includes(projectId);
        return (
          <div key={projectId} data-project-id={projectId}>
            <div className="group/project flex items-center gap-0.5">
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[15px] font-medium transition-colors ${showActiveProjectHighlight ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'}`}
                data-active-highlight={showActiveProjectHighlight}
                aria-label={`${expanded ? '折叠' : '展开'}项目 ${project.name}`}
                aria-expanded={expanded}
                onClick={() => onToggleProject(projectId, !expanded)}
                disabled={mutating}
                title={project.workspacePath}
              >
                <span className="text-[var(--color-text-muted)]"><FolderIcon /></span>
                <span className="truncate">{project.name}</span>
                <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${project.runtimeStatus === 'running' ? 'bg-[var(--color-accent-green)]' : project.runtimeStatus === 'error' ? 'bg-[var(--color-accent-red)]' : project.runtimeStatus === 'starting' ? 'bg-[var(--color-accent-yellow)]' : 'bg-[var(--color-text-muted)]'}`} />
              </button>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] group-hover/project:opacity-100 focus:opacity-100"
                aria-label={`项目操作 ${project.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProjectMenu(event, project);
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" /></svg>
              </button>
            </div>

            {expanded ? (
              <div className="mt-0.5 space-y-0.5 pl-7">
                {projectThreads.length === 0 ? (
                  <button
                    type="button"
                    className="w-full py-1 pr-2 text-left text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                    aria-label={`在 ${project.name} 中新建会话`}
                    onClick={() => onCreateProjectThread(projectId)}
                  >+ 新建会话</button>
                ) : displayedThreads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  const switching = projectNavigationBusy && projectNavigationTargetId === `thread:${thread.id}`;
                  const isRenaming = renamingId === thread.id;
                  return (
                    <div
                      key={thread.id}
                      data-session-row
                      data-session-id={thread.id}
                      className={`group/session relative flex min-h-7 items-center rounded-md ${isActive ? 'bg-[var(--color-bg-hover)]' : 'hover:bg-[var(--color-bg-hover)]'}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu({ thread, x: event.clientX, y: event.clientY });
                      }}
                    >
                      {isRenaming ? (
                        <div className="min-w-0 flex-1 px-1.5 py-1">
                          <input
                            autoFocus
                            value={renameValue}
                            disabled={renameBusy}
                            aria-label="会话新名称"
                            className="w-full rounded border border-[var(--color-border-active)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-sm text-[var(--color-text-primary)]"
                            onChange={(event) => { setRenameValue(event.target.value); setRenameError(''); }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') submitRename(thread.id);
                              if (event.key === 'Escape' && !renameBusy) setRenamingId(null);
                            }}
                          />
                          {renameError ? <div className="pt-1 text-[10px] text-[var(--color-accent-red)]">{renameError}</div> : null}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left text-[14px] text-[var(--color-text-secondary)] disabled:opacity-60"
                            disabled={projectNavigationBusy}
                            onClick={() => onActivateThread(thread.id)}
                            title={thread.title || '新对话'}
                          >
                            <span className={`truncate ${isActive ? 'text-[var(--color-text-primary)]' : ''}`}>{thread.title || '新对话'}</span>
                          </button>
                          <div className="mr-1 flex h-6 shrink-0 items-center gap-0.5">
                            <div className="hidden items-center gap-0.5 group-hover/session:flex group-focus-within/session:flex">
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                                aria-label={thread.pinned ? '取消置顶会话' : '置顶会话'}
                                title={thread.pinned ? '取消置顶' : '置顶'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runRowAction(() => onPinThread(thread.id, !thread.pinned));
                                }}
                              ><PinIcon filled={thread.pinned} /></button>
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                                aria-label="归档会话"
                                title="归档"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runRowAction(() => onArchiveThread(thread.id));
                                }}
                              ><ArchiveIcon /></button>
                            </div>
                            {switching || thread.status === 'running' ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-text-muted)] border-t-transparent" aria-label="AI处理中" />
                            ) : thread.unread ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-blue)]" aria-label="未读更新" />
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {projectThreads.length > SESSION_PREVIEW_LIMIT ? (
                  <button
                    type="button"
                    className="w-full py-1 pr-2 text-left text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                    aria-label={`${sessionsExpanded ? '收起' : '展开'} ${project.name} 的全部会话`}
                    onClick={() => setExpandedSessionProjects((current) => ({
                      ...current,
                      [projectId]: !sessionsExpanded,
                    }))}
                  >{sessionsExpanded ? '收起' : '展开显示'}</button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {actionError ? <div className="px-2 pt-1 text-[10px] text-[var(--color-accent-red)]">{actionError}</div> : null}

      {contextMenu ? (
        <div
          data-thread-context-menu
          role="menu"
          className="fixed z-50 w-32 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            data-action="rename"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            onClick={() => startRename(contextMenu.thread)}
          >重命名</button>
          <button
            type="button"
            role="menuitem"
            data-action="delete"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-accent-red)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => { setPendingDelete(contextMenu.thread); setContextMenu(null); setDeleteError(''); }}
          >删除</button>
        </div>
      ) : null}

      <ActionConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除会话？"
        description={pendingDelete ? `“${pendingDelete.title || '新对话'}”及其本地记录将被删除，此操作无法撤销。` : ''}
        confirmLabel="删除"
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => { if (!deleteBusy) setPendingDelete(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default ProjectSessionTree;
