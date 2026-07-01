import React, { useEffect, useState } from 'react';
import { useStore } from '../store';

const API = 'http://127.0.0.1:7890';

export default function FilesView() {
    const [path, setPath] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchFiles = async (p) => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/fs/list`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CodeBuddy-Request': '1' }, body: JSON.stringify({ path: p || '.' }) });
            const data = await res.json();
            setItems(data.files || data.entries || (Array.isArray(data) ? data : []));
        } catch { setItems([]); }
        setLoading(false);
    };

    useEffect(() => { fetchFiles(path); }, [path]);

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-2 px-5 py-2.5 text-xs font-mono" style={{ borderBottom: '1px solid var(--color-border-muted)', background: 'var(--color-bg-input)' }}>
                <button onClick={() => setPath('')} className="btn-icon px-2" style={{ color: 'var(--color-accent-primary)' }}>📁</button>
                {path.split('/').filter(Boolean).map((seg, i) => (
                    <React.Fragment key={i}>
                        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                        <button onClick={() => setPath(path.split('/').slice(0,i+1).join('/'))} className="hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>{seg}</button>
                    </React.Fragment>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3" style={{ fontSize: 13 }}>
                {loading ? (
                    <div className="text-center mt-12" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
                ) : items.length === 0 ? (
                    <div className="text-center mt-12" style={{ color: 'var(--color-text-muted)' }}>No files found</div>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {items.map((item, i) => (
                            <button key={i} onClick={() => item.is_dir && setPath(path ? `${path}/${item.name}` : item.name)}
                                className="flex flex-col items-center p-4 rounded-lg"
                                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-muted)' }}>
                                <span className="text-2xl mb-1">{item.is_dir ? '📁' : '📄'}</span>
                                <span className="text-xs truncate w-full text-center" style={{ color: 'var(--color-text-secondary)' }}>{item.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
