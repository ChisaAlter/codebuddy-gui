import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

function formatNumber(num) {
  if (num == null || num === '') return '-';
  const n = Number(num);
  if (Number.isNaN(n)) return num;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <div className="skeleton h-3 w-20 mb-3" />
      <div className="skeleton h-7 w-24 mb-2" />
      <div className="skeleton h-3 w-16" />
    </div>
  );
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <div className="text-xs text-[var(--color-text-muted)]">{title}</div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{formatNumber(value)}</div>
      {subtitle ? (
        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{subtitle}</div>
      ) : null}
    </div>
  );
}

export default function ReplicaStatsView() {
  const sessionId = useStore((s) => s.sessionId);
  const stats = useStore((s) => s.stats);
  const sessionStats = useStore((s) => s.sessionStats);
  const statsLoading = useStore((s) => s.statsLoading);
  const statsError = useStore((s) => s.statsError);
  const refreshStats = useStore((s) => s.refreshStats);
  const [refreshing, setRefreshing] = useState(false);

  // 首次挂载若 store 尚未拉过全局 stats，主动拉一次
  useEffect(() => {
    if (stats === null && !statsLoading && !statsError) {
      refreshStats();
    }
  }, [stats, statsLoading, statsError, refreshStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshStats();
    } finally {
      setRefreshing(false);
    }
  };

  // 全局 stats 缺字段时回退到会话级 sessionStats，保证两源都能渲染
  const source = stats || sessionStats || null;
  const tokenUsage = source?.tokenUsageByModel;
  const tokenByModel = tokenUsage
    ? Object.entries(tokenUsage).map(([name, v]) => ({
        name,
        inputTokens: v?.inputTokens ?? 0,
        outputTokens: v?.outputTokens ?? 0,
        total: (v?.inputTokens ?? 0) + (v?.outputTokens ?? 0),
      }))
    : [];

  const label = stats ? '全局统计' : (sessionStats ? '当前会话统计' : '');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Stats</h2>
          {label && (
            <span className="rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">{label}</span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || statsLoading}
          className="btn-ghost text-xs"
        >
          <svg
            width="14" height="14" viewBox="0 0 16 16"
            fill="none" stroke="currentColor" strokeWidth="1.5"
            className={refreshing || statsLoading ? 'animate-spin' : ''}
          >
            <path d="M1 8a7 7 0 0113.29-4M15 8a7 7 0 01-13.29 4" />
            <path d="M13 1v4h-4M3 15v-4h4" />
          </svg>
          {refreshing || statsLoading ? '刷新中...' : '刷新'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {statsError && (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[var(--color-error-bg)] px-4 py-2.5 text-sm text-[var(--color-error)]">
            {statsError}
            <button className="ml-3 underline text-xs" onClick={handleRefresh}>重试</button>
          </div>
        )}

        {(statsLoading || refreshing) && !source ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : !source ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {statsError ? '加载统计数据失败' : '暂无统计数据'}
            </p>
            {statsError && (
              <button className="mt-2 text-xs text-[var(--color-accent-primary)] hover:underline" onClick={handleRefresh}>
                点击重试
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <StatCard title="API Duration" value={source.apiDuration} subtitle="ms" />
              <StatCard title="Running Time" value={source.runningTime} subtitle="ms" />
              <StatCard
                title="Added Lines"
                value={source.fileChangeStats?.totalAddedLines}
                subtitle="File changes"
              />
              <StatCard
                title="Deleted Lines"
                value={source.fileChangeStats?.totalDeletedLines}
                subtitle="File changes"
              />
              <StatCard
                title="Input Tokens"
                value={tokenByModel.length > 0 ? tokenByModel.reduce((s, x) => s + x.inputTokens, 0) : '-'}
                subtitle={tokenByModel.length > 0 ? `${tokenByModel.length} 个模型` : ''}
              />
              <StatCard
                title="Output Tokens"
                value={tokenByModel.length > 0 ? tokenByModel.reduce((s, x) => s + x.outputTokens, 0) : '-'}
                subtitle={tokenByModel.length > 0 ? `${tokenByModel.length} 个模型` : ''}
              />
            </div>

            {tokenByModel.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                  Token 用量（按模型）
                </h3>
                <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
                        <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-secondary)]">模型</th>
                        <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-secondary)]">Input Tokens</th>
                        <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-secondary)]">Output Tokens</th>
                        <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-secondary)]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenByModel.map((row) => (
                        <tr
                          key={row.name}
                          className="border-b border-[var(--color-border-muted)] last:border-0 hover:bg-[var(--color-bg-hover)]"
                        >
                          <td className="px-4 py-2.5 text-[var(--color-text-primary)] truncate max-w-[160px]">
                            {row.name}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-secondary)]">
                            {formatNumber(row.inputTokens)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-secondary)]">
                            {formatNumber(row.outputTokens)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-accent-primary)]">
                            {formatNumber(row.total)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--color-bg-secondary)] font-medium">
                        <td className="px-4 py-2.5 text-[var(--color-text-primary)]">合计</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-primary)]">
                          {formatNumber(tokenByModel.reduce((s, x) => s + x.inputTokens, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-primary)]">
                          {formatNumber(tokenByModel.reduce((s, x) => s + x.outputTokens, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-accent-primary)]">
                          {formatNumber(tokenByModel.reduce((s, x) => s + x.total, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
