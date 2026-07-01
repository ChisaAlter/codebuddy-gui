import React, { useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function TracesView() {
    const [traces, setTraces] = useState([]);
    const [filter, setFilter] = useState('');

    React.useEffect(() => {
        fetch(`${API}/api/v1/traces?offset=0&limit=50`, { headers: { 'X-CodeBuddy-Request': '1' } })
            .then(r => r.ok ? r.json() : []).then(d => setTraces(d.traces || d)).catch(() => setTraces([]));
    }, []);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Traces</h2>
                <input className="input-base" style={{ fontSize: 12, padding: '5px 12px', background: 'var(--color-bg-input)', width: 200 }} placeholder="Filter..." value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto p-5">
                {traces.length === 0 ? (
                    <div className="text-center mt-12" style={{ color: 'var(--color-text-muted)' }}>No traces recorded</div>
                ) : (
                    <table className="w-full text-sm card">
                        <thead><tr>
                            <th className="p-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Trace ID</th>
                            <th className="p-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Service</th>
                            <th className="p-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Duration</th>
                        </tr></thead>
                        <tbody>{traces.map(t => (
                            <tr key={t.traceId} style={{ borderTop: '1px solid var(' }}>
                                <td className="p-3 font-mono" style={{ color: 'var(--color-accent-blue)' }}>{t.traceId?.slice(0, 12)}...</td>
                                <td className="p-3" style={{ color: 'var(--color-text-primary)' }}>{t.serviceName || 'unknown'}</td>
                                <td className="p-3" style={{ color: 'var(--color-text-muted)' }}>{t.durationMs}ms</td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
