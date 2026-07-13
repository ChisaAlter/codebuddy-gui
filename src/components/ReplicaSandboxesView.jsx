import React from 'react';
import ActionConfirmDialog from './ActionConfirmDialog';
import { cleanSandboxes, killSandbox, listSandboxes } from '../lib/sandbox';

function formatDateTime(value) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}

function sandboxErrorMessage(error, fallback) {
  const message = error?.message || fallback;
  if (/E2B_API_KEY environment variable is required/i.test(message)) {
    return `缺少 E2B_API_KEY。请先在启动 CodeBuddy GUI 的环境中配置该变量。CLI 返回：${message}`;
  }
  return message;
}

export default function ReplicaSandboxesView() {
  const [snapshot, setSnapshot] = React.useState({ statePath: '', stateExists: false, currentSandboxId: null, aliases: [], sandboxes: [] });
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [pendingKill, setPendingKill] = React.useState(null);
  const [cleanOpen, setCleanOpen] = React.useState(false);
  const [operationBusy, setOperationBusy] = React.useState(false);
  const [operationError, setOperationError] = React.useState('');
  const requestRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const load = React.useCallback(async ({ initial = false } = {}) => {
    const requestId = ++requestRef.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const next = await listSandboxes();
      if (mountedRef.current && requestId === requestRef.current) setSnapshot(next || { sandboxes: [], aliases: [] });
      return next;
    } catch (loadError) {
      if (mountedRef.current && requestId === requestRef.current) setError(loadError?.message || '读取 Sandbox 状态失败');
      return null;
    } finally {
      if (mountedRef.current && requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    load({ initial: true });
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [load]);

  const applyOperationResult = (result) => {
    if (result?.snapshot) setSnapshot(result.snapshot);
    else load();
    return String(result?.output || '').trim();
  };

  const confirmKill = async () => {
    if (!pendingKill || operationBusy) return;
    const target = pendingKill;
    setOperationBusy(true);
    setOperationError('');
    setNotice('');
    try {
      const result = await killSandbox(target.sandboxId);
      if (!mountedRef.current) return;
      const output = applyOperationResult(result);
      const stillExists = result?.snapshot?.sandboxes?.some((item) => item.sandboxId === target.sandboxId);
      if (stillExists) throw new Error('CodeBuddy 已返回成功，但本地状态中仍存在该 Sandbox，请刷新后重试');
      setPendingKill(null);
      setNotice(output || `Sandbox ${target.sandboxId} 已终止`);
    } catch (operationFailure) {
      if (mountedRef.current) setOperationError(sandboxErrorMessage(operationFailure, '终止 Sandbox 失败'));
    } finally {
      if (mountedRef.current) setOperationBusy(false);
    }
  };

  const confirmClean = async () => {
    if (operationBusy) return;
    setOperationBusy(true);
    setOperationError('');
    setNotice('');
    try {
      const before = snapshot.sandboxes?.length || 0;
      const result = await cleanSandboxes();
      if (!mountedRef.current) return;
      const output = applyOperationResult(result);
      const after = result?.snapshot?.sandboxes?.length || 0;
      setCleanOpen(false);
      setNotice(output || `清理完成，移除 ${Math.max(0, before - after)} 条失效记录`);
    } catch (operationFailure) {
      if (mountedRef.current) setOperationError(sandboxErrorMessage(operationFailure, '清理 Sandbox 记录失败'));
    } finally {
      if (mountedRef.current) setOperationBusy(false);
    }
  };

  const sandboxes = Array.isArray(snapshot.sandboxes) ? snapshot.sandboxes : [];
  const query = search.trim().toLowerCase();
  const filtered = query ? sandboxes.filter((sandbox) => [
    sandbox.sandboxId,
    sandbox.templateName,
    ...(sandbox.aliases || []),
    ...(sandbox.projects || []).flatMap((project) => [project.localPath, project.remotePath]),
  ].join(' ').toLowerCase().includes(query)) : sandboxes;
  const orphanAliases = (snapshot.aliases || []).filter((item) => !sandboxes.some((sandbox) => sandbox.sandboxId === item.sandboxId));

  const toggleExpanded = (sandboxId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(sandboxId)) next.delete(sandboxId);
      else next.add(sandboxId);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-6xl px-8 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Sandboxes</h1>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">{sandboxes.length} 个本地记录{snapshot.currentSandboxId ? '，1 个当前 Sandbox' : ''}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost text-xs" disabled={refreshing || operationBusy} onClick={() => load()}>{refreshing ? '刷新中...' : '刷新'}</button>
            <button className="btn-primary text-xs" disabled={!sandboxes.length || operationBusy} onClick={() => { setOperationError(''); setCleanOpen(true); }}>清理失效记录</button>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-md border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-[var(--color-accent-red)]">{error}</div> : null}
        {notice ? <div className="mb-4 rounded-md border border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] px-4 py-3 text-sm text-[var(--color-accent-green)]">{notice}</div> : null}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <input className="input-field w-full max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 ID、别名、模板或项目路径..." />
          <div className="min-w-0 max-w-full truncate font-mono text-[10px] text-[var(--color-text-muted)]" title={snapshot.statePath}>{snapshot.statePath || '正在定位状态文件...'}</div>
        </div>

        {orphanAliases.length ? (
          <div className="mb-5 rounded-md border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.08)] px-4 py-3 text-xs text-[var(--color-accent-yellow)]">
            {orphanAliases.length} 个别名指向已不在本地状态中的 Sandbox：{orphanAliases.map((item) => item.alias).join('、')}
          </div>
        ) : null}

        {loading ? (
          <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">正在读取 Sandbox 状态...</div>
        ) : filtered.length ? (
          <div className="overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
            {filtered.map((sandbox, index) => {
              const isExpanded = expanded.has(sandbox.sandboxId);
              const projects = Array.isArray(sandbox.projects) ? sandbox.projects : [];
              return (
                <section key={sandbox.sandboxId} className={index ? 'border-t border-[var(--color-border-default)]' : ''}>
                  <div className="flex flex-wrap items-start gap-4 px-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono text-sm font-medium text-[var(--color-text-primary)]">{sandbox.sandboxId}</span>
                        {sandbox.current ? <span className="rounded border border-[rgba(74,222,128,0.35)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent-green)]">当前</span> : null}
                        {sandbox.templateName ? <span className="rounded border border-[var(--color-border-default)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">{sandbox.templateName}</span> : null}
                      </div>
                      {sandbox.aliases?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{sandbox.aliases.map((alias) => <span key={alias} className="rounded bg-[var(--color-bg-tertiary)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">{alias}</span>)}</div> : null}
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
                        <span>创建：{formatDateTime(sandbox.createdAt)}</span>
                        <span>最近使用：{formatDateTime(sandbox.lastUsedAt)}</span>
                        <span>{projects.length} 个项目映射</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => toggleExpanded(sandbox.sandboxId)}>{isExpanded ? '收起' : '详情'}</button>
                      <button className="btn-ghost px-2 py-1 text-xs text-[var(--color-accent-red)]" disabled={operationBusy} onClick={() => { setOperationError(''); setPendingKill(sandbox); }}>终止</button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-4 py-4">
                      {projects.length ? <div className="space-y-3">{projects.map((project) => <div key={`${sandbox.sandboxId}:${project.key}`} className="grid gap-1 text-xs md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                        <span className="min-w-0 break-all font-mono text-[var(--color-text-secondary)]">{project.localPath || project.key}</span>
                        <span className="text-[var(--color-text-muted)]">→</span>
                        <span className="min-w-0 break-all font-mono text-[var(--color-text-primary)]">{project.remotePath || '未记录远程路径'}</span>
                        {project.lastSyncedAt ? <span className="text-[10px] text-[var(--color-text-muted)] md:col-span-3">最近同步：{formatDateTime(project.lastSyncedAt)}</span> : null}
                      </div>)}</div> : <div className="text-xs text-[var(--color-text-muted)]">该 Sandbox 尚无项目映射。</div>}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="text-sm text-[var(--color-text-secondary)]">{sandboxes.length ? '没有匹配的 Sandbox' : '尚无 Sandbox 记录'}</div>
            {!sandboxes.length ? <div className="mt-2 text-xs text-[var(--color-text-muted)]">通过 CodeBuddy CLI 创建 Sandbox 后会自动出现在这里。</div> : null}
          </div>
        )}
      </div>

      <ActionConfirmDialog
        open={Boolean(pendingKill)}
        title="终止 Sandbox？"
        description={pendingKill ? <><div className="break-all font-mono font-medium text-[var(--color-text-primary)]">{pendingKill.sandboxId}</div>{pendingKill.current ? <div className="mt-2 text-[var(--color-accent-yellow)]">这是当前 Sandbox，终止后下次使用需要重新创建或连接。</div> : null}<div className="mt-2">该操作会调用 CodeBuddy CLI 终止远端 E2B Sandbox，并移除本地记录。</div></> : null}
        confirmLabel="终止 Sandbox"
        busy={operationBusy}
        error={operationError}
        onCancel={() => { if (!operationBusy) { setPendingKill(null); setOperationError(''); } }}
        onConfirm={confirmKill}
      />
      <ActionConfirmDialog
        open={cleanOpen}
        title="清理失效 Sandbox 记录？"
        description="CodeBuddy 将查询当前 E2B Sandbox，并从本地状态中移除已停止或过期的记录。此操作需要 E2B_API_KEY。"
        confirmLabel="开始清理"
        busy={operationBusy}
        error={operationError}
        danger={false}
        onCancel={() => { if (!operationBusy) { setCleanOpen(false); setOperationError(''); } }}
        onConfirm={confirmClean}
      />
    </div>
  );
}
