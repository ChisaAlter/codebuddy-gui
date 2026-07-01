import React, { useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function TasksView() {
    const [tasks, setTasks] = useState([]);

    React.useEffect(() => {
        fetch(`${API}/api/v1/scheduled-tasks`, { headers: { 'X-CodeBuddy-Request': '1' } })
            .then(r => r.ok ? r.json() : []).then(setTasks).catch(() => setTasks([]));
    }, []);

    const del = async id => {
        await fetch(`${API}/api/v1/scheduled-tasks/${id}`, { method: 'DELETE', headers: { 'X-CodeBuddy-Request': '1' } });
        setTasks(tasks.filter(t => t.id !== id));
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Scheduled Tasks</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {tasks.length === 0 && (
                    <div className="text-center" style={{ color: 'var(--color-text-muted)', marginTop: 60 }}>
                        No scheduled tasks found
                    </div>
                )}
                {tasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                        <div>
                            <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name || t.taskName || 'Unnamed'}</div>
                            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t.cron || t.schedule || 'No schedule'}</div>
                        </div>
                        <button onClick={() => del(t.id)} className="btn-ghost text-red-400 text-xs">Delete</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
