import React from 'react';
import { useStore } from '../store';

const STATUS_CONFIG = {
  running: { klass: 'tag-green', label: '运行中' },
  active: { klass: 'tag-green', label: '运行中' },
  stopped: { klass: 'tag-red', label: '已停止' },
  error: { klass: 'tag-red', label: '错误' },
  failed: { klass: 'tag-red', label: '失败' },
};

export default function ReplicaWorkersView() {
  const { workers, refreshWorkers, error, setRoute } = useStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [expandedPid, setExpandedPid] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (workers != null) {
      setLoading(false);
    }
  }, [workers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshWorkers();
    setRefreshing(false);
  };

  const workersList = Array.isArray(workers) ? workers : [];

  // Search filter
  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? workersList.filter(
        (w) =>
          (w.kind || '').toLowerCase().includes(term) ||
          String(w.pid || '').includes(term) ||
          (w.sessionId || '').toLowerCase().includes(term)
      )
    : workersList;

  const getStatusTag = (w) => {
    const status = (w.status || w.state || 'running').toLowerCase();
    const cfg = STATUS_CONFIG[status] || { klass: 'tag-green', label: w.status || w.state || '运行中' };
    return <span className={`tag ${cfg.klass}`}>{cfg.label}</span>;
  };

  const handleViewLogs = (w) => {
    try {
      sessionStorage.setItem('logs-preferred-worker-pid', String(w.pid));
    } catch (_) {}
    setRoute('logs');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-5xl px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Workers</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={refreshing ? 'animate-spin' : ''}>
              <path d="M1 8a7 7 0 0113.29-4M15 8a7 7 0 01-13.29 4" />
              <path d="M13 1v4h-4M3 15v-4h4" />
            </svg>
            {refreshing ? '刷新中...' : '刷新'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.1)] px-4 py-2.5 text-sm text-[#f87171]">
            {error}
            <button className="ml-3 underline text-xs" onClick={handleRefresh}>重试</button>
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <input
            className="input-field max-w-[320px]"
            type="text"
            placeholder="搜索 Worker（kind / PID / sessionId）..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 shimmer"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-12 rounded-full" />
                  <div className="skeleton h-3 w-14 ml-auto" />
                </div>
                <div className="space-y-1.5">
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="skeleton h-3 w-3/4" />
                </div>
                <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[var(--color-border-muted)]">
                  <div className="skeleton h-3 w-10" />
                  <div className="skeleton h-3 w-10" />
                  <div className="skeleton h-3 w-10" />
                  <div className="skeleton h-3 w-14 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {workersList.length === 0 ? '暂无活跃 worker' : '无匹配 Worker'}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {workersList.length === 0 ? 'Worker 进程将在需要时自动创建' : '尝试更换搜索条件'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((w, idx) => {
              const isExpanded = expandedPid === w.pid;
              return (
                <div
                  key={w.pid || idx}
                  className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]"
                >
                  {/* Card header - clickable to expand */}
                  <div
                    className="p-4 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
                    onClick={() => setExpandedPid(isExpanded ? null : w.pid)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="rounded-full bg-[rgba(74,222,128,0.1)] px-2 py-0.5 text-[10px] font-medium text-[#4ade80]">
                        {w.kind || 'Worker'}
                      </span>
                      {getStatusTag(w)}
                      <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
                        PID {w.pid || '-'}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                      <div className="truncate">Session: {w.sessionId || '-'}</div>
                      <div className="truncate">CWD: {w.cwd || '-'}</div>
                      <div>Version: {w.version || '-'}　OS: {w.os || '-'}</div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[var(--color-border-muted)]">
                      <button
                        className="btn-ghost text-xs text-[var(--color-accent-blue)]"
                        onClick={(e) => { e.stopPropagation(); handleViewLogs(w); }}
                      >
                        日志
                      </button>
                      <button
                        className="btn-ghost text-xs text-[var(--color-text-muted)] opacity-50"
                        onClick={(e) => e.stopPropagation()}
                        disabled
                        title="当前 CodeBuddy 运行时未提供单 Worker 重启接口"
                      >
                        重启
                      </button>
                      <button
                        className="btn-ghost text-xs text-[var(--color-text-muted)] opacity-50"
                        onClick={(e) => e.stopPropagation()}
                        disabled
                        title="当前 CodeBuddy 运行时未提供单 Worker 停止接口"
                      >
                        停止
                      </button>
                      <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                        {isExpanded ? '收起' : '展开详情'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="border-t border-[var(--color-border-default)] p-4 bg-[var(--color-bg-card)] rounded-b-lg">
                      <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-3">Worker 详情</h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        <Field label="PID" value={w.pid} />
                        <Field label="Kind" value={w.kind} />
                        <Field label="Session ID" value={w.sessionId} />
                        <Field label="Status" value={w.status || w.state || 'running'} />
                        <Field label="CWD" value={w.cwd} />
                        <Field label="Version" value={w.version} />
                        <Field label="OS" value={w.os} />
                        <Field label="Arch" value={w.arch || w.architecture} />
                        <Field label="Command" value={w.command || w.cmd} />
                        <Field label="CPU" value={w.cpu != null ? `${w.cpu}%` : null} />
                        <Field label="Memory" value={w.memory || w.mem} />
                        <Field label="Started" value={w.startedAt || w.createdAt || w.startTime} />
                        <Field label="Port" value={w.port} />
                        <Field label="Host" value={w.host || w.hostname} />
                      </div>
                      {w.args && w.args.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Args</div>
                          <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-code)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                            {Array.isArray(w.args) ? w.args.join(' ') : String(w.args)}
                          </pre>
                        </div>
                      )}
                      {w.env && Object.keys(w.env).length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Env</div>
                          <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-code)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                            {Object.entries(w.env)
                              .map(([k, v]) => `${k}=${v}`)
                              .join('\n')}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[var(--color-text-muted)] shrink-0 min-w-[80px]">{label}</span>
      <span className="text-[var(--color-text-secondary)] truncate">{value ?? '-'}</span>
    </div>
  );
}
