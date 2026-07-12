import React, { useEffect, useState } from 'react';
import {
  commit,
  createBranch,
  discardAll,
  discardFile,
  getBranches,
  getCurrentBranch,
  getDiff,
  getGitStatus,
  pullBranch,
  pushBranch,
  stageAll,
  stageFile,
  switchBranch,
  unstageAll,
  unstageFile,
} from '../lib/git';
import { useStore } from '../store';

function DiffBlock({ diff }) {
  if (!diff) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">选择左侧文件以查看 diff</div>;
  }

  const lines = diff.split(/\r?\n/);
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#161616] p-4 font-mono text-[12px] leading-6 text-[#f8f8f8]">
      {lines.map((line, index) => {
        let style = {};
        if (line.startsWith('+') && !line.startsWith('+++')) style = { background: '#22c55e1a', color: '#4ade80' };
        else if (line.startsWith('-') && !line.startsWith('---')) style = { background: '#ef44441a', color: '#fca5a5' };
        else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('@@'))
          style = { color: '#0078d4' };
        return (
          <div key={index} style={style}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}

export default function ReplicaChangesView() {
  const workspacePath = useStore((state) => state.workspacePath);
  const [items, setItems] = useState([]);
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [operationDialog, setOperationDialog] = useState(null);
  const [operationValue, setOperationValue] = useState('');
  const [operationError, setOperationError] = useState('');
  const [loadError, setLoadError] = useState('');

  async function loadAll(keepSelection = true) {
    setLoading(true);
    setLoadError('');
    try {
      const [status, currentBranch, branchList] = await Promise.all([
        getGitStatus(),
        getCurrentBranch(),
        getBranches(),
      ]);
      setItems(status);
      setBranch(currentBranch);
      setBranches(branchList);
      if (keepSelection && selected?.path) {
        const found = status.find((x) => x.path === selected.path);
        setSelected(found || null);
      } else if (!keepSelection) {
        setSelected(null);
      }
    } catch (error) {
      const message = error.message || '读取 Git 状态失败';
      setItems([]);
      setBranch('');
      setBranches([]);
      setSelected(null);
      setDiff('');
      setLoadError(/not a git repository/i.test(message) ? '当前文件夹不是 Git 仓库' : message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(false);
  }, [workspacePath]);

  useEffect(() => {
    async function loadDiff() {
      if (!selected?.path) {
        setDiff('');
        return;
      }
      try {
        const text = await getDiff(selected.path);
        setDiff(text || '该文件当前无可显示 diff');
      } catch (error) {
        setDiff(`加载 diff 失败: ${error.message}`);
      }
    }
    loadDiff();
  }, [selected]);

  async function perform(action) {
    setBusy(true);
    setStatusText('执行中...');
    try {
      await action();
      setStatusText('已完成');
      await loadAll(true);
      if (selected?.path) {
        const text = await getDiff(selected.path).catch(() => '');
        setDiff(text || '该文件当前无可显示 diff');
      }
      return { ok: true };
    } catch (error) {
      setStatusText(`失败: ${error.message}`);
      return { ok: false, error: error.message || '操作失败' };
    } finally {
      setBusy(false);
    }
  }

  function onSwitchBranch() {
    setOperationDialog({ type: 'switch' });
    setOperationValue(branches.find((name) => name !== branch) || branch || '');
    setOperationError('');
  }

  function onCreateBranch() {
    setOperationDialog({ type: 'create' });
    setOperationValue('');
    setOperationError('');
  }

  const confirmDiscardAll = () => {
    setOperationDialog({ type: 'discard-all' });
    setOperationValue('');
    setOperationError('');
  };

  const closeOperationDialog = () => {
    if (busy) return;
    setOperationDialog(null);
    setOperationError('');
  };

  const submitOperationDialog = async () => {
    if (!operationDialog || busy) return;
    const value = operationValue.trim();
    if ((operationDialog.type === 'switch' || operationDialog.type === 'create') && !value) {
      setOperationError(operationDialog.type === 'switch' ? '请选择目标分支' : '分支名称不能为空');
      return;
    }
    if (operationDialog.type === 'switch' && value === branch) {
      setOperationError('当前已经位于这个分支');
      return;
    }
    if (operationDialog.type === 'create' && branches.includes(value)) {
      setOperationError('该分支已存在');
      return;
    }

    let action;
    if (operationDialog.type === 'switch') action = () => switchBranch(value);
    else if (operationDialog.type === 'create') action = () => createBranch(value);
    else if (operationDialog.type === 'discard-all') action = () => discardAll();
    else action = () => discardFile(operationDialog.item);

    setOperationError('');
    const result = await perform(action);
    if (!result.ok) {
      setOperationError(result.error);
      return;
    }
    setOperationDialog(null);
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      await commit(commitMessage.trim());
      setStatusText('提交成功');
      setCommitMessage('');
      await loadAll(true);
    } catch (err) {
      setStatusText(`提交失败: ${err.message}`);
    } finally {
      setCommitting(false);
    }
  };
  const operationType = operationDialog?.type || '';
  const hasSwitchTarget = branches.some((name) => name !== branch);
  const isBranchOperation = operationType === 'switch' || operationType === 'create';
  const isDiscardOperation = operationType === 'discard-all' || operationType === 'discard-file';
  const discardItem = operationDialog?.item || null;
  const discardIsUntracked = discardItem?.indexStatus === '?' && discardItem?.worktreeStatus === '?';
  const operationTitle =
    operationType === 'switch'
      ? '切换分支'
      : operationType === 'create'
        ? '新建分支'
        : operationType === 'discard-all'
          ? '丢弃全部修改？'
          : '丢弃文件修改？';
  const confirmLabel =
    operationType === 'switch'
      ? '切换'
      : operationType === 'create'
        ? '创建并切换'
        : discardIsUntracked
          ? '删除文件'
          : '丢弃修改';

  return (
    <>
      <div className="flex min-h-0 flex-1 bg-[var(--color-bg-primary)]">
        <div className="flex min-h-0 w-[380px] shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
          <div className="border-b border-[var(--color-border-default)] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Source Control
            </div>
            <div className="text-sm text-[var(--color-text-primary)]">当前分支: {branch || '-'}</div>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">{branches.length} 个分支</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost" disabled={busy || !!loadError || !hasSwitchTarget} onClick={onSwitchBranch}>
                切换分支
              </button>
              <button className="btn-ghost" disabled={busy || !!loadError} onClick={onCreateBranch}>
                新建分支
              </button>
              <button className="btn-ghost" disabled={busy || !!loadError} onClick={() => perform(() => pullBranch())}>
                Pull
              </button>
              <button className="btn-ghost" disabled={busy || !!loadError} onClick={() => perform(() => pushBranch())}>
                Push
              </button>
            </div>
            {/* Commit area */}
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleCommit();
                    }
                  }}
                  placeholder="输入提交信息..."
                  disabled={committing || !!loadError}
                  className="flex-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-focus-ring)] placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
                />
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || committing || !!loadError}
                  className="rounded-md bg-[#0078d4] px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {committing ? '提交中...' : '提交'}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost" disabled={busy || !!loadError} onClick={() => perform(() => stageAll())}>
                Stage All
              </button>
              <button className="btn-ghost" disabled={busy || !!loadError} onClick={() => perform(() => unstageAll())}>
                Unstage All
              </button>
              <button className="btn-ghost" disabled={busy || !!loadError} onClick={confirmDiscardAll}>
                Discard All
              </button>
            </div>
            {statusText && (
              <div
                className={`mt-2 rounded-md px-3 py-1.5 text-xs ${
                  statusText.includes('成功') || statusText.includes('已完成')
                    ? 'bg-[rgba(74,222,128,0.1)] text-[#4ade80] border border-[rgba(74,222,128,0.2)]'
                    : statusText.includes('失败') || statusText.includes('错误')
                      ? 'bg-[rgba(248,113,113,0.1)] text-[#f87171] border border-[rgba(248,113,113,0.2)]'
                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
              >
                {statusText}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-3 text-sm text-[var(--color-text-muted)]">加载改动中...</div>
            ) : loadError ? (
              <div className="m-2 rounded-md border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] p-3 text-sm text-[#f87171]">
                <div>{loadError}</div>
                <button className="mt-2 text-xs underline" onClick={() => loadAll(false)}>
                  重新检查
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="p-3 text-sm text-[var(--color-text-muted)]">没有检测到改动</div>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.path}
                    className="rounded-md px-2 py-2"
                    style={{ background: selected?.path === item.path ? 'rgba(0,120,212,0.12)' : 'transparent' }}
                  >
                    <button
                      className="block w-full text-left text-sm"
                      style={{ color: selected?.path === item.path ? '#fff' : 'var(--color-text-secondary)' }}
                      onClick={() => setSelected(item)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="truncate"
                          title={item.originalPath ? `${item.originalPath} → ${item.path}` : item.path}
                        >
                          {item.originalPath ? `${item.originalPath} → ${item.path}` : item.path}
                        </span>
                        <span className="rounded bg-[var(--color-bg-card)] px-2 py-0.5 text-[10px]">
                          {item.indexStatus}
                          {item.worktreeStatus}
                        </span>
                      </div>
                    </button>
                    {selected?.path === item.path ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => perform(() => stageFile(item.path))}
                        >
                          Stage
                        </button>
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => perform(() => unstageFile(item.path))}
                        >
                          Unstage
                        </button>
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            setOperationDialog({ type: 'discard-file', item });
                            setOperationValue('');
                            setOperationError('');
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-primary)]">
          <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-4">
            <div className="truncate text-sm text-[var(--color-text-primary)]">{selected?.path || '未选择文件'}</div>
            <div className="text-xs text-[var(--color-text-muted)]">Diff Preview</div>
          </div>
          <DiffBlock diff={diff} />
        </div>
      </div>

      {operationDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={operationTitle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeOperationDialog();
          }}
        >
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">{operationTitle}</div>

            {isBranchOperation ? (
              <div className="mt-4">
                <label
                  className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
                  htmlFor="git-branch-operation"
                >
                  {operationType === 'switch' ? '目标分支' : '分支名称'}
                </label>
                {operationType === 'switch' ? (
                  <select
                    id="git-branch-operation"
                    autoFocus
                    className="input-field w-full"
                    value={operationValue}
                    disabled={busy}
                    onChange={(event) => {
                      setOperationValue(event.target.value);
                      setOperationError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitOperationDialog();
                      else if (event.key === 'Escape') closeOperationDialog();
                    }}
                  >
                    {branches.map((name) => (
                      <option key={name} value={name}>
                        {name}
                        {name === branch ? '（当前）' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="git-branch-operation"
                    autoFocus
                    className="input-field w-full"
                    value={operationValue}
                    disabled={busy}
                    placeholder="例如 feature/new-ui"
                    onChange={(event) => {
                      setOperationValue(event.target.value);
                      setOperationError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitOperationDialog();
                      else if (event.key === 'Escape') closeOperationDialog();
                    }}
                  />
                )}
              </div>
            ) : null}

            {operationType === 'discard-all' ? (
              <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                全部暂存和未暂存修改会被还原，未跟踪文件及文件夹会被删除。此操作无法撤销。
              </p>
            ) : null}
            {operationType === 'discard-file' ? (
              <p className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                {discardIsUntracked
                  ? `未跟踪文件“${discardItem?.path || ''}”会从磁盘删除，此操作无法撤销。`
                  : `“${discardItem?.path || ''}”的全部暂存和未暂存修改会被永久丢弃。`}
              </p>
            ) : null}

            {operationError ? (
              <div className="mt-3 text-xs text-[var(--color-accent-red)]">{operationError}</div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={closeOperationDialog}>
                取消
              </button>
              <button
                className={
                  isDiscardOperation
                    ? 'rounded-md px-3 py-1.5 text-xs font-medium text-white'
                    : 'btn-primary px-3 py-1.5 text-xs'
                }
                style={isDiscardOperation ? { background: 'var(--color-accent-red)' } : undefined}
                disabled={
                  busy ||
                  (operationType === 'switch' && (!operationValue || operationValue === branch)) ||
                  (operationType === 'create' && !operationValue.trim())
                }
                onClick={submitOperationDialog}
              >
                {busy ? '处理中...' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
