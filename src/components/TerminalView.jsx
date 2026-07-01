import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

const API = 'http://127.0.0.1:7890';

export default function TerminalView() {
    const [panels, setPanels] = useState([1]);
    const [ptyStates, setPtyStates] = useState({});
    const termRefs = useRef({});

    const createPty = async () => {
        try {
            const res = await fetch(`${API}/api/v1/pty`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ cols: 120, rows: 30 }) });
            const data = await res.json();
            return data.id;
        } catch { return null; }
    };

    const openPty = async (panelId) => {
        const id = await createPty();
        if (!id) return;
        
        setPtyStates(s => ({ ...s, [panelId]: { id, connected: true } }));
        
        const el = document.getElementById('terminal-' + panelId);
        if (!el || !window.Terminal) return;
        
        const term = new window.Terminal({ fontSize: 13, fontFamily: 'JetBrains Mono, Menlo, monospace', theme: { background: '#121214', foreground: '#e5e5e5' } });
        term.open(el);
        termRefs.current[panelId] = term;
        
        const es = new EventSource(`${API}/api/v1/pty/${id}/output`);
        es.onmessage = e => term.write(e.data);
        es.onerror = () => setPtyStates(s => ({ ...s, [panelId]: { ...s[panelId], connected: false } }));
        
        term.onData(data => {
            fetch(`${API}/api/v1/pty/${id}/input/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ data }) });
        });
    };

    useEffect(() => {
        openPty(panels[panels.length - 1]);
    }, [panels]);

    const addPanel = () => setPanels([...panels, Date.now()]);
    const removePanel = id => setPanels(panels.filter(p => p !== id));

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Terminal</h2>
                    <div className="tab-group">
                        {panels.map((id, i) => (
                            <div key={id} className={`tab ${i === panels.length - 1 ? 'active' : ''}`}>
                                Tab {i + 1}
                                {ptyStates[id]?.connected && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
                                {panels.length > 1 && <span className="ml-1.5 cursor-pointer" onClick={e => { e.stopPropagation(); removePanel(id); }}>×</span>}
                            </div>
                        ))}
                    </div>
                </div>
                <button onClick={addPanel} className="btn-primary text-xs">+ New Tab</button>
            </div>
            <div className={`flex-1 grid gap-1 p-1 ${panels.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {panels.map(id => (
                    <div key={id} className="rounded-lg overflow-hidden" style={{ background: '#121214', border: '1px solid var(--color-border-muted)' }}>
                        <div id={'terminal-' + id} className="h-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}

import { useRef } from 'react';
