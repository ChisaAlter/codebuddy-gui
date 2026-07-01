import React, { useState } from 'react';
const TABS = [{id:'general',label:'General'},{id:'appearance',label:'Appearance'},{id:'model',label:'Model'},{id:'permissions',label:'Permissions'},{id:'server',label:'Server'}];

export default function SettingsView() {
    const [tab, setTab] = useState('appearance');
    const [theme, setTheme] = useState('dark');
    const [lang, setLang] = useState('en');
    const [model, setModel] = useState('claude-sonnet-4-20250514');
    const [perm, setPerm] = useState('default');

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Settings</h2>
                <div className="tab-group">{TABS.map(t => (
                    <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}
                    </div>
                ))}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {tab === 'appearance' && (
                    <div className="space-y-6">
                        <div className="card p-5">
                            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>Theme</h3>
                            <div className="grid grid-cols-3 gap-3">
                                [['dark','Dark'],['light','Light'],['auto','System']].map(([v,l]) => (
                                    <button key={v} onClick={() => setTheme(v)} className="p-3 rounded-lg text-sm text-center"
                                        style={{ background: theme === v ? 'var(--color-accent-primary-dim)' : 'var(--color-bg-card)', border: `1px solid ${theme === v ? 'var(--color-border-active)' : 'var(--color-border-muted)'}`, color: theme === v ? 'var(--color-accent-brand)' : 'var(--color-text-secondary)' }}>{l}</button>
                                ))}
                            </div>
                        </div>
                        <div className="card p-5">
                            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>Language</h3>
                            <div className="grid grid-cols-3 gap-3">
                                [['zh','中文'],['en','English'],['auto','Auto']].map(([v,l]) => (
                                    <button key={v} onClick={() => setLang(v)} className="p-3 rounded-lg text-sm text-center"
                                        style={{ background: lang === v ? 'var(--color-accent-primary-dim)' : 'var(--color-bg-card)', border: `1px solid ${lang === v ? 'var(--color-border-active)' : 'var(--color-border-muted)'}`, color: lang === v ? 'var(--color-accent-brand)' : 'var(--color-text-secondary)' }}>{l}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {tab === 'model' && (
                    <div className="card p-5">
                        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>Default Model</h3>
                        <select value={model} onChange={e => setModel(e.target.value)} className="input-field" style={{ width: 280 }}>
                            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                            <option value="claude-opus-4">Claude Opus 4</option>
                            <option value="gpt-4o">GPT-4o</option>
                            <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                        </select>
                    </div>
                )}
                {tab === 'permissions' && (
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            {id:'default',label:'Standard',desc:'Confirm new tools'},
                            {id:'acceptEdits',label:'Accept Edits',desc:'Auto-accept file edits'},
                            {id:'plan',label:'Plan Mode',desc:'No file modifications'},
                            {id:'bypassPermissions',label:'Bypass',desc:'Skip all approval prompts'}
                        ].map(p => (
                            <button key={p.id} onClick={() => setPerm(p.id)} className="p-4 rounded-xl text-left"
                                style={{ background: perm === p.id ? 'var(--color-accent-primary-dim)' : 'var(--color-bg-card)', border: `1px solid ${perm === p.id ? 'var(--color-border-active)' : 'var(--color-border-muted)'}` }}>
                                <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{p.label}</div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{p.desc}</div>
                            </button>
                        ))}
                    </div>
                )}
                {tab === 'server' && (
                    <div className="card p-5">
                        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>HTTP Server</h3>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <div>Endpoint: <code style={{ color: 'var(--color-accent-blue)' }}>http://127.0.0.1:7890</code></div>
                            <div className="mt-1">API Version: v1 • Swagger UI: <code style={{ color: 'var(--color-accent-blue)' }}>/api/docs</code></div>
                        </div>
                    </div>
                )}
                {tab === 'general' && (
                    <div className="card p-5">
                        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>Application</h3>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <div>Version: 0.1.0</div>
                            <div>Platform: Windows x64</div>
                            <div>Electron: 31.0.0</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
