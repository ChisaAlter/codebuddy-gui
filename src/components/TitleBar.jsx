import React, { useState } from 'react';

export default function TitleBar() {
    const { currentView } = useStore();
    const [isMax, setIsMax] = useState(false);

    const minimize = () => window.electronAPI?.minimize();
    const maximize = () => { setIsMax(!isMax); window.electronAPI?.maximize(); };
    const close = () => window.electronAPI?.close();

    const titles = {
        chat: 'Chat',
        workers: 'Workers',
        logs: 'Logs',
        tasks: 'Tasks',
        plugins: 'Plugins',
        files: 'Files',
        traces: 'Traces',
        docs: 'API Docs',
        metrics: 'Metrics',
        settings: 'Settings'
    };

    return (
        <div className="h-9 flex items-center justify-between" style={{ WebkitAppRegion: 'drag', background: 'var(--color-bg-titlebar)', borderBottom: '1px solid var(--color-border-muted)' }}>
            <div className="flex items-center gap-3 pl-4">
                <span className="text-xs font-medium text-gray-400">
                    CodeBuddy GUI — {titles[currentView]}
                </span>
            </div>
            <div className="flex" style={{ WebkitAppRegion: 'no-drag' }}>
                <button onClick={minimize} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-dark-300 hover:text-white transiton">
                    <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5.5" width="12" height="1" fill="currentColor"/></svg>
                </button>
                <button onClick={maximize} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-dark-300 hover:text-white transiton">
                    <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
                </button>
                <button onClick={close} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-red-600 hover:text-white transiton">
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.2"/></svg>
                </button>
            </div>
        </div>
    );
}

import { useStore } from '../store';
