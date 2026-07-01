import React, { useState } from 'react';

const TABS = [{id:'general',label:'General'},{id:'appearance',label:'Appearance'},{id:'model',label:'Model'},{id:'permissions',label:'Permissions'},{id:'server',label:'Server'}];
const THEMES = ['Dark', 'Light', 'System'];
const LANGS = ['中文', 'English', 'Auto'];
const PERMS = ['Standard', 'Accept Edits', 'Plan Mode', 'Bypass Permissions'];

export default function SettingsView() {
    const [tab, setTab] = useState('appearance');
    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Settings</h2>
                <div className="flex gap-1 text-xs">{TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-1 rounded"
                        style={{ background: tab === t.id ? 'var(--color-accent-brand-dim)' : 'transparent', color: tab === t.id ? 'var(--color-accent-brand)' : 'var(--color-text-muted)' }}>
                        {t.label}
                    </button>
                ))}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                {tab === 'appearance' && (
                    <div className="space-y-6">
                        <div><label className="text-sm font-medium mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>Theme</label>
                            <div className="flex gap-2">{THEMES.map(t => (
                                <button key={t} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)', color: 'var(--color-text-primary)' }}>{t}</button>
                            ))}</div>
                        </div>
                        <div><label className="text-sm font-medium mb-2 block" style={{ color: 'var(--color-text-secondary)' }}>Language</label>
                            <div className="flex gap-2">{LANGS.map(t => (
                                <button key={t} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)', color: 'var(--color-text-primary)' }}>{t}</button>
                            ))}</div>
                        </div>
                    </div>
                )}
                {tab === 'model' && <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Model config via <code style={{ color: 'var(--color-accent-blue)' }}>~/.codebuddy/models.json</code></div>}
                {tab === 'permissions' && (
                    <div className="space-y-2">{PERMS.map(p => (
                        <button key={p} className="w-full text-left px-4 py-3 rounded-lg text-sm flex items-center gap-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                            <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: 'var(--color-border-muted)' }}/>
                            <span style={{ color: 'var(--color-text-primary)' }}>{p}</span>
                        </button>
                    ))}</div>
                )}
                {tab === 'server' && (
                    <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                        <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>CodeBuddy HTTP Server</h4>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Endpoint: <code style={{ color: 'var(--color-accent-blue)' }}>http://127.0.0.1:7890</code></div>
                    </div>
                )}
                {tab === 'general' && <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>General settings</div>}
            </div>
        </div>
    );
}
