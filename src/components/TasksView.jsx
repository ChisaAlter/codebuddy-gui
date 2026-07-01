import React, { useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function TasksView() {
    const [tasks, setTasks] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [schedule, setSchedule] = useState('');

    React.useEffect(() => {
        fetch(`${API}/api/v1/scheduled-tasks`, { headers: { 'X-CodeBuddy-Request': '1' } })
            .then(r => r.ok ? r.json() : []).then(setTasks).catch(() => setTasks([]));
    }, []);

    const create = async () => {
        if (!name.trim() || !schedule.trim()) return;
        await fetch(`${API}/api/v1/scheduled-tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ name, cron: schedule }) });
        setTasks([...tasks, { id: Date.now().toString(), name, cron: schedule }]);
        setName(''); setSchedule(''); setShowForm(false);
    };

    const del = async id => {
        await fetch(`${API}/api/v1/scheduled-tasks/${id}`, { method: 'DELETE', headers: { 'X-CodeBuddy-Request': '1' } });
        setTasks(tasks.filter(t => t.id !== id));
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Scheduled Tasks</h2>
                <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">+ Create Task</button>
            </div>
            {showForm && (
                <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-muted)', background: 'var(--color-bg-card)' }}>
                    <div className="flex gap-3">
                        <input className="input-field" placeholder="Task name..." value={name} onChange={e => setName(e.target.value)} />
                        <input className="input-field" placeholder="Cron expression..." value={schedule} onChange={e => setSchedule(e.target.value)} />
                        <button onClick={create} className="btn-primary text-xs">Add</button>
                        <button onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancel</button>
                    </div>
                </div>
            )}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {tasks.length === 0 && (
                    <div className="text-center mt-12" style={{ color: 'var(--color-text-muted)' }}>
                        No scheduled tasks
                    </div>
                )}
                {tasks.map(t => (
                    <div key={t.id} className="card p-4 flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name || t.taskName || 'Unnamed'}</div>
                            <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--color-accent-blue)' }}>{t.cron || t.schedule}</div>
                        </div>
                        <button onClick={() => del(t.id)} className="btn-ghost text-red-400 text-xs">Delete</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
