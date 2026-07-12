import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

function formatSince(startedAt) {
  if (!startedAt) return '-';
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return '-';
  const minutes = Math.floor(Math.max(0, Date.now() - started) / 60000);
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} 天`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时`;
  return minutes > 0 ? `${minutes} 分钟` : '刚刚';
}

function statusLabel(status) {
  if (status === 'running') return '运行中';
  if (status === 'starting') return '启动中';
  if (status === 'stopping') return '停止中';
  if (status === 'error') return '异常';
  if (status === 'stopped') return '已停止';
  return '未启动';
}

export default function ReplicaInstancesView() {
  const projectsById = useStore((state) => state.projectsById);
  const projectOrder = useStore((state) => state.projectOrder);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const applyProjectRuntimeStatus = useStore((state) => state.applyProjectRuntimeStatus);
  const ensureProjectRuntime = useStore((state) => state.ensureProjectRuntime);
  const stopProjectRuntime = useStore((state) => state.stopProjectRuntime);
  const restartProjectRuntime = useStore((state) => state.restartProjectRuntime);
  const chooseWorkspace = useStore((state) => state.chooseWorkspace);
  const [busyProjectId, setBusyProjectId] = useState(null);

  const refresh = async () => {
    const runtimes = await window.electronAPI?.listProjectRuntimes?.();
    for (const runtime of runtimes || []) applyProjectRuntimeStatus(runtime);
  };

  useEffect(() => {
    refresh();
  }, []);

  const runAction = async (projectId, action) => {
    setBusyProjectId(projectId);
    try {
      await action(projectId);
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">项目运行时</h2>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={refresh}>刷新</button>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={chooseWorkspace}>添加项目</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {projectOrder.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button className="btn-primary px-4 py-2 text-sm" onClick={chooseWorkspace}>打开第一个项目</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {projectOrder.map((projectId) => {
              const project = projectsById[projectId];
              if (!project) return null;
              const busy = busyProjectId === projectId || ['starting', 'stopping'].includes(project.runtimeStatus);
              const running = project.runtimeStatus === 'running';
              return (
                <article key={projectId} className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${running ? 'bg-[var(--color-accent-green)]' : project.runtimeStatus === 'error' ? 'bg-[var(--color-accent-red)]' : busy ? 'bg-[var(--color-accent-yellow)]' : 'bg-[var(--color-text-muted)]'}`} />
                        <h3 className="truncate text-sm font-medium text-[var(--color-text-primary)]">{project.name}</h3>
                        {projectId === activeProjectId ? <span className="text-[10px] text-[var(--color-accent-blue)]">当前</span> : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--color-text-secondary)]" title={project.workspacePath}>{project.workspacePath}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {running ? (
                        <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={() => runAction(projectId, stopProjectRuntime)}>停止</button>
                      ) : (
                        <button className="btn-primary px-2.5 py-1 text-xs" disabled={busy} onClick={() => runAction(projectId, ensureProjectRuntime)}>启动</button>
                      )}
                      <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={() => runAction(projectId, restartProjectRuntime)}>重启</button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-3 border-t border-[var(--color-border-muted)] pt-3 text-xs">
                    <div><div className="text-[var(--color-text-muted)]">状态</div><div className="mt-1 text-[var(--color-text-primary)]">{statusLabel(project.runtimeStatus)}</div></div>
                    <div><div className="text-[var(--color-text-muted)]">PID</div><div className="mt-1 text-[var(--color-text-primary)]">{project.runtimePid || '-'}</div></div>
                    <div><div className="text-[var(--color-text-muted)]">端口</div><div className="mt-1 text-[var(--color-text-primary)]">{project.runtimePort || '-'}</div></div>
                    <div><div className="text-[var(--color-text-muted)]">运行时长</div><div className="mt-1 text-[var(--color-text-primary)]">{formatSince(project.runtimeStartedAt)}</div></div>
                  </div>

                  {project.runtimeError ? (
                    <div className="mt-3 rounded border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[var(--color-accent-red)]">
                      {project.runtimeError}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
