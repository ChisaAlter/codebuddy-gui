import React, { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/acp';

function formatSince(startedAt) {
  if (!startedAt) return '-';
  const diff = Math.max(0, Date.now() - startedAt);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  return '刚刚';
}

function SessionCard({ session }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
      <div className="text-sm font-medium text-white line-clamp-2">{session.name || 'Untitled Session'}</div>
      <div className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
        <div>消息数: {session.messageCount ?? 0}</div>
        <div>更新时间: {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : '-'}</div>
        <div>当前会话: {session.isCurrent ? '是' : '否'}</div>
      </div>
    </div>
  );
}

export default function ReplicaInstancesView() {
  const [info, setInfo] = useState(null);
  const [daemon, setDaemon] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [infoPayload, daemonPayload, sessionsPayload] = await Promise.all([
        fetchJson('/api/v1/info'),
        fetchJson('/api/v1/daemon/status'),
        fetchJson('/api/v1/sessions'),
      ]);
      setInfo(infoPayload?.data || infoPayload || null);
      setDaemon(daemonPayload?.data || daemonPayload || null);
      setSessions(sessionsPayload?.data?.sessions || sessionsPayload?.sessions || []);
    } catch (err) {
      setError(err.message || '加载失败');
      setInfo(null);
      setDaemon(null);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currentSession = useMemo(() => sessions.find((item) => item.isCurrent) || null, [sessions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">实例</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="text-lg font-semibold text-white">实例列表</div>
          <div className="mt-1 text-sm text-[var(--color-text-secondary)]">管理实例</div>
        </div>

        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => setError('添加实例功能开发中')}>添加实例</button>
          <button className="btn-ghost" onClick={() => setError('手动添加功能开发中')}>手动添加</button>
          <button className="btn-ghost" onClick={load}>刷新</button>
        </div>

        {loading ? <div className="text-sm text-[var(--color-text-muted)]">加载实例中...</div> : null}
        {error ? <div className="rounded-lg border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-red-300">{error}</div> : null}

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
            <div className="text-xs text-[var(--color-text-muted)]">当前工作区</div>
            <div className="mt-2 text-sm text-white break-all">{info?.cwd || '-'}</div>
            <div className="mt-3 space-y-1 text-xs text-[var(--color-text-secondary)]">
              <div>运行模式: {info?.gatewayMode || '-'}</div>
              <div>用户: {info?.userName || '-'}</div>
              <div>版本: {info?.version || '-'}</div>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
            <div className="text-xs text-[var(--color-text-muted)]">Daemon</div>
            <div className="mt-2 text-sm text-white">{daemon?.status || '-'}</div>
            <div className="mt-3 space-y-1 text-xs text-[var(--color-text-secondary)]">
              <div>PID: {daemon?.pid || '-'}</div>
              <div className="break-all">Endpoint: {daemon?.endpoint || '-'}</div>
              <div>启动于: {formatSince(daemon?.startedAt)}</div>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text-secondary)]">当前实例</div>
          {currentSession ? (
            <SessionCard session={currentSession} />
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">暂无当前实例信息</div>
          )}
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text-secondary)]">会话 / 实例历史</div>
          {sessions.length ? (
            <div className="grid grid-cols-2 gap-4">
              {sessions.slice(0, 8).map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">暂无其他实例</div>
          )}
        </section>
      </div>
    </div>
  );
}
