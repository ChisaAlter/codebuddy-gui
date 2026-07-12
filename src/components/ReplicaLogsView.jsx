import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../store';

function highlightText(text, term) {
  if (!term || typeof text !== 'string') return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="bg-[var(--color-accent-yellow)] text-black px-0.5 rounded">{part}</mark>
    ) : part
  );
}

export default function ReplicaLogsView() {
  const workers = useStore((s) => s.workers);
  const refreshWorkers = useStore((s) => s.refreshWorkers);
  const workersError = useStore((s) => s.workersError);
  const loadWorkerLogs = useStore((s) => s.loadWorkerLogs);
  const [workerPid, setWorkerPid] = useState('');
  const [logType, setLogType] = useState('stdout');
  const [logs, setLogs] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialWorkersLoad, setInitialWorkersLoad] = useState(true);
  const [logError, setLogError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.resolve(refreshWorkers()).finally(() => {
      if (active) setInitialWorkersLoad(false);
    });
    try {
      const preferredPid = sessionStorage.getItem('logs-preferred-worker-pid');
      if (preferredPid) {
        setWorkerPid(preferredPid);
        sessionStorage.removeItem('logs-preferred-worker-pid');
      }
    } catch (_) {}
    return () => { active = false; };
  }, [refreshWorkers]);

  useEffect(() => {
    if (!workerPid && workers.length) {
      setWorkerPid(String(workers[0].pid));
    }
  }, [workers, workerPid]);

  const loadLogs = useCallback(async () => {
    if (!workerPid) return;
    setLoading(true);
    setLogError(null);
    try {
      const text = await loadWorkerLogs(workerPid, logType, 200);
      setLogs(text || '');
    } catch (err) {
      setLogError('日志加载失败: ' + (err?.message || '未知错误'));
      setLogs('');
    } finally {
      setLoading(false);
    }
  }, [workerPid, logType, loadWorkerLogs]);

  useEffect(() => {
    if (!autoRefresh || !workerPid) return;
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs, workerPid]);

  useEffect(() => {
    if (!logError) return;
    const timer = setTimeout(() => setLogError(null), 8000);
    return () => clearTimeout(timer);
  }, [logError]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = logs;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const lines = logs ? logs.split('\n') : [];
  const term = searchTerm.trim();
  const filtered = term
    ? lines
        .map((line, i) => ({ line, num: i + 1, match: line.toLowerCase().includes(term.toLowerCase()) }))
        .filter((x) => x.match)
    : lines.map((line, i) => ({ line, num: i + 1, match: true }));

  const stderrMode = logType === 'stderr';
  const logColor = stderrMode ? 'var(--color-error)' : 'var(--color-text-secondary)';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Logs</h2>
      </div>

      <div className="flex items-center flex-wrap gap-3 border-b border-[var(--color-border-default)] px-6 py-3">
        <select
          className="input-field max-w-[240px]"
          value={workerPid}
          onChange={(e) => setWorkerPid(e.target.value)}
        >
          {initialWorkersLoad && workers.length === 0 ? (
            <option value="">加载 Worker 列表中...</option>
          ) : (
            <>
              <option value="">选择 Worker</option>
              {workers.map((w) => (
                <option key={w.pid} value={String(w.pid)}>
                  {w.pid} · {w.kind} · {w.sessionId || '-'}
                </option>
              ))}
            </>
          )}
        </select>

        <select
          className="input-field max-w-[160px]"
          value={logType}
          onChange={(e) => setLogType(e.target.value)}
        >
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
        </select>

        <button
          className="btn-primary"
          onClick={loadLogs}
          disabled={!workerPid || loading}
        >
          加载日志
        </button>

        {!workerPid && (
          <span className="text-xs text-[var(--color-error)]">请先选择一个 Worker</span>
        )}

        <span className="text-xs text-[var(--color-text-muted)] ml-1">自动刷新</span>
        <button
          type="button"
          role="switch"
          aria-checked={autoRefresh}
          aria-label="自动刷新日志"
          className={`toggle-switch ${autoRefresh ? 'toggle-switch-on' : 'toggle-switch-off'}`}
          onClick={() => setAutoRefresh((v) => !v)}
        >
          <div className={`toggle-knob ${autoRefresh ? 'toggle-knob-on' : ''}`} />
        </button>

        <input
          className="input-field max-w-[200px]"
          type="text"
          placeholder="搜索日志..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {logError && (
        <div className="mx-6 mb-2 p-2 rounded flex items-center justify-between text-xs"
             style={{ background: 'var(--color-error-bg, rgba(248,113,113,0.1))', border: '1px solid var(--color-accent-red)', color: 'var(--color-accent-red)' }}>
          <span>{logError}</span>
          <button className="underline" onClick={() => setLogError(null)}>关闭</button>
        </div>
      )}
      {workersError && !initialWorkersLoad && (
        <div className="mx-6 mb-2 rounded border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.1)] p-2 text-xs text-[var(--color-error)]">
          Worker 列表加载失败：{workersError}
          <button
            className="ml-3 underline"
            onClick={() => {
              setInitialWorkersLoad(true);
              Promise.resolve(refreshWorkers()).finally(() => setInitialWorkersLoad(false));
            }}
          >
            重试
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden relative">
        {logs && (
          <button
            className="absolute top-2 right-4 z-10 btn-ghost text-xs"
            onClick={handleCopy}
            title="复制全部日志"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="5" width="9" height="9" rx="1.5" />
              <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v8a1 1 0 001 1h2" />
            </svg>
            复制
          </button>
        )}

        <div ref={containerRef} className="h-full overflow-auto p-6 pt-10">
          {loading ? (
            <pre className="min-h-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4 space-y-2.5">
              {[88, 72, 91, 55, 85, 63, 94, 50, 78].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: '0.75rem', width: `${w}%` }} />
              ))}
            </pre>
          ) : !logs ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[var(--color-text-muted)]">暂无日志</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[var(--color-text-muted)]">无匹配结果</p>
            </div>
          ) : (
            <pre
              className="min-h-full whitespace-pre-wrap break-words rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4 text-xs font-mono"
              style={{ color: logColor }}
            >
              {filtered.map(({ line, num }) => (
                <div key={num} className="flex">
                  <span className="select-none shrink-0 w-10 text-right mr-3 text-[var(--color-text-muted)]">
                    {num}
                  </span>
                  <span>{term ? highlightText(line, term) : line}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
