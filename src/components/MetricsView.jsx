import React from 'react';
const API = 'http://127.0.0.1:7890';

export default function MetricsView() {
    const [m, setM] = React.useState(null);
    React.useEffect(() => {
        fetch(`${API}/api/v1/metrics`, { headers: { 'X-CodeBuddy-Request': '1' } }).then(r => r.ok ? r.json() : null).then(setM).catch(() => setM(null));
    }, []);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>System Metrics</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
                {!m ? <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>Loading...</div> : (
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: 'CPU', value: `${m.cpuUsedPct || 0}%`, color: 'var(--color-accent-blue)' },
                            { label: 'Memory', value: `${m.memUsedMib || 0}/${m.memTotalMib || 0} MiB`, color: 'var(--color-accent-purple)' },
                            { label: 'Disk', value: `${m.diskUsed || '?'}/${m.diskTotal || '?'}`, color: 'var(--color-accent-yellow)' },
                            { label: 'Load', value: m.loadAverage || 'N/A', color: 'var(--color-accent-green)' },
                        ].map(item => (
                            <div key={item.label} className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                                <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{item.label}</div>
                                <div className="text-lg font-semibold" style={{ color: item.color }}>{item.value}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
