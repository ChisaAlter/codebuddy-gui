import React from 'react';
import { useStore } from '../store';

export default function StatusBar() {
    const { daemonStatus, workersList } = useStore();

    return (
        <div className="flex items-center justify-between h-6 px-3 text-xs" style={{ background: 'var(--color-bg-titlebar)', borderTop: '1px solid var(--color-border-muted)', color: 'var(--color-text-muted)' }}>
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                    <span className={`dot ${daemonStatus?.status === 'running' ? 'dot-green' : 'dot-red'}`} />
                    {daemonStatus?.status === 'running' ? 'Connected' : 'Disconnected'}
                </span>
                <span>{workersList.length} workers</span>
            </div>
            <div className="flex items-center gap-3">
                <span>API: 127.0.0.1:7890</span>
                <span>CodeBuddy GUI v0.1.0</span>
            </div>
        </div>
    );
}
