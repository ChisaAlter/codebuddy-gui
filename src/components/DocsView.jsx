import React from 'react';

export default function DocsView() {
    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>API Documentation</h2>
                <span className="tag tag-green">OpenAPI 3.1</span>
            </div>
            <iframe src="http://127.0.0.1:7890/api/docs" className="flex-1" style={{ background: '#fff' }} title="API Docs" />
        </div>
    );
}
