import React, { useEffect, useRef, useState } from 'react';

const API = 'http://127.0.0.1:7890';

export default function TerminalView() {
    const [panels, setPanels] = useState([1]);
    const termRefs = useRef({});

    useEffect(() => {
        const id = panels[panels.length - 1];
        const el = document.getElementById('terminal-' + id);
        if (el && window.Terminal && !termRefs.current[id]) {
            const term = new window.Terminal({ fontSize: 13, fontFamily: 'JetBrains Mono, Menlo, monospace', theme: { background: '#121214', foreground: '#e5e5e5' } });
            term.open(el);
            term.write('\x1b[1;32m✓\x1b[0m Connected to CodeBuddy PTY\r\n');
            termRefs.current[id] = term;

            fetch(`${API}/api/v1/pty`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ cols: 120, rows: 30 }) })
                .then(r => r.json())
                .then(d => {
                    if (d.id) {
                        const es = new EventSource(`${API}/api/v1/pty/${d.id}/output`);
                        es.onmessage = e => term.write(e.data);
                        term.onData(data => {
                            fetch(`${API}/api/v1/pty/${d.id}/input/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ data }) });
                        });
                    }
                })
                .catch(err => term.write(`\r\n\x1b[1;31mError: ${err.message}\x1b[0m\r\n`));
        }
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
                            <div key={id} className={`tab ${i === panels.length - 1 ? 'active' : ''}`} onClick={() => setPanels([...panels.slice(0, i), id, ...panels.slice(i+1)])}>
                                Tab {i + 1}
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
