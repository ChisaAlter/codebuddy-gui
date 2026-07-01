import React, { useEffect, useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function WorkersView() {
    const [workers, setWorkers] = useState([]);
    const [daemon, setDaemon] = useState(null);

    const fetchData = async () => {
        try { const r = await fetch(`${API}/api/v1/workers`, { headers: { 'X-CodeBuddy-Request': '1' } }); if (r.ok) setWorkers(await r.json()); } catch(e) {}
        try { const r = await fetch(`${API}/api/v1/daemon/status`, { headers: { 'X-CodeBuddy-Request': '1' } }); if (r.ok) setDaemon(await r.json()); } catch(e) {}
    };

    useEffect(() => { fetchData(); const t = setInterval(fetchData, 5000); return () => clearInterval(t); }, []);

    const kill = async pid => {
        try {
            await fetch(`${API}/api/v1/workers/${pid}`, { method: 'DELETE', headers: { 'X-CodeBuddy-Request': '1' } });
            setWorkers(workers.filter(w => w.pid !== pid));
        } catch(e) {}
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Workers & Daemon</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="card p-4" style={{ background: 'var(--color-bg-card)' }}>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Daemon Status</h3>
                    {daemon ? (
                        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Status:</span> <span style={{ color: 'var(--color-accent-green)' }}>{daemon.status}</span></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>PID:</span> <span style={{ color: 'var(--color-text-primary)' }}>{daemon.pid}</span></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Endpoint:</span> <span style={{ color: 'var(--color-text-primary)' }}>{daemon.endpoint}</span></div>
                            <div><span style={{ color: 'var(--color-text-muted)' }}>Memory:</span> <span style={{ color: 'var(--color-text-primary)' }}>{daemon.rssMib || 0} MiB</span></div>
                        </div>
                    ) : (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No daemon running</p>
                    )}
                </div>

                <div>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Active Workers ({workers.length})</h3>
                    {workers.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No running workers</p>
                    ) : (
                        <div className="space-y-2">
                            {workers.map((w, i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg px-4 py-2.5 text-xs" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                                    <div>
                                        <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{w.sessionId || w.name || 'Unknown'}</div>
                                        <div style={{ color: 'var(--color-text-muted)' }}>{w.cwd || 'No directory'}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span style={{ color: 'var(--color-accent-green)' }}>{w.kind || 'interactive'}</span>
                                        <span style={{ color: 'var(--color-text-muted)' }}>PID: {w.pid}</span>
                                        <button onClick={() => kill(w.pid)} className="btn-ghost text-red-400" style={{ fontSize: 11 }}>Kill</button>
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
