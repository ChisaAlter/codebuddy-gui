import React, { useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function PluginsView() {
    const [plugins, setPlugins] = useState([]);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('installed');

    React.useEffect(() => {
        if (tab === 'installed') {
            fetch(`${API}/api/v1/plugins`, { headers: { 'X-CodeBuddy-Request': '1' } })
                .then(r => r.ok ? r.json() : []).then(setPlugins).catch(() => setPlugins([]));
        }
    }, [tab]);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Plugins</h2>
                <div className="tab-group">
                    <div className={`tab ${tab === 'installed' ? 'active' : ''}`} onClick={() => setTab('installed')}>Installed</div>
                    <div className={`tab ${tab === 'marketplace' ? 'active' : ''}`} onClick={() => setTab('marketplace')}>Marketplace</div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
                {tab === 'installed' && plugins.length === 0 && (
                    <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No plugins installed</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    {plugins.map(p => (
                        <div key={p.name} className="card p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                                <span className="tag tag-green">v{p.version}</span>
                            </div>
                            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{p.description}</p>
                            <button className="btn-ghost text-red-400 text-xs">Uninstall</button>
                        </div>
                    ))}
                </div>
                {tab === 'marketplace' && (
                    <div className="text-center mt-12" style={{ color: 'var(--color-text-muted)' }}>Browse available plugins from the marketplace</div>
                )}
            </div>
        </div>
    );
}
