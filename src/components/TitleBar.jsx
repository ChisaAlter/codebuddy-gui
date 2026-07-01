import React, { useState } from 'react';
import { useStore } from '../store';

export default function TitleBar() {
    const { currentView } = useStore();
    const [isMax, setIsMax] = useState(false);

    const titles = {
        chat: 'Chat', terminal: 'Terminal', workers: 'Workers', logs: 'Logs',
        tasks: 'Tasks', plugins: 'Plugins', files: 'Files', traces: 'Traces',
        docs: 'API Docs', metrics: 'Metrics', settings: 'Settings'
    };

    return (
        <div className="flex items-center justify-between h-9 px-3 titlebar-drag" style={{ background: 'var(--color-bg-titlebar)', borderBottom: '1px solid var(--color-border-muted)' }}>
            <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'var(--color-accent-primary)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    CodeBuddy GUI
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>—</span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {titles[currentView]}
                </span>
            </div>
            <div className="flex items-center gap-1 titlebar-no-drag">
                <button onClick={() => window.electronAPI?.minimize()} className="w-8 h-8 flex items-center justify-center rounded" style={{ color: 'var(--color-text-muted)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5.5" width="12" height="1" fill="currentColor"/></svg>
                </button>
                <button onClick={() => { setIsMax(!isMax); window.electronAPI?.maximize(); }} className="w-8 h-8 flex items-center justify-center rounded" style={{ color: 'var(--color-text-muted)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
                </button>
                <button onClick={() => window.electronAPI?.close()} className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-600 hover:text-white" style={{ color: 'var(--color-text-muted)' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.2"/></svg>
                </button>
            </div>
        </div>
    );
}
