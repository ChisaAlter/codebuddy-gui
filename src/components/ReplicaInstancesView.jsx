import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [actionStateByProject, setActionStateByProject] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const refreshRequestIdRef = useRef(0);
  const [, setClock] = useState(0);
  const actionVersionByProjectRef = useRef(new Map());
  const activeActionsRef = useRef(new Set());
  const messageTimerByProjectRef = useRef(new Map());
  const mountedRef = useRef(true);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++refreshRequestIdRef.current;
    if (!silent) {
      setRefreshing(true);
      setRefreshError('');
    }
    try {
      if (!window.electronAPI?.listProjectRuntimes) throw new Error('运行时管理接口不可用');
      const runtimes = await window.electronAPI.listProjectRuntimes();
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return false;
      const runtimeByProject = new Map((runtimes || []).map((runtime) => [runtime.projectId, runtime]));
      const state = useStore.getState();
      for (const projectId of state.projectOrder) {
        const runtime = runtimeByProject.get(projectId);
        if (runtime) {
          applyProjectRuntimeStatus(runtime);
        } else {
          const project = state.projectsById[projectId];
          if (project && !['idle', 'stopped'].includes(project.runtimeStatus)) {
            applyProjectRuntimeStatus({ projectId, status: 'stopped' });
          }
        }
      }
      setRefreshError('');
      return true;
    } catch (error) {
      if (mountedRef.current && requestId === refreshRequestIdRef.current) {
        setRefreshError(error.message || '刷新项目运行时失败');
      }
      return false;
    } finally {
      if (mountedRef.current && requestId === refreshRequestIdRef.current) setRefreshing(false);
    }
  }, [applyProjectRuntimeStatus]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const refreshTimer = setInterval(() => refresh({ silent: true }), 10000);
    const clockTimer = setInterval(() => {
      if (mountedRef.current) setClock((value) => value + 1);
    }, 60000);
    return () => {
      mountedRef.current = false;
      refreshRequestIdRef.current += 1;
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
      activeActionsRef.current.clear();
      for (const timer of messageTimerByProjectRef.current.values()) clearTimeout(timer);
      messageTimerByProjectRef.current.clear();
    };
  }, [refresh]);

  const runAction = async (projectId, action, actionName, successMessage) => {
    if (activeActionsRef.current.has(projectId)) return;
    activeActionsRef.current.add(projectId);
    const version = (actionVersionByProjectRef.current.get(projectId) || 0) + 1;
    actionVersionByProjectRef.current.set(projectId, version);
    const existingMessageTimer = messageTimerByProjectRef.current.get(projectId);
    if (existingMessageTimer) clearTimeout(existingMessageTimer);
    messageTimerByProjectRef.current.delete(projectId);
    const isCurrentAction = () => (
      mountedRef.current && actionVersionByProjectRef.current.get(projectId) === version
    );
    setActionStateByProject((current) => ({
      ...current,
      [projectId]: { busy: actionName, error: '', message: '' },
    }));
    try {
      const result = await action(projectId);
      if (!isCurrentAction()) return;
      if (result === false || result == null) {
        const projectError = useStore.getState().projectsById[projectId]?.runtimeError;
        setActionStateByProject((current) => ({
          ...current,
          [projectId]: { busy: actionName, error: projectError || '运行时操作失败', message: '' },
        }));
      } else {
        setActionStateByProject((current) => ({
          ...current,
          [projectId]: { busy: actionName, error: '', message: successMessage },
        }));
        const messageTimer = setTimeout(() => {
          messageTimerByProjectRef.current.delete(projectId);
          if (!mountedRef.current) return;
          setActionStateByProject((current) => ({
            ...current,
            [projectId]: current[projectId]?.message === successMessage
              ? { ...current[projectId], message: '' }
              : current[projectId],
          }));
        }, 4000);
        messageTimerByProjectRef.current.set(projectId, messageTimer);
      }
      await refresh({ silent: true });
    } catch (error) {
      if (isCurrentAction()) {
        setActionStateByProject((current) => ({
          ...current,
          [projectId]: { busy: actionName, error: error.message || '运行时操作失败', message: '' },
        }));
      }
    } finally {
      activeActionsRef.current.delete(projectId);
      if (isCurrentAction()) {
        setActionStateByProject((current) => ({
          ...current,
          [projectId]: { ...current[projectId], busy: null },
        }));
      }
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">项目运行时</h2>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={refreshing} onClick={() => refresh()}>{refreshing ? '刷新中...' : '刷新'}</button>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={chooseWorkspace}>添加项目</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {refreshError ? (
          <div className="mb-4 flex items-center justify-between rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[var(--color-accent-red)]">
            <span>{refreshError}</span>
            <button className="btn-ghost px-2 py-1 text-xs" disabled={refreshing} onClick={() => refresh()}>{refreshing ? '重试中...' : '重试'}</button>
          </div>
        ) : null}
        {projectOrder.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button className="btn-primary px-4 py-2 text-sm" onClick={chooseWorkspace}>打开第一个项目</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {projectOrder.map((projectId) => {
              const project = projectsById[projectId];
              if (!project) return null;
              const actionState = actionStateByProject[projectId] || {};
              const busy = Boolean(actionState.busy) || ['starting', 'stopping'].includes(project.runtimeStatus);
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
                        <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={() => runAction(projectId, stopProjectRuntime, 'stop', '运行时已停止')}>
                          {actionState.busy === 'stop' ? '停止中...' : '停止'}
                        </button>
                      ) : (
                        <button className="btn-primary px-2.5 py-1 text-xs" disabled={busy} onClick={() => runAction(projectId, ensureProjectRuntime, 'start', '运行时已启动')}>
                          {actionState.busy === 'start' ? '启动中...' : '启动'}
                        </button>
                      )}
                      <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={() => runAction(projectId, restartProjectRuntime, 'restart', '运行时已重启')}>
                        {actionState.busy === 'restart' ? '重启中...' : '重启'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-3 border-t border-[var(--color-border-muted)] pt-3 text-xs">
                    <div><div className="text-[var(--color-text-muted)]">状态</div><div className="mt-1 text-[var(--color-text-primary)]">{statusLabel(project.runtimeStatus)}</div></div>
                    <div><div className="text-[var(--color-text-muted)]">PID</div><div className="mt-1 text-[var(--color-text-primary)]">{project.runtimePid || '-'}</div></div>
                    <div><div className="text-[var(--color-text-muted)]">端口</div><div className="mt-1 text-[var(--color-text-primary)]">{project.runtimePort || '-'}</div></div>
                    <div><div className="text-[var(--color-text-muted)]">运行时长</div><div className="mt-1 text-[var(--color-text-primary)]">{formatSince(project.runtimeStartedAt)}</div></div>
                  </div>

                  {(actionState.error || project.runtimeError) ? (
                    <div className="mt-3 rounded border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[var(--color-accent-red)]">
                      {actionState.error || project.runtimeError}
                    </div>
                  ) : null}
                  {actionState.message ? (
                    <div className="mt-3 rounded border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-2 text-xs text-[var(--color-accent-green)]">
                      {actionState.message}
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
