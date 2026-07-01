import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

export default function PluginsView() {
    const { pluginsList, fetchPlugins, uninstallPlugin } = useStore();
    const [tab, setTab] = useState('installed');

    useEffect(() => { if (tab === 'installed') fetchPlugins(); }, [tab]);

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
                {tab === 'installed' && pluginsList.length === 0 && (
                    <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No plugins installed</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    {pluginsList.map(p => (
                        <div key={p.name} className="card p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                                <span className="tag tag-green">v{p.version || '0.0.0'}</span>
                            </div>
                            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{p.description || 'No description'}</p>
                            <button onClick={() => uninstallPlugin(p.name)} className="btn-ghost text-red-400 text-xs">Uninstall</button>
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
