import React, { useState } from 'react';

const LOG_TYPES = ['telemetry', 'process', 'debug', 'transcript'];

export default function LogsView() {
    const [type, setType] = useState('telemetry');
    const [search, setSearch] = useState('');
    const [worker, setWorker] = useState('all');

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Logs</h2>
                <div className="flex gap-2">
                    {LOG_TYPES.map(t => (
                        <button key={t} onClick={() => setType(t)}
                            className="px-3 py-1 rounded text-xs font-medium transition-colors"
                            style={{
                                background: type === t ? 'var(--color-accent-brand-dim)' : 'transparent',
                                color: type === t ? 'var(--color-accent-brand)' : 'var(--color-text-muted)'
                            }}>
                            {t}
                        </button>
                    ))}
                </div>
                <input
                    className="input-base ml-auto"
                    style={{ fontSize: 12, padding: '5px 12px', background: 'var(--color-bg-input)', width: 200 }}
                    placeholder="Filter logs..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div className="flex-1 p-5 overflow-y-auto font-mono" style={{ fontSize: 12 }}>
                <div className="rounded-lg p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                    <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-text-muted)' }}>
                        Log viewer — select a log type and worker to view output
                    </div>
                </div>
            </div>
        </div>
    );
}
