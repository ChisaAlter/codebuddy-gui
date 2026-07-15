import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { archivedProjectThreads } from '../lib/session-sidebar';

function ArchiveBoxIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6v7h10V6M6 9h4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 5V2m0 0H0m3 0l2.2 2.2A5.5 5.5 0 111 9" />
    </svg>
  );
}

function formatArchiveTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '归档时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ReplicaArchivedView() {
  const { projectsById, projectOrder, threadsById, threadOrderByProject, restoreThread } = useStore(useShallow((state) => ({
    projectsById: state.projectsById,
    projectOrder: state.projectOrder,
    threadsById: state.threadsById,
    threadOrderByProject: state.threadOrderByProject,
    restoreThread: state.restoreThread,
  })));
  const [restoringId, setRestoringId] = React.useState(null);
  const [error, setError] = React.useState('');
  const groups = projectOrder.map((projectId) => ({
    project: projectsById[projectId],
    threads: archivedProjectThreads(projectId, threadOrderByProject, threadsById),
  })).filter((group) => group.project && group.threads.length > 0);

  const restore = async (thread) => {
    if (restoringId) return;
    setRestoringId(thread.id);
    setError('');
    try {
      const restored = await restoreThread(thread.id);
      if (!restored) setError('恢复会话失败，请重试');
    } catch (restoreError) {
      setError(restoreError?.message || '恢复会话失败，请重试');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]"><ArchiveBoxIcon /></span>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">已归档</h1>
          <span className="text-xs text-[var(--color-text-muted)]">{groups.reduce((count, group) => count + group.threads.length, 0)}</span>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[var(--color-accent-red)]">{error}</div>
        ) : null}

        {groups.length === 0 ? (
          <div className="border-t border-[var(--color-border-muted)] py-16 text-center">
            <div className="text-sm text-[var(--color-text-secondary)]">没有已归档的会话</div>
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map(({ project, threads }) => (
              <section key={project.id} aria-labelledby={`archived-project-${project.id}`}>
                <div className="mb-2 flex items-center gap-2 border-b border-[var(--color-border-muted)] pb-2">
                  <svg className="h-3.5 w-3.5 text-[var(--color-text-muted)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 4h5l1.2 1.5h6.8v7.5h-13V4z" /></svg>
                  <h2 id={`archived-project-${project.id}`} className="text-sm font-medium text-[var(--color-text-primary)]">{project.name}</h2>
                  <span className="text-[11px] text-[var(--color-text-muted)]">{threads.length}</span>
                </div>
                <div className="divide-y divide-[var(--color-border-muted)]">
                  {threads.map((thread) => (
                    <div key={thread.id} className="group flex min-h-12 items-center gap-3 px-2 py-2 hover:bg-[var(--color-bg-hover)]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                          <span className="truncate">{thread.title || '新对话'}</span>
                          {thread.pinned ? (
                            <svg className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" viewBox="0 0 16 16" fill="currentColor"><path d="M5 2h6l-1 4 2 2v1H9v5l-1 1-1-1V9H4V8l2-2-1-4z" /></svg>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">归档于 {formatArchiveTime(thread.archivedAt)}</div>
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] disabled:cursor-wait disabled:opacity-60"
                        aria-label={`恢复会话 ${thread.title || '新对话'}`}
                        disabled={Boolean(restoringId)}
                        onClick={() => restore(thread)}
                      >
                        {restoringId === thread.id ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : <RestoreIcon />}
                        恢复
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
