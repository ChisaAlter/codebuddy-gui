import React, { useEffect, useState } from 'react';
import {
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
        else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('@@')) style = { color: '#0078d4' };
        return <div key={index} style={style}>{line || ' '}</div>;
      })}
    </div>
  );
}

export default function ReplicaChangesView() {
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

  async function loadAll(keepSelection = true) {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(false);
  }, []);

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
    } catch (error) {
      setStatusText(`失败: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSwitchBranch() {
    const name = window.prompt('输入要切换的分支名', branch || '');
    if (!name) return;
    await perform(() => switchBranch(name));
  }

  async function onCreateBranch() {
    const name = window.prompt('输入新分支名');
    if (!name) return;
    await perform(() => createBranch(name));
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      const res = await window.electronAPI.runGit(['commit', '-m', commitMessage.trim()]);
      setStatusText(res.ok ? '提交成功' : `提交失败: ${res.output}`);
      if (res.ok) {
        setCommitMessage('');
        loadAll(true);
      }
    } catch (err) {
      setStatusText(`提交失败: ${err.message}`);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--color-bg-primary)]">
      <div className="flex min-h-0 w-[380px] shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border-default)] p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Source Control</div>
          <div className="text-sm text-[var(--color-text-primary)]">当前分支: {branch || '-'}</div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">{branches.length} 个分支</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={busy} onClick={onSwitchBranch}>切换分支</button>
            <button className="btn-ghost" disabled={busy} onClick={onCreateBranch}>新建分支</button>
            <button className="btn-ghost" disabled={busy} onClick={() => perform(() => pullBranch())}>Pull</button>
            <button className="btn-ghost" disabled={busy} onClick={() => perform(() => pushBranch())}>Push</button>
          </div>
          {/* Commit area */}
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit(); } }}
                placeholder="输入提交信息..."
                disabled={committing}
                className="flex-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-focus-ring)] placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
              />
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || committing}
                className="rounded-md bg-[#0078d4] px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {committing ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={busy} onClick={() => perform(() => stageAll())}>Stage All</button>
            <button className="btn-ghost" disabled={busy} onClick={() => perform(() => unstageAll())}>Unstage All</button>
            <button className="btn-ghost" disabled={busy} onClick={() => perform(() => discardAll())}>Discard All</button>
          </div>
          {statusText && (
            <div className={`mt-2 rounded-md px-3 py-1.5 text-xs ${
              statusText.includes('成功')
                ? 'bg-[rgba(74,222,128,0.1)] text-[#4ade80] border border-[rgba(74,222,128,0.2)]'
                : statusText.includes('失败') || statusText.includes('错误')
                ? 'bg-[rgba(248,113,113,0.1)] text-[#f87171] border border-[rgba(248,113,113,0.2)]'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
            }`}>{statusText}</div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="p-3 text-sm text-[var(--color-text-muted)]">加载改动中...</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-[var(--color-text-muted)]">没有检测到改动</div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <div key={item.path} className="rounded-md px-2 py-2" style={{ background: selected?.path === item.path ? 'rgba(0,120,212,0.12)' : 'transparent' }}>
                  <button
                    className="block w-full text-left text-sm"
                    style={{ color: selected?.path === item.path ? '#fff' : 'var(--color-text-secondary)' }}
                    onClick={() => setSelected(item)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.path}</span>
                      <span className="rounded bg-[var(--color-bg-card)] px-2 py-0.5 text-[10px]">{item.indexStatus}{item.worktreeStatus}</span>
                    </div>
                  </button>
                  {selected?.path === item.path ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="btn-ghost" disabled={busy} onClick={() => perform(() => stageFile(item.path))}>Stage</button>
                      <button className="btn-ghost" disabled={busy} onClick={() => perform(() => unstageFile(item.path))}>Unstage</button>
                      <button className="btn-ghost" disabled={busy} onClick={() => perform(() => discardFile(item.path))}>Discard</button>
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
  );
}
