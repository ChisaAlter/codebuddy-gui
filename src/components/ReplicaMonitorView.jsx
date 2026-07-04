import React, { useEffect, useState } from 'react';
import { fetchJson } from '../lib/acp';

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <div className="text-xs text-[var(--color-text-muted)]">{title}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{subtitle}</div> : null}
    </div>
  );
}

function WorkerCard({ worker }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">{worker.kind || 'worker'}</div>
        <span className="rounded px-2 py-1 text-[10px]" style={{ background: worker.isCurrent ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)', color: worker.isCurrent ? '#22c55e' : '#9ca3af' }}>
          {worker.isCurrent ? 'current' : 'worker'}
        </span>
      </div>
      <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
        <div>PID: {worker.pid || '-'}</div>
        <div className="truncate">Session: {worker.sessionId || '-'}</div>
        <div className="truncate">Endpoint: {worker.endpoint || worker.url || '-'}</div>
        <div>Version: {worker.version || '-'}</div>
      </div>
    </div>
  );
}

export default function ReplicaMonitorView() {
  const [auth, setAuth] = useState(null);
  const [info, setInfo] = useState(null);
  const [daemon, setDaemon] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [authPayload, infoPayload, daemonPayload, metricsPayload, workersPayload, channelsPayload] = await Promise.all([
        fetchJson('/api/v1/auth/status'),
        fetchJson('/api/v1/info'),
        fetchJson('/api/v1/daemon/status'),
        fetchJson('/api/v1/metrics'),
        fetchJson('/api/v1/workers'),
        fetchJson('/api/v1/channels'),
      ]);
      setAuth(authPayload || null);
      setInfo(infoPayload?.data || infoPayload || null);
      setDaemon(daemonPayload?.data || daemonPayload || null);
      setMetrics(metricsPayload?.data || metricsPayload || null);
      setWorkers(workersPayload?.data || workersPayload || []);
      setChannels((channelsPayload?.clients || []).filter((item) => !item.hidden));
    } catch (err) {
      setError(err.message || '加载失败');
      setAuth(null);
      setInfo(null);
      setDaemon(null);
      setMetrics(null);
      setWorkers([]);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const diskGiB = metrics ? `${(metrics.diskUsed / 1024 / 1024 / 1024).toFixed(1)} / ${(metrics.diskTotal / 1024 / 1024 / 1024).toFixed(1)} GiB` : '-';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">监控</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="text-lg font-semibold text-white">监控</div>
          <div className="mt-1 text-sm text-[var(--color-text-secondary)]">运行状态与实例健康</div>
        </div>

        <div className="flex gap-3">
          <button className="btn-primary" onClick={load}>刷新</button>
        </div>

        {loading ? <div className="text-sm text-[var(--color-text-muted)]">加载中...</div> : null}
        {error ? <div className="rounded-lg border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-red-300">{error}</div> : null}

        <div className="grid grid-cols-2 gap-4">
          <StatCard title="认证" value={auth?.authenticated ? 'authenticated' : 'unauthenticated'} subtitle={`authEnabled: ${String(!!auth?.authEnabled)}`} />
          <StatCard title="Daemon" value={daemon?.status || '-'} subtitle={`PID ${daemon?.pid || '-'}`} />
          <StatCard title="CPU" value={metrics?.cpuUsedPct ?? '-'} subtitle="CPU Used %" />
          <StatCard title="Memory" value={metrics?.memUsedMib ?? '-'} subtitle={`Total ${metrics?.memTotalMib ?? '-'} MiB`} />
          <StatCard title="Disk" value={diskGiB} subtitle="Used / Total" />
          <StatCard title="Channels" value={channels.length} subtitle="Visible channels" />
        </div>

        <section className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text-secondary)]">环境信息</div>
          <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4 text-sm text-[var(--color-text-secondary)] space-y-1">
            <div>CWD: {info?.cwd || '-'}</div>
            <div>OS: {info?.os || '-'} / {info?.arch || '-'}</div>
            <div>Node: {info?.nodeVersion || '-'}</div>
            <div>Gateway: {info?.gatewayMode || '-'}</div>
            <div>Tunnel: {info?.tunnelUrl || '-'}</div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text-secondary)]">Workers</div>
          {workers.length ? (
            <div className="grid grid-cols-2 gap-4">
              {workers.map((worker) => <WorkerCard key={`${worker.pid}-${worker.sessionId}`} worker={worker} />)}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">暂无 worker</div>
          )}
        </section>
      </div>
    </div>
  );
}
