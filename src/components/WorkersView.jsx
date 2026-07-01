import React, { useState, useEffect } from 'react';
const API = 'http://127.0.0.1:7890';

export default function WorkersView() {
    const [workers, setWorkers] = useState([]);
    const [daemon, setDaemon] = useState(null);

    const fetchAll = async () => {
        try { const r = await fetch(`${API}/api/v1/workers`, { headers: { 'X-CodeBuddy-Request': '1' } }); if (r.ok) setWorkers(await r.json()); } catch(e) {}
        try { const r = await fetch(`${API}/api/v1/daemon/status`, { headers: { 'X-CodeBuddy-Request': '1' } }); if (r.ok) setDaemon(await r.json()); } catch(e) {}
    };

    useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 5000); return () => clearInterval(t); }, []);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Workers & Daemon</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
                {/* Daemon Card */}
                <div className="card p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className={`dot ${daemon?.status === 'running' ? 'dot-green' : 'dot-red'}`} />
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Daemon Process</h3>
                        </div>
                        <span className={`status-badge ${daemon?.status === 'running' ? 'status-online' : 'status-offline'}`}>
                            {daemon?.status === 'running' ? 'Running' : 'Stopped'}
                        </span>
                    </div>
                    {daemon && (
                        <div className="grid grid-cols-4 gap-3 text-xs">
                            <div><span style={{ color: 'var(--color-text-muted)' }}>PID</span><p style={{ color: 'var(--color-text-primary)' }}>{daemon.pid}</p></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Endpoint</span><p style={{ color: 'var(--color-accent-blue)' }}>{daemon.endpoint}</p></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Uptime</span><p style={{ color: 'var(--color-text-primary)' }}>{((Date.now() - daemon.startedAt) / 3600000).toFixed(1)}h</p></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Memory</span><p style={{ color: 'var(--color-text-primary)' }}>{daemon.rssMib || 0} MiB</p></div>
                        </div>
                    )}
                    {!daemon && <p style={{ color: 'var(--color-text-muted)' }}>No daemon running</p>}
                </div>

                {/* Workers Grid */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Active Workers ({workers.length})</h3>
                        <button onClick={fetchAll} className="btn-ghost text-xs">Refresh</button>
                    </div>
                    {workers.length === 0 ? (
                        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
                            No workers currently running
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {workers.map((w, i) => (
                                <div key={i} className="card p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{w.sessionId || w.name || 'Worker ' + i}</span>
                                        <span className={`tag tag-${w.kind === 'daemon' ? 'purple' : w.kind === 'bg' ? 'yellow' : 'green'}`}>{w.kind || 'interactive'}</span>
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{w.cwd || 'No directory'}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PID: {w.pid}</span>
                                        <button
                                            onClick={async () => { await fetch(`${API}/api/v1/workers/${w.pid}`, { method: 'DELETE', headers: { 'X-CodeBuddy-Request': '1' } }); fetchAll(); }}
                                            className="btn-ghost text-red-400 text-xs ml-auto">Kill</button>
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
