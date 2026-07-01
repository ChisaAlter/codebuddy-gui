import React, { useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function PluginsView() {
    const [plugins, setPlugins] = useState([]);
    const [tab, setTab] = useState('installed');

    React.useEffect(() => {
        if (tab === 'installed') {
            fetch(`${API}/api/v1/plugins`, { headers: { 'X-CodeBuddy-Request': '1' } })
                .then(r => r.ok ? r.json() : []).then(setPlugins).catch(() => setPlugins([]));
        }
    }, [tab]);

    const uninstall = async name => {
        if (!confirm(`Uninstall plugin: ${name}?`)) return;
        await fetch(`${API}/api/v1/plugins`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ name, action: 'uninstall' }) });
        setPlugins(plugins.filter(p => p.name !== name));
    };

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Plugins</h2>
                <div className="flex gap-2 text-xs">
                    {[{id:'installed',label:'Installed'},{id:'marketplace',label:'Marketplace'}].map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className="px-3 py-1 rounded transition-colors"
                            style={{ background: tab === t.id ? 'var(--color-accent-brand-dim)' : 'transparent', color: tab === t.id ? 'var(--color-accent-brand)' : 'var(--color-text-muted)' }}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {tab === 'installed' && plugins.length === 0 && (
                    <div className="text-center" style={{ color: 'var(--color-text-muted)', marginTop: 60 }}>
                        No plugins installed
                    </div>
                )}
                {tab === 'installed' && plugins.map(p => (
                    <div key={p.name} className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                        <div>
                            <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{p.name}</div>
                            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.description || 'No description'}</div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>v{p.version || '0.0.0'}</span>
                            <button onClick={() => uninstall(p.name)} className="btn-ghost text-red-400 text-xs">Uninstall</button>
                        </div>
                    </div>
                ))}
                {tab === 'marketplace' && (
                    <div className="text-center" style={{ color: 'var(--color-text-muted)', marginTop: 60 }}>
                        Browse the plugin marketplace to discover new tools
                    </div>
                )}
            </div>
        </div>
    );
}
