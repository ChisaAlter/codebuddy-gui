import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store';
import { fetchTraceList } from '../lib/ops';

const PAGE_SIZE = 20;

const SearchIcon = () => (
  <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const RefreshIcon = ({ spinning }) => (
  <svg className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-2.636-6.364" />
    <path d="M21 3v6h-6" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const SortArrow = ({ direction }) => (
  <span className="inline-block w-3 text-center text-xs leading-none">
    {direction === 'asc' ? '\u2191' : '\u2193'}
  </span>
);

export default function ReplicaTracesView() {
  const traces = useStore((s) => s.traces);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const loadRequestRef = useRef(0);

  // --- local UI state ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedTraces, setExpandedTraces] = useState(new Set());

  // --- data loading ---
  const loadTraces = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const projectId = activeProjectId;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTraceList();
      if (requestId !== loadRequestRef.current || useStore.getState().activeProjectId !== projectId) return;
      useStore.setState({ traces: Array.isArray(data) ? data : [] });
    } catch (e) {
      if (requestId !== loadRequestRef.current || useStore.getState().activeProjectId !== projectId) return;
      setError(e.message || '加载链路数据失败');
    } finally {
      if (requestId === loadRequestRef.current && useStore.getState().activeProjectId === projectId) setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  // --- derived data ---

  // 1. filter
  const filtered = useMemo(() => {
    let result = [...(traces || [])];

    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          (t.traceId || '').toLowerCase().includes(q) ||
          (t.serviceName || '').toLowerCase().includes(q),
      );
    }

    return result;
  }, [traces, searchQuery, statusFilter]);

  // 2. sort (always by DurationMs)
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const da = a.durationMs ?? 0;
      const db = b.durationMs ?? 0;
      return sortDirection === 'asc' ? da - db : db - da;
    });
    return copy;
  }, [filtered, sortDirection]);

  // 3. paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // --- interaction handlers ---
  const toggleSort = () =>
    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));

  const toggleExpand = (traceId) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  };

  // --- formatting helpers ---
  const formatTraceId = (id) => {
    if (!id) return '-';
    return id.length > 12 ? `${id.slice(0, 12)}…` : id;
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('zh-CN');
    } catch {
      return '-';
    }
  };

  const getDurationColor = (ms) => {
    if (ms == null) return undefined;
    if (ms < 100) return 'var(--color-success)';
    if (ms <= 500) return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const renderStatusTag = (status) => {
    if (status === 'OK') return <span className="tag-green">{status}</span>;
    if (status === 'Error') return <span className="tag-red">{status}</span>;
    return <span className="tag-gray">{status || '-'}</span>;
  };

  // --- skeleton rows ---
  const SkeletonCell = ({ w }) => (
    <div
      className="skeleton animate-pulse rounded"
      style={{ height: '0.875rem', width: w }}
    />
  );

  const renderSkeletonRows = (count) =>
    Array.from({ length: count }, (_, i) => (
      <tr key={`skel-${i}`} className="border-t border-[var(--color-border-muted)]">
        <td className="px-4 py-3"><SkeletonCell w="6rem" /></td>
        <td className="px-4 py-3"><SkeletonCell w="5rem" /></td>
        <td className="px-4 py-3"><SkeletonCell w="2.5rem" /></td>
        <td className="px-4 py-3"><SkeletonCell w="4rem" /></td>
        <td className="px-4 py-3"><SkeletonCell w="3.5rem" /></td>
        <td className="px-4 py-3"><SkeletonCell w="8rem" /></td>
      </tr>
    ));

  // --- empty row ---
  const renderEmptyRow = () => (
    <tr>
      <td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">
        暂无链路数据
      </td>
    </tr>
  );

  // --- expandable detail panel ---
  const renderDetailPanel = (trace) => {
    const spans = trace.spans || [];
    return (
      <tr key={`detail-${trace.traceId}`}>
        <td colSpan={6} className="bg-[var(--color-bg-secondary)] px-6 py-4">
          <div className="animate-fadeIn space-y-4">
            {/* trace meta */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
              <div>
                <span className="text-[var(--color-text-muted)]">Trace ID：</span>
                <span className="font-mono text-xs text-[var(--color-accent-blue)]">{trace.traceId || '-'}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Service：</span>
                <span className="text-[var(--color-text-primary)]">{trace.serviceName || '-'}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Duration：</span>
                <span className="text-[var(--color-text-primary)]">{trace.durationMs ?? '-'} ms</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Status：</span>
                {renderStatusTag(trace.status)}
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Timestamp：</span>
                <span className="text-[var(--color-text-primary)]">{formatTimestamp(trace.timestamp)}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Span Count：</span>
                <span className="text-[var(--color-text-primary)]">{trace.spanCount ?? spans.length}</span>
              </div>
            </div>

            {/* span list (if available) */}
            {spans.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Span List ({spans.length})
                </h4>
                <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Span Name</th>
                        <th className="px-3 py-2 font-medium">Service</th>
                        <th className="px-3 py-2 font-medium">Duration</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spans.map((span, idx) => (
                        <tr
                          key={span.spanId || idx}
                          className="border-t border-[var(--color-border-muted)] text-[var(--color-text-secondary)]"
                        >
                          <td className="px-3 py-2 font-mono">{span.spanName || span.name || '-'}</td>
                          <td className="px-3 py-2">{span.serviceName || span.service || '-'}</td>
                          <td className="px-3 py-2">{span.durationMs ?? span.duration ?? '-'} ms</td>
                          <td className="px-3 py-2">{renderStatusTag(span.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // --- main render ---
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* ========== Toolbar ========== */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">链路追踪</h2>

        <div className="flex items-center gap-3">
          {/* search */}
          <div className="relative">
            <SearchIcon />
            <input
              className="input-field w-52 py-1.5 pl-8 pr-3 text-xs"
              type="text"
              placeholder="搜索 Service 或 Trace ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* status filter */}
          <select
            className="input-field px-3 py-1.5 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="OK">OK</option>
            <option value="Error">Error</option>
          </select>

          {/* refresh */}
          <button
            className="btn-icon flex items-center gap-1.5 text-xs"
            onClick={loadTraces}
            disabled={loading}
            title="刷新链路数据"
          >
            <RefreshIcon spinning={loading} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* ========== Error Banner ========== */}
      {error && !loading && (
        <div className="mx-6 mt-3 flex items-center gap-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-2.5 text-sm text-[var(--color-error)]">
          <ErrorIcon />
          <span className="flex-1">{error}</span>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={loadTraces}>
            重试
          </button>
        </div>
      )}

      {/* ========== Table ========== */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="card overflow-hidden rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Trace ID</th>
                <th className="px-4 py-3 font-medium">Service Name</th>
                <th className="px-4 py-3 font-medium">Span Count</th>
                <th
                  className="cursor-pointer select-none px-4 py-3 font-medium transition-colors hover:text-[var(--color-text-primary)]"
                  onClick={toggleSort}
                  title="按 Duration 排序"
                >
                  <span className="inline-flex items-center gap-1">
                    Duration
                    <SortArrow direction={sortDirection} />
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
              </tr>
            </thead>

            <tbody>
              {/* loading skeleton */}
              {loading && renderSkeletonRows(8)}

              {/* empty */}
              {!loading && !error && sorted.length === 0 && renderEmptyRow()}

              {/* data rows + expanded detail */}
              {!loading &&
                pageItems.map((trace) => {
                  const isExpanded = expandedTraces.has(trace.traceId);
                  const durationColor = getDurationColor(trace.durationMs);

                  const rows = [
                    <tr
                      key={trace.traceId}
                      className={`cursor-pointer border-t border-[var(--color-border-muted)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] ${
                        isExpanded ? 'bg-[var(--color-bg-secondary)]' : ''
                      }`}
                      onClick={() => toggleExpand(trace.traceId)}
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs text-[var(--color-accent-blue)]"
                        title={trace.traceId}
                      >
                        {formatTraceId(trace.traceId)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-primary)]">
                        {trace.serviceName || '-'}
                      </td>
                      <td className="px-4 py-3">{trace.spanCount ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className="font-medium"
                          style={durationColor ? { color: durationColor } : undefined}
                        >
                          {trace.durationMs ?? '-'} ms
                        </span>
                      </td>
                      <td className="px-4 py-3">{renderStatusTag(trace.status)}</td>
                      <td className="px-4 py-3 text-xs">
                        {formatTimestamp(trace.timestamp)}
                      </td>
                    </tr>,
                  ];

                  if (isExpanded) {
                    rows.push(renderDetailPanel(trace));
                  }

                  return rows;
                })}
            </tbody>
          </table>
        </div>

        {/* ========== Pagination ========== */}
        {!loading && sorted.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
            <span>
              共 {sorted.length} 条，每页 {PAGE_SIZE} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-30 px-3 py-1.5 text-xs"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span className="min-w-[5rem] text-center tabular-nums">
                第 {safePage}/{totalPages} 页
              </span>
              <button
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-30 px-3 py-1.5 text-xs"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
