import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

function formatNumber(value) {
  if (value == null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(number);
}

function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '-';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <div className="skeleton mb-3 h-3 w-20" />
      <div className="skeleton mb-2 h-7 w-24" />
      <div className="skeleton h-3 w-16" />
    </div>
  );
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <div className="text-xs text-[var(--color-text-muted)]">{title}</div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{formatNumber(value)}</div>
      {subtitle ? <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{subtitle}</div> : null}
    </div>
  );
}

export default function ReplicaStatsView() {
  const activeProjectId = useStore((state) => state.activeProjectId);
  const sessionId = useStore((state) => state.sessionId);
  const stats = useStore((state) => state.stats);
  const sessionStats = useStore((state) => state.sessionStats);
  const statsLoading = useStore((state) => state.statsLoading);
  const statsError = useStore((state) => state.statsError);
  const refreshStats = useStore((state) => state.refreshStats);
  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlightRef = useRef(null);

  useEffect(() => {
    refreshInFlightRef.current = null;
    setRefreshing(false);
  }, [activeProjectId]);

  useEffect(() => {
    if (stats === null && !statsLoading && !statsError) refreshStats();
  }, [stats, statsLoading, statsError, refreshStats]);

  const handleRefresh = async () => {
    if (refreshInFlightRef.current) return;
    const operation = {};
    refreshInFlightRef.current = operation;
    const projectId = activeProjectId;
    setRefreshing(true);
    try {
      await refreshStats();
    } finally {
      if (refreshInFlightRef.current === operation) {
        refreshInFlightRef.current = null;
        if (useStore.getState().activeProjectId === projectId) setRefreshing(false);
      }
    }
  };

  const source = stats || sessionStats || null;
  const usesCurrentContract = Boolean(
    source && ('totalSessions' in source || 'modelUsage' in source || 'dailyActivity' in source),
  );
  const tokenUsage = source?.modelUsage || source?.tokenUsageByModel || {};
  const tokenByModel = Object.entries(tokenUsage)
    .map(([id, value]) => ({
      id,
      name: value?.displayName || id,
      inputTokens: Number(value?.inputTokens) || 0,
      outputTokens: Number(value?.outputTokens) || 0,
      total: (Number(value?.inputTokens) || 0) + (Number(value?.outputTokens) || 0),
    }))
    .sort((left, right) => right.total - left.total);
  const totalInputTokens = tokenByModel.reduce((sum, item) => sum + item.inputTokens, 0);
  const totalOutputTokens = tokenByModel.reduce((sum, item) => sum + item.outputTokens, 0);
  const toolUsage = (Array.isArray(source?.toolUsage)
    ? source.toolUsage
    : Object.entries(source?.toolUsage || {}).map(([toolName, count]) => ({ toolName, count })))
    .map((item) => ({ name: item.toolName || item.name || '-', count: Number(item.count) || 0 }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 12);
  const dailyActivity = Array.isArray(source?.dailyActivity)
    ? source.dailyActivity.slice(-14).reverse()
    : [];
  const label = stats ? '全局统计' : (sessionId && sessionStats ? '当前会话统计' : '');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">使用统计</h2>
          {label ? (
            <span className="rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">{label}</span>
          ) : null}
        </div>
        <button onClick={handleRefresh} disabled={refreshing || statsLoading} className="btn-ghost text-xs">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={refreshing || statsLoading ? 'animate-spin' : ''}
          >
            <path d="M1 8a7 7 0 0113.29-4M15 8a7 7 0 01-13.29 4" />
            <path d="M13 1v4h-4M3 15v-4h4" />
          </svg>
          {refreshing || statsLoading ? '刷新中...' : '刷新'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {statsError ? (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[var(--color-error-bg)] px-4 py-2.5 text-sm text-[var(--color-error)]">
            {statsError}
            <button className="ml-3 text-xs underline" onClick={handleRefresh}>重试</button>
          </div>
        ) : null}

        {(statsLoading || refreshing) && !source ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)}
          </div>
        ) : !source ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">{statsError ? '加载统计数据失败' : '暂无统计数据'}</p>
            {statsError ? (
              <button className="mt-2 text-xs text-[var(--color-accent-primary)] hover:underline" onClick={handleRefresh}>点击重试</button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
              {usesCurrentContract ? (
                <>
                  <StatCard title="会话总数" value={source.totalSessions} subtitle={`首次 ${formatDate(source.firstSessionDate)}`} />
                  <StatCard title="消息总数" value={source.totalMessages} subtitle={`最近 ${formatDate(source.lastSessionDate)}`} />
                  <StatCard title="活跃天数" value={source.activeDays} subtitle={`统计跨度 ${formatNumber(source.totalDays)} 天`} />
                  <StatCard title="当前连续活跃" value={source.streaks?.currentStreak} subtitle={`最长 ${formatNumber(source.streaks?.longestStreak)} 天`} />
                  <StatCard title="Input Tokens" value={totalInputTokens} subtitle={`${tokenByModel.length} 个模型`} />
                  <StatCard title="Output Tokens" value={totalOutputTokens} subtitle={`${tokenByModel.length} 个模型`} />
                  <StatCard title="平均会话时长" value={formatDuration(source.averageSessionDuration)} subtitle={`高峰时段 ${source.peakActivityHour ?? '-'}:00`} />
                  <StatCard title="最长会话" value={formatDuration(source.longestSession?.duration)} subtitle={`${formatNumber(source.longestSession?.messageCount)} 条消息`} />
                </>
              ) : (
                <>
                  <StatCard title="API Duration" value={source.apiDuration} subtitle="ms" />
                  <StatCard title="Running Time" value={source.runningTime} subtitle="ms" />
                  <StatCard title="Added Lines" value={source.fileChangeStats?.totalAddedLines} subtitle="File changes" />
                  <StatCard title="Deleted Lines" value={source.fileChangeStats?.totalDeletedLines} subtitle="File changes" />
                  <StatCard title="Input Tokens" value={totalInputTokens || '-'} subtitle={`${tokenByModel.length} 个模型`} />
                  <StatCard title="Output Tokens" value={totalOutputTokens || '-'} subtitle={`${tokenByModel.length} 个模型`} />
                </>
              )}
            </div>

            {tokenByModel.length ? (
              <section className="mb-8">
                <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Token 用量（按模型）</h3>
                <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
                        <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">模型</th>
                        <th className="px-4 py-2.5 text-right font-medium text-[var(--color-text-secondary)]">Input</th>
                        <th className="px-4 py-2.5 text-right font-medium text-[var(--color-text-secondary)]">Output</th>
                        <th className="px-4 py-2.5 text-right font-medium text-[var(--color-text-secondary)]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenByModel.map((row) => (
                        <tr key={row.id} className="border-b border-[var(--color-border-muted)] last:border-0 hover:bg-[var(--color-bg-hover)]">
                          <td className="max-w-[240px] truncate px-4 py-2.5 text-[var(--color-text-primary)]" title={row.id}>{row.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-secondary)]">{formatNumber(row.inputTokens)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-secondary)]">{formatNumber(row.outputTokens)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-accent-primary)]">{formatNumber(row.total)}</td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--color-bg-secondary)] font-medium">
                        <td className="px-4 py-2.5 text-[var(--color-text-primary)]">合计</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-primary)]">{formatNumber(totalInputTokens)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-primary)]">{formatNumber(totalOutputTokens)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-accent-primary)]">{formatNumber(totalInputTokens + totalOutputTokens)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {usesCurrentContract && (toolUsage.length || dailyActivity.length) ? (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">常用工具</h3>
                  <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)]">
                    {toolUsage.length ? toolUsage.map((tool, index) => (
                      <div key={`${tool.name}-${index}`} className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-2.5 text-xs last:border-0">
                        <span className="truncate text-[var(--color-text-primary)]">{tool.name}</span>
                        <span className="font-mono text-[var(--color-text-secondary)]">{formatNumber(tool.count)}</span>
                      </div>
                    )) : <div className="px-4 py-8 text-center text-xs text-[var(--color-text-muted)]">暂无工具使用数据</div>}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">近期活动</h3>
                  <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-medium">日期</th>
                          <th className="px-3 py-2.5 text-right font-medium">消息</th>
                          <th className="px-3 py-2.5 text-right font-medium">会话</th>
                          <th className="px-3 py-2.5 text-right font-medium">工具</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyActivity.map((day) => (
                          <tr key={day.date} className="border-t border-[var(--color-border-muted)]">
                            <td className="px-3 py-2 text-[var(--color-text-primary)]">{formatDate(day.date)}</td>
                            <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">{formatNumber(day.messageCount)}</td>
                            <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">{formatNumber(day.sessionCount)}</td>
                            <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">{formatNumber(day.toolCallCount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
