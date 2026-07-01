import React, { useState } from 'react';
const API = 'http://127.0.0.1:7890';

export default function FilesView() {
    const [path, setPath] = useState('');
    const [items, setItems] = useState([]);

    const fetchFiles = async (p) => {
        try {
            const r = await fetch(`${API}/api/v1/fs/list`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ path: p || '.' }) });
            if (r.ok) setItems(await r.json());
        } catch(e) { setItems([]); }
    };

    React.useEffect(() => { fetchFiles(path); }, [path]);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-2 px-6 py-3 text-xs font-mono" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <button onClick={() => setPath('')} className="btn-ghost">📁</button>
                {path.split('/').filter(Boolean).map((seg, i) => (
                    <React.Fragment key={i}>
                        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                        <button onClick={() => setPath(path.split('/').slice(0,i+1).join('/'))} className="btn-ghost" style={{ color: 'var(--color-text-primary)' }}>{seg}</button>
                    </React.Fragment>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-sm" style={{ fontSize: 13 }}>
                {path && (
                    <button onClick={() => setPath(path.split('/').slice(0,-1).join('/'))} className="flex items-center gap-2 py-1.5 px-3 rounded-lg w-full" style={{ color: 'var(--color-text-secondary)' }}>
                        <span>..</span>
                    </button>
                )}
                {items.map((item, i) => (
                    <button key={i} onClick={() => item.is_dir && setPath(path ? `${path}/${item.name}` : item.name)}
                        className={`flex items-center gap-2 py-1.5 px-3 rounded-lg w-full text-left ${item.is_dir ? '' : ''}`}
                        style={{ color: item.is_dir ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)' }}>
                        <span>{item.is_dir ? '📁' : '📄'}</span>
                        <span>{item.name}</span>
                    </button>
                ))}
                {items.length === 0 && (
                    <div className="text-center" style={{ color: 'var(--color-text-muted)', marginTop: 40 }}>
                        No files found
                    </div>
                )}
            </div>
        </div>
    );
}
