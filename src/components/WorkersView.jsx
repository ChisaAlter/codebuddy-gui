import React, { useEffect } from 'react';
import { useStore } from '../store';

export default function WorkersView() {
    const { workersList, fetchWorkers, killWorker, daemonStatus, fetchDaemonStatus } = useStore();

    useEffect(() => {
        fetchWorkers();
        fetchDaemonStatus();
        const t = setInterval(() => { fetchWorkers(); fetchDaemonStatus(); }, 5000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Workers & Daemon</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
                <div className="card p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className={`dot ${daemonStatus?.status === 'running' ? 'dot-green' : 'dot-red'}`} />
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Daemon Process</h3>
                        </div>
                        <span className={`status-badge ${daemonStatus?.status === 'running' ? 'status-online' : 'status-offline'}`}>
                            {daemonStatus?.status === 'running' ? 'Running' : 'Stopped'}
                        </span>
                    </div>
                    {daemonStatus && daemonStatus.status === 'running' ? (
                        <div className="grid grid-cols-4 gap-3 text-xs">
                            <div><span style={{ color: 'var(--color-text-muted)' }}>PID</span><p style={{ color: 'var(--color-text-primary)' }}>{daemonStatus.pid}</p></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Endpoint</span><p style={{ color: 'var(--color-accent-blue)' }}>{daemonStatus.endpoint}</p></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Uptime</span><p style={{ color: 'var(--color-text-primary)' }}>{daemonStatus.startedAt ? ((Date.now() - daemonStatus.startedAt) / 3600000).toFixed(1) + 'h' : '—'}</p></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Memory</span><p style={{ color: 'var(--color-text-primary)' }}>{daemonStatus.rssMib || 0} MiB</p></div>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--color-text-muted)' }}>No daemon running. Start with: codebuddy daemon start</p>
                    )}
                </div>

                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Active Workers ({workersList.length})</h3>
                        <button onClick={fetchWorkers} className="btn-ghost text-xs">Refresh</button>
                    </div>
                    {workersList.length === 0 ? (
                        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
                            No workers currently running
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {workersList.map((w, i) => (
                                <div key={i} className="card p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{w.sessionId || w.name || 'Worker ' + i}</span>
                                        <span className={`tag tag-${w.kind === 'daemon' ? 'purple' : w.kind === 'bg' ? 'yellow' : 'green'}`}>{w.kind || 'interactive'}</span>
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{w.cwd || 'No directory'}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PID: {w.pid}</span>
                                        <button onClick={() => killWorker(w.pid)} className="btn-ghost text-red-400 text-xs ml-auto">Kill</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
