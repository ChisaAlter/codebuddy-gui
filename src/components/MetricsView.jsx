import React, { useEffect, useState } from 'react';

const API = 'http://127.0.0.1:7890';

export default function MetricsView() {
    const [m, setM] = useState(null);

    const fetchMetrics = () => {
        fetch(`${API}/api/v1/metrics`, { headers: { 'X-CodeBuddy-Request': '1' } })
            .then(r => r.ok ? r.json() : null)
            .then(setM)
            .catch(() => setM(null));
    };

    useEffect(() => {
        fetchMetrics();
        const t = setInterval(fetchMetrics, 5000);
        return () => clearInterval(t);
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
                            { label: 'CPU Usage', value: m.cpuUsedPct || 0, unit: '%', color: 'var(--color-accent-blue)', bar: true },
                            { label: 'Memory', value: m.memUsedMib || 0, unit: `MiB / ${m.memTotalMib || 0}`, color: 'var(--color-accent-purple)', bar: true },
                            { label: 'Disk', value: m.diskUsed || '?', unit: `GiB / ${m.diskTotal || '?'}`, color: 'var(--color-accent-yellow)', bar: false },
                            { label: 'Load', value: (m.loadAverage || [0,0,0]).slice(0,3).join(', '), unit: '', color: 'var(--color-accent-green)', bar: false },
                        ].map(item => (
                            <div key={item.label} className="card p-5">
                                <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>{item.label}</div>
                                <div className="text-2xl font-bold" style={{ color: item.color }}>
                                    {item.value}{item.unit && item.bar !== true && <span className="text-sm ml-1" style={{ color: 'var(--color-text-muted)' }}>{item.unit}</span>}
                                </div>
                                {item.bar && item.unit === '%' && (
                                    <div className="progress-bar mt-2">
                                        <div className="progress-fill" style={{ width: `${item.value}%` }} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
