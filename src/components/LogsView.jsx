import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

const API = 'http://127.0.0.1:7890';
const LOG_TYPES = ['telemetry', 'process', 'debug', 'transcript'];

export default function LogsView() {
    const [type, setType] = useState('telemetry');
    const [search, setSearch] = useState('');
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/workers?kind=bg`, { headers: { 'X-CodeBuddy-Request': '1' } });
            const workers = await res.json();
            const list = workers.workers || workers || [];
            
            if (list.length > 0) {
                const wid = list[0].pid;
                const logRes = await fetch(`${API}/api/v1/workers/${wid}/logs?type=${type}&tail=200`, { headers: { 'X-CodeBuddy-Request': '1' } });
                const text = await logRes.text();
                setLogs(text.split('\n').filter(l => l.trim()));
            } else {
                setLogs(['No running workers with logs']);
            }
        } catch (e) {
            setLogs(['Error fetching logs: ' + e.message]);
        }
        setLoading(false);
    };

    useEffect(() => { fetchLogs(); }, [type]);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-2.5" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Logs</h2>
                <div className="tab-group">
                    {LOG_TYPES.map(t => (
                        <div key={t} className={`tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>{t}</div>
                    ))}
                </div>
                <button onClick={fetchLogs} className="btn-ghost text-xs ml-auto">Refresh</button>
            </div>
            <div className="flex-1 p-5 overflow-y-auto font-mono" style={{ fontSize: 12 }}>
                <div className="card p-4" style={{ fontFamily: 'var(--font-mono)', minHeight: '80%' }}>
                    {loading ? (
                        <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
                    ) : logs.length === 0 ? (
                        <div style={{ color: 'var(--color-text-muted)' }}>No logs available</div>
                    ) : (
                        logs.map((line, i) => (
                            <div key={i} style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {line}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
