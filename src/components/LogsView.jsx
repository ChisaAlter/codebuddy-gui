import React, { useState } from 'react';

const LOG_TYPES = ['telemetry', 'process', 'debug', 'transcript'];

export default function LogsView() {
    const [type, setType] = useState('telemetry');
    const [search, setSearch] = useState('');

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-2.5" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Logs</h2>
                <div className="tab-group">
                    {LOG_TYPES.map(t => (
                        <div key={t} className={`tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>{t}</div>
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
                <div className="card p-5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <div style={{ color: 'var(--color-text-muted)' }}>Select a log source to begin viewing output</div>
                    <div className="mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                        Real-time logs will stream via Server-Sent Events
                    </div>
                </div>
            </div>
        </div>
    );
}
