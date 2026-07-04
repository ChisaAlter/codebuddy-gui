import React, { useState } from 'react';
import { useStore } from '../store';

export default function ReplicaTasksView() {
  const { scheduledTasks, sessionId, refreshTasks, createTask, error } = useStore();
  const [cron, setCron] = useState('0 9 * * *');
  const [prompt, setPrompt] = useState('每日汇总当前会话进度');
  const [creating, setCreating] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleCreate = async () => {
    setCreating(true);
    setLocalError(null);
    try {
      await createTask(cron.trim(), prompt.trim());
      setPrompt('每日汇总当前会话进度');
    } catch (err) {
      setLocalError(err.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const tasksList = Array.isArray(scheduledTasks) ? scheduledTasks : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-3xl px-8 py-8">
        <h1 className="mb-6 text-lg font-semibold text-[var(--color-text-primary)]">任务</h1>

        {/* Error banner */}
        {(error || localError) && (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.1)] px-4 py-2.5 text-sm text-[#f87171]">
            {error || localError}
            <button className="ml-3 underline text-xs" onClick={() => { setLocalError(null); refreshTasks(); }}>重试</button>
          </div>
        )}

        {/* Create form */}
        <div className="mb-6 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4">
          <h2 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">新增定时任务</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Cron 表达式</label>
              <input
                type="text" value={cron} onChange={(e) => setCron(e.target.value)}
                placeholder="0 9 * * *"
                className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-focus-ring)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">提示词</label>
              <textarea
                rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                className="w-full resize-none rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-focus-ring)]"
              />
            </div>
            <button
              onClick={handleCreate} disabled={creating || !sessionId}
              className="rounded-md bg-[#0078d4] px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-all disabled:opacity-40"
            >
              {creating ? '创建中...' : '创建任务'}
            </button>
          </div>
        </div>

        {/* Task list */}
        <h2 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">任务列表</h2>

        {tasksList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-12 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">暂无定时任务</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">使用上方表单创建新的定时任务</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasksList.map((task, idx) => (
              <div key={task.id || idx} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--color-text-primary)] truncate">{task.prompt || task.name || `任务 ${idx + 1}`}</div>
                    <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">{task.cron || task.schedule || '-'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
